import { DESTINATIONS, FLOOR_BY_ID, FLOOR_LEVEL } from "@/data";
import type { Destination, FloorId, Pt } from "@/types/map";
import { dist, headingDeg, pointInPolygon, projectOnSegment, turnDeg } from "@/lib/geometry";
import type { RoutingGraph } from "./graph";
import type { RouteLeg, RouteTransition } from "./route";

export type InstructionIcon = "start" | "straight" | "left" | "right" | "slight-left" | "slight-right" | "uturn" | "elevator" | "escalator" | "stair" | "arrive";

export interface Instruction {
  id: string;
  text: string;
  icon: InstructionIcon;
  floor: FloorId;
  at: Pt;
  /** distance along the full route (plan units) where this instruction applies */
  s: number;
  /** distance (plan units) to the next instruction, for optional calibrated display */
  segmentLength: number;
}

const ordinalFloor = (n: number) => `${n}th floor`;
const ORDINAL = ["next", "second", "third", "fourth", "fifth"];

/** Fallback orientation using the street names printed on the plans. */
function sideOfBuilding(h: number): string {
  if (h >= 315 || h < 45) return "away from the Dundas Street side";
  if (h < 135) return "toward the Bay Street side";
  if (h < 225) return "toward the Dundas Street side";
  return "away from the Bay Street side";
}

/** Destinations people can recognise on site: named rooms, washrooms, elevators, map pins, water. */
function isLandmark(d: Destination) {
  if (!d.entry) return false;
  if (d.category === "washroom" || d.category === "elevator" || d.category === "water") return true;
  return !!d.hasName || (!d.number && d.category !== "room");
}

const LANDMARKS = DESTINATIONS.filter(isLandmark);
const landmarkName = (d: Destination) =>
  d.category === "washroom" ? "the washrooms" : d.category === "elevator" ? "the elevators" : d.category === "water" ? "the water refill station" : d.number && d.hasName ? `${d.name} (${d.number})` : d.name;

/** Polyline with cumulative distances for along-path queries. */
interface Path {
  pts: Pt[];
  cum: number[];
}
function makePath(pts: Pt[], start: number): Path {
  const cum = [start];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
  return { pts, cum };
}
function pointAt(p: Path, s: number): Pt {
  for (let i = 1; i < p.pts.length; i++) {
    if (s <= p.cum[i] || i === p.pts.length - 1) {
      const L = p.cum[i] - p.cum[i - 1] || 1;
      const t = Math.max(0, Math.min(1, (s - p.cum[i - 1]) / L));
      return [p.pts[i - 1][0] + (p.pts[i][0] - p.pts[i - 1][0]) * t, p.pts[i - 1][1] + (p.pts[i][1] - p.pts[i - 1][1]) * t];
    }
  }
  return p.pts[p.pts.length - 1];
}
/** Project a point onto the path: distance along it and lateral offset. */
function project(p: Path, q: Pt): { s: number; d: number } {
  let best = { s: p.cum[0], d: Infinity };
  for (let i = 1; i < p.pts.length; i++) {
    const pr = projectOnSegment(q, p.pts[i - 1], p.pts[i]);
    if (pr.d < best.d) best = { s: p.cum[i - 1] + dist(p.pts[i - 1], pr.point), d: pr.d };
  }
  return best;
}

function landmarksAlong(floor: FloorId, path: Path, from: number, to: number, maxOffset: number, exclude: Set<string>) {
  const out: { d: Destination; s: number; off: number }[] = [];
  for (const d of LANDMARKS) {
    if (d.floor !== floor || exclude.has(d.id)) continue;
    const pr = project(path, [d.entry!.x, d.entry!.y]);
    if (pr.d <= maxOffset && pr.s > from && pr.s < to) out.push({ d, s: pr.s, off: pr.d });
  }
  return out.sort((a, b) => a.s - b.s);
}

function intersectionsBetween(g: RoutingGraph, floor: FloorId, path: Path, from: number, to: number): number[] {
  const hits: number[] = [];
  for (const id of g.intersections) {
    const n = g.nodes.get(id);
    if (!n || n.floor !== floor) continue;
    const pr = project(path, [n.x, n.y]);
    if (pr.d < 9 && pr.s > from && pr.s < to) hits.push(pr.s);
  }
  // junctions closer than 12 units apart read as one intersection
  hits.sort((a, b) => a - b);
  return hits.filter((s, i) => i === 0 || s - hits[i - 1] > 12);
}

