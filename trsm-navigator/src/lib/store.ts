"use client";
import { create } from "zustand";
import { ANCHOR_BY_ID, DEST_BY_ID, FLOOR_LEVEL } from "@/data";
import type { FloorId, Pt } from "@/types/map";
import { computeRoute, type RouteOk, type RouteStart } from "@/features/routing/route";
import { EMPTY_CALIBRATION, type Calibration } from "@/features/indoor-map/calibration";

export type Phase = "explore" | "place" | "directions" | "navigating" | "arrived";
export type NavMode = "demo" | "qr" | "motion" | "manual";
export type SheetSnap = "peek" | "half" | "full";

export interface CameraRequest {
  kind: "fit" | "focus" | "north" | "route";
  floor?: FloorId;
  x?: number;
  y?: number;
  distance?: number;
  nonce: number;
}

export interface LivePosition {
  floor: FloorId;
  p: Pt;
  heading: number | null;
  /** plan units; 0 = exact (anchor), grows with dead reckoning */
  uncertainty: number;
  source: "demo" | "qr" | "motion" | "manual";
}

interface State {
  floor: FloorId;
  viewMode: "3d" | "2d";
  selectedId: string | null;
  phase: Phase;
  start: RouteStart | null;
  startSource: "room" | "qr" | "map" | null;
  accessible: boolean;
  allowUnverified: boolean;
  route: RouteOk | null;
  routeError: string | null;
  navMode: NavMode | null;
  /** distance travelled along the route (plan units) */
  progress: number;
  /** current step in step-by-step (manual / QR) mode */
  stepIndex: number;
  playing: boolean;
  speed: number;
  follow: boolean;
  position: LivePosition | null;
  camera: CameraRequest | null;
  calibration: Calibration;
  sheet: SheetSnap;
  pickingStartOnMap: boolean;
  notice: string | null;
  reducedMotion: boolean;
  announce: string;
  /** measured height (px) of the bottom panel on phones, so the map centres above it */
  panelH: number;
  /** category list being browsed from the home panel */
  browse: import("@/types/map").Category | "popular" | null;

  setFloor: (f: FloorId, opts?: { fromUser?: boolean }) => void;
  setViewMode: (m: "3d" | "2d") => void;
  select: (id: string | null, opts?: { focus?: boolean }) => void;
  openDirections: () => void;
  setStart: (s: RouteStart | null, source?: State["startSource"]) => void;
  swap: () => void;
  setAccessible: (v: boolean) => void;
  setAllowUnverified: (v: boolean) => void;
  recompute: () => void;
  startNavigation: (mode: NavMode) => void;
  stopNavigation: () => void;
  setProgress: (s: number) => void;
  goToStep: (i: number) => void;
  setPlaying: (p: boolean) => void;
  setSpeed: (v: number) => void;
  setFollow: (v: boolean) => void;
  setPosition: (p: LivePosition | null) => void;
  requestCamera: (c: Omit<CameraRequest, "nonce">) => void;
  setCalibration: (c: Calibration) => void;
  setSheet: (s: SheetSnap) => void;
  setPickingStart: (v: boolean) => void;
  setNotice: (n: string | null) => void;
  setReducedMotion: (v: boolean) => void;
  arrive: () => void;
  reset: () => void;
  applyAnchor: (anchorId: string) => { ok: boolean; message: string };
  say: (text: string) => void;
  setPanelH: (h: number) => void;
  setBrowse: (c: State["browse"]) => void;
  clearStart: () => void;
}

let nonce = 1;

const RECENT_KEY = "trsm.recent.v1";
export function loadRecent(): string[] {
  try {
    const r = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
    return r.filter((id) => DEST_BY_ID[id]).slice(0, 6);
  } catch {
    return [];
  }
}
export function pushRecent(id: string) {
  try {
    const r = [id, ...loadRecent().filter((x) => x !== id)].slice(0, 6);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(r));
  } catch {
    /* ignore */
  }
}
export function clearRecent() {
  try {
    window.localStorage.removeItem(RECENT_KEY);
  } catch {
    /* ignore */
  }
}

