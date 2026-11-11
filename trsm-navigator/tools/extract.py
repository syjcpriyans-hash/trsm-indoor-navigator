"""Extract floor geometry from the TRSM floor-plan PDF.

Output: raw JSON per page with
  - base (floor fill = corridor / circulation shade)
  - courtyard + outdoor seating polygons
  - every filled shape classified by colour
  - walkable polygon = base - obstacle fills - solid wall strokes
  - text lines with bbox + direction
Coordinates are PDF points, page top-left origin, y increasing downward.
"""
import json
import sys

import pymupdf
from shapely.geometry import LineString, Polygon, mapping
from shapely.ops import unary_union

PDF = sys.argv[1]
OUT = sys.argv[2]

MAP_MAX_X = 700  # legend lives to the right of x=700

COLOURS = {
    "background": (0.82, 0.826, 0.832),
    "base": (0.91, 0.911, 0.911),
    "courtyard_outer": (0.837, 0.842, 0.848),
    "courtyard": (0.769, 0.771, 0.775),
    "white": (1.0, 1.0, 1.0),
    "blue_room": (0.67, 0.881, 0.979),
    "lime_room": (0.811, 0.832, 0.373),
    "green_room": (0.65, 0.85, 0.767),
    "pink_room": (0.957, 0.604, 0.759),
    "lavender_room": (0.772, 0.696, 0.84),
    "paleyellow_room": (1.0, 0.939, 0.668),
    "salmon_room": (0.987, 0.793, 0.716),
    "washroom": (0.972, 0.597, 0.284),
    "elevator": (1.0, 0.888, 0.312),
    "elevator_alt": (0.945, 0.915, 0.097),
    "exit_icon": (0.085, 0.582, 0.276),
    "water_icon": (0.0, 0.67, 0.74),
    "escalator_icon": (0.0, 0.348, 0.616),
    "marker_purple": (0.436, 0.17, 0.567),
    "marker_magenta": (0.933, 0.236, 0.563),
    "marker_teal": (0.0, 0.639, 0.678),
}
ROOM_CLASSES = {
    "white", "blue_room", "lime_room", "green_room", "pink_room",
    "lavender_room", "paleyellow_room", "salmon_room", "washroom", "elevator", "elevator_alt",
}


def classify(rgb):
    if rgb is None:
        return None
    best, bd = None, 1e9
    for name, c in COLOURS.items():
        d = sum((a - b) ** 2 for a, b in zip(rgb, c))
        if d < bd:
            best, bd = name, d
    if bd > 0.004:
        return "other:" + ",".join(f"{v:.3f}" for v in rgb)
    return best


def bezier(p0, p1, p2, p3, n=10):
    pts = []
    for i in range(1, n + 1):
        t = i / n
        mt = 1 - t
        x = mt**3 * p0.x + 3 * mt**2 * t * p1.x + 3 * mt * t**2 * p2.x + t**3 * p3.x
        y = mt**3 * p0.y + 3 * mt**2 * t * p1.y + 3 * mt * t**2 * p2.y + t**3 * p3.y
        pts.append((x, y))
    return pts


def rings_of(path):
    rings, cur = [], []

    def flush():
        nonlocal cur
        if len(cur) >= 3:
            rings.append(cur)
        cur = []

    last = None
    for it in path["items"]:
        op = it[0]
        if op == "re":
            flush()
            r = it[1]
            rings.append([(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1)])
            last = None
        elif op == "qu":
            flush()
            q = it[1]
            rings.append([tuple(q.ul), tuple(q.ur), tuple(q.lr), tuple(q.ll)])
            last = None
        elif op in ("l", "c"):
            a = it[1]
            if last is None or abs(last.x - a.x) > 0.15 or abs(last.y - a.y) > 0.15:
                flush()
                cur = [(a.x, a.y)]
            if op == "l":
                cur.append((it[2].x, it[2].y))
                last = it[2]
            else:
                cur.extend(bezier(it[1], it[2], it[3], it[4]))
                last = it[4]
    flush()
    return rings


def path_polygon(path):
    rings = rings_of(path)
    polys = []
    for r in rings:
        try:
            p = Polygon(r).buffer(0)
        except Exception:
            continue
        if not p.is_empty and p.area > 0.01:
            polys.append(p)
    if not polys:
        return None
    polys.sort(key=lambda p: -p.area)
    acc = polys[0]
    for p in polys[1:]:
        if acc.contains(p.buffer(-0.05)):
            acc = acc.difference(p)  # hole
        else:
            acc = acc.union(p)
    return acc


