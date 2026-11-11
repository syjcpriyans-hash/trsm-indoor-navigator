/**
 * TRSM indoor-map data model.
 *
 * Coordinates are "plan units": PDF points measured from the top-left of each page of
 * TRSM-Maps-2024.pdf, with y increasing downward (south on the plans). The source plans
 * are explicitly NOT TO SCALE, so plan units are only converted to metres after an
 * on-site calibration (see src/features/indoor-map/calibration.ts).
 */

export type FloorId = "L7" | "L8" | "L9";
export type Pt = [number, number];

export interface PolygonJSON {
  outer: Pt[];
  holes: Pt[][];
}

/** How much a piece of data can be trusted. */
export type Verification =
  | "source-derived" // computed directly from the PDF vector geometry
  | "source-indicated" // a symbol on the plan marks it (entrance notch, map pin, icon)
  | "plan-aligned" // the same symbol appears at the same place on every plan (vertical connectors)
  | "estimated" // inferred from geometry, e.g. door at the middle of a corridor-facing wall
  | "nearest-corridor" // the room has no wall on a corridor; we route to the closest corridor point
  | "unverified" // the plan does not establish this; needs an on-site survey
  | "verified-onsite"; // reserved for data confirmed during a site survey

export type FillClass =
  | "white"
  | "blue_room"
  | "lime_room"
  | "green_room"
  | "pink_room"
  | "lavender_room"
  | "paleyellow_room"
  | "salmon_room"
  | "washroom"
  | "elevator";

export interface Space {
  id: string;
  floor: FloorId;
  kind: "room" | "washroom" | "elevator";
  fill: FillClass;
  number: string | null;
  name: string | null;
  labelAt: Pt | null;
  labelVertical: boolean;
  polygon: PolygonJSON;
  area: number;
  source: { page: number; drawingIndex: number };
  entranceNotches?: Pt[];
}

export interface MapFeature {
  type: "exit" | "water" | "escalator" | "marker";
  x: number;
  y: number;
  bbox: [number, number, number, number];
  label?: string;
}

export interface Floor {
  id: FloorId;
  level: number;
  label: string;
  building: string;
  sourcePage: number;
  outline: PolygonJSON;
  walkable: PolygonJSON;
  walkableInset: PolygonJSON[];
  courtyard: PolygonJSON | null;
  outdoorSeating: PolygonJSON[];
  hatched: PolygonJSON[];
  stairs: PolygonJSON[];
  spaces: Space[];
  features: MapFeature[];
  elevatorBanks: PolygonJSON[];
  looseLabels: { text: string; x: number; y: number }[];
}

export type NodeKind = "corridor" | "entry" | "connector";

export interface GraphNode {
  id: string;
  floor: FloorId;
  x: number;
  y: number;
  kind: NodeKind;
}

export type EdgeKind = "corridor" | "entry" | "elevator" | "escalator" | "stair";

export interface GraphEdge {
  a: string;
  b: string;
  kind: EdgeKind;
  verification: Verification;
  connector?: string;
}

export interface Connector {
  id: string;
  type: "elevator" | "escalator" | "stair";
  name: string;
  floors: FloorId[];
  verification: Verification;
  enabledByDefault: boolean;
  /** "assumed": elevator, treated as the accessible option but not verified on site. */
  accessible: "assumed" | boolean;
  notes: string[];
}

export interface GraphJSON {
  nodes: GraphNode[];
  edges: GraphEdge[];
  connectors: Connector[];
}

export type Category =
  | "lecture"
  | "lab"
  | "meeting"
  | "food"
  | "study"
  | "services"
  | "safety"
  | "room"
  | "washroom"
  | "elevator"
  | "water"
  | "landmark";

export interface DestinationEntry {
  nodeId: string;
  status: Verification;
  note: string;
  x: number;
  y: number;
}

export interface Destination {
  id: string;
  floor: FloorId;
  name: string;
  number: string | null;
  category: Category;
  keywords: string[];
  labelAt: Pt | null;
  spaceIds: string[];
  entry: DestinationEntry | null;
  notes: string[];
  hasName?: boolean;
  cars?: number;
}

export interface Anchor {
  id: string;
  floor: FloorId;
  nodeId: string;
  x: number;
  y: number;
  label: string;
  status: "proposed" | "installed" | "verified-onsite";
  notes: string;
}
