"""Stage 2: room entries, vertical connectors, destinations, QR anchors.

usage: build_routing.py stage1.json out_dir
"""
import json
import math
import re
import sys
from collections import defaultdict

from shapely.geometry import LineString, MultiLineString, Point, Polygon
from shapely.ops import nearest_points, unary_union

ST = json.load(open(sys.argv[1]))
OUT = sys.argv[2]


def r2(v):
    return round(v, 2)


def P(pj):
    return Polygon(pj["outer"], pj.get("holes", [])).buffer(0)


def polys(g):
    if g.is_empty:
        return []
    return [g] if g.geom_type == "Polygon" else [x for x in getattr(g, "geoms", []) if x.geom_type == "Polygon"]


def lines(g):
    if g.is_empty:
        return []
    if g.geom_type == "LineString":
        return [g]
    out = []
    for x in getattr(g, "geoms", []):
        out.extend(lines(x))
    return out


floors = {f["id"]: f for f in ST["floors"]}
nodes = {n["id"]: dict(n) for n in ST["nodes"]}
edges = [dict(e) for e in ST["edges"]]
walk = {fid: P(f["walkable"]) for fid, f in floors.items()}
hatch = {fid: unary_union([P(h) for h in f["hatched"]]) if f["hatched"] else None for fid, f in floors.items()}
stairs = {fid: [P(s) for s in f["stairs"]] for fid, f in floors.items()}

# ------------------------------------------------------------ prune spurs that end inside stairwells
adj = defaultdict(set)
for e in edges:
    adj[e["a"]].add(e["b"]); adj[e["b"]].add(e["a"])
changed = True
while changed:
    changed = False
    for nid, n in list(nodes.items()):
        if len(adj[nid]) == 1:
            pt = Point(n["x"], n["y"])
            if any(s.buffer(3).contains(pt) for s in stairs[n["floor"]]):
                (other,) = adj[nid]
                adj[other].discard(nid)
                del adj[nid]
                del nodes[nid]
                edges = [e for e in edges if nid not in (e["a"], e["b"])]
                changed = True

# ------------------------------------------------------------ curation (documented overrides)
CURATION = {
    "L7:1-143": {"name": "Culinary/Catering Department", "why": "Plan label 'Culinary/Catering Department' has an arrow pointing to 1-143; lavender fill matches the legend colour."},
    "L7:1-150": {"name": "Commons", "why": "Blue block holds 'HTM Demo Kitchen & Classroom' and 'Commons 1-150' above a dashed divider; the HTM label is listed separately below."},
    "L9:3-017": {"note": "Small lime room inside the Office of the Dean area (same legend colour)."},
    "L9:3-165": {"note": "Small lime room inside the Office of the Dean area (same legend colour)."},
}
for n in ("2-112", "2-110", "2-108", "2-106", "2-104", "2-102"):
    CURATION[f"L8:{n}"] = {"name": "Breakout Room", "why": "Under the 'Breakout Rooms' label; blue fill matches the legend colour."}
for n in ("3-112", "3-110", "3-108"):
    CURATION[f"L9:{n}"] = {"name": "Breakout Room", "why": "Under the 'Breakout Rooms' label; blue fill matches the legend colour."}
for n in ("3-106", "3-104"):
    CURATION[f"L9:{n}"] = {"keywords": ["graduate programs", "breakout"],
                           "note": "Pink fill matches the Graduate Programs legend colour and the cell sits within the 'Breakout Rooms' label group. Confirm its use on site."}
NAME_DROP = {"L7:s55"}  # culinary text sits in this white area; the arrow assigns it to 1-143

# ------------------------------------------------------------ categories
def categorize(name, number, kind):
    if kind == "washroom":
        return "washroom"
    if kind == "elevator":
        return "elevator"
    n = (name or "").lower()
    rules = [
        ("lecture", ["lecture"]),
        ("lab", ["lab"]),
        ("meeting", ["boardroom", "conference", "breakout"]),
        ("food", ["kitchen", "bagel", "catering"]),
        ("study", ["commons", "lounge", "alcove", "study", "seating", "tutoring", "society", "workroom"]),
        ("services", ["advising", "support", "career", "hub", "office", "engagement", "dean", "programs", "fit for business", "pop-up"]),
        ("safety", ["security", "emergency"]),
    ]
    for cat, keys in rules:
        if any(k in n for k in keys):
            return cat
    return "room"


