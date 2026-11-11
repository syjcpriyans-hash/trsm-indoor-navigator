import { DEST_BY_ID, FLOOR_BY_ID, GRAPH, floorName } from "@/data";
import type { Connector, Destination, FloorId, GraphEdge, GraphNode, Pt } from "@/types/map";
import { dist, pointInPolygon, projectOnSegment, segmentInsideAny, segmentInsidePolygon } from "@/lib/geometry";
import { astar } from "./astar";
import { getRoutingGraph, type Arc, type RouteOptions } from "./graph";
import { buildInstructions, type Instruction } from "./instructions";

export type RouteStart =
  | { kind: "node"; nodeId: string; label: string }
  | { kind: "point"; floor: FloorId; x: number; y: number; label: string };

export interface RouteLeg {
  floor: FloorId;
  /** displayed polyline (smoothed inside the walkable area) */
  points: Pt[];
  /** for each segment i→i+1: true when it crosses a hatched (unverified) area */
  hatchSeg: boolean[];
  /** cumulative distance (plan units) at points[0] along the whole route */
  startAt: number;
  length: number;
}

export interface RouteTransition {
  connector: Connector;
  fromFloor: FloorId;
  toFloor: FloorId;
  at: Pt;
  toAt: Pt;
  distanceAt: number;
}

export interface RouteOk {
  ok: true;
  destination: Destination;
  start: RouteStart;
  legs: RouteLeg[];
  transitions: RouteTransition[];
  nodePath: string[];
  lengthUnits: number;
  instructions: Instruction[];
  warnings: string[];
  accessibleRequested: boolean;
  validation: { ok: boolean; problems: string[] };
}

export interface RouteFail {
  ok: false;
  reason: "invalid-destination" | "no-entry" | "invalid-start" | "no-route" | "invalid-geometry";
  message: string;
}

export type RouteResult = RouteOk | RouteFail;

const START_ID = "__start__";

/** Snap an arbitrary plan point to the nearest corridor edge reachable in a straight line. */
export function snapToCorridor(floor: FloorId, p: Pt): { a: string; b: string; point: Pt; d: number } | null {
  const fl = FLOOR_BY_ID[floor];
  if (!fl) return null;
  const nodes = new Map(GRAPH.nodes.map((n) => [n.id, n]));
  const inside = pointInPolygon(p, fl.walkable);
  const cands: { a: string; b: string; point: Pt; d: number }[] = [];
  for (const e of GRAPH.edges) {
    if (e.kind !== "corridor") continue;
    const A = nodes.get(e.a)!, B = nodes.get(e.b)!;
    if (A.floor !== floor) continue;
    const pr = projectOnSegment(p, [A.x, A.y], [B.x, B.y]);
    cands.push({ a: e.a, b: e.b, point: pr.point, d: pr.d });
  }
  cands.sort((x, y) => x.d - y.d);
  for (const c of cands) {
    if (!inside) return c; // outside walkable (e.g. tapped a wall): take the closest
    if (c.d < 0.05 || segmentInsidePolygon(p, c.point, fl.walkable)) return c;
  }
  return cands[0] ?? null;
}

function legPolygons(floor: FloorId) {
  const f = FLOOR_BY_ID[floor];
  return { walk: f.walkable, inset: f.walkableInset, hatched: f.hatched };
}

/** Greedy string-pulling inside the walkable area (keeps away from walls using the inset polygons). */
function smooth(points: Pt[], floor: FloorId): Pt[] {
  if (points.length <= 2) return points.slice();
  const { walk, inset } = legPolygons(floor);
  const out: Pt[] = [points[0]];
  let i = 0;
  while (i < points.length - 1) {
    let j = points.length - 1;
    for (; j > i + 1; j--) {
      const a = points[i], b = points[j];
      const endpoint = i === 0 || j === points.length - 1;
      const ok = endpoint ? segmentInsidePolygon(a, b, walk) && segmentClearOfWalls(a, b, inset, walk) : segmentInsideAny(a, b, inset);
      if (ok) break;
    }
    out.push(points[j]);
    i = j;
  }
  return out;
}

/** For segments touching a door point: the middle portion must still keep wall clearance. */
function segmentClearOfWalls(a: Pt, b: Pt, inset: import("@/types/map").PolygonJSON[], walk: import("@/types/map").PolygonJSON) {
  const L = dist(a, b);
  if (L < 8) return segmentInsidePolygon(a, b, walk);
  const t0 = 3 / L, t1 = 1 - 3 / L;
  const p0: Pt = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0];
  const p1: Pt = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
  return segmentInsideAny(p0, p1, inset) || segmentInsidePolygon(p0, p1, walk);
}

export function validateLegs(legs: RouteLeg[]): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  for (const leg of legs) {
    const { walk, hatched } = legPolygons(leg.floor);
    for (let i = 0; i < leg.points.length - 1; i++) {
      const a = leg.points[i], b = leg.points[i + 1];
      if (dist(a, b) < 0.05) continue;
      const ok = leg.hatchSeg[i] ? segmentInsideAny(a, b, [walk, ...hatched.map((h) => ({ outer: h.outer, holes: [] }))]) : segmentInsidePolygon(a, b, walk);
      if (!ok) problems.push(`${leg.floor} segment ${i} (${a.map((v) => v.toFixed(1))} → ${b.map((v) => v.toFixed(1))}) leaves the walkable area`);
    }
  }
  return { ok: problems.length === 0, problems };
}

