"""Build the structured TRSM indoor-map dataset from raw PDF extraction.

usage: build_dataset.py raw.json trsm.pdf out_dir
Writes out_dir/{floors.json, graph.json, destinations.json, anchors.json, provenance.json}

All coordinates are PDF points (page top-left origin, y down). The plans are
explicitly NOT TO SCALE, so no metric distances are produced here.
"""
import json
import math
import re
import sys
from collections import defaultdict

import numpy as np
import pymupdf
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, box, mapping, shape
from shapely.ops import polygonize, split, unary_union
from skimage.draw import polygon as sk_polygon
from skimage.morphology import skeletonize

RAW, PDF, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
raw = json.load(open(RAW))
pdf = pymupdf.open(PDF)

FLOORS = [
    {"id": "L7", "level": 7, "page": 1, "building": "TRS 1", "label": "7th Floor", "short": "7"},
    {"id": "L8", "level": 8, "page": 2, "building": "TRS 2", "label": "8th Floor", "short": "8"},
    {"id": "L9", "level": 9, "page": 3, "building": "TRS 3", "label": "9th Floor", "short": "9"},
]
ROOM_CLASSES = {"white", "blue_room", "lime_room", "green_room", "pink_room", "lavender_room",
                "paleyellow_room", "salmon_room", "washroom", "elevator", "elevator_alt"}
NUM_RE = re.compile(r"^(TRS\d-\d{3}|\d-\d{3}[A-Z]?|T\d)$")
IGNORE_TEXT = {"COURTYARD", "DUNDAS STREET WEST", "BAY STREET"}
R = 4.0  # raster px per pt for skeleton


def r2(v):
    return round(v, 2)


def ring_coords(ring):
    return [[r2(x), r2(y)] for x, y in ring.coords]


def poly_json(p):
    return {"outer": ring_coords(p.exterior), "holes": [ring_coords(h) for h in p.interiors]}


def polys(g):
    if g is None or g.is_empty:
        return []
    if isinstance(g, Polygon):
        return [g]
    return [x for x in getattr(g, "geoms", []) if isinstance(x, Polygon)]


# ---------------------------------------------------------------- text blocks
def text_blocks(page):
    nums, names = [], []
    for t in page["text"]:
        txt = t["text"].replace("’", "'").strip()
        if txt in IGNORE_TEXT:
            continue
        x0, y0, x1, y1 = t["bbox"]
        item = {"text": txt, "bbox": [x0, y0, x1, y1], "cx": (x0 + x1) / 2, "cy": (y0 + y1) / 2, "size": t["size"], "dir": t["dir"]}
        (nums if NUM_RE.match(txt) else names).append(item)
    return nums, names


def group_lines(names):
    names = sorted(names, key=lambda t: (t["bbox"][1], t["cx"]))
    blocks = []
    for t in names:
        placed = False
        for b in blocks:
            last = b["lines"][-1]
            h = last["bbox"][3] - last["bbox"][1]
            ov = min(last["bbox"][2], t["bbox"][2]) - max(last["bbox"][0], t["bbox"][0])
            if ov > 0.5 * min(last["bbox"][2] - last["bbox"][0], t["bbox"][2] - t["bbox"][0]) and 0 <= t["bbox"][1] - last["bbox"][1] < h * 1.35 and abs(last["size"] - t["size"]) < 1.5:
                b["lines"].append(t)
                placed = True
                break
        if not placed:
            blocks.append({"lines": [t]})
    out = []
    for b in blocks:
        x0 = min(l["bbox"][0] for l in b["lines"]); y0 = min(l["bbox"][1] for l in b["lines"])
        x1 = max(l["bbox"][2] for l in b["lines"]); y1 = max(l["bbox"][3] for l in b["lines"])
        text = " ".join(l["text"] for l in b["lines"])
        text = re.sub(r"(\w)- (\w)", r"\1-\2", text).replace("/ ", "/")
        out.append({"text": text, "bbox": [x0, y0, x1, y1], "cx": (x0 + x1) / 2, "cy": (y0 + y1) / 2})
    return out


