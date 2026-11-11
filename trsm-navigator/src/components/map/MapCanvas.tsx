"use client";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { MapControls } from "@react-three/drei";
import { DEST_BY_ID, FLOORS, FLOOR_BY_ID, FLOOR_LEVEL } from "@/data";
import { useApp } from "@/lib/store";
import { pointInPolygon } from "@/lib/geometry";
import type { FloorId } from "@/types/map";
import { FloorModel } from "./FloorModel";
import { RouteLayer } from "./RouteLayer";
import { BlueDot } from "./BlueDot";
import { CameraRig } from "./CameraRig";
import { LabelLayer } from "./LabelLayer";
import { staticLabels, type LabelItem } from "./labels";
import { ROOM_H, SLAB_TOP, fromWorld, toWorld } from "./sceneUtils";

/** Projects label anchors to screen space each frame and greedily removes overlaps. */
function LabelProjector({ items, container }: { items: LabelItem[]; container: React.RefObject<HTMLDivElement | null> }) {
  const { camera, size } = useThree();
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3 } | null;
  const sizes = useRef(new Map<number, [number, number]>());
  const last = useRef("");
  const v = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => {
    sizes.current.clear();
    last.current = "";
  }, [items]);
  useFrame(() => {
    const root = container.current;
    if (!root) return;
    const key = camera.matrixWorld.elements.map((e) => e.toFixed(2)).join(",") + size.width + "x" + size.height + items.length;
    if (key === last.current) return;
    last.current = key;
    const dist = controls ? camera.position.distanceTo(controls.target) : 600;
    const els = root.children as HTMLCollectionOf<HTMLElement>;
    const placed: [number, number, number, number][] = [];
    const order = items.map((_, i) => i).sort((a, b) => items[b].priority - items[a].priority);
    for (const i of order) {
      const it = items[i];
      const el = els[i];
      if (!el) continue;
      let show = dist <= it.maxDist;
      let x = 0, y = 0;
      if (show) {
        const w = toWorld(it.p, it.y);
        v.copy(w).project(camera);
        if (v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1) show = false;
        x = ((v.x + 1) / 2) * size.width;
        y = ((1 - v.y) / 2) * size.height;
      }
      if (show) {
        let sz = sizes.current.get(i);
        if (!sz) {
          el.style.display = "block";
          const inner = el.firstElementChild as HTMLElement | null;
          sz = [inner?.offsetWidth ?? 40, inner?.offsetHeight ?? 14];
          sizes.current.set(i, sz);
        }
        const [w, h] = sz;
        const anchorBottom = it.kind === "pin";
        const box: [number, number, number, number] = anchorBottom ? [x - w / 2, y - h, x + w / 2, y] : [x - w / 2 - 2, y - h / 2 - 1, x + w / 2 + 2, y + h / 2 + 1];
        const always = it.kind === "pin" || it.kind === "start" || it.kind === "transfer";
        if (!always && placed.some((b) => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) show = false;
        if (show) placed.push(box);
      }
      if (show) {
        el.style.display = "block";
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      } else if (el.style.display !== "none") el.style.display = "none";
    }
  });
  return null;
}

/** Tap/click → select the room under the pointer (or set a start point while picking). */
function PointerPicker() {
  const { camera, gl, size } = useThree();
  useEffect(() => {
    const el = gl.domElement;
    let down: { x: number; y: number; t: number } | null = null;
    const ray = new THREE.Raycaster();
    const hitPlane = (cx: number, cy: number, yLevel: number) => {
      const rect = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const p = new THREE.Vector3();
      return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -yLevel), p) ? fromWorld(p) : null;
    };
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY, t: performance.now() });
    const onUp = (e: PointerEvent) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const dt = performance.now() - down.t;
      down = null;
      if (moved > 7 || dt > 600) return;
      const st = useApp.getState();
      const fl = FLOOR_BY_ID[st.floor];
      if (st.pickingStartOnMap) {
        const p = hitPlane(e.clientX, e.clientY, SLAB_TOP);
        if (!p) return;
        if (!pointInPolygon(p, fl.walkable)) {
          st.setNotice("That spot isn't a corridor. Tap a light-grey walkway.");
          return;
        }
        st.setStart({ kind: "point", floor: st.floor, x: p[0], y: p[1], label: "Pinned location" }, "map");
        st.setNotice(null);
        return;
      }
      const top = hitPlane(e.clientX, e.clientY, SLAB_TOP + ROOM_H);
      if (top) {
        const space = fl.spaces.find((s) => pointInPolygon(top, s.polygon));
        if (space) {
          const dest = Object.values(DEST_BY_ID).find((d) => d.spaceIds.includes(space.id) && d.number === space.number) ?? Object.values(DEST_BY_ID).find((d) => d.spaceIds.includes(space.id));
          if (dest) {
            st.select(dest.id, { focus: false });
            return;
          }
        }
      }
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
    };
  }, [camera, gl, size]);
  return null;
}

