import floorsJson from "./generated/floors.json";
import graphJson from "./generated/graph.json";
import destinationsJson from "./generated/destinations.json";
import anchorsJson from "./generated/anchors.json";
import type { Anchor, Destination, Floor, FloorId, GraphJSON } from "@/types/map";

export const FLOORS = (floorsJson as unknown as { floors: Floor[] }).floors;
export const GRAPH = graphJson as unknown as GraphJSON;
export const DESTINATIONS = destinationsJson as unknown as Destination[];
export const ANCHORS = anchorsJson as unknown as Anchor[];

export const FLOOR_IDS: FloorId[] = ["L7", "L8", "L9"];
export const FLOOR_BY_ID: Record<FloorId, Floor> = Object.fromEntries(FLOORS.map((f) => [f.id, f])) as Record<FloorId, Floor>;
export const FLOOR_LEVEL: Record<FloorId, number> = { L7: 7, L8: 8, L9: 9 };
export const floorName = (f: FloorId) => `${FLOOR_LEVEL[f]}th floor`;

export const DEST_BY_ID: Record<string, Destination> = Object.fromEntries(DESTINATIONS.map((d) => [d.id, d]));
export const ANCHOR_BY_ID: Record<string, Anchor> = Object.fromEntries(ANCHORS.map((a) => [a.id, a]));

/** Plan-space bounds of the building shell (shared by all three plans). */
export const PLAN_BOUNDS = (() => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of FLOORS)
    for (const [x, y] of f.outline.outer) {
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  return { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
})();
