import type { Connector, GraphEdge, GraphJSON, GraphNode } from "@/types/map";

export interface RouteOptions {
  /** Prefer step-free connections: never use escalators/stairs, avoid unconfirmed room access. */
  accessible?: boolean;
  /** Include connectors whose floor-to-floor link is not established by the plans (escalators, central stair). */
  allowUnverifiedConnectors?: boolean;
  /** Connector ids to switch off (testing / closures). */
  disabledConnectors?: string[];
}

export interface Arc {
  to: string;
  w: number;
  edge: GraphEdge;
}

export interface RoutingGraph {
  nodes: Map<string, GraphNode>;
  adj: Map<string, Arc[]>;
  connectors: Map<string, Connector>;
  /** corridor-degree per node (for "intersection" wording) */
  corridorDegree: Map<string, number>;
  /**
   * Corridor junctions a person would perceive as an intersection: at least three branches
   * that are real corridors (short dead-end spurs into recesses or door notches don't count).
   */
  intersections: Set<string>;
  options: Required<RouteOptions>;
}

function perceivedIntersections(g: GraphJSON): Set<string> {
  const pos = new Map(g.nodes.map((n) => [n.id, n]));
  const adj = new Map<string, string[]>();
  for (const e of g.edges) {
    if (e.kind !== "corridor") continue;
    if (!adj.has(e.a)) adj.set(e.a, []);
    if (!adj.has(e.b)) adj.set(e.b, []);
    adj.get(e.a)!.push(e.b);
    adj.get(e.b)!.push(e.a);
  }
  const d = (a: string, b: string) => Math.hypot(pos.get(a)!.x - pos.get(b)!.x, pos.get(a)!.y - pos.get(b)!.y);
  const out = new Set<string>();
  for (const [j, nbrs] of adj) {
    if (nbrs.length < 3) continue;
    let real = 0;
    for (const first of nbrs) {
      let prev = j, cur = first, len = d(j, first);
      while ((adj.get(cur)?.length ?? 0) === 2 && len < 50) {
        const next = adj.get(cur)!.find((x) => x !== prev)!;
        len += d(cur, next);
        prev = cur;
        cur = next;
      }
      const leaf = (adj.get(cur)?.length ?? 0) === 1;
      if (!(leaf && len < 36)) real++;
    }
    if (real >= 3) out.add(j);
  }
  return out;
}

let intersectionCache: { key: number; set: Set<string> } | null = null;

export const VERTICAL_COST: Record<string, number> = { elevator: 40, escalator: 28, stair: 32 };

export function edgeAllowed(e: GraphEdge, conns: Map<string, Connector>, o: Required<RouteOptions>): boolean {
  if (e.connector) {
    const c = conns.get(e.connector);
    if (!c) return false;
    if (o.disabledConnectors.includes(c.id)) return false;
    if (!c.enabledByDefault && !o.allowUnverifiedConnectors) return false;
    if (o.accessible && c.accessible === false) return false;
  }
  if (o.accessible && e.kind === "entry" && e.verification === "unverified") return false;
  return true;
}

export function buildRoutingGraph(g: GraphJSON, opts: RouteOptions = {}): RoutingGraph {
  const options: Required<RouteOptions> = {
    accessible: !!opts.accessible,
    allowUnverifiedConnectors: !!opts.allowUnverifiedConnectors,
    disabledConnectors: opts.disabledConnectors ?? [],
  };
  const nodes = new Map(g.nodes.map((n) => [n.id, n]));
  const connectors = new Map(g.connectors.map((c) => [c.id, c]));
  const adj = new Map<string, Arc[]>();
  const corridorDegree = new Map<string, number>();
  for (const n of g.nodes) adj.set(n.id, []);
  for (const e of g.edges) {
    const a = nodes.get(e.a), b = nodes.get(e.b);
    if (!a || !b) continue;
    if (e.kind === "corridor") {
      corridorDegree.set(e.a, (corridorDegree.get(e.a) ?? 0) + 1);
      corridorDegree.set(e.b, (corridorDegree.get(e.b) ?? 0) + 1);
    }
    if (!edgeAllowed(e, connectors, options)) continue;
    const w = e.kind in VERTICAL_COST ? VERTICAL_COST[e.kind] : Math.hypot(a.x - b.x, a.y - b.y);
    adj.get(e.a)!.push({ to: e.b, w, edge: e });
    adj.get(e.b)!.push({ to: e.a, w, edge: e });
  }
  if (!intersectionCache || intersectionCache.key !== g.edges.length) intersectionCache = { key: g.edges.length, set: perceivedIntersections(g) };
  return { nodes, adj, connectors, corridorDegree, intersections: intersectionCache.set, options };
}

const cache = new Map<string, RoutingGraph>();
export function getRoutingGraph(g: GraphJSON, opts: RouteOptions = {}): RoutingGraph {
  const key = JSON.stringify([!!opts.accessible, !!opts.allowUnverifiedConnectors, [...(opts.disabledConnectors ?? [])].sort()]) + g.nodes.length;
  let rg = cache.get(key);
  if (!rg) {
    rg = buildRoutingGraph(g, opts);
    cache.set(key, rg);
  }
  return rg;
}