export function computeRoute(start: RouteStart, destinationId: string, opts: RouteOptions = {}): RouteResult {
  const dest = DEST_BY_ID[destinationId];
  if (!dest) return { ok: false, reason: "invalid-destination", message: "That destination isn't in the TRSM map data." };
  if (!dest.entry) return { ok: false, reason: "no-entry", message: `No way into ${dest.name} could be established from the floor plan.` };
  const g = getRoutingGraph(GRAPH, opts);
  const goal = dest.entry.nodeId;

  // virtual start
  const extraNodes = new Map<string, { x: number; y: number; floor: string }>();
  const extraAdj = new Map<string, Arc[]>();
  let startId: string;
  if (start.kind === "node") {
    if (!g.nodes.has(start.nodeId)) return { ok: false, reason: "invalid-start", message: "The starting point isn't on the map." };
    startId = start.nodeId;
  } else {
    if (!FLOOR_BY_ID[start.floor]) return { ok: false, reason: "invalid-start", message: "Unknown floor for the starting point." };
    const snap = snapToCorridor(start.floor, [start.x, start.y]);
    if (!snap) return { ok: false, reason: "invalid-start", message: "Couldn't place the starting point on a corridor." };
    startId = START_ID;
    extraNodes.set(START_ID, { x: snap.point[0], y: snap.point[1], floor: start.floor });
    const A = g.nodes.get(snap.a)!, B = g.nodes.get(snap.b)!;
    const fakeEdge = (to: string): GraphEdge => ({ a: START_ID, b: to, kind: "corridor", verification: "source-derived" });
    extraAdj.set(START_ID, [
      { to: snap.a, w: dist(snap.point, [A.x, A.y]), edge: fakeEdge(snap.a) },
      { to: snap.b, w: dist(snap.point, [B.x, B.y]), edge: fakeEdge(snap.b) },
    ]);
  }
  const path = astar(g, startId, goal, { nodes: extraNodes, adj: extraAdj });
  if (!path) {
    const reason = opts.accessible
      ? `No route with confirmed step-free connections reaches ${dest.name}. The plans don't establish an accessible way there.`
      : `No connected route to ${dest.name} could be found with the verified connections.`;
    return { ok: false, reason: "no-route", message: reason };
  }

  const pos = (id: string): GraphNode | { x: number; y: number; floor: FloorId } => g.nodes.get(id) ?? (extraNodes.get(id) as { x: number; y: number; floor: FloorId });

  // split into floor legs at vertical edges
  const legsRaw: { floor: FloorId; pts: Pt[]; hatch: boolean[] }[] = [];
  const transitions: Omit<RouteTransition, "distanceAt">[] = [];
  let cur = { floor: pos(path.nodes[0]).floor as FloorId, pts: [[pos(path.nodes[0]).x, pos(path.nodes[0]).y] as Pt], hatch: [] as boolean[] };
  if (start.kind === "point") cur.pts.unshift([start.x, start.y]), cur.hatch.push(false);
  for (let k = 0; k < path.edges.length; k++) {
    const e = path.edges[k];
    const nb = pos(path.nodes[k + 1]);
    if (e.kind === "elevator" || e.kind === "escalator" || e.kind === "stair") {
      legsRaw.push(cur);
      const na = pos(path.nodes[k]);
      transitions.push({ connector: g.connectors.get(e.connector!)!, fromFloor: na.floor as FloorId, toFloor: nb.floor as FloorId, at: [na.x, na.y], toAt: [nb.x, nb.y] });
      cur = { floor: nb.floor as FloorId, pts: [[nb.x, nb.y]], hatch: [] };
    } else {
      cur.pts.push([nb.x, nb.y]);
      cur.hatch.push(e.kind === "entry" && e.verification === "unverified");
    }
  }
  legsRaw.push(cur);
  // merge consecutive vertical hops (7 → 8 → 9 in one ride)
  const mergedTransitions: Omit<RouteTransition, "distanceAt">[] = [];
  const legsMerged: typeof legsRaw = [legsRaw[0]];
  for (let i = 0; i < transitions.length; i++) {
    const t = transitions[i];
    const nextLeg = legsRaw[i + 1];
    const last = mergedTransitions[mergedTransitions.length - 1];
    const prevLeg = legsMerged[legsMerged.length - 1];
    if (last && prevLeg.pts.length <= 1 && last.connector.id === t.connector.id) {
      last.toFloor = t.toFloor;
      last.toAt = t.toAt;
      legsMerged[legsMerged.length - 1] = nextLeg;
    } else {
      mergedTransitions.push({ ...t });
      legsMerged.push(nextLeg);
    }
  }

  // smooth each leg in runs separated by hatch segments
  const legs: RouteLeg[] = [];
  let acc = 0;
  const transOut: RouteTransition[] = [];
  legsMerged.forEach((lr, idx) => {
    const pts: Pt[] = [];
    const hatchSeg: boolean[] = [];
    let run: Pt[] = [lr.pts[0]];
    const flush = () => {
      const s = smooth(run, lr.floor);
      if (!pts.length) pts.push(s[0]);
      for (let i = 1; i < s.length; i++) {
        pts.push(s[i]);
        hatchSeg.push(false);
      }
    };
    for (let i = 0; i < lr.hatch.length; i++) {
      if (lr.hatch[i]) {
        flush();
        pts.push(lr.pts[i + 1]);
        hatchSeg.push(true);
        run = [lr.pts[i + 1]];
      } else run.push(lr.pts[i + 1]);
    }
    flush();
    // drop duplicate points
    const P: Pt[] = [pts[0]];
    const H: boolean[] = [];
    for (let i = 1; i < pts.length; i++) {
      if (dist(pts[i], P[P.length - 1]) < 0.05) continue;
      P.push(pts[i]);
      H.push(hatchSeg[i - 1]);
    }
    let length = 0;
    for (let i = 1; i < P.length; i++) length += dist(P[i - 1], P[i]);
    legs.push({ floor: lr.floor, points: P, hatchSeg: H, startAt: acc, length });
    acc += length;
    if (idx < mergedTransitions.length) transOut.push({ ...mergedTransitions[idx], distanceAt: acc });
  });

  const validation = validateLegs(legs);
  if (!validation.ok) {
    return { ok: false, reason: "invalid-geometry", message: "The computed path would leave the walkable corridors, so it was rejected. " + validation.problems[0] };
  }

  const warnings: string[] = [];
  if (dest.entry.status === "estimated") warnings.push("Door positions aren't shown on the floor plans. The arrival point is estimated at the room's corridor-facing wall.");
  if (dest.entry.status === "unverified" || dest.entry.status === "nearest-corridor") warnings.push(dest.entry.note);
  for (const t of transOut) {
    if (t.connector.type === "elevator") warnings.push("This route uses an elevator. Its stops on each floor and its accessibility haven't been verified on site.");
    if (t.connector.verification === "unverified") warnings.push(`${t.connector.name}: ${t.connector.notes[0]}`);
  }
  if (opts.accessible) {
    warnings.push("Accessible routing avoids escalators, stairs and unconfirmed entrances. Step-free access along corridors has not been verified on site, so this route is not confirmed as wheelchair accessible.");
  }

  const startLabel = start.label;
  const instructions = buildInstructions({ legs, transitions: transOut, destination: dest, startLabel, graph: g, startNodeId: start.kind === "node" ? start.nodeId : undefined });
  return {
    ok: true,
    destination: dest,
    start,
    legs,
    transitions: transOut,
    nodePath: path.nodes,
    lengthUnits: acc,
    instructions,
    warnings: Array.from(new Set(warnings)),
    accessibleRequested: !!opts.accessible,
    validation,
  };
}

