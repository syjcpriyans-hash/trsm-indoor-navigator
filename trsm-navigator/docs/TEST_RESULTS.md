# Test results

Run on 10 November 2026 against the production static build (`next build` → `out/`), in headless Google Chrome with SwiftShader WebGL. The GitHub Pages build (`/trsm-indoor-navigator/` base path, `_next` → `assets`) and the single-file claude.ai build were each smoke-tested with the scripted first-time-visitor walk-through: no page errors, and the page never scrolled or zoomed.

| Suite | Result |
|---|---|
| Vitest (routing, directions wording, search, positioning, data integrity) | **41 / 41 passed** |
| Playwright E2E (desktop 1440×900, mobile 375×812, mobile 390×844) | **19 / 19 passed** |
| Edge validation in the data pipeline (every corridor/entry edge inside walkable space) | **0 failures / 841 edges** |
| Route sweep (8th-floor south-west elevators → every destination; route validated against walls) | **307 / 307** |
| QR sample PDF: decoded every code with zxing-cpp | **13 / 13** decode to `https://delminmedical-lgtm.github.io/trsm-indoor-navigator/?anchor=…` |

Safari's engine (WebKit) could not be downloaded in the build environment. Safari-specific behaviour is handled explicitly (gesture-event blocking, 16 px inputs, fixed body, `dvh` units, Safari 12+ JS target) but should be checked on a real iPhone.

## Acceptance tests

| Test | Where it is covered | What is asserted |
|---|---|---|
| **A** Same-floor route PASS 1-004 → 1-067 | `tests/unit/routing.test.ts`, `tests/e2e/flows.spec.ts` | One leg on the 7th floor; in-app wall validation passes; every sampled point avoids the courtyard and every room except the destination's own doorway; starts "Leave Program Advising and Student Success (PASS) and…" and ends "…Lecture Theatre (1-067) is on your left/right/straight ahead". |
| **B** Search Business Career Hub / 2-148 | `tests/unit/search.test.ts`, `flows.spec.ts` | Top result is `L8:2-148`; card shows Room 2-148, 8th floor; the floor selector switches to 8. Also `2148`, `TRS3-173`, partial `3-17`, misspelling suggestions. |
| **C** Multi-floor BCH (8th) → 3-176 (9th) | `routing.test.ts`, `flows.spec.ts` | Legs `[L8, L9]`; one plan-aligned elevator; "Take the elevator up to the 9th floor."; "Leave the elevator on the 9th floor and turn left." (checked against the plan geometry). |
| **D** Demo Walk | `flows.spec.ts` | Progress increases; the dot moves; the camera follows; the banner changes; the floor auto-switches to 9; arrival panel; pause/restart/stop. |
| **E** QR positioning | `positioning.spec.ts`, `positioning.test.ts` | `?anchor=TRSM-8-03` sets the floor, the dot and the start; the route starts on L8. `#TRSM-9-03` rescan. Simulated-scan list. Parsing and validation unit-tested. |
| **F** Accessibility | `routing.test.ts`, `positioning.spec.ts` | Escalator-only connection is rejected in accessible mode; the accessible route uses elevators only and warns "not confirmed as wheelchair accessible"; hatched-strip rooms are excluded. |
| **G** Mobile 375/390 | `mobile.spec.ts` | Controls ≥ 44 px and on screen; floor switch; 2D/3D; labels; the panel never covers the floor buttons; the Start button is on screen; **dragging the panel and pinching the toolbar leave page scroll = 0 and zoom = 1**; inputs are 16 px; the map pans and pinch-zooms. |
| **H** Error handling | `routing.test.ts`, `positioning.spec.ts` | Unknown destination, unknown or malformed QR code, empty search, motion mode with no sensors, forced no-WebGL fallback, disconnected graph: all handled without page errors. |
| First-time visitor | `flows.spec.ts` | Washrooms tile → pick one → Directions → "Where are you now?" → elevator shortcut → Start → each **Next** advances exactly one step → "I've arrived". |

## Raw output

