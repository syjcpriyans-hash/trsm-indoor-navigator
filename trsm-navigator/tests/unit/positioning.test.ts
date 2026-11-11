import { describe, expect, it } from "vitest";
import { createStepDetector } from "@/features/positioning/motion";
import { anchorIdFromScan, anchorIdFromUrl, validateAnchorId } from "@/features/positioning/qr";
import { ANCHORS, FLOOR_BY_ID } from "@/data";
import { pointInPolygon } from "@/lib/geometry";
import { computeRoute, projectOntoRoute, sampleRoute, type RouteOk } from "@/features/routing/route";

describe("experimental motion: step detection", () => {
  it("counts walking steps (~1.8 Hz acceleration peaks)", () => {
    const d = createStepDetector();
    let steps = 0;
    for (let t = 0; t < 10_000; t += 20) {
      const mag = 9.81 + 2.6 * Math.sin((2 * Math.PI * 1.8 * t) / 1000);
      if (d.push(mag, t)) steps++;
    }
    expect(steps).toBeGreaterThanOrEqual(15);
    expect(steps).toBeLessThanOrEqual(19);
  });
  it("never advances when the phone is only rotated (gravity magnitude stays ~constant)", () => {
    const d = createStepDetector();
    let steps = 0;
    for (let t = 0; t < 10_000; t += 20) {
      // rotating redistributes gravity between axes, but |a| stays ≈ g with small sensor noise
      const ax = 9.81 * Math.cos(t / 400), ay = 9.81 * Math.sin(t / 400), az = 0.05 * Math.sin(t / 37);
      if (d.push(Math.hypot(ax, ay, az) + (Math.random() - 0.5) * 0.15, t)) steps++;
    }
    expect(steps).toBe(0);
  });
  it("ignores implausibly fast cadence (vibration)", () => {
    const d = createStepDetector();
    let steps = 0;
    for (let t = 0; t < 2000; t += 5) if (d.push(9.81 + 3 * Math.sin((2 * Math.PI * 12 * t) / 1000), t)) steps++;
    expect(steps).toBeLessThanOrEqual(8); // ≤ 1 per 280 ms
  });
  it("route-based estimates always stay on walkable corridors", () => {
    const r = computeRoute({ kind: "node", nodeId: ANCHORS[0].nodeId, label: "a" }, "L9:3-180") as RouteOk;
    for (let s = 0; s <= r.lengthUnits; s += 4.5) {
      const p = sampleRoute(r, s);
      const fl = FLOOR_BY_ID[p.floor];
      const inside = pointInPolygon(p.p, fl.walkable) || fl.hatched.some((h) => pointInPolygon(p.p, h));
      expect(inside, `${p.floor} ${p.p}`).toBe(true);
    }
    const mid = sampleRoute(r, r.lengthUnits / 2);
    expect(projectOntoRoute(r, mid.floor, mid.p)!.d).toBeLessThan(0.01);
  });
});

describe("QR anchors", () => {
  it("parses ?anchor= and #ID links and bare scanned codes", () => {
    expect(anchorIdFromUrl("https://x.vercel.app/?anchor=TRSM-8-03")).toBe("TRSM-8-03");
    expect(anchorIdFromUrl("https://x.vercel.app/?anchor=trsm-8-03")).toBe("TRSM-8-03");
    expect(anchorIdFromUrl("https://x.vercel.app/")).toBeNull();
    expect(anchorIdFromScan("TRSM-9-01")).toBe("TRSM-9-01");
    expect(anchorIdFromScan("https://x.vercel.app/?anchor=TRSM-7-02")).toBe("TRSM-7-02");
  });
  it("validates ids against the registry", () => {
    expect(validateAnchorId("TRSM-8-03").ok).toBe(true);
    const unknown = validateAnchorId("TRSM-9-99");
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.reason).toBe("unknown");
    const bad = validateAnchorId("hello");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe("malformed");
  });
  it("every anchor sits on a corridor node inside the walkable area of its floor", () => {
    for (const a of ANCHORS) expect(pointInPolygon([a.x, a.y], FLOOR_BY_ID[a.floor].walkable), a.id).toBe(true);
  });
});