CAT_LABEL = {"lecture": "Lecture hall", "lab": "Lab", "meeting": "Meeting room", "food": "Food & kitchen",
             "study": "Study & lounge", "services": "Student & staff services", "safety": "Security",
             "room": "Room", "washroom": "Washroom", "elevator": "Elevator", "water": "Water refill",
             "landmark": "Landmark"}

# ------------------------------------------------------------ helpers: graph projection & splits
pending_splits = defaultdict(list)  # edge index -> [(t, new_node_id)]


def edge_segments(fid):
    for i, e in enumerate(edges):
        a, b = nodes.get(e["a"]), nodes.get(e["b"])
        if not a or not b or a["floor"] != fid or b["floor"] != fid or e["kind"] != "corridor":
            continue
        yield i, a, b


def project(px, py, a, b):
    ax, ay, bx, by = a["x"], a["y"], b["x"], b["y"]
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy or 1e-9
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
    return t, ax + t * dx, ay + t * dy


def attach(fid, door, allowed_area, max_dist=160):
    """Find nearest corridor-edge point with a straight connector inside allowed_area."""
    cands = []
    for i, a, b in edge_segments(fid):
        t, cx, cy = project(door[0], door[1], a, b)
        cands.append((math.dist(door, (cx, cy)), i, t, cx, cy))
    cands.sort()
    zone = allowed_area.buffer(0.08)
    for d, i, t, cx, cy in cands:
        if d > max_dist:
            break
        if d < 0.05 or zone.contains(LineString([door, (cx, cy)])):
            return i, t, (cx, cy), d
    return None


def door_point(fid, mouth, area):
    """Move a point on the wall slightly into the allowed area."""
    inner = area.buffer(-0.9)
    if inner.is_empty:
        inner = area
    p = nearest_points(inner, Point(mouth))[0]
    return (p.x, p.y)


new_nodes = {}
entry_edges = []


def make_entry(fid, key, door, status, area_for_connector, note):
    hit = attach(fid, door, area_for_connector)
    if hit is None:
        return None
    i, t, (cx, cy), d = hit
    did = f"{fid}:door:{key}"
    new_nodes[did] = {"id": did, "floor": fid, "x": r2(door[0]), "y": r2(door[1]), "kind": "entry"}
    jid = f"{fid}:j:{key}"
    new_nodes[jid] = {"id": jid, "floor": fid, "x": r2(cx), "y": r2(cy), "kind": "corridor"}
    pending_splits[i].append((t, jid))
    entry_edges.append({"a": jid, "b": did, "kind": "entry", "verification": status})
    return {"nodeId": did, "status": status, "note": note, "x": r2(door[0]), "y": r2(door[1])}


def best_wall(poly, area):
    """Longest single straight wall piece that faces `area` (walls are not merged across corners)."""
    g = poly.simplify(0.4)
    rings = [g.exterior] if g.geom_type == "Polygon" else [p.exterior for p in g.geoms]
    best = None
    for ring in rings:
        cs = list(ring.coords)
        for a, b in zip(cs, cs[1:]):
            seg = LineString([a, b])
            if seg.length < 2.5:
                continue
            for piece in lines(seg.intersection(area)):
                if piece.length > 2.5 and (best is None or piece.length > best.length):
                    best = piece
    return best


