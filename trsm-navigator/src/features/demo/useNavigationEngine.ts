"use client";
import { useEffect, useRef } from "react";
import { useApp } from "@/lib/store";
import { sampleRoute } from "@/features/routing/route";
import { startMotion, type SensorStatus } from "@/features/positioning/motion";

/** Demo walking speed in plan units per second at 1× (the plans are not to scale). */
export const DEMO_UNITS_PER_SEC = 24;
/** Seconds the demo pauses to "ride" a vertical connector. */
const RIDE_SECONDS = 1.6;
/** Assumed step length in plan units when the plan hasn't been calibrated. */
export const DEFAULT_STEP_UNITS = 4.5;

export function currentInstructionIndex(s: number, instr: { s: number }[]): number {
  let idx = 0;
  for (let i = 0; i < instr.length; i++) if (instr[i].s <= s + 6) idx = i;
  return idx;
}

/** The manoeuvre to show while moving continuously (demo / motion): the next one ahead of you. */
export function upcomingInstructionIndex(s: number, instr: { s: number }[]): number {
  if (s < 2) return 0;
  for (let i = 0; i < instr.length; i++) if (instr[i].s > s + 0.3) return i;
  return instr.length - 1;
}

/**
 * Drives the active position during navigation:
 *  - demo: animates along the computed graph route (never claims to be your real location)
 *  - motion: advances an estimate along the route on detected steps (experimental)
 *  - qr / manual: position stays at the anchor/pinned point until the user rescans or moves it
 */
export function useNavigationEngine(onSensorStatus: (s: SensorStatus, msg?: string) => void) {
  const phase = useApp((s) => s.phase);
  const navMode = useApp((s) => s.navMode);
  const playing = useApp((s) => s.playing);
  const route = useApp((s) => s.route);
  const rideUntil = useRef(0);
  const lastLeg = useRef(0);
  const lastInstr = useRef(-1);
  const stopMotion = useRef<(() => void) | null>(null);

  // announce instruction changes (screen readers + UI)
  useEffect(() => {
    lastInstr.current = -1;
    lastLeg.current = 0;
  }, [route]);

  const publish = (s: number, source: "demo" | "motion", uncertainty: number) => {
    const st = useApp.getState();
    const r = st.route;
    if (!r) return;
    const smp = sampleRoute(r, s);
    if (smp.legIndex !== lastLeg.current) {
      lastLeg.current = smp.legIndex;
      if (st.floor !== smp.floor) st.setFloor(smp.floor);
    }
    st.setPosition({ floor: smp.floor, p: smp.p, heading: smp.heading, uncertainty, source });
    const idx = upcomingInstructionIndex(s, r.instructions);
    if (idx !== lastInstr.current) {
      lastInstr.current = idx;
      st.say(r.instructions[idx].text);
    }
    if (s >= r.lengthUnits - 0.01 && st.phase === "navigating") st.arrive();
  };

  // demo animation loop
  useEffect(() => {
    if (phase !== "navigating" || navMode !== "demo" || !playing || !route) return;
    let raf = 0;
    let prev = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - prev) / 1000);
      prev = now;
      const st = useApp.getState();
      const r = st.route;
      if (!r) return;
      if (now < rideUntil.current) {
        raf = requestAnimationFrame(tick);
        return;
      }
      let s = st.progress + DEMO_UNITS_PER_SEC * st.speed * dt;
      // pause at each floor transition so the floor switch is visible
      for (const t of r.transitions) {
        if (st.progress < t.distanceAt && s >= t.distanceAt) {
          s = t.distanceAt + 0.01;
          rideUntil.current = now + (RIDE_SECONDS * 1000) / Math.max(0.5, st.speed);
        }
      }
      s = Math.min(s, r.lengthUnits);
      st.setProgress(s);
      publish(s, "demo", 0);
      if (s < r.lengthUnits) raf = requestAnimationFrame(tick);
    };
    publish(useApp.getState().progress, "demo", 0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, navMode, playing, route]);

  // initial position for demo when paused/restarted
  useEffect(() => {
    if (phase === "navigating" && navMode === "demo" && route && !playing) publish(useApp.getState().progress, "demo", 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, navMode, route]);

  // experimental motion mode
  useEffect(() => {
    if (phase !== "navigating" || navMode !== "motion" || !route) return;
    let uncertainty = 2;
    let cancelled = false;
    const st0 = useApp.getState();
    publish(st0.progress, "motion", uncertainty);
    startMotion({
      onStep: () => {
        const st = useApp.getState();
        const r = st.route;
        if (!r || st.phase !== "navigating") return;
        const mpu = st.calibration.metersPerUnit;
        const step = mpu ? 0.7 / mpu : DEFAULT_STEP_UNITS;
        let s = st.progress + step;
        // steps can't carry you through an elevator: stop at the transition until confirmed
        for (const t of r.transitions) if (st.progress < t.distanceAt && s > t.distanceAt) s = t.distanceAt - 0.01;
        uncertainty = Math.min(60, uncertainty + step * 0.12);
        st.setProgress(Math.min(s, r.lengthUnits));
        publish(Math.min(s, r.lengthUnits), "motion", uncertainty);
      },
      onHeading: () => {
        /* heading is shown only after plan-north calibration; route direction is used otherwise */
      },
      onStatus: (s, m) => onSensorStatus(s, m),
    }).then((stop) => {
      if (cancelled) stop();
      else stopMotion.current = stop;
    });
    return () => {
      cancelled = true;
      stopMotion.current?.();
      stopMotion.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, navMode, route]);

  // static modes: keep the dot at the start
  useEffect(() => {
    if (phase !== "navigating" || !route || (navMode !== "qr" && navMode !== "manual")) return;
    useApp.getState().goToStep(0);
  }, [phase, navMode, route]);
}

/** Confirm arrival on the next floor in motion mode (steps can't detect elevator rides). */
export function confirmFloorChange() {
  const st = useApp.getState();
  const r = st.route;
  if (!r) return;
  const t = r.transitions.find((t) => st.progress < t.distanceAt + 0.02 && st.progress > t.distanceAt - 1);
  if (t) {
    st.setProgress(t.distanceAt + 0.05);
    const smp = sampleRoute(r, t.distanceAt + 0.05);
    st.setFloor(smp.floor);
    st.setPosition({ floor: smp.floor, p: smp.p, heading: smp.heading, uncertainty: 8, source: "motion" });
  }
}
