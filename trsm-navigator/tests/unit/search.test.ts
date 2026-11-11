import { describe, expect, it } from "vitest";
import { normaliseRoomQuery, search, suggestions } from "@/features/indoor-map/search";

describe("Test B — search", () => {
  it("finds Business Career Hub by name on the 8th floor", () => {
    const h = search("Business Career Hub");
    expect(h[0].destination.id).toBe("L8:2-148");
    expect(h[0].destination.floor).toBe("L8");
  });
  it("finds 2-148 by exact number", () => {
    const h = search("2-148");
    expect(h[0].destination.id).toBe("L8:2-148");
    expect(h[0].match).toBe("exact-number");
  });
  it("normalises number formats", () => {
    expect(normaliseRoomQuery("2148")).toBe("2-148");
    expect(normaliseRoomQuery("TRS2-148")).toBe("2-148");
    expect(normaliseRoomQuery("room 3 176")).toBe("3-176");
    expect(normaliseRoomQuery("1-143a")).toBe("1-143A");
    expect(search("3176")[0].destination.number).toBe("3-176");
  });
  it("supports partial numbers", () => {
    const h = search("3-17");
    const nums = h.map((x) => x.destination.number);
    expect(nums).toContain("3-176");
    expect(nums).toContain("3-174");
  });
  it("finds the Bloomberg Lab by its TRS3-173 identifier", () => {
    expect(search("TRS3-173")[0].destination.name).toBe("Bloomberg Lab");
  });
  it("finds facilities by type", () => {
    expect(search("washroom").slice(0, 6).every((x) => x.destination.category === "washroom")).toBe(true);
    expect(search("elevator")[0].destination.category).toBe("elevator");
    expect(search("PASS")[0].destination.number).toBe("1-004");
  });
  it("suggests corrections for misspellings", () => {
    const s = suggestions("bussines carrer hub");
    expect(s.map((d) => d.name)).toContain("Business Career Hub");
    const s2 = suggestions("harry rossen");
    expect(s2[0].name).toBe("Harry Rosen Lecture Hall");
  });
  it("returns nothing (no crash) for nonsense", () => {
    expect(search("zzzzqqq")).toEqual([]);
    expect(search("")).toEqual([]);
  });
});