def frontage_entry(fid, key, poly, notches):
    W = walk[fid]
    if notches:
        mouth = notches[0]
        door = door_point(fid, mouth, W)
        e = make_entry(fid, key, door, "source-indicated", W, "Entrance notch symbol drawn on the plan at this wall.")
        if e:
            return e
    best = best_wall(poly, W.buffer(1.8))
    if best is not None:
        mouth = best.interpolate(0.5, normalized=True)
        door = door_point(fid, (mouth.x, mouth.y), W)
        e = make_entry(fid, key, door, "estimated", W,
                       "Door position is not shown on the plan; estimated at the middle of the room's longest corridor-facing wall.")
        if e:
            return e
    H = hatch[fid]
    if H is not None:
        best = best_wall(poly, H.buffer(1.8))
        if best is not None:
            mouth = best.interpolate(0.5, normalized=True)
            area = unary_union([W, H.buffer(0.5)])
            door = door_point(fid, (mouth.x, mouth.y), area)
            e = make_entry(fid, key, door, "unverified", area,
                           "This room only faces a hatched area whose meaning is not given in the plan legend. Access is unconfirmed.")
            if e:
                return e
    # fallback: room has no wall on a corridor (it sits behind other rooms)
    if poly.distance(W) < 70:
        np_ = nearest_points(W.buffer(-0.9), poly)[0]
        e = make_entry(fid, key, (np_.x, np_.y), "nearest-corridor", W,
                       "No wall of this room touches a corridor on the plan (it sits behind other rooms). The route ends at the nearest corridor point; the way in must be confirmed on site.")
        if e:
            return e
    return None