# ---------------------------------------------------------------- strokes from PDF
def page_strokes(pno):
    pg = pdf[pno - 1]
    dashed, diagonal, solid = [], [], []
    for di, d in enumerate(pg.get_drawings()):
        if d["rect"].x0 > 700 or d["type"] not in ("s", "fs"):
            continue
        stroke_only = d["type"] == "s"
        is_dashed = d.get("dashes") not in (None, "[] 0", "[] 0.0")
        for it in d["items"]:
            op = it[0]
            if op == "l":
                a, b = it[1], it[2]
                ln = LineString([(a.x, a.y), (b.x, b.y)])
                if ln.length < 0.05:
                    continue
                if is_dashed:
                    dashed.append(ln)
                    continue
                if stroke_only:
                    solid.append((di, ln))
                if abs(a.x - b.x) > 1 and abs(a.y - b.y) > 1 and ln.length < 40:
                    diagonal.append(ln)
            elif is_dashed or not stroke_only:
                continue
            elif op == "c":
                solid.append((di, LineString([(it[1].x, it[1].y)] + bezier_pts(it[1], it[2], it[3], it[4]))))
            elif op == "re":
                r = it[1]
                solid.append((di, LineString([(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1), (r.x0, r.y0)])))
            elif op == "qu":
                q = it[1]
                solid.append((di, LineString([tuple(q.ul), tuple(q.ur), tuple(q.lr), tuple(q.ll), tuple(q.ul)])))
    return dashed, diagonal, solid


def bezier_pts(p0, p1, p2, p3, n=10):
    out = []
    for i in range(1, n + 1):
        t = i / n; mt = 1 - t
        out.append((mt**3 * p0.x + 3 * mt**2 * t * p1.x + 3 * mt * t**2 * p2.x + t**3 * p3.x,
                    mt**3 * p0.y + 3 * mt**2 * t * p1.y + 3 * mt * t**2 * p2.y + t**3 * p3.y))
    return out


def hatch_zones(diagonal, base):
    """Cluster repeated parallel diagonals (hatching). Returns (zones, member_lines)."""
    by_ang = defaultdict(list)
    for ln in diagonal:
        (x0, y0), (x1, y1) = ln.coords[0], ln.coords[-1]
        ang = math.degrees(math.atan2(y1 - y0, x1 - x0)) % 180
        by_ang[round(ang / 3)].append(ln)
    zones, members_all = [], []
    for _, lns in by_ang.items():
        if len(lns) < 8:
            continue
        u = unary_union([l.buffer(3.2) for l in lns])
        for p in polys(u):
            members = [l for l in lns if p.contains(l.centroid)]
            if len(members) >= 8:
                z = unary_union(members).envelope.intersection(base)
                if z.area > 60:
                    zones.append(z)
                    members_all.extend(members)
    return (polys(unary_union(zones)) if zones else []), members_all


# ---------------------------------------------------------------- stair treads
def is_tread(g):
    minx, miny, maxx, maxy = g.bounds
    w, h = maxx - minx, maxy - miny
    if g.area < 0.85 * w * h:
        return False
    s, l = min(w, h), max(w, h)
    return s < 8.5 and l / max(s, 0.1) > 2.0 and l < 45


def tread_blocks(tread_geoms):
    if not tread_geoms:
        return []
    u = unary_union([g.buffer(1.5) for g in tread_geoms])
    out = []
    for p in polys(u):
        members = [g for g in tread_geoms if p.contains(g.centroid)]
        if len(members) >= 4:
            out.append(unary_union(members).envelope)
    return out


