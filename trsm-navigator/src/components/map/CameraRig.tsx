"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useApp } from "@/lib/store";
import { FLOOR_BY_ID, PLAN_BOUNDS } from "@/data";
import { SLAB_TOP, toWorld } from "./sceneUtils";

export const BASE_FOV = 34;

/** Visible map rectangle (canvas px) not covered by the sidebar / search bar / bottom sheet. */
export function visibleInsets(w: number, h: number, panelH: number, navigating: boolean) {
  if (w >= 1024) return { left: 432, top: 0, right: 72, bottom: 0 };
  return { left: 0, top: navigating ? 150 : 72, right: 58, bottom: Math.min(panelH, h * 0.62) };
}

type Controls = THREE.EventDispatcher & {
  target: THREE.Vector3;
  update: () => void;
  getAzimuthalAngle: () => number;
  getPolarAngle: () => number;
  minPolarAngle: number;
  maxPolarAngle: number;
  enabled: boolean;
};

const POLAR_3D = 0.86;
const POLAR_FOLLOW_3D = 0.9;
const POLAR_2D = 0.0001;

interface Anim {
  t0: number;
  dur: number;
  from: { target: THREE.Vector3; dist: number; az: number; polar: number };
  to: { target: THREE.Vector3; dist: number; az: number; polar: number };
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function shortestAz(from: number, to: number) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + d;
}

function place(camera: THREE.Camera, controls: Controls, target: THREE.Vector3, dist: number, az: number, polar: number) {
  const off = new THREE.Vector3(dist * Math.sin(polar) * Math.sin(az), dist * Math.cos(polar), dist * Math.sin(polar) * Math.cos(az));
  camera.position.copy(target).add(off);
  controls.target.copy(target);
  camera.lookAt(target);
  controls.update();
}

/** Shift the projection centre into the visible part of the screen (keeps zoom scale). */
function useViewOffset() {
  const { camera, size } = useThree();
  const panelH = useApp((s) => s.panelH);
  const phase = useApp((s) => s.phase);
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const ins = visibleInsets(size.width, size.height, panelH, phase === "navigating");
    const dx = (ins.left - ins.right) / 2;
    const dy = (ins.top - ins.bottom) / 2;
    const fullW = size.width + 2 * Math.abs(dx);
    const fullH = size.height + 2 * Math.abs(dy);
    const x = Math.abs(dx) - dx;
    const y = Math.abs(dy) - dy;
    cam.fov = (2 * Math.atan(Math.tan((BASE_FOV * Math.PI) / 360) * (fullH / size.height)) * 180) / Math.PI;
    cam.setViewOffset(fullW, fullH, x, y, size.width, size.height);
    cam.updateProjectionMatrix();
  }, [camera, size, panelH, phase]);
}