# ------------------------------------------------------------ destinations from spaces
destinations = []
space_entry = {}
for fid, f in floors.items():
    # washroom blocks
    wash = [s for s in f["spaces"] if s["kind"] == "washroom"]
    blocks = polys(unary_union([P(s["polygon"]).buffer(0.6) for s in wash]))
    for k, b in enumerate(sorted(blocks, key=lambda g: (g.centroid.y, g.centroid.x))):
        key = f"washrooms-{k+1}"
        poly = b.buffer(-0.6)
        ent = frontage_entry(fid, key, poly, [])
        c = poly.centroid
        destinations.append({
            "id": f"{fid}:{key}", "floor": fid, "name": "Washrooms", "number": None, "category": "washroom",
            "keywords": ["washroom", "restroom", "bathroom", "toilet", "accessible washroom", "wc"],
            "labelAt": [r2(c.x), r2(c.y)], "spaceIds": [s["id"] for s in wash if P(s["polygon"]).intersects(b)],
            "entry": ent, "notes": ["The plan shows women's, men's and accessible washroom symbols in this block."],
        })
    # elevator banks
    for k, bj in enumerate(f["elevatorBanks"]):
        b = P(bj)
        c = b.centroid
        side = "north-east" if c.x > 400 else "south-west"
        key = f"elevator-{side}"
        ent = frontage_entry(fid, key, b, [])
        cars = sum(1 for s in f["spaces"] if s["kind"] == "elevator" and P(s["polygon"]).intersects(b.buffer(0.5)))
        destinations.append({
            "id": f"{fid}:{key}", "floor": fid, "name": f"Elevator{'s' if cars > 1 else ''} ({side})", "number": None,
            "category": "elevator", "keywords": ["elevator", "lift"], "labelAt": [r2(c.x), r2(c.y)],
            "spaceIds": [], "entry": ent, "cars": cars,
            "notes": ["Elevator symbol appears at this position on the 7th, 8th and 9th floor plans.",
                      "Which side the doors open on is not shown; the access point is inferred from the adjacent corridor."],
        })
    # rooms and named spaces
    for s in f["spaces"]:
        if s["kind"] != "room":
            continue
        if s["id"] in NAME_DROP:
            s["name"] = None
        cur = CURATION.get(s["id"], {})
        name = cur.get("name", s["name"])
        if not s["number"] and not name:
            continue
        poly = P(s["polygon"])
        key = s["id"].split(":", 1)[1]
        ent = frontage_entry(fid, key, poly, s.get("entranceNotches", []))
        space_entry[s["id"]] = ent
        notes = []
        if cur.get("why"):
            notes.append(cur["why"])
        if cur.get("note"):
            notes.append(cur["note"])
        if s["number"] and s["number"].startswith("T") and len(s["number"]) == 2:
            notes.append("Label shown on the plan; its purpose is not stated.")
        cat = categorize(name, s["number"], "room")
        kw = list(cur.get("keywords", []))
        destinations.append({
            "id": s["id"], "floor": fid, "name": name or f"Room {s['number']}", "number": s["number"], "category": cat,
            "keywords": kw, "labelAt": s["labelAt"], "spaceIds": [s["id"]], "entry": ent, "notes": notes,
            "hasName": bool(name),
        })

    # extra: HTM Demo Kitchen shares the 1-150 block
    if fid == "L7":
        base = next(d for d in destinations if d["id"] == "L7:1-150")
        htm_lab = next((s for s in f["spaces"] if s["id"] == "L7:1-150"), None)
        destinations.append({
            "id": "L7:htm-demo-kitchen", "floor": "L7", "name": "HTM Demo Kitchen & Classroom", "number": None,
            "category": "food", "keywords": ["htm", "hospitality", "demo kitchen", "classroom"],
            "labelAt": [227.1, 197.0], "spaceIds": ["L7:1-150"], "entry": base["entry"],
            "notes": ["No separate room number is shown. The label shares the blue block with Commons 1-150."],
        })

    # icon features -> destinations
    for k, ft in enumerate(f["features"]):
        if ft["type"] == "water":
            key = f"water-{k}"
            pt = (ft["x"], ft["y"])
            door = door_point(fid, pt, walk[fid])
            ent = make_entry(fid, key, door, "source-indicated", walk[fid], "Water refill symbol location on the plan.")
            destinations.append({"id": f"{fid}:{key}", "floor": fid, "name": "Water Refill Station", "number": None,
                                 "category": "water", "keywords": ["water", "refill", "fountain", "bottle"],
                                 "labelAt": [ft["x"], ft["y"]], "spaceIds": [], "entry": ent, "notes": []})
        if ft["type"] == "marker":
            label = ft.get("label", "")
            names = {"Ted's Bagels": ("Ted's Bagels", "food", ["food", "coffee", "bagel", "cafe"]),
                     "Retail Pop-Up": ("School of Retail Management Retail Pop-Up", "services", ["retail", "pop-up", "shop"]),
                     "Quiet Study Area": ("Quiet Study Area", "study", ["study", "quiet", "silent"])}
            nm, cat, kw = names.get(label, (label, "landmark", []))
            key = re.sub(r"[^a-z0-9]+", "-", nm.lower()).strip("-")
            pt = (ft["x"], ft["y"])
            door = door_point(fid, pt, walk[fid])
            ent = make_entry(fid, key, door, "source-indicated", walk[fid], "Map-pin location on the plan.")
            destinations.append({"id": f"{fid}:{key}", "floor": fid, "name": nm, "number": None, "category": cat,
                                 "keywords": kw, "labelAt": [ft["x"], ft["y"]], "spaceIds": [], "entry": ent,
                                 "notes": ["Shown as a map pin; it is a point of interest, not an enclosed room."]})
    # outdoor seating (L7)
    for k, os_ in enumerate(f["outdoorSeating"]):
        poly = P(os_)
        if poly.area < 300:
            continue
        key = "outdoor-seating-area"
        ent = frontage_entry(fid, key, poly, [])
        c = poly.representative_point()
        destinations.append({"id": f"{fid}:{key}", "floor": fid, "name": "Outdoor Seating Area", "number": None,
                             "category": "study", "keywords": ["outdoor", "seating", "patio", "terrace"],
                             "labelAt": [r2(c.x), r2(c.y)], "spaceIds": [], "entry": ent,
                             "notes": ["Outdoor area beside the courtyard. Access point estimated; seasonal availability unknown."]})

# ------------------------------------------------------------ apply edge splits
final_edges = []
for i, e in enumerate(edges):
    if i not in pending_splits:
        final_edges.append(e)
        continue
    pts = sorted(pending_splits[i])
    chain = [e["a"]] + [nid for t, nid in pts] + [e["b"]]
    # collapse splits that land on endpoints
    for a, b in zip(chain, chain[1:]):
        if a != b:
            final_edges.append({"a": a, "b": b, "kind": "corridor", "verification": e["verification"]})
