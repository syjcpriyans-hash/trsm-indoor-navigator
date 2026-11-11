import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { PLAN_BOUNDS } from "@/data";
import type { FillClass, PolygonJSON, Pt } from "@/types/map";

/** plan (x, y-down) → world (X, Z) with the building centred on the origin */
export const toWorld = (p: Pt, y = 0) => new THREE.Vector3(p[0] - PLAN_BOUNDS.cx, y, p[1] - PLAN_BOUNDS.cy);
export const fromWorld = (v: THREE.Vector3): Pt => [v.x + PLAN_BOUNDS.cx, v.z + PLAN_BOUNDS.cy];

export const SLAB_TOP = 2;
export const ROOM_H = 7;

// muted architectural palette, keyed to the plan legend colours
export const FILL_COLOR: Record<FillClass, string> = {
  white: "#FFFFFF",
  blue_room: "#CFE6F3",
  lime_room: "#DCE3A6",
  green_room: "#CBE6D9",
  pink_room: "#F1CFDF",
  lavender_room: "#DDD3EA",
  paleyellow_room: "#F6EDC4",
  salmon_room: "#F5D9CB",
  washroom: "#F3CDA8",
  elevator: "#F4E29A",
};

/** Build a THREE.Shape in the shape's XY plane such that after rotateX(-PI/2) it lands on world XZ. */
export function shapeFrom(poly: PolygonJSON): THREE.Shape {
  const pts = poly.outer.map(([x, y]) => new THREE.Vector2(x - PLAN_BOUNDS.cx, -(y - PLAN_BOUNDS.cy)));
  const s = new THREE.Shape(pts);
  for (const h of poly.holes) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x - PLAN_BOUNDS.cx, -(y - PLAN_BOUNDS.cy)))));
  return s;
}

export function extrude(polys: PolygonJSON[], depth: number, base = 0): THREE.BufferGeometry | null {
  const geos: THREE.BufferGeometry[] = [];
  for (const p of polys) {
    if (p.outer.length < 3) continue;
    const g = new THREE.ExtrudeGeometry(shapeFrom(p), { depth, bevelEnabled: false, curveSegments: 1 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, base, 0);
    geos.push(g.index ? g.toNonIndexed() : g);
  }
  if (!geos.length) return null;
  const m = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  return m;
}

export function flat(polys: PolygonJSON[], y: number): THREE.BufferGeometry | null {
  const geos: THREE.BufferGeometry[] = [];
  for (const p of polys) {
    if (p.outer.length < 3) continue;
    const g = new THREE.ShapeGeometry(shapeFrom(p), 1);
    g.rotateX(-Math.PI / 2);
    g.translate(0, y, 0);
    geos.push(g.index ? g.toNonIndexed() : g);
  }
  if (!geos.length) return null;
  const m = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  // world-space UVs for pattern textures
  const pos = m.getAttribute("position");
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / 6;
    uv[i * 2 + 1] = pos.getZ(i) / 6;
  }
  m.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return m;
}

export function outlineSegments(polys: PolygonJSON[], y: number): THREE.BufferGeometry {
  const arr: number[] = [];
  for (const p of polys) {
    for (const ring of [p.outer, ...p.holes]) {
      for (let i = 0; i < ring.length - 1; i++) {
        const a = ring[i], b = ring[i + 1];
        arr.push(a[0] - PLAN_BOUNDS.cx, y, a[1] - PLAN_BOUNDS.cy, b[0] - PLAN_BOUNDS.cx, y, b[1] - PLAN_BOUNDS.cy);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
  return g;
}

/** Thin flat ribbon along a polyline (route line). */
export function ribbon(points: Pt[], width: number, y: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const hw = width / 2;
  const w = (p: Pt) => [p[0] - PLAN_BOUNDS.cx, p[1] - PLAN_BOUNDS.cy];
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = w(points[i]);
    const [bx, bz] = w(points[i + 1]);
    const dx = bx - ax, dz = bz - az;
    const L = Math.hypot(dx, dz) || 1;
    const nx = (-dz / L) * hw, nz = (dx / L) * hw;
    pos.push(ax + nx, y, az + nz, bx + nx, y, bz + nz, bx - nx, y, bz - nz);
    pos.push(ax + nx, y, az + nz, bx - nx, y, bz - nz, ax - nx, y, az - nz);
  }
  // round joins
  const seg = 10;
  for (let i = 0; i < points.length; i++) {
    const [cx, cz] = w(points[i]);
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
      pos.push(cx, y, cz, cx + Math.cos(a1) * hw, y, cz + Math.sin(a1) * hw, cx + Math.cos(a0) * hw, y, cz + Math.sin(a0) * hw);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Chevron arrows spaced along a polyline. */
export function chevrons(points: Pt[], spacing: number, size: number, y: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const total: number[] = [0];
  for (let i = 1; i < points.length; i++) total.push(total[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  const L = total[total.length - 1];
  for (let s = spacing * 0.6; s < L - spacing * 0.4; s += spacing) {
    let i = 1;
    while (i < total.length - 1 && total[i] < s) i++;
    const a = points[i - 1], b = points[i];
    const segL = total[i] - total[i - 1] || 1;
    const t = (s - total[i - 1]) / segL;
    const cx = a[0] + (b[0] - a[0]) * t - PLAN_BOUNDS.cx, cz = a[1] + (b[1] - a[1]) * t - PLAN_BOUNDS.cy;
    const dx = (b[0] - a[0]) / segL, dz = (b[1] - a[1]) / segL;
    const nx = -dz, nz = dx;
    const tip = [cx + dx * size * 0.55, cz + dz * size * 0.55];
    const l = [cx - dx * size * 0.35 + nx * size * 0.5, cz - dz * size * 0.35 + nz * size * 0.5];
    const r = [cx - dx * size * 0.35 - nx * size * 0.5, cz - dz * size * 0.35 - nz * size * 0.5];
    const m = [cx - dx * size * 0.05, cz - dz * size * 0.05];
    pos.push(tip[0], y, tip[1], l[0], y, l[1], m[0], y, m[1]);
    pos.push(tip[0], y, tip[1], m[0], y, m[1], r[0], y, r[1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

let stripeTex: THREE.CanvasTexture | null = null;
export function stripeTexture(): THREE.Texture {
  if (stripeTex) return stripeTex;
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d")!;
  g.fillStyle = "#E7E9EC";
  g.fillRect(0, 0, 32, 32);
  g.strokeStyle = "#A9AFB7";
  g.lineWidth = 3;
  for (let k = -32; k < 64; k += 10) {
    g.beginPath();
    g.moveTo(k, 32);
    g.lineTo(k + 32, 0);
    g.stroke();
  }
  stripeTex = new THREE.CanvasTexture(c);
  stripeTex.wrapS = stripeTex.wrapT = THREE.RepeatWrapping;
  stripeTex.anisotropy = 4;
  return stripeTex;
}

let stairTex: THREE.CanvasTexture | null = null;
export function stairTexture(): THREE.Texture {
  if (stairTex) return stairTex;
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d")!;
  g.fillStyle = "#D9DCE1";
  g.fillRect(0, 0, 32, 32);
  g.fillStyle = "#B8BEC6";
  for (let k = 0; k < 32; k += 8) g.fillRect(0, k, 32, 2);
  stairTex = new THREE.CanvasTexture(c);
  stairTex.wrapS = stairTex.wrapT = THREE.RepeatWrapping;
  return stairTex;
}
