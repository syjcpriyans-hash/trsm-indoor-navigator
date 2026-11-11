import { describe, expect, it } from "vitest";
import { DESTINATIONS, DEST_BY_ID, FLOOR_BY_ID, GRAPH } from "@/data";
import { computeRoute, sampleRoute, validateLegs, type RouteOk } from "@/features/routing/route";
import { buildRoutingGraph } from "@/features/routing/graph";
import { astar } from "@/features/routing/astar";
import { pointInPolygon, segmentInsidePolygon } from "@/lib/geometry";
import type { Pt } from "@/types/map";

const startAt = (id: string) => {
  const d = DEST_BY_ID[id];
  return { kind: "node" as const, nodeId: d.entry!.nodeId, label: d.name };
};

function assertNoRoomOrCourtyardCrossing(r: RouteOk) {
  for (const leg of r.legs) {
    const fl = FLOOR_BY_ID[leg.floor];
    for (let i = 0; i < leg.points.length - 1; i++) {
      const a = leg.points[i], b = leg.points[i + 1];
      const n = Math.max(2, Math.ceil(Math.hypot(a[0] - b[0], a[1] - b[1]) / 1.5));
      for (let k = 0; k <= n; k++) {
        const p: Pt = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
        if (fl.courtyard) expect(pointInPolygon(p, fl.courtyard), `courtyard at ${p}`).toBe(false);
        for (const s of fl.spaces) {
          // allow the last 2 plan units into the destination's own doorway
          if (pointInPolygon(p, s.polygon)) {
            const own = r.destination.spaceIds.includes(s.id);
            expect(own, `crosses ${s.number ?? s.name ?? s.id} at ${p.map((v) => v.toFixed(1))}`).toBe(true);
          }
        }
      }
    }
  }
}