### Vitest
```
 ✓ tests/unit/routing.test.ts > data integrity > has the three floors with their source pages 3ms
 ✓ tests/unit/routing.test.ts > data integrity > contains the example destinations named in the brief 1ms
 ✓ tests/unit/routing.test.ts > data integrity > every corridor and entry edge lies inside the walkable area (or a hatched zone when flagged unverified) 17ms
 ✓ tests/unit/routing.test.ts > data integrity > each floor's corridor graph is a single connected component 2ms
 ✓ tests/unit/routing.test.ts > Test A — same-floor route PASS (1-004) → Steve & Rashmi Gupta Lecture Theatre (1-067) > finds a route on the 7th floor only 1ms
 ✓ tests/unit/routing.test.ts > Test A — same-floor route PASS (1-004) → Steve & Rashmi Gupta Lecture Theatre (1-067) > stays inside walkable corridors and never crosses rooms or the courtyard 20ms
 ✓ tests/unit/routing.test.ts > Test A — same-floor route PASS (1-004) → Steve & Rashmi Gupta Lecture Theatre (1-067) > produces geometry-derived instructions that end with the destination side 1ms
 ✓ tests/unit/routing.test.ts > Test A — same-floor route PASS (1-004) → Steve & Rashmi Gupta Lecture Theatre (1-067) > starts at PASS's source-indicated entrance notch 0ms
 ✓ tests/unit/routing.test.ts > Test C — multi-floor route Business Career Hub (8th) → Harry Rosen Lecture Hall 3-176 (9th) > uses a plan-aligned elevator to go from L8 to L9 1ms
 ✓ tests/unit/routing.test.ts > Test C — multi-floor route Business Career Hub (8th) → Harry Rosen Lecture Hall 3-176 (9th) > both legs stay in corridors 53ms
 ✓ tests/unit/routing.test.ts > Test C — multi-floor route Business Career Hub (8th) → Harry Rosen Lecture Hall 3-176 (9th) > 7th → 9th rides one elevator through two floors 10ms
 ✓ tests/unit/routing.test.ts > Test C — multi-floor route Business Career Hub (8th) → Harry Rosen Lecture Hall 3-176 (9th) > demo sampling walks from the 8th floor to the 9th 0ms
 ✓ tests/unit/routing.test.ts > Test F — accessible routing > standard routing may use an escalator when it is the only (enabled) link 6ms
 ✓ tests/unit/routing.test.ts > Test F — accessible routing > accessible routing never treats an escalator-only path as accessible 1ms
 ✓ tests/unit/routing.test.ts > Test F — accessible routing > accessible routing uses elevators and discloses that accessibility is unverified 8ms
 ✓ tests/unit/routing.test.ts > Test F — accessible routing > escalators and the central stair are disabled by default (direction/served floors not shown) 0ms
 ✓ tests/unit/routing.test.ts > Test F — accessible routing > rooms reachable only across a hatched area are not offered as accessible 2ms
 ✓ tests/unit/routing.test.ts > direction wording is grounded in the geometry > starts by leaving the start room, and says which way to turn out of the elevator 1ms
 ✓ tests/unit/routing.test.ts > direction wording is grounded in the geometry > never names the same landmark twice in one route 57ms
 ✓ tests/unit/routing.test.ts > direction wording is grounded in the geometry > only counts real intersections (short recesses are ignored) and uses at most a 'fifth' 976ms
 ✓ tests/unit/routing.test.ts > direction wording is grounded in the geometry > every route ends by saying which side the destination is on 413ms
 ✓ tests/unit/routing.test.ts > Test H — error handling > rejects an unknown destination without throwing 0ms
 ✓ tests/unit/routing.test.ts > Test H — error handling > rejects an unknown start node 0ms
 ✓ tests/unit/routing.test.ts > Test H — error handling > reports no-route on a disconnected graph instead of crashing 1ms
 ✓ tests/unit/routing.test.ts > Test H — error handling > routes from an arbitrary point (QR / map tap) snapped to the nearest corridor 6ms
 ✓ tests/unit/routing.test.ts > route sweep > every destination is reachable from the 8th-floor south-west elevator with a valid path 1799ms
 ✓ tests/unit/search.test.ts > Test B — search > finds Business Career Hub by name on the 8th floor 17ms
 ✓ tests/unit/search.test.ts > Test B — search > finds 2-148 by exact number 7ms
 ✓ tests/unit/search.test.ts > Test B — search > normalises number formats 16ms
 ✓ tests/unit/search.test.ts > Test B — search > supports partial numbers 7ms
 ✓ tests/unit/search.test.ts > Test B — search > finds the Bloomberg Lab by its TRS3-173 identifier 13ms
 ✓ tests/unit/search.test.ts > Test B — search > finds facilities by type 7ms
 ✓ tests/unit/search.test.ts > Test B — search > suggests corrections for misspellings 2ms
 ✓ tests/unit/search.test.ts > Test B — search > returns nothing (no crash) for nonsense 2ms
 ✓ tests/unit/positioning.test.ts > experimental motion: step detection > counts walking steps (~1.8 Hz acceleration peaks) 2ms
 ✓ tests/unit/positioning.test.ts > experimental motion: step detection > never advances when the phone is only rotated (gravity magnitude stays ~constant) 1ms
 ✓ tests/unit/positioning.test.ts > experimental motion: step detection > ignores implausibly fast cadence (vibration) 0ms
 ✓ tests/unit/positioning.test.ts > experimental motion: step detection > route-based estimates always stay on walkable corridors 25ms
 ✓ tests/unit/positioning.test.ts > QR anchors > parses ?anchor= and #ID links and bare scanned codes 0ms
 ✓ tests/unit/positioning.test.ts > QR anchors > validates ids against the registry 0ms
 ✓ tests/unit/positioning.test.ts > QR anchors > every anchor sits on a corridor node inside the walkable area of its floor 0ms
 Test Files  3 passed (3)
      Tests  41 passed (41)
```