/** Position + heading at a given distance along the route (for the demo walker). */
export function sampleRoute(route: RouteOk, s: number): { floor: FloorId; p: Pt; heading: number; legIndex: number } {
  const total = route.lengthUnits;
  const d = Math.max(0, Math.min(total, s));
  for (let li = 0; li < route.legs.length; li++) {
    const leg = route.legs[li];
    const isLast = li === route.legs.length - 1;
    if (d <= leg.startAt + leg.length || isLast) {
      let rem = d - leg.startAt;
      for (let i = 1; i < leg.points.length; i++) {
        const a = leg.points[i - 1], b = leg.points[i];
        const L = dist(a, b);
        if (rem <= L || i === leg.points.length - 1) {
          const t = L > 0 ? Math.min(1, Math.max(0, rem / L)) : 0;
          const heading = (Math.atan2(b[0] - a[0], -(b[1] - a[1])) * 180) / Math.PI;
          return { floor: leg.floor, p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], heading: (heading + 360) % 360, legIndex: li };
        }
        rem -= L;
      }
      return { floor: leg.floor, p: leg.points[leg.points.length - 1], heading: 0, legIndex: li };
    }
  }
  const leg = route.legs[route.legs.length - 1];
  return { floor: leg.floor, p: leg.points[leg.points.length - 1], heading: 0, legIndex: route.legs.length - 1 };
}

/** Project a free point onto the route; returns distance-along and lateral offset. */
export function projectOntoRoute(route: RouteOk, floor: FloorId, p: Pt): { s: number; d: number } | null {
  let best: { s: number; d: number } | null = null;
  for (const leg of route.legs) {
    if (leg.floor !== floor) continue;
    let acc = leg.startAt;
    for (let i = 1; i < leg.points.length; i++) {
      const a = leg.points[i - 1], b = leg.points[i];
      const pr = projectOnSegment(p, a, b);
      const s = acc + dist(a, pr.point);
      if (!best || pr.d < best.d) best = { s, d: pr.d };
      acc += dist(a, b);
    }
  }
  return best;
}

export const describeFloor = floorName;