def stroke_lines(path):
    lines = []
    for r in rings_of(path) if False else []:
        pass
    last = None
    seg = []
    for it in path["items"]:
        op = it[0]
        if op == "l":
            lines.append(LineString([(it[1].x, it[1].y), (it[2].x, it[2].y)]))
        elif op == "c":
            pts = [(it[1].x, it[1].y)] + bezier(it[1], it[2], it[3], it[4])
            lines.append(LineString(pts))
        elif op == "re":
            r = it[1]
            lines.append(LineString([(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1), (r.x0, r.y0)]))
        elif op == "qu":
            q = it[1]
            lines.append(LineString([tuple(q.ul), tuple(q.ur), tuple(q.lr), tuple(q.ll), tuple(q.ul)]))
    return lines


def geo(g):
    return mapping(g.simplify(0.05)) if g is not None else None


def main():
    doc = pymupdf.open(PDF)
    out = {"source": PDF, "pages": []}
    for pno, pg in enumerate(doc):
        drawings = pg.get_drawings()
        shapes = []
        base_parts, court_outer, court = [], [], []
        obstacles, wall_lines, icon_boxes = [], [], []
        for i, d in enumerate(drawings):
            r = d["rect"]
            if r.x0 > MAP_MAX_X:
                continue
            fill_cls = classify(d.get("fill")) if d.get("fill") is not None else None
            has_stroke = d["type"] in ("s", "fs")
            dashed = d.get("dashes") not in (None, "[] 0", "[] 0.0")
            if fill_cls is not None:
                poly = path_polygon(d)
                if poly is None:
                    continue
                shapes.append({"i": i, "cls": fill_cls, "area": poly.area, "bbox": [r.x0, r.y0, r.x1, r.y1], "geom": poly})
                if fill_cls == "base":
                    base_parts.append(poly)
                elif fill_cls == "courtyard_outer":
                    court_outer.append(poly)
                elif fill_cls == "courtyard":
                    court.append(poly)
                elif fill_cls in ROOM_CLASSES:
                    obstacles.append(poly)
                elif fill_cls in ("water_icon", "marker_purple", "marker_magenta", "marker_teal"):
                    icon_boxes.append(poly.envelope.buffer(0.5))
            if has_stroke and not dashed:
                w = d.get("width") or 0.5
                for ln in stroke_lines(d):
                    wall_lines.append(ln.buffer(max(w, 0.6) / 2, cap_style=2, join_style=2))

        base = unary_union(base_parts)
        courtyard_outer = unary_union(court_outer) if court_outer else None
        courtyard = unary_union(court) if court else None
        icon_union = unary_union(icon_boxes) if icon_boxes else None
        if icon_union is not None:
            obstacles = [o for o in obstacles if not icon_union.contains(o)]
            wall_lines = [w for w in wall_lines if not icon_union.contains(w)]
        blockers = unary_union(obstacles + wall_lines + ([courtyard_outer] if courtyard_outer else []) + ([courtyard] if courtyard else []))
        # morphological closing merges stair treads / hatch strips into solid blocks
        blockers = blockers.buffer(2.0, join_style=2).buffer(-2.0, join_style=2)
        walk = base.difference(blockers)
        walk = walk.buffer(-0.25).buffer(0.25)
        parts = [g for g in getattr(walk, "geoms", [walk]) if g.area > 40]
        walk = unary_union(parts)

        # text
        lines = []
        td = pg.get_text("dict")
        for b in td["blocks"]:
            for ln in b.get("lines", []):
                txt = " ".join(s["text"] for s in ln["spans"]).strip()
                if not txt:
                    continue
                bb = ln["bbox"]
                if bb[0] > MAP_MAX_X:
                    continue
                size = max(s["size"] for s in ln["spans"])
                lines.append({"text": txt, "bbox": [round(v, 2) for v in bb], "dir": [round(v, 3) for v in ln["dir"]], "size": round(size, 2)})

        out["pages"].append({
            "page": pno + 1,
            "size": [pg.rect.width, pg.rect.height],
            "base": geo(base),
            "courtyard_outer": geo(courtyard_outer),
            "courtyard": geo(courtyard),
            "walkable": geo(walk),
            "walkable_area": walk.area,
            "walkable_parts": len(parts),
            "shapes": [{**{k: v for k, v in s.items() if k != "geom"}, "geom": geo(s["geom"])} for s in shapes],
            "text": lines,
        })
        print(f"page {pno+1}: shapes={len(shapes)} walkable parts={len(parts)} area={walk.area:.0f}", file=sys.stderr)
    json.dump(out, open(OUT, "w"))


main()
