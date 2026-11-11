import Fuse from "fuse.js";
import { DESTINATIONS, FLOOR_LEVEL } from "@/data";
import type { Category, Destination } from "@/types/map";

export const CATEGORY_LABEL: Record<Category, string> = {
  lecture: "Lecture halls",
  lab: "Labs",
  meeting: "Meeting rooms",
  food: "Food & kitchens",
  study: "Study & lounges",
  services: "Student & staff services",
  safety: "Security",
  room: "Rooms",
  washroom: "Washrooms",
  elevator: "Elevators",
  water: "Water refill",
  landmark: "Landmarks",
};

export const CATEGORY_ORDER: Category[] = ["lecture", "lab", "services", "study", "meeting", "food", "washroom", "elevator", "water", "safety", "landmark", "room"];

/** Normalise room-number style input: "2148", "2 148", "trs2-148", "2-148" → "2-148". */
export function normaliseRoomQuery(q: string): string | null {
  const s = q.trim().toLowerCase().replace(/^trs\s*/, "").replace(/^room\s*/, "");
  const m = s.match(/^([1-3])\s*[-–\s]?\s*(\d{1,3})([a-c])?$/);
  if (!m) return null;
  return `${m[1]}-${m[2]}${m[3] ? m[3].toUpperCase() : ""}`;
}

interface Doc {
  d: Destination;
  name: string;
  number: string;
  numberDigits: string;
  keywords: string;
  category: string;
  floorWords: string;
}

const docs: Doc[] = DESTINATIONS.filter((d) => d.entry).map((d) => ({
  d,
  name: d.name,
  number: d.number ?? "",
  numberDigits: (d.number ?? "").replace(/[^0-9a-z]/gi, ""),
  keywords: d.keywords.join(" "),
  category: CATEGORY_LABEL[d.category],
  floorWords: `${FLOOR_LEVEL[d.floor]}th floor level ${FLOOR_LEVEL[d.floor]}`,
}));

const fuse = new Fuse(docs, {
  keys: [
    { name: "name", weight: 0.45 },
    { name: "number", weight: 0.25 },
    { name: "keywords", weight: 0.15 },
    { name: "category", weight: 0.1 },
    { name: "floorWords", weight: 0.05 },
  ],
  includeScore: true,
  threshold: 0.38,
  ignoreLocation: true,
  minMatchCharLength: 2,
});

export interface SearchHit {
  destination: Destination;
  score: number;
  match: "exact-number" | "partial-number" | "text";
}

/** De-duplicate per-floor duplicates (e.g. several "Washrooms") by keeping all but ranking by floor. */
export function search(query: string, limit = 30): SearchHit[] {
  const q = query.trim();
  if (!q) return [];
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  const add = (d: Destination, score: number, match: SearchHit["match"]) => {
    if (seen.has(d.id)) return;
    seen.add(d.id);
    hits.push({ destination: d, score, match });
  };

  const norm = normaliseRoomQuery(q);
  if (norm) {
    for (const x of docs) if (x.number.toUpperCase() === norm.toUpperCase() || x.number.toUpperCase() === `TRS${norm}`.toUpperCase()) add(x.d, 0, "exact-number");
  }
  // partial numbers: "2-14", "214", "3-1"
  const digits = q.replace(/^trs/i, "").replace(/[^0-9a-z]/gi, "");
  if (/^[1-3]\d{0,3}[a-c]?$/i.test(digits) && digits.length >= 2) {
    for (const x of docs) if (x.numberDigits.toLowerCase().startsWith(digits.toLowerCase())) add(x.d, 0.05 + x.numberDigits.length * 0.001, "partial-number");
  }
  for (const r of fuse.search(q)) add(r.item.d, 0.1 + (r.score ?? 1), "text");
  hits.sort((a, b) => a.score - b.score || (b.destination.hasName ? 1 : 0) - (a.destination.hasName ? 1 : 0));
  return hits.slice(0, limit);
}

/** "Did you mean" suggestions for misspellings when nothing matched well. */
const loose = new Fuse(docs.filter((x) => x.d.hasName || x.d.category !== "room"), {
  keys: ["name", "keywords"],
  includeScore: true,
  threshold: 0.6,
  ignoreLocation: true,
});

export function suggestions(query: string, limit = 3): Destination[] {
  const out: Destination[] = [];
  const names = new Set<string>();
  for (const r of loose.search(query)) {
    if (names.has(r.item.d.name)) continue;
    names.add(r.item.d.name);
    out.push(r.item.d);
    if (out.length >= limit) break;
  }
  return out;
}

export function groupByCategory(hits: SearchHit[]): { category: Category; hits: SearchHit[] }[] {
  const exact = hits.filter((h) => h.match === "exact-number");
  const rest = hits.filter((h) => h.match !== "exact-number");
  const groups = new Map<Category, SearchHit[]>();
  for (const h of rest) {
    const c = h.destination.category;
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c)!.push(h);
  }
  const ordered = [...groups.entries()].sort((a, b) => {
    const ba = Math.min(...a[1].map((h) => h.score)), bb = Math.min(...b[1].map((h) => h.score));
    return ba - bb || CATEGORY_ORDER.indexOf(a[0]) - CATEGORY_ORDER.indexOf(b[0]);
  });
  const res = ordered.map(([category, hs]) => ({ category, hits: hs }));
  if (exact.length) res.unshift({ category: exact[0].destination.category, hits: exact });
  return res;
}