nodes.update(new_nodes)
final_edges.extend(entry_edges)

# ------------------------------------------------------------ vertical connectors
connectors = []
FLOOR_ORDER = ["L7", "L8", "L9"]
for side in ("north-east", "south-west"):
    per_floor = {}
    for fid in FLOOR_ORDER:
        d = next((d for d in destinations if d["id"] == f"{fid}:elevator-{side}"), None)
        if d and d["entry"]:
            per_floor[fid] = d["entry"]["nodeId"]
    cid = f"elevator-{side}"
    connectors.append({"id": cid, "type": "elevator", "name": f"Elevator ({side})", "floors": list(per_floor.keys()),
                       "verification": "plan-aligned", "enabledByDefault": True, "accessible": "assumed",
                       "notes": ["Elevator symbol drawn at the same position on all three plans.",
                                 "Stops at every floor, door side and accessibility have not been verified on site."]})
    for a, b in zip(FLOOR_ORDER, FLOOR_ORDER[1:]):
        if a in per_floor and b in per_floor:
            final_edges.append({"a": per_floor[a], "b": per_floor[b], "kind": "elevator", "connector": cid,
                                "verification": "plan-aligned"})


def nearest_corridor_node(fid, x, y):
    best = None
    for n in nodes.values():
        if n["floor"] != fid or n["kind"] != "corridor":
            continue
        d = math.dist((x, y), (n["x"], n["y"]))
        if best is None or d < best[0]:
            best = (d, n["id"])
    return best[1]


# escalators & central stair: modelled but disabled (direction / served floors not shown)
esc = {fid: [ft for ft in floors[fid]["features"] if ft["type"] == "escalator"] for fid in FLOOR_ORDER}
def esc_node(fid, ft, key):
    nid = f"{fid}:{key}"
    near = nearest_corridor_node(fid, ft["x"], ft["y"])
    n = nodes[near]
    nodes[nid] = {"id": nid, "floor": fid, "x": n["x"], "y": n["y"], "kind": "connector"}
    final_edges.append({"a": near, "b": nid, "kind": "entry", "verification": "unverified"})
    return nid

l7w = min(esc["L7"], key=lambda f: math.dist((f["x"], f["y"]), (105, 348)))
l8 = esc["L8"][0]; l9 = esc["L9"][0]
a7 = esc_node("L7", l7w, "escalator-west"); a8 = esc_node("L8", l8, "escalator-west"); a9 = esc_node("L9", l9, "escalator-west")
connectors.append({"id": "escalator-west", "type": "escalator", "name": "Escalators (west)", "floors": ["L7", "L8", "L9"],
                   "verification": "unverified", "enabledByDefault": False, "accessible": False,
                   "notes": ["Escalator symbols appear near the west stair on each plan, but travel direction and which floors each escalator serves are not shown.",
                             "Disabled for routing until confirmed on site. Never used for accessible routes."]})
final_edges.append({"a": a7, "b": a8, "kind": "escalator", "connector": "escalator-west", "verification": "unverified"})
final_edges.append({"a": a8, "b": a9, "kind": "escalator", "connector": "escalator-west", "verification": "unverified"})

stair_ids = {}
for fid in FLOOR_ORDER:
    cands = [s for s in stairs[fid] if 300 < s.centroid.x < 420 and s.centroid.y < 230]
    if not cands:
        continue
    st = cands[0]
    nid = f"{fid}:stair-central"
    near = nearest_corridor_node(fid, st.centroid.x, st.bounds[1])
    n = nodes[near]
    nodes[nid] = {"id": nid, "floor": fid, "x": n["x"], "y": n["y"], "kind": "connector"}
    final_edges.append({"a": near, "b": nid, "kind": "entry", "verification": "unverified"})
    stair_ids[fid] = nid
connectors.append({"id": "stair-central", "type": "stair", "name": "Central stair (north side of courtyard)",
                   "floors": list(stair_ids.keys()), "verification": "unverified", "enabledByDefault": False, "accessible": False,
                   "notes": ["A stair is drawn at the same position on all three plans, but whether it links these floors is not stated.",
                             "Disabled for routing until confirmed on site."]})