/** Direction you face when stepping out through a door: from the nearest wall point to the door. */
function outwardHeading(floor: FloorId, door: Pt, polys: import("@/types/map").PolygonJSON[], fallbackFrom: Pt): number {
  let best: { d: number; p: Pt } | null = null;
  for (const poly of polys) {
    for (const ring of [poly.outer, ...poly.holes]) {
      for (let i = 1; i < ring.length; i++) {
        const pr = projectOnSegment(door, ring[i - 1], ring[i]);
        if (!best || pr.d < best.d) best = { d: pr.d, p: pr.point };
      }
    }
  }
  if (best && best.d > 0.2 && best.d < 6) return headingDeg(best.p, door);
  return headingDeg(fallbackFrom, door);
}

/** True when the corridor does not continue straight on past a turn (a T-junction or corner). */
function corridorEnds(floor: FloorId, at: Pt, heading: number): boolean {
  const walk = FLOOR_BY_ID[floor].walkable;
  const r = (heading * Math.PI) / 180;
  for (const k of [14, 22]) {
    if (pointInPolygon([at[0] + Math.sin(r) * k, at[1] - Math.cos(r) * k], walk)) return false;
  }
  return true;
}

function turnWord(t: number): { word: string; icon: InstructionIcon } {
  const a = Math.abs(t);
  const side = t > 0 ? "right" : "left";
  if (a > 150) return { word: "turn around", icon: "uturn" };
  if (a < 50) return { word: `bear ${side}`, icon: side === "left" ? "slight-left" : "slight-right" };
  return { word: `turn ${side}`, icon: side };
}