export function CameraRig({ onAzimuth }: { onAzimuth: (az: number) => void }) {
  useViewOffset();
  const { camera, size } = useThree();
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const anim = useRef<Anim | null>(null);
  const lastAz = useRef(0);
  const camera_ = useApp((s) => s.camera);
  const viewMode = useApp((s) => s.viewMode);
  const follow = useApp((s) => s.follow);
  const reduced = useApp((s) => s.reducedMotion);

  const current = () => {
    const c = controls!;
    return { target: c.target.clone(), dist: camera.position.distanceTo(c.target), az: c.getAzimuthalAngle(), polar: c.getPolarAngle() };
  };

  const fitDistance = (w: number, h: number) => {
    const st = useApp.getState();
    const ins = visibleInsets(size.width, size.height, st.panelH, st.phase === "navigating");
    const vw = Math.max(120, size.width - ins.left - ins.right);
    const vh = Math.max(120, size.height - ins.top - ins.bottom);
    const fov = (BASE_FOV * Math.PI) / 180;
    // world units per pixel at distance d (vertical) = 2 d tan(fov/2) / H
    const tanH = Math.tan(fov / 2);
    const st3d = st.viewMode === "3d";
    const needH = ((h * (st3d ? 0.72 : 1)) / 2 / tanH) * (size.height / vh);
    const needW = (w / 2 / tanH) * (size.height / vw);
    return Math.max(needH, needW) * 1.06;
  };

  const animateTo = (to: Anim["to"], dur = 700) => {
    if (!controls) return;
    if (reduced) {
      place(camera, controls, to.target, to.dist, to.az, to.polar);
      return;
    }
    const from = current();
    to.az = shortestAz(from.az, to.az);
    anim.current = { t0: performance.now(), dur, from, to };
  };

  // initial framing
  useEffect(() => {
    if (!controls) return;
    const d = fitDistance(PLAN_BOUNDS.maxX - PLAN_BOUNDS.minX, PLAN_BOUNDS.maxY - PLAN_BOUNDS.minY);
    place(camera, controls, new THREE.Vector3(0, SLAB_TOP, 0), d * 0.92, 0, viewMode === "3d" ? POLAR_3D : POLAR_2D);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls]);

  // 2D / 3D switch
  useEffect(() => {
    if (!controls) return;
    controls.minPolarAngle = viewMode === "2d" ? POLAR_2D : 0;
    controls.maxPolarAngle = viewMode === "2d" ? POLAR_2D : 1.15;
    const c = current();
    animateTo({ ...c, polar: viewMode === "2d" ? POLAR_2D : POLAR_3D }, 600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, controls]);

  // camera requests from the UI
  useEffect(() => {
    if (!controls || !camera_) return;
    const st = useApp.getState();
    const polar = st.viewMode === "2d" ? POLAR_2D : POLAR_3D;
    const c = current();
    if (camera_.kind === "north") {
      animateTo({ ...c, az: 0 }, 500);
    } else if (camera_.kind === "fit") {
      const d = fitDistance(PLAN_BOUNDS.maxX - PLAN_BOUNDS.minX, PLAN_BOUNDS.maxY - PLAN_BOUNDS.minY);
      animateTo({ target: new THREE.Vector3(0, SLAB_TOP, 0), dist: d * 0.92, az: 0, polar });
    } else if (camera_.kind === "focus" && camera_.x != null && camera_.y != null) {
      animateTo({ target: toWorld([camera_.x, camera_.y], SLAB_TOP), dist: camera_.distance ?? 260, az: c.az, polar });
    } else if (camera_.kind === "route" && st.route) {
      const legs = st.route.legs.filter((l) => l.floor === st.floor);
      const pts = (legs.length ? legs : st.route.legs).flatMap((l) => l.points);
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [x, y] of pts) {
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
      const w = Math.max(190, maxX - minX), h = Math.max(150, maxY - minY);
      const d = Math.min(fitDistance(w, h), 1700);
      const ctr = toWorld([(minX + maxX) / 2, (minY + maxY) / 2], SLAB_TOP);
      animateTo({ target: ctr, dist: d, az: 0, polar });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera_, controls]);

  // test hook: current camera target in plan coordinates
  useEffect(() => {
    if (!controls) return;
    (window as unknown as { __trsmCam: () => number[] }).__trsmCam = () => [controls.target.x, controls.target.z, camera.position.distanceTo(controls.target)];
  }, [controls, camera]);

  // re-frame the route when the phone panel changes height (e.g. start chosen, steps shown)
  const panelH = useApp((s) => s.panelH);
  useEffect(() => {
    const st = useApp.getState();
    if (st.phase !== "directions" || !st.route || size.width >= 1024) return;
    const t = setTimeout(() => useApp.getState().requestCamera({ kind: "route" }), 120);
    return () => clearTimeout(t);
  }, [panelH, size.width]);

  // user interaction cancels follow mode
  useEffect(() => {
    if (!controls) return;
    const onStart = () => {
      anim.current = null;
      if (useApp.getState().follow) useApp.getState().setFollow(false);
    };
    controls.addEventListener("start" as never, onStart);
    return () => controls.removeEventListener("start" as never, onStart);
  }, [controls]);

  useFrame((_, dt) => {
    if (!controls) return;
    const a = anim.current;
    if (a) {
      const t = Math.min(1, (performance.now() - a.t0) / a.dur);
      const e = ease(t);
      const target = a.from.target.clone().lerp(a.to.target, e);
      place(camera, controls, target, THREE.MathUtils.lerp(a.from.dist, a.to.dist, e), THREE.MathUtils.lerp(a.from.az, a.to.az, e), THREE.MathUtils.lerp(a.from.polar, a.to.polar, e));
      if (t >= 1) anim.current = null;
    } else if (follow) {
      const st = useApp.getState();
      const pos = st.position;
      if (pos && FLOOR_BY_ID[pos.floor]) {
        const c = current();
        const heading = pos.heading ?? (c.az * -180) / Math.PI;
        const rotate = !st.reducedMotion && pos.heading != null;
        const desiredAz = rotate ? shortestAz(c.az, (-heading * Math.PI) / 180) : c.az;
        const polar = st.viewMode === "2d" ? POLAR_2D : POLAR_FOLLOW_3D;
        const dist = THREE.MathUtils.clamp(c.dist, 200, 400);
        // keep the dot in the lower-middle: aim the camera ahead of it
        const h = (-desiredAz * 180) / Math.PI;
        // place the dot ~25% below the centre of the *visible* map area
        const ins = visibleInsets(size.width, size.height, st.panelH, true);
        const visFrac = Math.max(0.3, (size.height - ins.top - ins.bottom) / size.height);
        const ahead = 0.42 * dist * Math.tan((BASE_FOV * Math.PI) / 360) * visFrac * (st.viewMode === "2d" ? 1 : 1.35);
        const p = toWorld(pos.p, SLAB_TOP);
        p.x += Math.sin((h * Math.PI) / 180) * ahead;
        p.z += -Math.cos((h * Math.PI) / 180) * ahead;
        const k = st.reducedMotion ? 1 : 1 - Math.pow(0.03, dt);
        const target = c.target.clone().lerp(p, k);
        place(camera, controls, target, THREE.MathUtils.lerp(c.dist, dist, k), THREE.MathUtils.lerp(c.az, desiredAz, k * 0.6), THREE.MathUtils.lerp(c.polar, polar, k));
      }
    }
    // keep the building on screen: the map can't be dragged away into empty space
    const hw = (PLAN_BOUNDS.maxX - PLAN_BOUNDS.minX) / 2 + 20, hh = (PLAN_BOUNDS.maxY - PLAN_BOUNDS.minY) / 2 + 20;
    const t = controls.target;
    const cx = THREE.MathUtils.clamp(t.x, -hw, hw), cz = THREE.MathUtils.clamp(t.z, -hh, hh);
    if (cx !== t.x || cz !== t.z) {
      const dx = cx - t.x, dz = cz - t.z;
      t.x = cx; t.z = cz;
      camera.position.x += dx; camera.position.z += dz;
      controls.update();
    }
    const az = controls.getAzimuthalAngle();
    if (Math.abs(az - lastAz.current) > 0.002) {
      lastAz.current = az;
      onAzimuth(az);
    }
  });
  return null;
}