# ---------------------------------------------------------------- skeleton graph
def skeleton_graph(walk, fid):
    minx, miny, maxx, maxy = walk.bounds
    ox, oy = minx - 2, miny - 2
    W = int((maxx - ox + 2) * R); H = int((maxy - oy + 2) * R)
    mask = np.zeros((H, W), dtype=bool)
    for p in polys(walk):
        xs = [(x - ox) * R for x, y in p.exterior.coords]; ys = [(y - oy) * R for x, y in p.exterior.coords]
        rr, cc = sk_polygon(ys, xs, mask.shape); mask[rr, cc] = True
        for h in p.interiors:
            xs = [(x - ox) * R for x, y in h.coords]; ys = [(y - oy) * R for x, y in h.coords]
            rr, cc = sk_polygon(ys, xs, mask.shape); mask[rr, cc] = False
    sk = skeletonize(mask)
    pts = set(zip(*np.nonzero(sk)))
    nbrs = {}
    for (r, c) in pts:
        n = []
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                if (dr or dc) and (r + dr, c + dc) in pts:
                    n.append((r + dr, c + dc))
        nbrs[(r, c)] = n
    # collapse junction clusters
    node_px = {p for p, n in nbrs.items() if len(n) != 2}
    # trace edges
    visited = set()
    edges = []
    for start in node_px:
        for nb in nbrs[start]:
            if (start, nb) in visited:
                continue
            path = [start, nb]
            visited.add((start, nb)); visited.add((nb, start))
            prev, cur = start, nb
            while cur not in node_px:
                nxt = [q for q in nbrs[cur] if q != prev]
                if not nxt:
                    break
                # prefer straight continuation
                nxt = nxt[0]
                visited.add((cur, nxt)); visited.add((nxt, cur))
                path.append(nxt)
                prev, cur = cur, nxt
            edges.append(path)
    to_pt = lambda p: (p[1] / R + ox, p[0] / R + oy)
    # build networkx-like structure with clustered junctions
    import networkx as nx
    G = nx.Graph()
    def key(p):
        return p
    for path in edges:
        if len(path) < 2:
            continue
        a, b = path[0], path[-1]
        line = [to_pt(p) for p in path]
        length = LineString(line).length if len(line) > 1 else 0
        if a == b:
            continue
        if G.has_edge(a, b) and G[a][b]["length"] <= length:
            continue
        G.add_edge(a, b, line=line, length=length)
    # merge adjacent junction pixels (8-connected clusters)
    changed = True
    while changed:
        changed = False
        for u, v, d in list(G.edges(data=True)):
            if d["length"] < 1.2 and G.degree(u) > 1 and G.degree(v) > 1:
                G = nx.contracted_nodes(G, u, v, self_loops=False)
                changed = True
                break
    # prune short spurs iteratively
    for _ in range(6):
        removed = False
        for u, v, d in list(G.edges(data=True)):
            if not G.has_edge(u, v):
                continue
            du, dv = G.degree(u), G.degree(v)
            if (du == 1 and dv >= 3) or (dv == 1 and du >= 3):
                if d["length"] < 14:
                    leaf = u if du == 1 else v
                    G.remove_node(leaf)
                    removed = True
        # merge degree-2 nodes
        for n in list(G.nodes):
            if n in G and G.degree(n) == 2:
                (a, da), (b, db) = [(nb, G[n][nb]) for nb in G.neighbors(n)]
                la, lb = da["line"], db["line"]
                pn = to_pt(n)
                def orient(line, end_at):
                    return line if math.dist(line[-1], end_at) < math.dist(line[0], end_at) else line[::-1]
                la = orient(la, pn); lb = orient(lb, pn)[::-1]
                lb = lb if math.dist(lb[0], pn) < math.dist(lb[-1], pn) else lb[::-1]
                merged = la + lb[1:]
                if a == b:
                    continue
                G.remove_node(n)
                G.add_edge(a, b, line=merged, length=LineString(merged).length)
        if not removed:
            break
    G.remove_nodes_from([n for n in list(G.nodes) if G.degree(n) == 0])
    # keep the largest component
    comps = sorted(nx.connected_components(G), key=len, reverse=True)
    G = G.subgraph(comps[0]).copy()
    # simplify lines -> node/edge lists
    nodes, out_edges = {}, []
    def nid_for(pt):
        k = (round(pt[0], 1), round(pt[1], 1))
        if k not in nodes:
            nodes[k] = {"id": f"{fid}:n{len(nodes)}", "floor": fid, "x": r2(pt[0]), "y": r2(pt[1]), "kind": "corridor"}
        return nodes[k]["id"]
    for u, v, d in G.edges(data=True):
        line = d["line"]
        pu, pv = to_pt(u), to_pt(v)
        if math.dist(line[0], pu) > math.dist(line[-1], pu):
            line = line[::-1]
        line = [pu] + line[1:-1] + [pv]
        simp = LineString(line).simplify(1.2, preserve_topology=False)
        cs = list(simp.coords)
        # make sure every simplified segment stays inside walkable; else refine
        refined = [cs[0]]
        for q in cs[1:]:
            seg = LineString([refined[-1], q])
            if not walk.buffer(0.05).contains(seg):
                # fall back to finer simplification for this stretch
                sub = LineString(line).simplify(0.3).coords
                refined = list(sub)
                break
            refined.append(q)
        ids = [nid_for(p) for p in refined]
        for a, b in zip(ids, ids[1:]):
            if a != b:
                out_edges.append([a, b])
    for n in nodes.values():
        pass
    return list(nodes.values()), out_edges


