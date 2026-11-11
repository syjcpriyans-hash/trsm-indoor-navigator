import { DESTINATIONS } from "@/data";
import type { FloorId, MapFeature, Pt } from "@/types/map";
import { ROOM_H, SLAB_TOP } from "./sceneUtils";

export type LabelKind = "name" | "number" | "icon" | "area" | "pin" | "start" | "transfer";

export interface LabelItem {
  key: string;
  floor: FloorId;
  p: Pt;
  y: number;
  text: string;
  kind: LabelKind;
  priority: number;
  icon?: "elevator" | "washroom" | "exit" | "water" | "escalator" | "marker" | "stairs";
  destinationId?: string;
  /** only show when camera is closer than this (world units) */
  maxDist: number;
}

export function staticLabels(floor: FloorId, features: MapFeature[], loose: { text: string; x: number; y: number }[]): LabelItem[] {
  const items: LabelItem[] = [];
  for (const d of DESTINATIONS) {
    if (d.floor !== floor || !d.labelAt) continue;
    if (d.category === "washroom" || d.category === "elevator") {
      items.push({ key: d.id, floor, p: d.labelAt, y: SLAB_TOP + ROOM_H + 1, text: d.category === "washroom" ? "Washrooms" : "Elevator", kind: "icon", icon: d.category as "elevator" | "washroom", priority: 6, destinationId: d.id, maxDist: 1400 });
      continue;
    }
    if (d.category === "water" || d.id.endsWith("htm-demo-kitchen")) continue;
    if (d.spaceIds.length === 0 && d.category !== "study") {
      // map pins (Ted's Bagels, Retail Pop-Up, Quiet Study Area)
      items.push({ key: d.id, floor, p: d.labelAt, y: SLAB_TOP + 1, text: d.name.replace("School of Retail Management ", ""), kind: "icon", icon: "marker", priority: 7, destinationId: d.id, maxDist: 1400 });
      continue;
    }
    if (d.hasName || !d.number) {
      items.push({ key: d.id, floor, p: d.labelAt, y: SLAB_TOP + ROOM_H, text: d.name, kind: "name", priority: 5 + Math.min(2, (d.name.length < 22 ? 1 : 0)), destinationId: d.id, maxDist: 1500 });
      if (d.number) items.push({ key: d.id + "#n", floor, p: [d.labelAt[0], d.labelAt[1] + 7], y: SLAB_TOP + ROOM_H, text: d.number, kind: "number", priority: 2.5, destinationId: d.id, maxDist: 520 });
    } else {
      items.push({ key: d.id, floor, p: d.labelAt, y: SLAB_TOP + ROOM_H, text: d.number, kind: "number", priority: 2, destinationId: d.id, maxDist: 430 });
    }
  }
  for (const f of features) {
    if (f.type === "marker") continue;
    const text = f.type === "exit" ? "Exit" : f.type === "water" ? "Water" : "Escalator";
    items.push({ key: `${floor}-${f.type}-${f.x}-${f.y}`, floor, p: [f.x, f.y], y: SLAB_TOP + ROOM_H + 1, text, kind: "icon", icon: f.type as LabelItem["icon"], priority: 4, maxDist: 900 });
  }
  const named = new Set(DESTINATIONS.filter((d) => d.floor === floor).map((d) => d.name.toLowerCase()));
  for (const l of loose.filter((x) => !named.has(x.text.toLowerCase()))) items.push({ key: `${floor}-loose-${l.text}`, floor, p: [l.x, l.y], y: SLAB_TOP + 1, text: l.text, kind: "area", priority: 3, maxDist: 700 });
  return items;
}
