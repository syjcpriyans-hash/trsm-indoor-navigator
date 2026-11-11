"use client";
import { useMemo, useState, type ReactNode } from "react";
import {
  Accessibility, AlertTriangle, ArrowLeft, ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, Crosshair, Flag, Info, MapPin,
  Pause, Play, QrCode, RotateCcw, Smartphone, X, Navigation,
} from "lucide-react";
import { DESTINATIONS, DEST_BY_ID, FLOOR_LEVEL } from "@/data";
import { useApp } from "@/lib/store";
import { CATEGORY_LABEL } from "@/features/indoor-map/search";
import { formatDistance, formatTime } from "@/features/indoor-map/calibration";
import { confirmFloorChange, upcomingInstructionIndex } from "@/features/demo/useNavigationEngine";
import type { Category, Destination } from "@/types/map";
import { Button, CATEGORY_ICON, CategoryIcon, INSTRUCTION_ICON, Toggle } from "@/components/ui";
import { SearchBox } from "@/components/search/SearchBox";
import { links } from "@/lib/links";

export const label = (d: Destination) => (d.number && d.hasName ? `${d.name} (${d.number})` : d.name);
const floorText = (f: string) => `${FLOOR_LEVEL[f as "L7"]}th floor`;

function meta(d: Destination) {
  return [d.number && d.hasName ? `Room ${d.number}` : null, floorText(d.floor), d.category === "room" ? null : CATEGORY_LABEL[d.category].replace(/s$/, "")].filter(Boolean).join(" · ");
}

