# On-site calibration and validation checklist

Bring a phone with the deployed app, a laser measure or tape, a printed copy of `/inspect` for each floor, and the QR anchor sheet. Record results in a copy of this file or a shared spreadsheet, and enter measurements in `/inspect` → *Scale calibration* → *Copy as JSON*.

## A. Permissions and safety
- [ ] Permission from the TRSM facilities contact to survey and to post QR codes (and where they may go).
- [ ] Confirm the app will be described as an independent prototype, not official TMU signage.

## B. Scale calibration (per floor: 7, 8, 9)
For each measurement, tap both points in `/inspect` and enter the metres you measured.
- [ ] North corridor: from the west corridor junction to the north-east elevator.
- [ ] East corridor: from the north-east corner to the south-east corner.
- [ ] South corridor: from the stair at the middle of Dundas Street to the south-east corner.
- [ ] West corridor: from the north-west stair to the south-west elevators.
- [ ] One cross-hall distance (the hall south of the courtyard).
- [ ] Check the reported **spread**. If it is above ~15%, the drawing is distorted. Note which areas disagree; per-zone calibration may be needed.
- [ ] Measure the **plan-north offset**: stand in a long straight corridor that runs up/down on the plan, read the compass heading, and enter it.

## C. Doors and entrances
- [ ] For each source-indicated notch (PASS 1-004, 2-139, 2-002, 2-004, 3-172, 3-002), confirm it is the main entrance.
- [ ] For each estimated door, mark the real door on the printout. Prioritise named destinations and the example rooms in the brief.
- [ ] For the 21 rooms with no corridor-facing wall (1-129, 1-119, 1-109, 1-062, 1-143, 1-143A, 1-164, 2-129, 2-119, 2-109, 3-129, 3-119, 3-109, 3-009, 3-012, 3-014, 3-016, 3-018, 3-020, 3-003, 3-005), record how each is entered.
- [ ] Hatched strip on each floor: what is it (raised floor, ramp, open to below, restricted)? Can people walk across it to reach the south rooms?

## D. Vertical connections
- [ ] South-west elevators: which floors each car stops at; door side on each floor; accessible controls; any key or fob restriction.
- [ ] North-east elevator: same checks.
- [ ] West escalators: direction of each, and the floors each one links. Note any schedule (escalators are sometimes switched off).
- [ ] Central stair north of the courtyard: which floors it links, and whether it is open to the public.
- [ ] Record step-free routes and any level changes, steps or heavy doors along the main corridors.

## E. QR anchors
- [ ] For each of the 13 proposed anchors, confirm a mounting spot within ~2 m of the plotted position, visible from the corridor, at about 1.2–1.5 m height.
- [ ] Update positions in `tools/build_routing.py` (`ANCHOR_SPOTS`) if needed, rebuild, print `/anchors` with the deployed base URL, and mark them `installed`.
- [ ] Scan each installed code with iPhone and Android camera apps. The app must open on the right floor with the dot at the code.

## F. Walk tests (record pass/fail and notes)
- [ ] Test A: PASS (1-004) → Steve & Rashmi Gupta Lecture Theatre (1-067). Do the turns match reality?
- [ ] Test C: Business Career Hub (2-148) → Harry Rosen Lecture Hall (3-176) via the elevator.
- [ ] Accessible route from the 7th-floor south-west elevators to Bootcamp Lab (3-180).
- [ ] Experimental motion mode over a ~40 m straight corridor: compare estimated with actual progress, then correct with a QR scan.
- [ ] Check every "is on the left/right" arrival statement against reality on the three routes above.

## G. After the survey
- [ ] Mark confirmed items `verified-onsite` in the dataset (doors, connectors, anchors).
- [ ] Enable escalators or the central stair only if confirmed, with the correct direction.
- [ ] Re-run `npm test` and `npx playwright test`, then redeploy.
