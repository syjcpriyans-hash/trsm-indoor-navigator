import type { PolygonJSON, Pt } from "@/types/map";

export const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function pointInRing(p: Pt, ring: Pt[]): boolean {
  let inside = false;
  const [x, y] = p;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(p: Pt, poly: PolygonJSON): boolean {
  if (!pointInRing(p, poly.outer)) return false;
  for (const h of poly.holes) if (pointInRing(p, h)) return false;
  return true;
}

function orient(a: Pt, b: Pt, c: Pt) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

/** Proper intersection (touching at endpoints within eps is not counted). */
export function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt, eps = 1e-6): boolean {
  const d1 = orient(c, d, a), d2 = orient(c, d, b), d3 = orient(a, b, c), d4 = orient(a, b, d);
  return ((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) && ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps));
}

function* rings(poly: PolygonJSON) {
  yield poly.outer;
  for (const h of poly.holes) yield h;
}

/** True when the segment a→b stays inside the polygon (does not cross any wall ring). */
export function segmentInsidePolygon(a: Pt, b: Pt, poly: PolygonJSON): boolean {
  for (const ring of rings(poly)) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      if (segmentsCross(a, b, ring[j], ring[i])) return false;
    }
  }
  // sample interior points (handles collinear grazing and fully-outside segments)
  const n = Math.max(2, Math.ceil(dist(a, b) / 6));
  for (let k = 1; k < n; k++) {
    const t = k / n;
    if (!pointInPolygon([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], poly)) return false;
  }
  return true;
}

export function segmentInsideAny(a: Pt, b: Pt, polys: PolygonJSON[]): boolean {
  // either fully inside one polygon, or every sample point is inside some polygon
  if (polys.some((p) => segmentInsidePolygon(a, b, p))) return true;
  const n = Math.max(2, Math.ceil(dist(a, b) / 2));
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const q: Pt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    if (!polys.some((p) => pointInPolygon(q, p))) return false;
  }
  return true;
}

export function projectOnSegment(p: Pt, a: Pt, b: Pt): { t: number; point: Pt; d: number } {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy || 1e-9;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
  const point: Pt = [a[0] + t * dx, a[1] + t * dy];
  return { t, point, d: dist(p, point) };
}

export function polylineLength(pts: Pt[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]);
  return s;
}

/** Heading in degrees, 0 = plan north (up), clockwise positive. */
export function headingDeg(a: Pt, b: Pt): number {
  const h = (Math.atan2(b[0] - a[0], -(b[1] - a[1])) * 180) / Math.PI;
  return (h + 360) % 360;
}

/** Signed turn from heading h1 to h2 in degrees, (-180, 180]; positive = right/clockwise. */
export function turnDeg(h1: number, h2: number): number {
  let d = h2 - h1;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return d;
}

export function polygonCentroid(ring: Pt[]): Pt {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += f;
    cx += (ring[j][0] + ring[i][0]) * f;
    cy += (ring[j][1] + ring[i][1]) * f;
  }
  if (Math.abs(a) < 1e-9) return ring[0];
  return [cx / (3 * a), cy / (3 * a)];
}