export const useApp = create<State>((set, get) => ({
  floor: "L7",
  viewMode: "3d",
  selectedId: null,
  phase: "explore",
  start: null,
  startSource: null,
  accessible: false,
  allowUnverified: false,
  route: null,
  routeError: null,
  navMode: null,
  progress: 0,
  stepIndex: 0,
  playing: false,
  speed: 1,
  follow: false,
  position: null,
  camera: null,
  calibration: EMPTY_CALIBRATION,
  sheet: "peek",
  pickingStartOnMap: false,
  notice: null,
  reducedMotion: false,
  announce: "",
  panelH: 220,
  browse: null,

  setFloor: (f) => set({ floor: f }),
  setViewMode: (m) => set({ viewMode: m }),
  select: (id, opts) => {
    if (!id) {
      set({ selectedId: null, phase: get().phase === "place" ? "explore" : get().phase });
      return;
    }
    const d = DEST_BY_ID[id];
    if (!d) {
      set({ notice: "That destination isn't in the map data." });
      return;
    }
    pushRecent(id);
    const st = get();
    const inRoute = st.phase === "directions";
    set({ selectedId: id, floor: d.floor, phase: inRoute ? "directions" : "place", sheet: "half", browse: null });
    if (opts?.focus !== false) {
      const at = d.entry ? [d.entry.x, d.entry.y] : d.labelAt ?? [0, 0];
      get().requestCamera({ kind: "focus", floor: d.floor, x: at[0], y: at[1], distance: 540 });
    }
    get().say(`${d.name}${d.number && d.hasName ? `, room ${d.number}` : ""}, ${FLOOR_LEVEL[d.floor]}th floor selected.`);
    if (inRoute) get().recompute();
  },
  openDirections: () => {
    set({ phase: "directions", sheet: "half" });
    get().recompute();
  },
  setStart: (s, source = null) => {
    set({ start: s, startSource: source, pickingStartOnMap: false });
    if (s && s.kind === "point") set({ position: { floor: s.floor, p: [s.x, s.y], heading: null, uncertainty: 0, source: source === "qr" ? "qr" : "manual" } });
    get().recompute();
  },
  swap: () => {
    const { start, selectedId } = get();
    if (!start || !selectedId || start.kind !== "node") {
      set({ notice: "Swap works when both ends are rooms. Pick a room as your starting point first." });
      return;
    }
    // find the destination whose door is the start node
    const from = Object.values(DEST_BY_ID).find((d) => d.entry?.nodeId === start.nodeId);
    const to = DEST_BY_ID[selectedId];
    if (!from || !to?.entry) return;
    set({ selectedId: from.id, start: { kind: "node", nodeId: to.entry.nodeId, label: to.name }, startSource: "room" });
    get().recompute();
  },
  setAccessible: (v) => {
    set({ accessible: v });
    get().recompute();
  },
  setAllowUnverified: (v) => {
    set({ allowUnverified: v });
    try {
      window.localStorage.setItem("trsm.allowUnverified", v ? "1" : "0");
    } catch {
      /* ignore */
    }
    get().recompute();
  },
  recompute: () => {
    const { start, selectedId, accessible, allowUnverified, phase } = get();
    if (!selectedId || !start) {
      set({ route: null, routeError: null });
      return;
    }
    const r = computeRoute(start, selectedId, { accessible, allowUnverifiedConnectors: allowUnverified });
    if (r.ok) {
      set({ route: r, routeError: null, progress: 0 });
      if (phase === "directions") {
        set({ floor: (r.legs.find((l) => l.length > 2) ?? r.legs[0]).floor });
        get().requestCamera({ kind: "route" });
      }
      get().say(`Route ready: ${r.instructions.length} steps${r.transitions.length ? `, ${r.transitions.length} floor change` : ""}.`);
    } else {
      set({ route: null, routeError: r.message });
      get().say(r.message);
    }
  },
  startNavigation: (mode) => {
    const r = get().route;
    if (!r) return;
    set({ phase: "navigating", navMode: mode, progress: 0, stepIndex: 0, playing: mode === "demo", follow: true, sheet: "peek", floor: r.legs[0].floor });
    get().say(r.instructions[0]?.text ?? "Navigation started.");
  },
  stopNavigation: () => set({ phase: get().route ? "directions" : "explore", navMode: null, playing: false, follow: false, progress: 0, sheet: "half" }),
  setProgress: (s) => set({ progress: s }),
  goToStep: (i) => {
    const r = get().route;
    if (!r) return;
    if (i >= r.instructions.length) {
      get().arrive();
      return;
    }
    const idx = Math.max(0, i);
    const ins = r.instructions[idx];
    set({ stepIndex: idx, progress: Math.min(r.lengthUnits, ins.s), floor: ins.floor, follow: true });
    const legHeading = (() => {
      const leg = r.legs.find((l) => l.floor === ins.floor && ins.s >= l.startAt - 0.5 && ins.s <= l.startAt + l.length + 0.5);
      if (!leg) return null;
      let acc = leg.startAt;
      for (let k = 1; k < leg.points.length; k++) {
        const a = leg.points[k - 1], b = leg.points[k];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (ins.s <= acc + L + 0.01 || k === leg.points.length - 1) {
          const nb = k < leg.points.length - 1 && ins.s >= acc + L - 0.5 ? leg.points[k + 1] : b;
          const na = k < leg.points.length - 1 && ins.s >= acc + L - 0.5 ? b : a;
          return ((Math.atan2(nb[0] - na[0], -(nb[1] - na[1])) * 180) / Math.PI + 360) % 360;
        }
        acc += L;
      }
      return null;
    })();
    set({ position: { floor: ins.floor, p: ins.at, heading: legHeading, uncertainty: 0, source: "manual" } });
    get().say(ins.text);
  },
  setPlaying: (p) => set({ playing: p }),
  setSpeed: (v) => set({ speed: v }),
  setFollow: (v) => set({ follow: v }),
  setPosition: (p) => set({ position: p }),
  requestCamera: (c) => set({ camera: { ...c, nonce: nonce++ } }),
  setCalibration: (c) => set({ calibration: c }),
  setSheet: (s) => set({ sheet: s }),
  setPickingStart: (v) => set({ pickingStartOnMap: v, notice: v ? "Tap a corridor on the map to set your starting point." : null }),
  setNotice: (n) => set({ notice: n }),
  setReducedMotion: (v) => set({ reducedMotion: v }),
  arrive: () => {
    const d = get().selectedId ? DEST_BY_ID[get().selectedId!] : null;
    set({ phase: "arrived", playing: false, sheet: "half" });
    get().say(d ? `You have arrived at ${d.name}.` : "You have arrived.");
  },
  reset: () =>
    set({ selectedId: null, phase: "explore", route: null, routeError: null, navMode: null, progress: 0, playing: false, follow: false, sheet: "peek", browse: null }),
  applyAnchor: (anchorId) => {
    const a = ANCHOR_BY_ID[anchorId];
    if (!a) return { ok: false, message: `QR code "${anchorId}" isn't a known TRSM positioning anchor. Your location wasn't changed.` };
    set({ floor: a.floor, position: { floor: a.floor, p: [a.x, a.y], heading: null, uncertainty: 0, source: "qr" } });
    get().setStart({ kind: "node", nodeId: a.nodeId, label: a.label }, "qr");
    get().requestCamera({ kind: "focus", floor: a.floor, x: a.x, y: a.y, distance: 420 });
    get().say(`Location set from QR code: ${a.label}, ${FLOOR_LEVEL[a.floor]}th floor.`);
    return { ok: true, message: `You're at ${a.label} on the ${FLOOR_LEVEL[a.floor]}th floor.` };
  },
  say: (text) => set({ announce: text }),
  setPanelH: (h) => {
    if (Math.abs(h - get().panelH) > 2) set({ panelH: h });
  },
  setBrowse: (c) => set({ browse: c }),
  clearStart: () => set({ start: null, startSource: null, route: null, routeError: null }),
}));
