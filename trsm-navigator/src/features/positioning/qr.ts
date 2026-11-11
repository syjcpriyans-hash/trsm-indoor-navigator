import { ANCHOR_BY_ID } from "@/data";
import type { Anchor } from "@/types/map";

const ANCHOR_RE = /^TRSM-[7-9]-\d{2}$/;

/** Read ?anchor=TRSM-8-03 (or #anchor=…) from a URL. Returns the raw id, or null if absent. */
export function anchorIdFromUrl(href: string): string | null {
  try {
    const u = new URL(href, "https://local.invalid");
    const q = u.searchParams.get("anchor") ?? new URLSearchParams(u.hash.replace(/^#/, "")).get("anchor");
    return q ? q.trim().toUpperCase() : null;
  } catch {
    return null;
  }
}

export type AnchorCheck = { ok: true; anchor: Anchor } | { ok: false; reason: "malformed" | "unknown"; message: string };

export function validateAnchorId(id: string): AnchorCheck {
  const clean = id.trim().toUpperCase();
  if (!ANCHOR_RE.test(clean)) return { ok: false, reason: "malformed", message: `"${id}" isn't a TRSM positioning code. Codes look like TRSM-8-03.` };
  const a = ANCHOR_BY_ID[clean];
  if (!a) return { ok: false, reason: "unknown", message: `Code ${clean} isn't registered as a positioning anchor. Your location wasn't changed.` };
  return { ok: true, anchor: a };
}

export function anchorUrl(origin: string, basePath: string, id: string) {
  const base = origin.replace(/\/$/, "") + basePath.replace(/\/$/, "");
  return `${base}/?anchor=${encodeURIComponent(id)}`;
}

/** Extract an anchor id from scanned QR text (a full URL or a bare id). */
export function anchorIdFromScan(text: string): string | null {
  const t = text.trim();
  if (ANCHOR_RE.test(t.toUpperCase())) return t.toUpperCase();
  return anchorIdFromUrl(t);
}