def merge_geoms(a, b):
    m = unary_union([a.buffer(0.25, join_style=2), b.buffer(0.25, join_style=2)]).buffer(-0.25, join_style=2)
    ps = polys(m)
    return max(ps, key=lambda p: p.area) if ps else a


# ---------------------------------------------------------------- main per floor
floors_out, all_nodes, all_edges, destinations, provenance = [], [], [], [], {}

OVERRIDES = json.load(open(sys.argv[4])) if len(sys.argv) > 4 else {}

for F in FLOORS:
    page = raw["pages"][F["page"] - 1]
    fid = F["id"]
    base = shape(page["base"])
    base_main = max(polys(base), key=lambda p: p.area)
    court = shape(page["courtyard"]) if page["courtyard"] else None
    court_outer = shape(page["courtyard_outer"]) if page["courtyard_outer"] else None
    walk_all = shape(page["walkable"])
    walk = max(polys(walk_all), key=lambda p: p.area)
    dashed, diagonal, solid = page_strokes(F["page"])
    hatches, hatch_lines = hatch_zones(diagonal, base_main)
    hatch_keys = {tuple(map(lambda c: (round(c[0], 2), round(c[1], 2)), l.coords)) for l in hatch_lines}
    solid = [(di, l) for di, l in solid if tuple(map(lambda c: (round(c[0], 2), round(c[1], 2)), l.coords)) not in hatch_keys]
    hatch_union_all = unary_union(hatches) if hatches else None

    # ---- partition room-class shapes by drawing order (later = on top)
    shapes = [s for s in page["shapes"] if s["cls"] in ROOM_CLASSES]
    treads = [shape(s["geom"]) for s in shapes if s["cls"] == "white" and is_tread(shape(s["geom"]))]
    stairs = tread_blocks(treads)
    stair_union = unary_union(stairs) if stairs else None
    shapes = [s for s in shapes if not (s["cls"] == "white" and is_tread(shape(s["geom"])))]
    shapes.sort(key=lambda s: s["i"])
    shape_geoms = [(s["i"], s["cls"], shape(s["geom"]).buffer(0)) for s in shapes]
    all_fills = sorted([(s["i"], shape(s["geom"]).buffer(0)) for s in page["shapes"]
                        if s["cls"] in ROOM_CLASSES and not is_tread(shape(s["geom"]))], key=lambda t: t[0])
    linework = []
    for di, ln in solid:  # stroke-only lines can also be hidden under later fills
        later = [h for j, h in all_fills if j > di and h.area > 6 and h.intersects(ln)]
        if later:
            ln = ln.difference(unary_union([h.buffer(-0.2) for h in later]))
        if not ln.is_empty:
            linework.append(ln)
    for k, (i, c, g) in enumerate(shape_geoms):
        later = [h for j, h in all_fills if j > i and h.area > 6]
        cover = unary_union([h.buffer(-0.2) for h in later]) if later else None
        for p in polys(g):
            for ring in [p.exterior] + list(p.interiors):
                ln = LineString(ring.coords)
                vis = ln.difference(cover) if cover is not None and not cover.is_empty else ln
                if not vis.is_empty:
                    linework.append(vis)
    linework = [l for l in linework if base_main.buffer(3).intersects(l)]
    noded = unary_union(linework)
    faces = [f for f in polygonize(noded) if f.area > 4]
    pieces = []
    for fc in faces:
        rp = fc.representative_point()
        if stair_union is not None and stair_union.buffer(0.5).contains(rp):
            continue
        tops = [(i, c) for i, c, g in shape_geoms if g.contains(rp)]
        if not tops:
            continue
        i, c = max(tops)
        if hatch_union_all is not None and fc.intersection(hatch_union_all).area > 0.5 * fc.area:
            continue
        # the face must not be mostly corridor: if base is drawn above the room fill, skip
        pieces.append({"cls": c, "geom": fc.buffer(0), "src": i})
    # merge faces split only by icon strokes (same source fill, touching, unlabeled) later
    nums, name_lines = text_blocks(page)

    def piece_at(x, y):
        pt = Point(x, y)
        hits = [p for p in pieces if p["geom"].buffer(0.3).contains(pt)]
        return min(hits, key=lambda p: p["geom"].area) if hits else None

    for p in pieces:
        p["nums"], p["names"] = [], []
    for n in nums:
        p = piece_at(n["cx"], n["cy"])
        if p is not None:
            p["nums"].append(n)
    loose_lines = []
    for p in pieces:
        p["lines"] = []
    for t in name_lines:
        p = piece_at(t["cx"], t["cy"])
        if p is not None and p["cls"] not in ("elevator", "elevator_alt", "washroom"):
            p["lines"].append(t)
        else:
            loose_lines.append(t)
    for p in pieces:
        for b in group_lines(p["lines"]):
            p["names"].append(b)
    loose_names = group_lines(loose_lines)

    # absorb unlabeled coloured faces into an adjacent labeled face of the same fill & source
    for a in [p for p in pieces if not p["names"] and not p["nums"] and p["cls"] not in ("white", "washroom", "elevator", "elevator_alt")]:
        for b in pieces:
            if b is a or b["cls"] != a["cls"] or b["src"] != a["src"] or not (b["names"] or b["nums"]):
                continue
            if a["geom"].buffer(0.3).intersection(b["geom"].buffer(0.3)).area > 1.5:
                b["geom"] = merge_geoms(a["geom"], b["geom"])
                pieces.remove(a)
                break

    # split pieces holding several numbers along dashed lines
    new_pieces = []
    for p in pieces:
        if len(p["nums"]) >= 2:
            inner = [d for d in dashed if p["geom"].buffer(1).intersects(d)]
            if inner:
                ln = unary_union(inner)
                # extend each dashed line across the piece
                ext = []
                for d in getattr(ln, "geoms", [ln]):
                    (x0, y0), (x1, y1) = d.coords[0], d.coords[-1]
                    dx, dy = x1 - x0, y1 - y0
                    L = math.hypot(dx, dy) or 1
                    ext.append(LineString([(x0 - dx / L * 50, y0 - dy / L * 50), (x1 + dx / L * 50, y1 + dy / L * 50)]))
                parts = polys(split(p["geom"], unary_union(ext)))
                if len(parts) >= 2:
                    for part in parts:
                        q = {"cls": p["cls"], "geom": part, "src": p["src"]}
                        q["nums"] = [n for n in p["nums"] if part.buffer(0.3).contains(Point(n["cx"], n["cy"]))]
                        q["names"] = [b for b in p["names"] if part.buffer(0.3).contains(Point(b["cx"], b["cy"]))]
                        new_pieces.append(q)
                    continue
        new_pieces.append(p)
    pieces = new_pieces

    # ---- icon features (clusters by colour)
    feats = []
    icon_cls = {"exit_icon": "exit", "water_icon": "water", "escalator_icon": "escalator",
                "marker_purple": "marker", "marker_magenta": "marker", "marker_teal": "marker"}
    icon_geoms = defaultdict(list)
    for s in page["shapes"]:
        if s["cls"] in icon_cls:
            icon_geoms[icon_cls[s["cls"]]].append(shape(s["geom"]))
    for typ, gs in icon_geoms.items():
        u = unary_union([g.envelope.buffer(0.8) for g in gs])
        for p in polys(u):
            c = p.centroid
            feats.append({"type": typ, "x": r2(c.x), "y": r2(c.y), "bbox": [r2(v) for v in p.bounds]})
    # floor-8 teal marker shares the water colour; reclassify by nearby label
    for f in feats:
        if f["type"] not in ("water", "marker"):
            continue
        near = sorted(loose_names, key=lambda b: math.dist((b["cx"], b["cy"]), (f["x"], f["y"])))
        if not near:
            continue
        d0 = math.dist((near[0]["cx"], near[0]["cy"]), (f["x"], f["y"]))
        if (f["type"] == "marker" and d0 < 60) or (f["type"] == "water" and "Retail" in near[0]["text"] and d0 < 45):
            f["type"] = "marker"
            f["label"] = near[0]["text"]
            loose_names.remove(near[0])

    # ---- elevator banks
    elev_pieces = [p for p in pieces if p["cls"] in ("elevator", "elevator_alt")]
    banks = polys(unary_union([p["geom"].buffer(0.8) for p in elev_pieces]))

    # ---- walkable union used for frontage (hatch counts separately)
    walk_b = walk.buffer(1.6)
    hatch_union = unary_union(hatches) if hatches else None

    spaces = []
    for idx, p in enumerate(pieces):
        g = p["geom"]
        if not isinstance(g, Polygon):
            g = max(polys(g), key=lambda q: q.area)
        number = p["nums"][0]["text"] if p["nums"] else None
        name = " / ".join(b["text"] for b in sorted(p["names"], key=lambda b: b["cy"])) or None
        kind = "room"
        if p["cls"] == "washroom":
            kind = "washroom"
        elif p["cls"] in ("elevator", "elevator_alt"):
            kind = "elevator"
        sid = f"{fid}:{number}" if number else f"{fid}:s{idx}"
        spaces.append({
            "id": sid, "floor": fid, "kind": kind, "fill": p["cls"].replace("elevator_alt", "elevator"),
            "number": number, "name": name,
            "labelAt": [r2(p["nums"][0]["cx"]), r2(p["nums"][0]["cy"])] if number else ([r2(p["names"][0]["cx"]), r2(p["names"][0]["cy"])] if p["names"] else None),
            "labelVertical": bool(p["nums"] and abs(p["nums"][0]["dir"][1]) > 0.5),
            "polygon": poly_json(g), "area": r2(g.area),
            "source": {"page": F["page"], "drawingIndex": p["src"]},
        })

    # ---- notch (entrance-symbol) detection: a reflex vertex whose two short edges
    #      (one diagonal) cut a wedge into an otherwise straight wall facing the corridor
    def is_axis(a, b):
        ang = math.degrees(math.atan2(b[1] - a[1], b[0] - a[0])) % 90
        return ang < 6 or ang > 84
    for s in spaces:
        s["entranceNotches"] = []
        if not s["number"] and not s["name"]:
            continue
        g = Polygon(s["polygon"]["outer"]).buffer(0)
        if not isinstance(g, Polygon):
            continue
        g = g.simplify(0.15)
        ring = list(g.exterior.coords)[:-1]
        ccw = g.exterior.is_ccw
        n = len(ring)
        for k in range(n):
            P, V, N = ring[k - 1], ring[k], ring[(k + 1) % n]
            pv, vn, pn = math.dist(P, V), math.dist(V, N), math.dist(P, N)
            if not (pv < 22 and vn < 22 and 5 < pn < 26):
                continue
            cross = (V[0] - P[0]) * (N[1] - V[1]) - (V[1] - P[1]) * (N[0] - V[0])
            reflex = cross < 0 if ccw else cross > 0
            if not reflex:
                continue
            depth = LineString([P, N]).distance(Point(V))
            if not (3 < depth < 15):
                continue
            if is_axis(P, V) and is_axis(V, N):
                continue
            mouth = ((P[0] + N[0]) / 2, (P[1] + N[1]) / 2)
            if walk.distance(Point(mouth)) > 2.5:
                continue
            s["entranceNotches"].append([r2(mouth[0]), r2(mouth[1])])

    floors_out.append({
        "id": fid, "level": F["level"], "label": F["label"], "building": F["building"],
        "sourcePage": F["page"],
        "outline": poly_json(base_main),
        "walkable": poly_json(walk),
        "walkableInset": [poly_json(p) for p in polys(walk.buffer(-1.6, join_style=2))],
        "courtyard": poly_json(max(polys(court), key=lambda p: p.area)) if court else None,
        "outdoorSeating": [poly_json(p) for p in polys(court_outer.difference(court.buffer(0.3)))] if (court_outer is not None and court is not None) else [],
        "hatched": [poly_json(h) for h in hatches],
        "stairs": [poly_json(s) for s in stairs],
        "spaces": spaces,
        "features": feats,
        "elevatorBanks": [poly_json(b) for b in banks],
        "looseLabels": [{"text": b["text"], "x": r2(b["cx"]), "y": r2(b["cy"])} for b in loose_names],
    })

    # ---- corridor graph
    nodes, edges = skeleton_graph(walk, fid)
    provenance[fid] = {"walkableArea": r2(walk.area), "graphNodes": len(nodes), "graphEdges": len(edges), "hatchZones": len(hatches), "stairs": len(stairs)}
    for n in nodes:
        all_nodes.append(n)
    for a, b in edges:
        all_edges.append({"a": a, "b": b, "kind": "corridor", "verification": "source-derived"})

json.dump({"floors": floors_out, "nodes": all_nodes, "edges": all_edges, "provenance": provenance}, open(f"{OUT}/stage1.json", "w"))
for f in floors_out:
    print(f["id"], "spaces", len(f["spaces"]), "numbered", sum(1 for s in f["spaces"] if s["number"]),
          "named", sum(1 for s in f["spaces"] if s["name"]), "features", len(f["features"]),
          "hatched", len(f["hatched"]), "stairs", len(f["stairs"]), "banks", len(f["elevatorBanks"]),
          "loose", [l["text"] for l in f["looseLabels"]], provenance[f["id"]])