/** "Leave X and turn left" — compares the direction you face stepping out with the way the route goes. */
function exitPhrase(outward: number, path: Path, from: number): { phrase: string; icon: InstructionIcon } {
  const ahead = pointAt(path, from + 22);
  const h = headingDeg(pointAt(path, from), ahead);
  const t = turnDeg(outward, h);
  if (Math.abs(t) < 40) return { phrase: "go straight ahead", icon: "straight" };
  if (Math.abs(t) > 140) return { phrase: "turn around", icon: "uturn" };
  return { phrase: `turn ${t > 0 ? "right" : "left"}`, icon: t > 0 ? "right" : "left" };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function buildInstructions(args: {
  legs: RouteLeg[];
  transitions: RouteTransition[];
  destination: Destination;
  startLabel: string;
  graph: RoutingGraph;
  startNodeId?: string;
}): Instruction[] {
  const { legs, transitions, destination, startLabel, graph, startNodeId } = args;
  const out: Instruction[] = [];
  let n = 0;
  const push = (i: Omit<Instruction, "id" | "segmentLength">) => out.push({ ...i, id: `i${n++}`, segmentLength: 0 });
  const startRoom = startNodeId ? DESTINATIONS.find((d) => d.entry?.nodeId === startNodeId && d.labelAt && d.category !== "elevator") : undefined;
  // QR anchors sit on the corridor just outside a room: orient the first step with that room behind you
  const besideRoom = !startRoom && startNodeId
    ? (graph.adj.get(startNodeId) ?? [])
        .filter((a) => a.edge.kind === "entry")
        .map((a) => DESTINATIONS.find((d) => d.entry?.nodeId === a.to && d.labelAt && (d.hasName || d.category === "elevator")))
        .find(Boolean)
    : undefined;
  const exclude = new Set([destination.id, ...(startRoom ? [startRoom.id] : [])]);

  legs.forEach((leg, li) => {
    const path = makePath(leg.points, leg.startAt);
    const endS = path.cum[path.cum.length - 1];
    if (leg.points.length < 2) {
      if (li < legs.length - 1) {
        const t = transitions[li];
        const up = FLOOR_LEVEL[t.toFloor] > FLOOR_LEVEL[t.fromFloor] ? "up" : "down";
        const what = t.connector.type === "elevator" ? "the elevator" : t.connector.type === "escalator" ? "the escalator" : "the stairs";
        push({ text: `Take ${what} ${up} to the ${ordinalFloor(FLOOR_LEVEL[t.toFloor])}.`, icon: t.connector.type, floor: leg.floor, at: leg.points[0], s: leg.startAt });
      } else if (li === 0) push({ text: `You're already at ${destination.name}.`, icon: "arrive", floor: leg.floor, at: leg.points[0], s: 0 });
      return;
    }
    const first = landmarksAlong(leg.floor, path, path.cum[0] + 25, path.cum[0] + 170, 16, exclude)[0];
    const toward = first ? `, toward ${landmarkName(first.d)}` : "";
    if (first) exclude.add(first.d.id);
    const legFirstIndex = out.length;

    if (li === 0) {
      if (startRoom?.labelAt && startRoom.entry) {
        const fl = FLOOR_BY_ID[leg.floor];
        const polys = fl.spaces.filter((sp) => startRoom.spaceIds.includes(sp.id)).map((sp) => sp.polygon);
        const outward = outwardHeading(leg.floor, [startRoom.entry.x, startRoom.entry.y], polys, startRoom.labelAt);
        const ex = exitPhrase(outward, path, path.cum[0]);
        push({ text: `Leave ${startRoom.name} and ${ex.phrase}${toward}.`, icon: ex.icon, floor: leg.floor, at: leg.points[0], s: 0 });
      } else if (besideRoom?.entry && besideRoom.labelAt) {
        const fl = FLOOR_BY_ID[leg.floor];
        const polys = besideRoom.category === "elevator" ? fl.elevatorBanks : fl.spaces.filter((sp) => besideRoom.spaceIds.includes(sp.id)).map((sp) => sp.polygon);
        const outward = outwardHeading(leg.floor, [besideRoom.entry.x, besideRoom.entry.y], polys, besideRoom.labelAt);
        const ex = exitPhrase(outward, path, path.cum[0]);
        const room = besideRoom.category === "elevator" ? "the elevators" : besideRoom.name;
        push({ text: `With ${room} behind you, ${ex.phrase}${toward}.`, icon: ex.icon, floor: leg.floor, at: leg.points[0], s: 0 });
      } else {
        const h0 = headingDeg(leg.points[0], pointAt(path, path.cum[0] + 12));
        const far = first ?? landmarksAlong(leg.floor, path, path.cum[0] + 20, path.cum[0] + 320, 22, exclude)[0];
        if (far) exclude.add(far.d.id);
        push({ text: `Start at ${startLabel}. ${far ? `Head toward ${landmarkName(far.d)}` : `Head ${sideOfBuilding(h0)}`}.`, icon: "start", floor: leg.floor, at: leg.points[0], s: 0 });
      }
    } else {
      const t = transitions[li - 1];
      const bank = DESTINATIONS.find((d) => d.entry && d.floor === leg.floor && Math.hypot(d.entry.x - leg.points[0][0], d.entry.y - leg.points[0][1]) < 0.5 && d.category === t.connector.type);
      if (bank?.labelAt) {
        const fl = FLOOR_BY_ID[leg.floor];
        const polys = t.connector.type === "elevator" ? fl.elevatorBanks : [];
        const ex = exitPhrase(outwardHeading(leg.floor, leg.points[0], polys, bank.labelAt), path, path.cum[0]);
        push({ text: `Leave the ${t.connector.type} on the ${ordinalFloor(FLOOR_LEVEL[leg.floor])} and ${ex.phrase}${toward}.`, icon: ex.icon, floor: leg.floor, at: leg.points[0], s: leg.startAt + 1 });
      } else {
        push({ text: `Leave the ${t.connector.type} on the ${ordinalFloor(FLOOR_LEVEL[leg.floor])}${toward ? ` and head${toward}` : ""}.`, icon: "straight", floor: leg.floor, at: leg.points[0], s: leg.startAt + 1 });
      }
    }

    // turns at interior vertices
    let lastS = path.cum[0];
    const addContinue = (upTo: number) => {
      if (upTo - lastS < 90) return;
      const past = landmarksAlong(leg.floor, path, lastS + 20, upTo - 20, 14, exclude);
      const mid = (lastS + upTo) / 2;
      const pick = past.sort((a, b) => Math.abs(a.s - mid) - Math.abs(b.s - mid))[0];
      if (pick) {
        exclude.add(pick.d.id);
        push({ text: `Continue straight past ${landmarkName(pick.d)}.`, icon: "straight", floor: leg.floor, at: pointAt(path, pick.s), s: lastS + 8 });
      } else if (out.length - legFirstIndex > 1 && !["start", "straight"].includes(out[out.length - 1]?.icon)) {
        push({ text: "Continue along the corridor.", icon: "straight", floor: leg.floor, at: pointAt(path, lastS + 8), s: lastS + 8 });
      }
    };
    for (let i = 1; i < leg.points.length - 1; i++) {
      const t = turnDeg(headingDeg(leg.points[i - 1], leg.points[i]), headingDeg(leg.points[i], leg.points[i + 1]));
      if (Math.abs(t) < 28) continue;
      const s = path.cum[i];
      const { word, icon } = turnWord(t);
      const atIntersection = intersectionsBetween(graph, leg.floor, path, s - 10, s + 10).length > 0;
      const passed = intersectionsBetween(graph, leg.floor, path, lastS + 8, s - 10).length;
      const lm = landmarksAlong(leg.floor, path, s - 14, s + 14, 18, exclude).sort((a, b) => Math.abs(a.s - s) - Math.abs(b.s - s))[0];
      const by = lm ? ` by ${landmarkName(lm.d)}` : "";
      addContinue(s - 6);
      let text: string;
      const hIn = headingDeg(leg.points[i - 1], leg.points[i]);
      const ends = Math.abs(t) >= 50 && corridorEnds(leg.floor, leg.points[i], hIn);
      if (icon === "uturn") text = `Turn around${by}.`;
      else if (atIntersection && ends && passed > 0) text = `At the end of the corridor, ${word}${by}.`;
      else if (atIntersection && passed <= 2) text = `${cap(word)} at the ${ORDINAL[passed]} intersection${by}.`;
      else if (atIntersection && lm) text = `${cap(word)} at the intersection${by}.`;
      else if (atIntersection && passed < ORDINAL.length) text = `${cap(word)} at the ${ORDINAL[passed]} intersection.`;
      else if (atIntersection) text = `${cap(word)} at the intersection after passing ${passed} others.`;
      else text = icon.startsWith("slight") ? `${cap(word)} to stay on the corridor${by}.` : `Follow the corridor as it turns ${t > 0 ? "right" : "left"}${by}.`;
      if (!lm && icon !== "uturn") {
        const next = landmarksAlong(leg.floor, path, s + 8, s + 75, 16, exclude)[0];
        if (next) {
          text = text.replace(/\.$/, `, toward ${landmarkName(next.d)}.`);
          exclude.add(next.d.id);
        }
      }
      push({ text, icon, floor: leg.floor, at: leg.points[i], s });
      lastS = s;
      if (lm) exclude.add(lm.d.id);
    }

    const end = leg.points[leg.points.length - 1];
    addContinue(endS - 6);
    if (li < legs.length - 1) {
      const t = transitions[li];
      const up = FLOOR_LEVEL[t.toFloor] > FLOOR_LEVEL[t.fromFloor] ? "up" : "down";
      const what = t.connector.type === "elevator" ? "the elevator" : t.connector.type === "escalator" ? "the escalator" : "the stairs";
      push({ text: `Take ${what} ${up} to the ${ordinalFloor(FLOOR_LEVEL[t.toFloor])}.`, icon: t.connector.type, floor: leg.floor, at: end, s: endS });
    } else {
      let side = "straight ahead";
      if (destination.labelAt) {
        const hLast = headingDeg(pointAt(path, Math.max(path.cum[0], endS - 10)), end);
        const t = turnDeg(hLast, headingDeg(end, destination.labelAt));
        if (Math.abs(t) >= 145) side = "behind you";
        else if (Math.abs(t) > 35) side = t > 0 ? "on your right" : "on your left";
      }
      const label = destination.number && destination.hasName ? `${destination.name} (${destination.number})` : destination.name;
      push({ text: `${label} is ${side}.`, icon: "arrive", floor: leg.floor, at: end, s: endS });
    }
  });

  for (let i = 0; i < out.length; i++) out[i].segmentLength = i < out.length - 1 ? Math.max(0, out[i + 1].s - out[i].s) : 0;
  return out;
}