describe("data integrity", () => {
  it("has the three floors with their source pages", () => {
    expect(Object.keys(FLOOR_BY_ID).sort()).toEqual(["L7", "L8", "L9"]);
    expect(FLOOR_BY_ID.L7.sourcePage).toBe(1);
    expect(FLOOR_BY_ID.L9.sourcePage).toBe(3);
  });

  it("contains the example destinations named in the brief", () => {
    const want: [string, string, string][] = [
      ["L7", "1-004", "Program Advising and Student Success (PASS)"],
      ["L7", "1-003", "CPA Lounge"],
      ["L7", "1-067", "Steve & Rashmi Gupta Lecture Theatre"],
      ["L8", "2-148", "Business Career Hub"],
      ["L8", "2-154", "Computer Lab"],
      ["L8", "2-002", "Boardroom"],
      ["L9", "3-176", "Harry Rosen Lecture Hall"],
      ["L9", "3-180", "Bootcamp Lab"],
      ["L9", "TRS3-173", "Bloomberg Lab"],
    ];
    for (const [floor, num, name] of want) {
      const d = DESTINATIONS.find((x) => x.number === num);
      expect(d, num).toBeTruthy();
      expect(d!.floor).toBe(floor);
      expect(d!.name).toBe(name);
      expect(d!.entry).toBeTruthy();
    }
  });

  it("every corridor and entry edge lies inside the walkable area (or a hatched zone when flagged unverified)", () => {
    const nodes = new Map(GRAPH.nodes.map((n) => [n.id, n]));
    let checked = 0;
    for (const e of GRAPH.edges) {
      const a = nodes.get(e.a)!, b = nodes.get(e.b)!;
      if (a.floor !== b.floor || a.kind === "connector" || b.kind === "connector") continue;
      const fl = FLOOR_BY_ID[a.floor];
      const A: Pt = [a.x, a.y], B: Pt = [b.x, b.y];
      if (Math.hypot(a.x - b.x, a.y - b.y) < 0.2) continue;
      const inWalk = segmentInsidePolygon(A, B, fl.walkable);
      if (!inWalk) {
        expect(e.verification, `${e.a}→${e.b}`).toBe("unverified");
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(700);
  });

  it("each floor's corridor graph is a single connected component", () => {
    const g = buildRoutingGraph(GRAPH);
    for (const f of ["L7", "L8", "L9"]) {
      const ids = GRAPH.nodes.filter((n) => n.floor === f && n.kind === "corridor").map((n) => n.id);
      const seen = new Set([ids[0]]);
      const stack = [ids[0]];
      while (stack.length) {
        const c = stack.pop()!;
        for (const a of g.adj.get(c) ?? []) {
          if (a.edge.kind !== "corridor" || seen.has(a.to)) continue;
          seen.add(a.to);
          stack.push(a.to);
        }
      }
      expect(seen.size, f).toBe(ids.length);
    }
  });
});

describe("Test A — same-floor route PASS (1-004) → Steve & Rashmi Gupta Lecture Theatre (1-067)", () => {
  const r = computeRoute(startAt("L7:1-004"), "L7:1-067");
  it("finds a route on the 7th floor only", () => {
    expect(r.ok).toBe(true);
    const ok = r as RouteOk;
    expect(ok.legs).toHaveLength(1);
    expect(ok.legs[0].floor).toBe("L7");
    expect(ok.transitions).toHaveLength(0);
  });
  it("stays inside walkable corridors and never crosses rooms or the courtyard", () => {
    const ok = r as RouteOk;
    expect(validateLegs(ok.legs).ok).toBe(true);
    assertNoRoomOrCourtyardCrossing(ok);
  });
  it("produces geometry-derived instructions that end with the destination side", () => {
    const ok = r as RouteOk;
    expect(ok.instructions[0].text).toMatch(/^Leave Program Advising and Student Success \(PASS\) and (turn left|turn right|go straight ahead)/);
    expect(ok.instructions[ok.instructions.length - 1].icon).toBe("arrive");
    expect(ok.instructions[ok.instructions.length - 1].text).toMatch(/Lecture Theatre \(1-067\) is (on your left|on your right|straight ahead)/);
  });
  it("starts at PASS's source-indicated entrance notch", () => {
    expect(DEST_BY_ID["L7:1-004"].entry!.status).toBe("source-indicated");
  });
});

describe("Test C — multi-floor route Business Career Hub (8th) → Harry Rosen Lecture Hall 3-176 (9th)", () => {
  const r = computeRoute(startAt("L8:2-148"), "L9:3-176");
  it("uses a plan-aligned elevator to go from L8 to L9", () => {
    expect(r.ok).toBe(true);
    const ok = r as RouteOk;
    expect(ok.legs.map((l) => l.floor)).toEqual(["L8", "L9"]);
    expect(ok.transitions).toHaveLength(1);
    expect(ok.transitions[0].connector.type).toBe("elevator");
    expect(ok.transitions[0].connector.verification).toBe("plan-aligned");
    expect(ok.instructions.some((i) => /Take the elevator up to the 9th floor/.test(i.text))).toBe(true);
  });
  it("both legs stay in corridors", () => {
    const ok = r as RouteOk;
    expect(ok.validation.ok).toBe(true);
    assertNoRoomOrCourtyardCrossing(ok);
  });
  it("7th → 9th rides one elevator through two floors", () => {
    const r2 = computeRoute(startAt("L7:1-004"), "L9:3-180") as RouteOk;
    expect(r2.ok).toBe(true);
    expect(r2.legs.map((l) => l.floor)).toEqual(["L7", "L9"]);
    expect(r2.transitions[0].fromFloor).toBe("L7");
    expect(r2.transitions[0].toFloor).toBe("L9");
  });
  it("demo sampling walks from the 8th floor to the 9th", () => {
    const ok = r as RouteOk;
    expect(sampleRoute(ok, 0).floor).toBe("L8");
    expect(sampleRoute(ok, ok.lengthUnits).floor).toBe("L9");
  });
});

describe("Test F — accessible routing", () => {
  const opts = { allowUnverifiedConnectors: true, disabledConnectors: ["elevator-north-east", "elevator-south-west"] };
  it("standard routing may use an escalator when it is the only (enabled) link", () => {
    const r = computeRoute(startAt("L8:2-148"), "L9:3-176", opts);
    expect(r.ok).toBe(true);
    expect((r as RouteOk).transitions[0].connector.type).toBe("escalator");
  });
  it("accessible routing never treats an escalator-only path as accessible", () => {
    const r = computeRoute(startAt("L8:2-148"), "L9:3-176", { ...opts, accessible: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/step-free/);
  });
  it("accessible routing uses elevators and discloses that accessibility is unverified", () => {
    const r = computeRoute(startAt("L8:2-148"), "L9:3-176", { accessible: true, allowUnverifiedConnectors: true }) as RouteOk;
    expect(r.ok).toBe(true);
    expect(r.transitions.every((t) => t.connector.type === "elevator")).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/not confirmed as wheelchair accessible/);
  });
  it("escalators and the central stair are disabled by default (direction/served floors not shown)", () => {
    const esc = GRAPH.connectors.find((c) => c.id === "escalator-west")!;
    expect(esc.enabledByDefault).toBe(false);
    expect(esc.accessible).toBe(false);
  });
  it("rooms reachable only across a hatched area are not offered as accessible", () => {
    const hatchOnly = DESTINATIONS.find((d) => d.entry?.status === "unverified" && d.floor === "L7")!;
    expect(hatchOnly).toBeTruthy();
    const r = computeRoute(startAt("L7:1-004"), hatchOnly.id, { accessible: true });
    expect(r.ok).toBe(false);
  });
});

describe("direction wording is grounded in the geometry", () => {
  const r = computeRoute(startAt("L8:2-148"), "L9:3-176") as RouteOk;
  const texts = r.instructions.map((i) => i.text);
  it("starts by leaving the start room, and says which way to turn out of the elevator", () => {
    expect(texts[0]).toMatch(/^Leave Business Career Hub and turn (left|right)/);
    // 9th-floor SW elevators open east onto a north–south corridor; the route continues north = left
    expect(texts).toContain("Leave the elevator on the 9th floor and turn left.");
  });
  it("never names the same landmark twice in one route", () => {
    for (const [a, b] of [["L7:1-003", "L7:1-099"], ["L9:3-180", "L7:1-154"], ["L8:2-048", "L8:2-139"], ["L7:1-067", "L7:1-149"]]) {
      const rr = computeRoute(startAt(a), b) as RouteOk;
      const named = rr.instructions.slice(0, -1).flatMap((i) => [...i.text.matchAll(/(?:toward|past|by) ([^,.]+(?:\([^)]*\))?)/g)].map((m) => m[1]));
      expect(new Set(named).size, `${a}→${b}: ${named.join(" | ")}`).toBe(named.length);
    }
  });
  it("only counts real intersections (short recesses are ignored) and uses at most a 'fifth'", () => {
    for (const d of DESTINATIONS.slice(0, 120)) {
      if (!d.entry) continue;
      const rr = computeRoute(startAt("L8:elevator-south-west"), d.id);
      if (!rr.ok) continue;
      for (const i of rr.instructions) expect(i.text).not.toMatch(/sixth|seventh|eighth/);
    }
  });
  it("every route ends by saying which side the destination is on", () => {
    for (const d of DESTINATIONS.filter((x) => x.floor === "L7").slice(0, 60)) {
      const rr = computeRoute(startAt("L7:elevator-south-west"), d.id);
      if (!rr.ok) continue;
      expect(rr.instructions.at(-1)!.text).toMatch(/is (on your left|on your right|straight ahead|behind you)\.$|You're already at/);
    }
  });
});

describe("Test H — error handling", () => {
  it("rejects an unknown destination without throwing", () => {
    const r = computeRoute(startAt("L7:1-004"), "L7:9-999");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid-destination");
  });
  it("rejects an unknown start node", () => {
    const r = computeRoute({ kind: "node", nodeId: "nope", label: "x" }, "L7:1-067");
    expect(r.ok).toBe(false);
  });
  it("reports no-route on a disconnected graph instead of crashing", () => {
    const g = buildRoutingGraph(GRAPH, { disabledConnectors: ["elevator-north-east", "elevator-south-west"] });
    const p = astar(g, DEST_BY_ID["L7:1-004"].entry!.nodeId, DEST_BY_ID["L9:3-176"].entry!.nodeId);
    expect(p).toBeNull();
    const r = computeRoute(startAt("L7:1-004"), "L9:3-176", { disabledConnectors: ["elevator-north-east", "elevator-south-west"] });
    expect(r.ok).toBe(false);
  });
  it("routes from an arbitrary point (QR / map tap) snapped to the nearest corridor", () => {
    const r = computeRoute({ kind: "point", floor: "L8", x: 400, y: 375, label: "Pinned location" }, "L8:2-148");
    expect(r.ok).toBe(true);
  });
});

describe("route sweep", () => {
  it("every destination is reachable from the 8th-floor south-west elevator with a valid path", () => {
    const from = startAt("L8:elevator-south-west");
    const failures: string[] = [];
    for (const d of DESTINATIONS) {
      if (!d.entry) continue;
      const r = computeRoute(from, d.id);
      if (!r.ok) failures.push(`${d.id}: ${r.message}`);
    }
    expect(failures).toEqual([]);
  });
});
