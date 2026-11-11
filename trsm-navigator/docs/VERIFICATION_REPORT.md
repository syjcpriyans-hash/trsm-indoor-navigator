# Verification report

What the TRSM Indoor Navigator dataset takes from the source plans, what it estimates, and what needs an on-site survey.

**Source:** `TRSM-Maps-2024.pdf`, 3 pages, Adobe Acrobat vector PDF dated 3 July 2024. Page 1 is TRS 1, 7th floor. Page 2 is TRS 2, 8th floor. Page 3 is TRS 3, 9th floor. Every page states *"MAP IS NOT TO SCALE"*.
**Method:** automated extraction from the PDF's vector paths and text layer (not hand tracing). All three pipeline stages are deterministic and re-runnable (`npm run data:build`). `/inspect` overlays the result on the rendered source pages for visual checking.

## 1. Source-verified (read directly from the PDF)

| Item | 7th | 8th | 9th | Notes |
|---|---|---|---|---|
| Room numbers placed in their drawn room | 96 | 77 | 110 | 283 of 283 labels in the text layer, no duplicates (unit-tested). Includes `TRS3-173`, `1-143A`, `3-100A/B/C`, `T1–T3`. |
| Named spaces | 10 | 8 | 15 | Names come from text inside the room outline, e.g. PASS 1-004, CPA Lounge 1-003, Steve & Rashmi Gupta Lecture Theatre 1-067, Business Career Hub 2-148, Computer Lab 2-154, Boardroom 2-002, Harry Rosen Lecture Hall 3-176, Bootcamp Lab 3-180, Bloomberg Lab TRS3-173. |
| Room outlines | 194 faces | 168 | 206 | Polygonized from visible wall lines and fills. Unlabeled faces (aisles, closets, voids) are drawn but not searchable. |
| Corridor (walkable) area | ✓ | ✓ | ✓ | The plan's light-grey floor fill minus rooms, walls, courtyard, stairs and hatched zones. One connected region per floor. |
| Courtyard, Outdoor Seating Area | ✓ | ✓ | ✓ | Never walkable for routing. |
| Elevators | 4 shapes, 2 banks | same | same | South-west bank (3 cars) and north-east car, at the same position on all three plans. |
| Washrooms | 2 blocks | 2 | 2 | Each block shows women's, men's and accessible-washroom symbols. |
| Exit stairs, escalator and water symbols, map pins | ✓ | ✓ | ✓ | Ted's Bagels (7), School of Retail Management Retail Pop-Up (8), Quiet Study Area (8), Water Refill Station ×2 (7). |
| Corridor centreline graph | 518 corridor nodes in total | | | Skeleton of the walkable polygon. All 521 corridor edges are validated inside the walkable area. |
| **Entrance notch symbols** (source-indicated doors) | PASS 1-004 | 2-139, 2-002, 2-004 | 3-172, 3-002 | The small wedge cut into a wall where it faces the corridor. Treated as an entrance marker; that reading should be confirmed on site. |

## 2. Estimated (inferred from the geometry, clearly labelled in the app)

| Item | Count | How it was estimated |
|---|---|---|
| Door positions | 254 destinations | Door at the middle of the room's longest corridor-facing wall. The UI says "Door position estimated". |
| Elevator door side | 2 banks × 3 floors | Taken from the corridor next to the bank (east side for the south-west bank, south side for the north-east car). |
| Floor stops for elevators | 2 connectors | Treated as linking 7↔8↔9 because the symbol is at the same position on all three plans. Labelled "plan-aligned", not verified. |
| Rooms with no wall on a corridor | 21 | E.g. 1-129, 1-119, 1-109 behind the cell row, and 3-009–3-020 behind the Office of the Dean. The route ends at the nearest corridor point and the app says the way in must be confirmed. |
| Breakout Rooms group | 8th: 2-112…2-102; 9th: 3-112, 3-110, 3-108 | Under the "Breakout Rooms" label with the legend's blue fill. 3-106 and 3-104 are pink (the Graduate Programs legend colour), so their use is left unconfirmed. |
| Name associations from arrows or shared blocks | 1-143 = Culinary/Catering Department (arrow on the plan). HTM Demo Kitchen & Classroom shares the blue block with Commons 1-150 (no separate number shown). | Documented in `tools/build_routing.py` (`CURATION`). |
| Instructions | all routes | Generated from route geometry: the outward direction of the door wall for "leave X and turn left"; turn angles; *perceived* intersections, meaning junctions with three or more real corridor branches (recesses under ~36 plan units are ignored); dead-end detection for "at the end of the corridor"; and named landmarks near the path. Street names printed on the plans are used only as a fallback. Correct in principle, but each phrase should be walked on site (checklist F). |

## 3. Unverified (modelled but not used, or used only with a warning)

| Item | Status in the app |
|---|---|
| **Hatched strips** (one per floor, in front of the south rooms) | The legend doesn't explain them, so they are not walkable. 21 rooms that face only a hatched strip get an "Access unconfirmed" entry and are excluded from accessible routes. |
| **Escalators (west)** | Symbols appear near the west stair on each floor, but direction and which floors each serves are not shown. **Disabled** for routing (toggle in `/inspect` for testing). Never accessible. |
| **Central stair** (north side of the courtyard) | Drawn at the same position on all plans; the floors it links aren't stated. **Disabled**. |
| **Exit stairs** | Shown as map symbols only; never routed. Not emergency guidance. |
| **Accessibility** | No step-free information is on the plans. Accessible mode prefers elevators and avoids escalators, stairs and unconfirmed entrances, and always says the route is *not confirmed as wheelchair accessible*. |
| **Scale** | None. Distances and times stay hidden until calibrated in `/inspect`. Because the plan is not to scale, the inspector reports the spread between several measurements. |
| **QR anchor positions** (13) | Proposed from the plans at corridor junctions outside landmarks. Status `proposed` until installed. |
| T1, T2, T3 labels (7th floor) | Purpose not stated on the plan; searchable by label only. |

## 4. Needs an on-site survey before real use

1. Real door positions for every room, starting with the 21 "no corridor wall" rooms and the 21 hatched-strip rooms.
2. The meaning of the hatched strips, and whether the south rooms are reached across them.
3. Elevator stops on 7/8/9, door side, and accessibility for both banks.
4. Escalator directions and the floors each one serves. Whether the central stair links 7–9.
5. Step-free status of all corridors (level changes, ramps, doors).
6. Real-world scale: at least 4 measured distances per floor, spread across the building (see the checklist).
7. Plan-north to magnetic-north offset (needed before compass heading can be shown).
8. Mounting positions for the QR anchors (wall, height, line of sight, permission to install).
9. Confirmation that the PDF reflects current room names and numbers (it is dated 2024).
