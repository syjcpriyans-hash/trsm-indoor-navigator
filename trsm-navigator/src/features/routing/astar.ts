import type { GraphEdge } from "@/types/map";
import { FLOOR_LEVEL } from "@/data";
import type { Arc, RoutingGraph } from "./graph";

export interface PathResult {
  nodes: string[];
  edges: GraphEdge[];
  cost: number;
}

/** Minimal binary heap keyed by f-score. */
class Heap {
  private a: { id: string; f: number }[] = [];
  push(id: string, f: number) {
    const a = this.a;
    a.push({ id, f });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): string | undefined {
    const a = this.a;
    if (!a.length) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top.id;
  }
  get size() {
    return this.a.length;
  }
}

/**
 * A* over the corridor graph. `extra` lets callers splice in virtual nodes (e.g. an arbitrary
 * start point snapped onto a corridor edge) without mutating the shared graph.
 */
export function astar(
  g: RoutingGraph,
  start: string,
  goal: string,
  extra?: { nodes: Map<string, { x: number; y: number; floor: string }>; adj: Map<string, Arc[]> },
): PathResult | null {
  const pos = (id: string) => g.nodes.get(id) ?? extra?.nodes.get(id);
  const goalN = pos(goal);
  if (!pos(start) || !goalN) return null;
  const h = (id: string) => {
    const n = pos(id)!;
    const flat = Math.hypot(n.x - goalN.x, n.y - goalN.y);
    const dz = Math.abs(FLOOR_LEVEL[n.floor as "L7"] - FLOOR_LEVEL[goalN.floor as "L7"]);
    return Math.max(0, flat - 12 * dz) + dz * 25;
  };
  const neighbours = (id: string): Arc[] => {
    const base = g.adj.get(id) ?? [];
    const more = extra?.adj.get(id);
    return more ? base.concat(more) : base;
  };
  const gScore = new Map<string, number>([[start, 0]]);
  const came = new Map<string, { prev: string; edge: GraphEdge }>();
  const open = new Heap();
  const closed = new Set<string>();
  open.push(start, h(start));
  while (open.size) {
    const cur = open.pop()!;
    if (cur === goal) {
      const nodes = [goal];
      const edges: GraphEdge[] = [];
      let c = goal;
      while (came.has(c)) {
        const s = came.get(c)!;
        edges.unshift(s.edge);
        nodes.unshift(s.prev);
        c = s.prev;
      }
      return { nodes, edges, cost: gScore.get(goal)! };
    }
    if (closed.has(cur)) continue;
    closed.add(cur);
    for (const arc of neighbours(cur)) {
      if (!pos(arc.to)) continue;
      // Room doors are dead ends: a route may end at one but never pass *through* a room.
      // Elevator/escalator doors are the exception because they carry vertical edges.
      if (arc.to !== goal && g.nodes.get(arc.to)?.kind === "entry" && arc.edge.kind === "entry") {
        const hasVertical = (g.adj.get(arc.to) ?? []).some((a) => a.edge.kind !== "entry" && a.edge.kind !== "corridor");
        if (!hasVertical) continue;
      }
      const tentative = gScore.get(cur)! + arc.w;
      if (tentative < (gScore.get(arc.to) ?? Infinity)) {
        gScore.set(arc.to, tentative);
        came.set(arc.to, { prev: cur, edge: arc.edge });
        open.push(arc.to, tentative + h(arc.to));
      }
    }
  }
  return null;
}