function Row({ d, onClick, testId }: { d: Destination; onClick: () => void; testId?: string }) {
  return (
    <button onClick={onClick} data-testid={testId} data-dest={d.id} className="flex w-full items-center gap-3 rounded-xl px-1.5 py-2 text-left active:bg-neutral-100 lg:hover:bg-neutral-50">
      <CategoryIcon c={d.category} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-neutral-900">{d.name}</span>
        <span className="block truncate text-[12.5px] text-neutral-500">{meta(d)}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-neutral-300" />
    </button>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="px-1.5 pb-1 pt-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-neutral-500">{children}</h3>;
}

const BROWSE: { c: Category; label: string }[] = [
  { c: "washroom", label: "Washrooms" },
  { c: "elevator", label: "Elevators" },
  { c: "food", label: "Food" },
  { c: "study", label: "Study spaces" },
  { c: "lab", label: "Labs" },
  { c: "lecture", label: "Lecture halls" },
];
const POPULAR = ["L7:1-004", "L8:2-148", "L9:3-176", "L9:3-180", "L7:1-067", "L8:2-154", "L7:1-003", "L9:TRS3-173"];

/* ------------------------------------------------------------------ home */
export function ExplorePanel({ onQr }: { onQr: () => void }) {
  const select = useApp((s) => s.select);
  const browse = useApp((s) => s.browse);
  const setBrowse = useApp((s) => s.setBrowse);
  const start = useApp((s) => s.start);
  const clearStart = useApp((s) => s.clearStart);

  if (browse) {
    const list = browse === "popular" ? POPULAR.map((id) => DEST_BY_ID[id]).filter(Boolean) : DESTINATIONS.filter((d) => d.category === browse && d.entry);
    const title = browse === "popular" ? "Popular places" : BROWSE.find((b) => b.c === browse)?.label ?? CATEGORY_LABEL[browse];
    const byFloor = ["L9", "L8", "L7"].map((f) => ({ f, items: list.filter((d) => d.floor === f) })).filter((g) => g.items.length);
    return (
      <div data-testid="browse-list">
        <div className="mb-1 flex items-center gap-2">
          <button aria-label="Back" onClick={() => setBrowse(null)} className="grid h-10 w-10 place-items-center rounded-full text-neutral-700 active:bg-neutral-100">
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-neutral-900">{title}</h2>
        </div>
        {browse === "popular"
          ? list.map((d) => <Row key={d.id} d={d} onClick={() => select(d.id)} testId="browse-item" />)
          : byFloor.map((g) => (
              <div key={g.f}>
                <SectionTitle>{floorText(g.f)}</SectionTitle>
                {g.items.map((d) => <Row key={d.id} d={d} onClick={() => select(d.id)} testId="browse-item" />)}
              </div>
            ))}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="explore">
      {start && (
        <div className="flex items-center gap-2.5 rounded-2xl bg-[#EEF4FF] px-3 py-2.5" data-testid="you-are-here">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white"><span className="h-3 w-3 rounded-full border-2 border-white bg-[#1F6FEB] shadow" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11.5px] font-medium text-[#1F4FB0]">You&apos;re here</span>
            <span className="block truncate text-[14px] text-neutral-900">{start.label}</span>
          </span>
          <button onClick={clearStart} className="shrink-0 px-1 text-[13px] font-medium text-[#1F6FEB]">Change</button>
        </div>
      )}
      <div>
        <div className="flex items-center gap-2 text-[12px] font-medium text-neutral-500">
          Ted Rogers School of Management · floors 7–9
          <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-neutral-500 lg:hidden">Prototype</span>
        </div>
        <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.015em] text-neutral-900">Where would you like to go?</h2>
      </div>
      <div className="grid grid-cols-3 gap-2" role="list">
        {BROWSE.map((b) => {
          const I = CATEGORY_ICON[b.c];
          return (
            <button key={b.c} role="listitem" onClick={() => setBrowse(b.c)} data-testid={`browse-${b.c}`} className="flex h-[74px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-neutral-200/80 bg-white text-[12.5px] font-medium text-neutral-800 active:bg-neutral-100 lg:hover:bg-neutral-50">
              <I size={20} strokeWidth={1.9} className="text-[#1F6FEB]" />
              {b.label}
            </button>
          );
        })}
      </div>
      <div>
        <div className="flex items-center justify-between">
          <SectionTitle>Popular</SectionTitle>
          <button onClick={() => setBrowse("popular")} className="px-1.5 text-[13px] font-medium text-[#1F6FEB]">See all</button>
        </div>
        {POPULAR.slice(0, 3).map((id) => DEST_BY_ID[id]).map((d) => <Row key={d.id} d={d} onClick={() => select(d.id)} />)}
      </div>
      <Button variant="secondary" className="w-full" onClick={onQr} data-testid="open-qr">
        <QrCode size={18} /> Scan a location QR code
      </Button>
      <About />
    </div>
  );
}

export function About() {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-[12px] leading-snug text-neutral-500">
      <button onClick={() => setOpen(!open)} className="inline-flex items-center gap-1 font-medium text-neutral-600">
        <Info size={13} /> About this prototype <ChevronDown size={13} className={open ? "rotate-180" : ""} />
      </button>
      {open && (
        <div className="mt-1.5 space-y-1.5">
          <p>Independent demonstration, not an official Toronto Metropolitan University service. Built from the 2024 TRSM floor maps, which are not to scale, so entrances are approximate and no distances are shown. In an emergency, follow posted signs and staff.</p>
          <p>
            For organisers: <a className="font-medium text-[#1F6FEB]" href={links.anchors} data-testid="link-anchors">QR anchor sheet</a> ·{" "}
            <a className="font-medium text-[#1F6FEB]" href={links.inspect}>Map inspector &amp; calibration</a>
          </p>
        </div>
      )}
    </div>
  );
}
export const Disclaimer = About;

/* ------------------------------------------------------------------ place */
function EntranceNote({ d }: { d: Destination }) {
  const [open, setOpen] = useState(false);
  if (!d.entry) return null;
  const short =
    d.entry.status === "source-indicated" ? "Entrance shown on the floor plan" :
    d.entry.status === "estimated" ? "Entrance location is approximate" :
    "Way in not shown on the floor plan";
  const tone = d.entry.status === "source-indicated" ? "text-emerald-700" : d.entry.status === "estimated" ? "text-neutral-600" : "text-amber-700";
  return (
    <div className="text-[13px]">
      <button onClick={() => setOpen(!open)} className={`inline-flex items-center gap-1.5 ${tone}`} data-testid="entrance-note">
        <Info size={14} /> {short} <ChevronDown size={14} className={open ? "rotate-180" : ""} />
      </button>
      {open && (
        <div className="mt-1.5 space-y-1 rounded-xl bg-neutral-50 p-3 text-[12.5px] leading-snug text-neutral-600">
          <p>{d.entry.note}</p>
          {d.notes.map((n, i) => <p key={i}>{n}</p>)}
        </div>
      )}
    </div>
  );
}

export function PlacePanelBody() {
  const id = useApp((s) => s.selectedId)!;
  const reset = useApp((s) => s.reset);
  const d = DEST_BY_ID[id];
  if (!d) return null;
  return (
    <div className="space-y-3" data-testid="place-card">
      <div className="flex items-start gap-3">
        <CategoryIcon c={d.category} size={18} />
        <div className="min-w-0 flex-1">
          <h2 className="text-[19px] font-semibold leading-tight tracking-[-0.015em] text-neutral-900" data-testid="place-name">{d.name}</h2>
          <p className="mt-0.5 text-[13.5px] text-neutral-500" data-testid="place-meta">{meta(d)}</p>
        </div>
        <button aria-label="Close" onClick={reset} className="-mr-1 -mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-600 active:bg-neutral-200">
          <X size={18} />
        </button>
      </div>
      <EntranceNote d={d} />
    </div>
  );
}

export function PlacePanelFooter() {
  const openDirections = useApp((s) => s.openDirections);
  const id = useApp((s) => s.selectedId)!;
  const d = DEST_BY_ID[id];
  return (
    <div className="grid grid-cols-[1fr_auto] gap-2">
      <Button variant="primary" onClick={openDirections} data-testid="directions">
        <Navigation size={17} /> Directions
      </Button>
      <Button
        variant="secondary"
        onClick={() => {
          if (!d?.entry) return;
          const st = useApp.getState();
          st.setStart({ kind: "node", nodeId: d.entry.nodeId, label: label(d) }, "room");
          st.setPosition({ floor: d.floor, p: [d.entry.x, d.entry.y], heading: null, uncertainty: 0, source: "manual" });
          st.setNotice(`Your location is set to ${d.name}. Search for where you want to go.`);
          st.reset();
        }}
        data-testid="im-here"
      >
        I&apos;m here
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ directions */
const QUICK_STARTS = ["L7:elevator-south-west", "L8:elevator-south-west", "L9:elevator-south-west"];

function WhereAreYou({ onQr, onDone }: { onQr: () => void; onDone?: () => void }) {
  const setStart = useApp((s) => s.setStart);
  const setPickingStart = useApp((s) => s.setPickingStart);
  const selectedId = useApp((s) => s.selectedId);
  return (
    <div className="space-y-3" data-testid="where-are-you">
      <div>
        <h3 className="text-[16px] font-semibold text-neutral-900">Where are you now?</h3>
        <p className="text-[13px] text-neutral-500">Pick the room you&apos;re next to, or scan a location QR code.</p>
      </div>
      <SearchBox
        compact
        testId="start-search"
        placeholder="Search a nearby room"
        onPick={(d) => {
          if (!d.entry) return;
          setStart({ kind: "node", nodeId: d.entry.nodeId, label: label(d) }, "room");
          onDone?.();
        }}
      />
      <div>
        <SectionTitle>Or start at the elevators</SectionTitle>
        <div className="grid grid-cols-3 gap-2">
          {QUICK_STARTS.map((id) => DEST_BY_ID[id]).filter((d) => d && d.id !== selectedId).map((d) => (
            <button
              key={d.id}
              data-testid={`quick-${d.id}`}
              onClick={() => {
                setStart({ kind: "node", nodeId: d.entry!.nodeId, label: `Elevators, ${floorText(d.floor)}` }, "room");
                onDone?.();
              }}
              className="flex h-12 items-center justify-center gap-1.5 rounded-xl border border-neutral-200 text-[13.5px] font-medium text-neutral-800 active:bg-neutral-100"
            >
              <ArrowUpDown size={15} className="text-neutral-500" /> {FLOOR_LEVEL[d.floor]}th floor
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onQr}><QrCode size={17} /> Scan QR code</Button>
        <Button variant="secondary" onClick={() => { setPickingStart(true); onDone?.(); }}><Crosshair size={17} /> Tap on map</Button>
      </div>
    </div>
  );
}

export function DirectionsPanelBody({ onQr }: { onQr: () => void }) {
  const id = useApp((s) => s.selectedId)!;
  const start = useApp((s) => s.start);
  const startSource = useApp((s) => s.startSource);
  const route = useApp((s) => s.route);
  const err = useApp((s) => s.routeError);
  const accessible = useApp((s) => s.accessible);
  const setAccessible = useApp((s) => s.setAccessible);
  const swap = useApp((s) => s.swap);
  const select = useApp((s) => s.select);
  const clearStart = useApp((s) => s.clearStart);
  const mpu = useApp((s) => s.calibration.metersPerUnit);
  const [showNotes, setShowNotes] = useState(false);
  const d = DEST_BY_ID[id];
  if (!d) return null;
  const dist = route ? formatDistance(route.lengthUnits, mpu) : null;
  const time = route ? formatTime(route.lengthUnits, route.transitions.length, mpu) : null;

  return (
    <div className="space-y-3.5" data-testid="directions-panel">
      <div className="flex items-center gap-2">
        <button aria-label="Back to place" onClick={() => select(id)} className="-ml-1 grid h-10 w-10 place-items-center rounded-full text-neutral-700 active:bg-neutral-100">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-neutral-900">Directions</h2>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-neutral-200">
        <button onClick={clearStart} className="flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-neutral-50" data-testid="start-field" aria-label="Change starting point">
          <span className="grid h-5 w-5 place-items-center"><span className="h-3 w-3 rounded-full border-[2.5px] border-[#1F6FEB] bg-white" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11.5px] font-medium text-neutral-500">From{startSource === "qr" ? " · QR code" : startSource === "map" ? " · pinned on map" : ""}</span>
            <span className="block truncate pr-12 text-[15px] text-neutral-900" data-testid="start-label">{start ? start.label : "Choose where you are"}</span>
          </span>
        </button>
        <div className="mx-3.5 border-t border-neutral-100" />
        <div className="flex items-center gap-3 px-3.5 py-3">
          <span className="grid h-5 w-5 place-items-center text-[#1F6FEB]"><MapPin size={18} strokeWidth={2.2} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11.5px] font-medium text-neutral-500">To · {floorText(d.floor)}</span>
            <span className="block truncate pr-12 text-[15px] text-neutral-900" data-testid="dest-label">{label(d)}</span>
          </span>
        </div>
        {start && (
          <button onClick={swap} aria-label="Swap start and destination" data-testid="swap" className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-neutral-200 bg-white text-neutral-600 shadow-sm active:bg-neutral-50">
            <ArrowUpDown size={17} />
          </button>
        )}
      </div>

      {!start ? (
        <WhereAreYou onQr={onQr} />
      ) : (
        <>
          <Toggle id="accessible" checked={accessible} onChange={setAccessible} label={<span className="inline-flex items-center gap-1.5"><Accessibility size={17} /> Accessible route</span>} hint="Uses elevators; avoids escalators and stairs." />

          {err && (
            <div className="flex gap-2 rounded-xl bg-amber-50 p-3 text-[13px] leading-snug text-amber-900" role="alert" data-testid="route-error">
              <AlertTriangle size={17} className="mt-0.5 shrink-0" />
              <span>{err}</span>
            </div>
          )}

          {route && (
            <>
              <div className="flex items-baseline justify-between gap-2" data-testid="route-summary">
                <div>
                  <div className="text-[17px] font-semibold text-neutral-900">{dist && time ? `${time} · ${dist}` : `${route.instructions.length} steps`}</div>
                  <div className="text-[13px] text-neutral-500">
                    {route.legs.length > 1 ? `${route.legs.map((l) => `${FLOOR_LEVEL[l.floor]}th`).join(" → ")} floor` : floorText(route.legs[0].floor)}
                    {route.transitions.length > 0 && ` · by ${route.transitions[0].connector.type}`}
                  </div>
                </div>
                {route.warnings.length > 0 && (
                  <button onClick={() => setShowNotes((v) => !v)} className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-neutral-600" data-testid="notes-toggle">
                    <Info size={14} /> Route notes
                  </button>
                )}
              </div>
              {showNotes && (
                <ul className="list-disc space-y-1 rounded-xl bg-neutral-50 py-2.5 pl-7 pr-3 text-[12.5px] leading-snug text-neutral-600" data-testid="route-warnings">
                  {route.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}
              <ol className="relative space-y-0" data-testid="step-list" aria-label="Route steps">
                {route.instructions.map((ins, i) => {
                  const I = INSTRUCTION_ICON[ins.icon];
                  return (
                    <li key={ins.id} className="flex items-start gap-3 py-2">
                      <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${i === route.instructions.length - 1 ? "bg-[#1F6FEB] text-white" : "bg-neutral-100 text-neutral-700"}`}><I size={16} /></span>
                      <span className="pt-1 text-[14.5px] leading-snug text-neutral-800">
                        {ins.text}
                        {formatDistance(ins.segmentLength, mpu) && ins.segmentLength > 0 && <span className="text-neutral-500"> · {formatDistance(ins.segmentLength, mpu)}</span>}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </>
      )}
    </div>
  );
}

export function DirectionsPanelFooter() {
  const route = useApp((s) => s.route);
  const startSource = useApp((s) => s.startSource);
  const startNavigation = useApp((s) => s.startNavigation);
  const allowUnverified = useApp((s) => s.allowUnverified);
  const [useSensors, setUseSensors] = useState(false);
  if (!route) return null;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[auto_1fr] gap-2">
        <Button variant="secondary" onClick={() => startNavigation("demo")} data-testid="demo-walk" className="px-3.5">
          <Play size={16} /> Demo Walk
        </Button>
        <Button variant="primary" onClick={() => startNavigation(useSensors ? "motion" : startSource === "qr" ? "qr" : "manual")} data-testid="start-nav">
          <Navigation size={17} /> Start
        </Button>
      </div>
      <label className="flex items-center gap-2 px-0.5 text-[12px] text-neutral-500">
        <input type="checkbox" checked={useSensors} onChange={(e) => setUseSensors(e.target.checked)} className="h-4 w-4 accent-[#1F6FEB]" data-testid="sensors" />
        Follow my steps with phone motion sensors (experimental)
      </label>
      {allowUnverified && <p className="text-[11.5px] text-amber-700">Unverified escalators and stairs are switched on in the inspector.</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ navigating */
export function useShownStep() {
  const route = useApp((s) => s.route);
  const progress = useApp((s) => s.progress);
  const navMode = useApp((s) => s.navMode);
  const stepIndex = useApp((s) => s.stepIndex);
  if (!route) return 0;
  return navMode === "manual" || navMode === "qr" ? stepIndex : upcomingInstructionIndex(progress, route.instructions);
}

export function InstructionBanner() {
  const route = useApp((s) => s.route)!;
  const progress = useApp((s) => s.progress);
  const mpu = useApp((s) => s.calibration.metersPerUnit);
  const navMode = useApp((s) => s.navMode);
  const showingIdx = useShownStep();
  const showing = route.instructions[showingIdx];
  const after = route.instructions[showingIdx + 1];
  const I = INSTRUCTION_ICON[showing.icon];
  const dist = formatDistance(Math.max(0, showing.s - progress), mpu);
  return (
    <div className="pointer-events-auto overflow-hidden rounded-[20px] bg-[#0F5BD8] text-white shadow-[0_10px_30px_rgba(15,91,216,0.35)]" data-testid="instruction-banner" aria-live="off">
      <div className="flex items-start gap-3 px-4 pb-3 pt-3.5">
        <span className="mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/15"><I size={26} strokeWidth={2.3} /></span>
        <div className="min-w-0">
          <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-white/70">
            Step {showingIdx + 1} of {route.instructions.length}{dist ? ` · in ${dist}` : ""}
          </div>
          <div className="text-[18px] font-semibold leading-snug" data-testid="current-instruction">{showing.text}</div>
        </div>
      </div>
      {after && (
        <div className="flex items-center gap-2 bg-black/15 px-4 py-2 text-[13px] text-white/90">
          <span className="font-medium text-white/70">Then</span> <span className="truncate">{after.text}</span>
        </div>
      )}
      {navMode === "demo" && <div className="bg-amber-300 px-4 py-1.5 text-[12px] font-semibold text-amber-950" data-testid="demo-badge">Demo Walk · simulated, not your real location</div>}
      {navMode === "motion" && <div className="bg-amber-100 px-4 py-1.5 text-[12px] font-semibold text-amber-900">Estimated position · experimental motion tracking</div>}
    </div>
  );
}

export function NavigatingPanelBody({ sensorMsg }: { sensorMsg: string | null }) {
  const route = useApp((s) => s.route)!;
  const progress = useApp((s) => s.progress);
  const navMode = useApp((s) => s.navMode);
  const [showAll, setShowAll] = useState(false);
  const idx = useShownStep();
  const pct = Math.round((progress / Math.max(1, route.lengthUnits)) * 100);
  return (
    <div className="space-y-2.5" data-testid="nav-panel">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-medium text-neutral-500">Going to</div>
          <div className="truncate text-[16px] font-semibold text-neutral-900">{label(route.destination)}</div>
        </div>
        <button onClick={() => setShowAll(!showAll)} className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-[#1F6FEB]" data-testid="all-steps">
          {showAll ? "Hide steps" : `All ${route.instructions.length} steps`}
        </button>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Route progress">
        <div className="h-full rounded-full bg-[#1F6FEB] transition-[width] duration-200" style={{ width: `${pct}%` }} data-testid="progress-bar" data-progress={progress.toFixed(1)} />
      </div>
      {navMode === "motion" && sensorMsg && <p className="rounded-xl bg-amber-50 p-2.5 text-[12.5px] text-amber-900" role="status">{sensorMsg}</p>}
      {navMode === "motion" && <p className="flex gap-1.5 text-[12px] leading-snug text-neutral-500"><Smartphone size={14} className="mt-0.5 shrink-0" /> Only your steps move the dot; turning your phone doesn&apos;t. Scan a QR code to correct it.</p>}
      {(navMode === "manual" || navMode === "qr") && <p className="text-[12.5px] leading-snug text-neutral-500">Your position isn&apos;t tracked. Tap <strong className="font-semibold text-neutral-700">Next</strong> after each step.</p>}
      {showAll && (
        <ol className="rounded-xl border border-neutral-200 px-3 py-1">
          {route.instructions.map((ins, i) => {
            const I = INSTRUCTION_ICON[ins.icon];
            return (
              <li key={ins.id} className={`flex items-start gap-3 py-1.5 ${i < idx ? "opacity-40" : ""}`}>
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-700"><I size={13} /></span>
                <span className={`text-[13.5px] leading-snug text-neutral-800 ${i === idx ? "font-semibold" : ""}`}>{ins.text}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export function NavigatingPanelFooter({ onQr }: { onQr: () => void }) {
  const route = useApp((s) => s.route)!;
  const navMode = useApp((s) => s.navMode);
  const playing = useApp((s) => s.playing);
  const setPlaying = useApp((s) => s.setPlaying);
  const speed = useApp((s) => s.speed);
  const setSpeed = useApp((s) => s.setSpeed);
  const progress = useApp((s) => s.progress);
  const stop = useApp((s) => s.stopNavigation);
  const setProgress = useApp((s) => s.setProgress);
  const setPickingStart = useApp((s) => s.setPickingStart);
  const goToStep = useApp((s) => s.goToStep);
  const idx = useShownStep();
  const atTransition = route.transitions.find((t) => Math.abs(progress - t.distanceAt) < 1.2);
  const cur = route.instructions[idx];
  const jump = (i: number) => goToStep(i);

  const stopBtn = (
    <Button variant="secondary" onClick={stop} data-testid="stop-nav" aria-label="End navigation" className="w-12 px-0 text-red-600">
      <X size={20} />
    </Button>
  );

  if (navMode === "demo") {
    return (
      <div className="flex items-center gap-2">
        {stopBtn}
        <Button variant="secondary" onClick={() => { setProgress(0); setPlaying(true); }} aria-label="Restart demo" data-testid="demo-restart" className="w-12 px-0">
          <RotateCcw size={18} />
        </Button>
        <div className="flex flex-1 overflow-hidden rounded-xl border border-neutral-200" role="group" aria-label="Demo speed">
          {[1, 2, 4].map((v) => (
            <button key={v} onClick={() => setSpeed(v)} aria-pressed={speed === v} className={`h-11 flex-1 text-[14px] font-medium tabular-nums ${speed === v ? "bg-neutral-900 text-white" : "text-neutral-700 active:bg-neutral-100"}`}>
              {v}×
            </button>
          ))}
        </div>
        <Button variant="primary" onClick={() => setPlaying(!playing)} aria-label={playing ? "Pause demo" : "Play demo"} data-testid="demo-play" className="w-14 px-0">
          {playing ? <Pause size={19} /> : <Play size={19} />}
        </Button>
      </div>
    );
  }
  if (navMode === "motion") {
    return (
      <div className="flex items-center gap-2">
        {stopBtn}
        {atTransition ? (
          <Button variant="primary" className="flex-1" onClick={confirmFloorChange}>
            <Flag size={16} /> I&apos;m on the {FLOOR_LEVEL[atTransition.toFloor]}th floor
          </Button>
        ) : (
          <>
            <Button variant="secondary" className="flex-1" onClick={onQr}><QrCode size={17} /> Rescan QR</Button>
            <Button variant="secondary" className="flex-1" onClick={() => { stop(); setPickingStart(true); }}><Crosshair size={17} /> Fix location</Button>
          </>
        )}
      </div>
    );
  }
  const nextLabel =
    cur?.icon === "arrive" ? "I've arrived" :
    cur?.icon === "elevator" || cur?.icon === "escalator" || cur?.icon === "stair" ? `I'm on the ${FLOOR_LEVEL[route.instructions[idx + 1]?.floor ?? route.destination.floor]}th floor` :
    "Next";
  return (
    <div className="flex items-center gap-2">
      {stopBtn}
      <Button variant="secondary" onClick={() => jump(idx - 1)} aria-label="Previous step" className="w-12 px-0" disabled={idx === 0}>
        <ChevronLeft size={20} />
      </Button>
      <Button variant="secondary" onClick={onQr} aria-label="Scan a QR code" className="w-12 px-0">
        <QrCode size={18} />
      </Button>
      <Button variant="primary" onClick={() => jump(idx + 1)} className="flex-1" data-testid="next-step">
        {nextLabel} <ChevronRight size={18} />
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ arrived */
export function ArrivedPanelBody() {
  const route = useApp((s) => s.route);
  const id = useApp((s) => s.selectedId);
  const d = id ? DEST_BY_ID[id] : null;
  const side = useMemo(() => route?.instructions[route.instructions.length - 1]?.text, [route]);
  return (
    <div className="space-y-3" data-testid="arrived">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-emerald-50 text-emerald-700"><Flag size={21} /></span>
        <div>
          <h2 className="text-[18px] font-semibold text-neutral-900">You&apos;ve arrived</h2>
          <p className="text-[14px] text-neutral-600">{side}</p>
        </div>
      </div>
      {d?.entry && d.entry.status !== "source-indicated" && <p className="rounded-xl bg-neutral-50 p-3 text-[12.5px] leading-snug text-neutral-600">The exact entrance isn&apos;t shown on the floor plan, so look for the door nearby.</p>}
    </div>
  );
}

export function ArrivedPanelFooter() {
  const reset = useApp((s) => s.reset);
  const stop = useApp((s) => s.stopNavigation);
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button variant="secondary" onClick={stop}>See route again</Button>
      <Button variant="primary" onClick={reset} data-testid="done">Done</Button>
    </div>
  );
}