for a, b in zip(FLOOR_ORDER, FLOOR_ORDER[1:]):
    if a in stair_ids and b in stair_ids:
        final_edges.append({"a": stair_ids[a], "b": stair_ids[b], "kind": "stair", "connector": "stair-central", "verification": "unverified"})

# ------------------------------------------------------------ validation of every same-floor edge
problems = []
for e in final_edges:
    a, b = nodes[e["a"]], nodes[e["b"]]
    if a["floor"] != b["floor"]:
        continue
    seg = LineString([(a["x"], a["y"]), (b["x"], b["y"])])
    W = walk[a["floor"]].buffer(0.1)
    if e["verification"] == "unverified" and hatch[a["floor"]] is not None:
        W = unary_union([W, hatch[a["floor"]].buffer(0.6)])
    if e["kind"] in ("corridor", "entry") and not W.contains(seg) and seg.length > 0.1 and "connector" not in a["kind"] + b["kind"]:
        problems.append((e["a"], e["b"], round(seg.length, 1)))
print("edge validation problems:", problems[:10], len(problems))

# ------------------------------------------------------------ anchors (proposed QR positions)
ANCHOR_SPOTS = {
    "L7": [("01", "South-west elevator lobby", "elevator-south-west"), ("02", "North-east elevator", "elevator-north-east"),
           ("03", "Outside PASS (1-004)", "1-004"), ("04", "Hall by Ted's Bagels", "ted-s-bagels"), ("05", "Outside 1-149 (west corridor)", "1-149")],
    "L8": [("01", "South-west elevator lobby", "elevator-south-west"), ("02", "North-east elevator", "elevator-north-east"),
           ("03", "Outside Business Career Hub (2-148)", "2-148"), ("04", "By the Retail Pop-Up", "school-of-retail-management-retail-pop-up")],
    "L9": [("01", "South-west elevator lobby", "elevator-south-west"), ("02", "North-east elevator", "elevator-north-east"),
           ("03", "Outside Harry Rosen Lecture Hall (3-176)", "3-176"), ("04", "Outside Bootcamp Lab (3-180)", "3-180")],
}
anchors = []
for fid, spots in ANCHOR_SPOTS.items():
    for num, label, dest_key in spots:
        d = next(d for d in destinations if d["id"] == f"{fid}:{dest_key}")
        door = nodes[d["entry"]["nodeId"]]
        # anchor sits on the corridor junction outside the destination
        j = next(e["a"] for e in final_edges if e["b"] == door["id"] and e["kind"] == "entry")
        jn = nodes[j]
        aid = f"TRSM-{fid[1:]}-{num}"
        anchors.append({"id": aid, "floor": fid, "nodeId": j, "x": jn["x"], "y": jn["y"], "label": label,
                        "status": "proposed", "notes": "Position chosen from the floor plan. Confirm the mounting spot on site before printing."})

# ------------------------------------------------------------ output
for fl in ST["floors"]:
    for s in fl["spaces"]:
        s.pop("entranceNotches", None) if False else None
graph = {"nodes": list(nodes.values()), "edges": final_edges, "connectors": connectors}
json.dump({"floors": ST["floors"]}, open(f"{OUT}/floors.json", "w"), separators=(",", ":"))
json.dump(graph, open(f"{OUT}/graph.json", "w"), separators=(",", ":"))
json.dump(destinations, open(f"{OUT}/destinations.json", "w"), indent=1)
json.dump(anchors, open(f"{OUT}/anchors.json", "w"), indent=1)

# summary
stat = defaultdict(lambda: defaultdict(int))
for d in destinations:
    stat[d["floor"]][d["entry"]["status"] if d["entry"] else "no-access"] += 1
print({k: dict(v) for k, v in stat.items()})
print("nodes", len(nodes), "edges", len(final_edges), "destinations", len(destinations), "anchors", len(anchors))
for d in destinations:
    if not d["entry"]:
        print("  NO ENTRY:", d["id"], d["name"])
