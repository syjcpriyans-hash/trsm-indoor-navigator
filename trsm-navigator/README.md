# TRSM Indoor Navigator (prototype)

A mobile-first 3D indoor navigation web app for floors 7, 8 and 9 of the Ted Rogers School of Management (TRS 1 / TRS 2 / TRS 3), built from the public 2024 TRSM floor maps (`data-source/TRSM-Maps-2024.pdf`).

> **Independent demonstration prototype, not an official Toronto Metropolitan University service.** The source plans state *"MAP IS NOT TO SCALE"*. Door positions, distances and accessibility have **not** been surveyed on site. Emergency-exit icons are shown for orientation only and are not emergency guidance.

| | |
|---|---|
| **Safari link (GitHub Pages)** | `https://delminmedical-lgtm.github.io/trsm-indoor-navigator/`. **Live once the repository exists**: see [Publish to GitHub Pages](#publish-to-github-pages-safari-link). |
| **claude.ai link (works now)** | https://claude.ai/artifact/6JQVQdm3qi1q78o5ECKJbE. Private to the owner until shared. Opens in Safari when you're signed in to claude.ai, or for anyone after you set it to public in its Share menu. |
| **Verification report** | [`docs/VERIFICATION_REPORT.md`](docs/VERIFICATION_REPORT.md): what is source-verified, estimated, or needs an on-site survey |
| **On-site checklist** | [`docs/ONSITE_CHECKLIST.md`](docs/ONSITE_CHECKLIST.md) |
| **Test results** | [`docs/TEST_RESULTS.md`](docs/TEST_RESULTS.md) |
| **Printable QR anchors** | [`docs/TRSM-QR-anchors-sample.pdf`](docs/TRSM-QR-anchors-sample.pdf). Codes open the GitHub Pages link with `?anchor=…`. |

The claude.ai link runs in a sandboxed frame, so camera scanning and motion sensors are blocked there. The GitHub Pages site has no such limits.

---

## Using it (anyone, no instructions needed)

1. **Where would you like to go?** Search a room number (`2-148`), a name (`Harry Rosen`) or a facility, or tap a tile: Washrooms, Elevators, Food, Study spaces, Labs, Lecture halls.
2. **Directions → Where are you now?** Pick a nearby room, tap one of the elevator shortcuts, scan a location QR code, or tap the map.
3. Read the route, then press **Start** for step-by-step guidance. Press **Next** after each step, and *I'm on the 9th floor* after an elevator ride. Or press **Demo Walk** to watch a simulated walk.

The interface is fixed: only the map pans, zooms and rotates. The page can't scroll, bounce or pinch-zoom in Safari, and search inputs use 16 px text so iOS doesn't zoom in.

### How directions are worded

Directions are generated from the route geometry, the way a person would give them:
- **Leaving a room or elevator:** "Leave Business Career Hub and turn left". This compares the direction you face stepping out of the door, taken from the wall at the door, with the direction the route goes.
- **From a QR sign:** "With PASS behind you, go straight ahead".
- **Turns count only real intersections:** "Turn right at the second intersection". Short recesses and door alcoves don't count, and a dead end becomes "At the end of the corridor, turn right".
- **Recognisable landmarks:** "…toward the elevators", "Continue straight past Bootcamp Lab (3-180)". Each landmark is named once per route.
- **Floor changes:** "Take the elevator up to the 9th floor", then "Leave the elevator on the 9th floor and turn left".
- **Arrival:** "Harry Rosen Lecture Hall (3-176) is on your right".

## Quick start

```bash
npm install
npm run dev              # http://localhost:3000
npm test                 # Vitest: routing, directions, search, positioning (41 tests)
npm run build            # static export to ./out
npx playwright test      # E2E A–H plus a first-time-visitor flow, on desktop, 375 px and 390 px (19 tests; serves ./out)
npm run build:artifact   # single-file build to ./dist-artifact/index.html
```

Playwright uses the local Chrome at `/usr/bin/google-chrome` by default. Set `CHROME_PATH=/path/to/chrome`, or run `npx playwright install chromium` and set `CI=1` to use Playwright's bundled browser.

Useful URLs:
- `/?anchor=TRSM-7-03&to=L7:1-067`: start at the PASS anchor with directions to the Lecture Theatre (Test A)
- `/?anchor=TRSM-8-03&to=L9:3-176`: Business Career Hub → Harry Rosen Lecture Hall (Test C)
- `/?render=svg`: force the no-WebGL 2D fallback
- `/anchors/` and `/inspect/`

## Rebuilding the map data from the PDF

```bash
pip install -r tools/requirements.txt
npm run data:build       # PDF → .data/raw.json → .data/stage1.json → src/data/generated/*.json
```

The pipeline is deterministic: re-running it reproduces the committed JSON byte-for-byte.

1. `tools/extract.py` reads every vector path with PyMuPDF and classifies fills by colour (corridor floor, courtyard, rooms, washrooms, elevators, icons). Walkable space = floor fill − room fills − wall strokes − courtyard. Stair treads and hatching are closed into solid blocks.
2. `tools/build_dataset.py` polygonizes the *visible* wall linework (outlines hidden under later fills are removed) into room faces, attaches the PDF's text labels (all 283 room numbers are assigned, none duplicated), detects entrance-notch symbols, hatched zones and stair blocks, and skeletonizes the walkable polygon into a corridor graph.
3. `tools/build_routing.py` adds room entry points, elevator connectors, disabled escalator and stair connectors, destinations, QR anchors and documented curation overrides. It then validates every edge against the walkable area (0 failures).

**Coordinates** are PDF points from the top-left of each page (y down), which are the same for all three pages. They are plan units, not metres. `src/features/indoor-map/calibration.ts` converts them only after someone enters on-site measurements in `/inspect`. Until then the UI shows no distances or times.

## Project structure

```
src/
  app/                      Next.js App Router: / (map), /anchors, /inspect
  components/
    map/                    MapCanvas (R3F), FloorModel, RouteLayer, BlueDot, CameraRig, LabelLayer, SvgFloor
    search/                 SearchBox
    navigation/             Sheet (bottom sheet / sidebar), Panels, QrDialog
    controls/               floor selector, compass, 2D/3D, recenter
    admin/                  AnchorSheet, Inspector
  features/
    indoor-map/             search (Fuse.js), calibration
    routing/                graph, astar, route (snap/smooth/validate), instructions
    positioning/            qr, motion (step detector + sensor permissions)
    demo/                   useNavigationEngine (Demo Walk / motion / manual)
  data/generated/           floors.json, graph.json, destinations.json, anchors.json
  types/map.ts              typed data model with verification status on every item
  lib/                      geometry, zustand store, links
tests/unit                  Vitest
tests/e2e                   Playwright (acceptance tests A–H)
tools/                      PDF → dataset pipeline (Python)
artifact/                   single-file build (esbuild + Tailwind CLI)
docs/                       report, checklist, test results, screenshots, QR sample PDF
```

To add another TRSM floor, add its page to the PDF (or a new PDF), add an entry to `FLOORS` in `tools/build_dataset.py` and to `FloorId` / `FLOOR_LEVEL`, and list the floor in the elevator connectors in `tools/build_routing.py`.

## Publish to GitHub Pages (Safari link)

The site is a static export, so GitHub Pages hosts it for free. The build for it is in `trsm-navigator-github-pages-site.zip`: 67 files, built for the path `/trsm-indoor-navigator/`, so the repository **must** be named exactly that.

**Option A: let Claude do it.** Create an empty public repository named `trsm-indoor-navigator` at github.com/new (signed in as `delminmedical-lgtm`, no README), then say "done" in the chat. Claude attaches it, pushes the site and turns on Pages.

**Option B: upload it yourself (about 3 minutes, browser only).**
1. github.com/new → Repository name `trsm-indoor-navigator` → **Public** → Create repository.
2. On the empty repository page click **uploading an existing file**. Unzip `trsm-navigator-github-pages-site.zip` on your computer, drag **everything inside it** onto the page, then **Commit changes**.
3. **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main`, folder `/ (root)` → Save.**
4. After about a minute, open `https://delminmedical-lgtm.github.io/trsm-indoor-navigator/` in Safari. Test a QR link: `…/trsm-indoor-navigator/?anchor=TRSM-8-03`.

To rebuild the package yourself:
```bash
NEXT_PUBLIC_BASE_PATH=/trsm-indoor-navigator npx next build
cp -r out out-pages && node tools/pages-postprocess.mjs out-pages   # renames _next → assets so GitHub's Jekyll step can't hide it
```

## Deploy to Vercel (preview)

The app is a static export (`output: "export"`), so no server, database or paid API is involved.

```bash
npm i -g vercel           # or: npx vercel
vercel login
vercel link               # create or link a project; framework preset: Next.js
vercel                    # deploys a PREVIEW and prints its https://…vercel.app URL
# vercel --prod           # only when you want a production deployment
```

Or import the repository at vercel.com/new. The defaults work: build `next build`, output detected automatically.

**Keep the preview private.** In the project, go to *Settings → Deployment Protection* and choose **Vercel Authentication** with **Standard Protection**, which protects preview URLs. Viewers then have to sign in with a Vercel account that has access, so check in the dashboard how you'll give faculty access before the demo.

After deploying:
1. Open the preview URL on a phone (HTTPS is required for motion sensors and camera).
2. Run `/?anchor=TRSM-7-03&to=L7:1-067` → **Demo Walk** (same-floor).
3. Run `/?anchor=TRSM-8-03&to=L9:3-176` → **Demo Walk** (multi-floor; the floor should switch to 9).
4. Open `/anchors/`, set *Link base URL* to the preview URL, and print.
5. Point the E2E suite at it: `BASE_URL=https://<preview>.vercel.app npx playwright test` (protected previews need a bypass token; see Vercel's docs).
6. Check the browser console for errors.