function Scene({ onAzimuth }: { onAzimuth: (a: number) => void }) {
  const floor = useApp((s) => s.floor);
  const selectedId = useApp((s) => s.selectedId);
  const route = useApp((s) => s.route);
  const phase = useApp((s) => s.phase);
  const progress = useApp((s) => s.progress);
  const position = useApp((s) => s.position);
  const navMode = useApp((s) => s.navMode);
  const reduced = useApp((s) => s.reducedMotion);
  const prevFloor = useRef<FloorId>(floor);
  const dir = useRef(0);
  if (prevFloor.current !== floor) {
    dir.current = FLOOR_LEVEL[floor] > FLOOR_LEVEL[prevFloor.current] ? 1 : -1;
    prevFloor.current = floor;
  }
  const showRoute = route && (phase === "directions" || phase === "navigating" || phase === "arrived");
  return (
    <>
      <hemisphereLight args={["#ffffff", "#d5d9e0", 1.55]} />
      <directionalLight position={[-180, 700, 260]} intensity={1.25} />
      <directionalLight position={[300, 200, -200]} intensity={0.3} />
      {FLOORS.map((f) => {
        const active = f.id === floor;
        const above = FLOOR_LEVEL[f.id] > FLOOR_LEVEL[floor];
        return (
          <FloorModel
            key={f.id}
            floor={f}
            targetVisibility={active ? 1 : 0}
            targetOffset={active ? 0 : above ? 70 : -70}
            selectedId={selectedId}
            reducedMotion={reduced}
          />
        );
      })}
      {showRoute && <RouteLayer route={route!} floor={floor} progress={progress} showProgress={phase === "navigating" || phase === "arrived"} />}
      {position && position.floor === floor && <BlueDot position={position} estimated={navMode === "motion"} />}
      <CameraRig onAzimuth={onAzimuth} />
      <PointerPicker />
    </>
  );
}

export default function MapCanvas({ onAzimuth }: { onAzimuth: (a: number) => void }) {
  const floor = useApp((s) => s.floor);
  const route = useApp((s) => s.route);
  const phase = useApp((s) => s.phase);
  const selectedId = useApp((s) => s.selectedId);
  const start = useApp((s) => s.start);
  const container = useRef<HTMLDivElement>(null);
  const viewMode = useApp((s) => s.viewMode);

  const items = useMemo(() => {
    const f = FLOOR_BY_ID[floor];
    const list = staticLabels(floor, f.features, f.looseLabels);
    const dyn: LabelItem[] = [];
    const d = selectedId ? DEST_BY_ID[selectedId] : null;
    if (d && d.floor === floor && d.entry) dyn.push({ key: "pin", floor, p: [d.entry.x, d.entry.y], y: SLAB_TOP + 1, text: d.number && d.hasName ? `${d.name} · ${d.number}` : d.name, kind: "pin", priority: 100, maxDist: 1e9 });
    if (route && (phase === "directions" || phase === "navigating" || phase === "arrived")) {
      const first = route.legs[0];
      if (first.floor === floor && start) dyn.push({ key: "start", floor, p: first.points[0], y: SLAB_TOP + 1, text: "", kind: "start", priority: 99, maxDist: 1e9 });
      for (const t of route.transitions) {
        if (t.fromFloor === floor) dyn.push({ key: `tr-${t.fromFloor}`, floor, p: t.at, y: SLAB_TOP + 1, text: `To ${FLOOR_LEVEL[t.toFloor]}th floor`, kind: "transfer", priority: 98, maxDist: 1e9 });
        if (t.toFloor === floor) dyn.push({ key: `tr2-${t.toFloor}`, floor, p: t.toAt, y: SLAB_TOP + 1, text: `From ${FLOOR_LEVEL[t.fromFloor]}th floor`, kind: "transfer", priority: 98, maxDist: 1e9 });
      }
    }
    return [...dyn, ...list];
  }, [floor, selectedId, route, phase, start]);

  return (
    <div className="absolute inset-0" data-testid="map-canvas" data-floor={floor} data-view={viewMode} data-map-surface>
      <Canvas
        dpr={[1, 2]}
        camera={{ fov: 34, near: 2, far: 6000, position: [0, 600, 500] }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => gl.setClearColor(new THREE.Color("#F4F5F7"))}
        style={{ touchAction: "none" }}
      >
        <Scene onAzimuth={onAzimuth} />
        <MapControls makeDefault enableDamping dampingFactor={0.12} minDistance={60} maxDistance={2800} maxPolarAngle={1.15} zoomSpeed={0.9} />
        <LabelProjector items={items} container={container} />
      </Canvas>
      <LabelLayer ref={container} items={items} onSelect={(id) => useApp.getState().select(id)} />
    </div>
  );
}
