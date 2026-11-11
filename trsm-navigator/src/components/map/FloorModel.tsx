"use client";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { FillClass, Floor } from "@/types/map";
import { DEST_BY_ID } from "@/data";
import { FILL_COLOR, ROOM_H, SLAB_TOP, extrude, flat, outlineSegments, stairTexture, stripeTexture } from "./sceneUtils";

interface Props {
  floor: Floor;
  /** 0 = hidden, 1 = fully shown */
  targetVisibility: number;
  /** vertical offset used for the floor-change animation (world units) */
  targetOffset: number;
  selectedId: string | null;
  reducedMotion: boolean;
}

export function FloorModel({ floor, targetVisibility, targetOffset, selectedId, reducedMotion }: Props) {
  const group = useRef<THREE.Group>(null);
  const state = useRef({ vis: targetVisibility, off: targetOffset });

  const geo = useMemo(() => {
    const byFill = new Map<FillClass, typeof floor.spaces>();
    for (const s of floor.spaces) {
      if (!byFill.has(s.fill)) byFill.set(s.fill, []);
      byFill.get(s.fill)!.push(s);
    }
    const rooms = [...byFill.entries()].map(([fill, list]) => ({
      fill,
      geo: extrude(list.map((s) => s.polygon), fill === "elevator" ? ROOM_H + 1.5 : ROOM_H, SLAB_TOP),
    }));
    return {
      slab: extrude([floor.outline], SLAB_TOP, 0),
      walk: flat([floor.walkable], SLAB_TOP + 0.04),
      court: floor.courtyard ? flat([floor.courtyard], SLAB_TOP + 0.03) : null,
      outdoor: floor.outdoorSeating.length ? flat(floor.outdoorSeating, SLAB_TOP + 0.035) : null,
      hatch: floor.hatched.length ? flat(floor.hatched, SLAB_TOP + 0.06) : null,
      stairs: floor.stairs.length ? flat(floor.stairs, SLAB_TOP + 0.07) : null,
      rooms,
      edges: outlineSegments(floor.spaces.map((s) => s.polygon), SLAB_TOP + ROOM_H + 0.05),
      outline: outlineSegments([floor.outline], SLAB_TOP + 0.08),
    };
  }, [floor]);

  const selGeo = useMemo(() => {
    const d = selectedId ? DEST_BY_ID[selectedId] : null;
    if (!d || d.floor !== floor.id || !d.spaceIds.length) return null;
    const polys = floor.spaces.filter((s) => d.spaceIds.includes(s.id)).map((s) => s.polygon);
    return polys.length ? extrude(polys, ROOM_H + 0.25, SLAB_TOP) : null;
  }, [selectedId, floor]);

  useEffect(
    () => () => {
      geo.slab?.dispose();
      geo.walk?.dispose();
      geo.court?.dispose();
      geo.outdoor?.dispose();
      geo.hatch?.dispose();
      geo.stairs?.dispose();
      geo.rooms.forEach((r) => r.geo?.dispose());
      geo.edges.dispose();
      geo.outline.dispose();
    },
    [geo],
  );
  useEffect(() => () => selGeo?.dispose(), [selGeo]);

  const materials = useMemo(() => {
    const mk = (color: string, extra: Partial<THREE.MeshLambertMaterialParameters> = {}) => new THREE.MeshLambertMaterial({ color, transparent: true, ...extra });
    return {
      slab: mk("#CDD2D9"),
      walk: mk("#E6E9EE"),
      court: mk("#C3C8CF"),
      outdoor: mk("#D6D9DE"),
      hatch: new THREE.MeshBasicMaterial({ map: stripeTexture(), transparent: true }),
      stairs: new THREE.MeshBasicMaterial({ map: stairTexture(), transparent: true }),
      rooms: Object.fromEntries((Object.keys(FILL_COLOR) as FillClass[]).map((k) => [k, mk(FILL_COLOR[k])])) as Record<FillClass, THREE.MeshLambertMaterial>,
      edges: new THREE.LineBasicMaterial({ color: "#6B7280", transparent: true, opacity: 0.6 }),
      outline: new THREE.LineBasicMaterial({ color: "#2B3036", transparent: true, opacity: 0.9 }),
      selected: new THREE.MeshLambertMaterial({ color: "#7FB0F5", transparent: true, opacity: 0.55 }),
    };
  }, []);
  useEffect(() => () => Object.values(materials).forEach((m) => (m instanceof THREE.Material ? m.dispose() : Object.values(m).forEach((x) => x.dispose()))), [materials]);

  useFrame((_, dt) => {
    const s = state.current;
    const k = reducedMotion ? 1 : 1 - Math.pow(0.0008, dt);
    s.vis += (targetVisibility - s.vis) * k;
    s.off += (targetOffset - s.off) * k;
    if (Math.abs(s.vis - targetVisibility) < 0.01) s.vis = targetVisibility;
    if (Math.abs(s.off - targetOffset) < 0.05) s.off = targetOffset;
    const g = group.current;
    if (!g) return;
    g.visible = s.vis > 0.01;
    g.position.y = s.off;
    const set = (m: THREE.Material, base = 1) => {
      m.opacity = base * s.vis;
      m.depthWrite = s.vis > 0.98;
    };
    set(materials.slab); set(materials.walk); set(materials.court); set(materials.outdoor);
    set(materials.hatch); set(materials.stairs);
    Object.values(materials.rooms).forEach((m) => set(m));
    set(materials.edges, 0.55); set(materials.outline, 0.9); set(materials.selected, 0.55);
  });

  return (
    <group ref={group}>
      {geo.slab && <mesh geometry={geo.slab} material={materials.slab} receiveShadow={false} />}
      {geo.walk && <mesh geometry={geo.walk} material={materials.walk} />}
      {geo.court && <mesh geometry={geo.court} material={materials.court} />}
      {geo.outdoor && <mesh geometry={geo.outdoor} material={materials.outdoor} />}
      {geo.hatch && <mesh geometry={geo.hatch} material={materials.hatch} />}
      {geo.stairs && <mesh geometry={geo.stairs} material={materials.stairs} />}
      {geo.rooms.map((r) => r.geo && <mesh key={r.fill} geometry={r.geo} material={materials.rooms[r.fill]} />)}
      <lineSegments geometry={geo.edges} material={materials.edges} />
      <lineSegments geometry={geo.outline} material={materials.outline} />
      {selGeo && <mesh geometry={selGeo} material={materials.selected} renderOrder={2} />}
    </group>
  );
}