### Playwright
```
  ✓   2 [desktop] › tests/e2e/positioning.spec.ts:4:1 › Test E: QR anchor URL sets floor, location and routes from it (6.5s)
  ✓   3 [desktop] › tests/e2e/positioning.spec.ts:25:1 › Test E (simulated scan): the QR dialog can place you at a test anchor (5.9s)
  ✓   1 [desktop] › tests/e2e/flows.spec.ts:4:1 › Test A: same-floor route PASS (1-004) → Steve & Rashmi Gupta Lecture Theatre (1-067) (12.8s)
  ✓   4 [desktop] › tests/e2e/positioning.spec.ts:34:1 › Test F: accessible routing avoids escalators and discloses unverified accessibility (4.7s)
  ✓   6 [desktop] › tests/e2e/positioning.spec.ts:52:1 › Test H: invalid destinations, invalid QR anchors, sensors and WebGL fallbacks don't crash (3.1s)
  ✓   7 [desktop] › tests/e2e/positioning.spec.ts:75:1 › organiser pages: QR anchor sheet and inspector render (2.2s)
  ✓   5 [desktop] › tests/e2e/flows.spec.ts:20:1 › Test B: search for Business Career Hub / 2-148 selects the 8th-floor destination (10.4s)
  ✓   8 [desktop] › tests/e2e/flows.spec.ts:33:1 › Test C + D: multi-floor route BCH (8th) → Harry Rosen Lecture Hall (9th) with Demo Walk (35.2s)
  ✓   9 [mobile-375] › tests/e2e/mobile.spec.ts:4:1 › Test G: mobile layout — search, floors, sheet, controls, labels (35.2s)
  ✓  11 [mobile-375] › tests/e2e/mobile.spec.ts:59:1 › Test G: touch pan/pinch gestures move the camera without selecting (10.4s)
  ✓  10 [desktop] › tests/e2e/flows.spec.ts:70:1 › Demo Walk controls: pause, restart and stop (12.6s)
  ✓  12 [mobile-390] › tests/e2e/flows.spec.ts:4:1 › Test A: same-floor route PASS (1-004) → Steve & Rashmi Gupta Lecture Theatre (1-067) (12.0s)
  ✓  13 [desktop] › tests/e2e/flows.spec.ts:85:1 › First-time visitor: browse a category, choose a start, follow steps one at a time (14.9s)
  ✓  14 [mobile-390] › tests/e2e/flows.spec.ts:20:1 › Test B: search for Business Career Hub / 2-148 selects the 8th-floor destination (15.8s)
  ✓  15 [mobile-390] › tests/e2e/mobile.spec.ts:4:1 › Test G: mobile layout — search, floors, sheet, controls, labels (40.2s)
  ✓  16 [mobile-390] › tests/e2e/flows.spec.ts:33:1 › Test C + D: multi-floor route BCH (8th) → Harry Rosen Lecture Hall (9th) with Demo Walk (32.6s)
  ✓  17 [mobile-390] › tests/e2e/mobile.spec.ts:59:1 › Test G: touch pan/pinch gestures move the camera without selecting (11.2s)
  ✓  18 [mobile-390] › tests/e2e/flows.spec.ts:70:1 › Demo Walk controls: pause, restart and stop (10.9s)
  ✓  19 [mobile-390] › tests/e2e/flows.spec.ts:85:1 › First-time visitor: browse a category, choose a start, follow steps one at a time (11.4s)
  19 passed (2.6m)
```
