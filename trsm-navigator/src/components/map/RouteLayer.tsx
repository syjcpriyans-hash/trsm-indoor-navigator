"use client";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { FloorId, Pt } from "@/types/map";
import type { RouteOk } from "@/features/routing/route";
import { dist } from "@/lib/geometry";
import { SLAB_TOP, chevrons, ribbon } from "./sceneUtils";

/** Split a leg polyline at leg-local distance s → [travelled, remaining]. */
function splitAt(points: Pt[], s: number): [Pt[], Pt[]] {
  if (s <= 0) return [[], points];
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const L = dist(points[i - 1], points[i]);
    if (acc + L >= s) {
      const t = (s - acc) / (L || 1);
      const m: Pt = [points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t, points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t];
      return [[...points.slice(0, i), m], [m, ...points.slice(i)]];
    }
    acc += L;
  }
  return [points, []];
}

export function RouteLayer({ route, floor, progress, showProgress }: { route: RouteOk; floor: FloorId; progress: number; showProgress: boolean }) {
  const legs = route.legs.filter((l) => l.floor === floor);
  // quantise progress so geometry isn't rebuilt every frame
  const q = showProgress ? Math.round(progress / 1.5) * 1.5 : 0;
  const geos = useMemo(() => {
    const done: THREE.BufferGeometry[] = [];
    const todo: THREE.BufferGeometry[] = [];
    const arrows: THREE.BufferGeometry[] = [];
    const casing: THREE.BufferGeometry[] = [];
    for (const leg of legs) {
      const local = q - leg.startAt;
      const [a, b] = splitAt(leg.points, Math.min(Math.max(local, 0), leg.length));
      if (a.length >= 2) done.push(ribbon(a, 3.4, SLAB_TOP + 0.45));
      if (b.length >= 2) {
        casing.push(ribbon(b, 5.0, SLAB_TOP + 0.4));
        todo.push(ribbon(b, 3.4, SLAB_TOP + 0.5));
        arrows.push(chevrons(b, 20, 2.6, SLAB_TOP + 0.56));
      }
    }
    return { done, todo, arrows, casing };
  }, [legs, q]);

  useEffect(() => () => Object.values(geos).flat().forEach((g) => g.dispose()), [geos]);

  const mats = useMemo(
    () => ({
      casing: new THREE.MeshBasicMaterial({ color: "#FFFFFF", depthTest: false, transparent: true, opacity: 0.95 }),
      todo: new THREE.MeshBasicMaterial({ color: "#1F6FEB", depthTest: false, transparent: true }),
      done: new THREE.MeshBasicMaterial({ color: "#9DB7DA", depthTest: false, transparent: true, opacity: 0.85 }),
      arrows: new THREE.MeshBasicMaterial({ color: "#FFFFFF", depthTest: false, transparent: true, side: THREE.DoubleSide }),
    }),
    [],
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  return (
    <group>
      {geos.done.map((g, i) => (
        <mesh key={`d${i}`} geometry={g} material={mats.done} renderOrder={20} />
      ))}
      {geos.casing.map((g, i) => (
        <mesh key={`c${i}`} geometry={g} material={mats.casing} renderOrder={21} />
      ))}
      {geos.todo.map((g, i) => (
        <mesh key={`t${i}`} geometry={g} material={mats.todo} renderOrder={22} />
      ))}
      {geos.arrows.map((g, i) => (
        <mesh key={`a${i}`} geometry={g} material={mats.arrows} renderOrder={23} />
      ))}
    </group>
  );
}
