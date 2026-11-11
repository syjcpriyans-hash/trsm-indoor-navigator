"use client";
import { useEffect, useMemo, useState } from "react";
import { DESTINATIONS, DEST_BY_ID, FLOOR_IDS, FLOOR_LEVEL, GRAPH } from "@/data";
import type { FloorId, Pt } from "@/types/map";
import { SvgFloor } from "@/components/map/SvgFloor";
import { links, SINGLE_FILE } from "@/lib/links";
import { SOURCE_IMAGES } from "@/lib/sourceImages";
import { computeRoute } from "@/features/routing/route";
import { calibrationSpread, loadCalibration, metersPerUnitFromSamples, saveCalibration, type Calibration } from "@/features/indoor-map/calibration";

const STATUS_COLOR: Record<string, string> = {
  "source-indicated": "#0F9D58",
  estimated: "#6B7280",
  "nearest-corridor": "#D97706",
  unverified: "#DC2626",
};

/** Source page images are optional (shipped in /public/source for the web build). */
const sourceImage = (floor: FloorId) => (SINGLE_FILE ? SOURCE_IMAGES[floor] : `../source/page-${FLOOR_LEVEL[floor] - 6}.png`);

export function Inspector() {
  useEffect(() => {
    document.documentElement.classList.add("doc-page");
    return () => document.documentElement.classList.remove("doc-page");
  }, []);
  const [floor, setFloor] = useState<FloorId>("L7");
  const [showSource, setShowSource] = useState(0.45);
  const [showGraph, setShowGraph] = useState(true);
  const [allowUnverified, setAllowUnverified] = useState(false);
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [cal, setCal] = useState<Calibration>(() => loadCalibration());
  const [pending, setPending] = useState<Pt[]>([]);
  const [meters, setMeters] = useState("");
  const [sweep, setSweep] = useState<string | null>(null);
  const [mode, setMode] = useState<"inspect" | "calibrate">("inspect");

  useEffect(() => {
    try {
      setAllowUnverified(window.localStorage.getItem("trsm.allowUnverified") === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const nodes = useMemo(() => new Map(GRAPH.nodes.map((n) => [n.id, n])), []);
  const edges = useMemo(() => GRAPH.edges.filter((e) => nodes.get(e.a)?.floor === floor && nodes.get(e.b)?.floor === floor), [floor, nodes]);
  const dests = DESTINATIONS.filter((d) => d.floor === floor);
  const counts = dests.reduce<Record<string, number>>((m, d) => ((m[d.entry?.status ?? "none"] = (m[d.entry?.status ?? "none"] ?? 0) + 1), m), {});
  const mpu = metersPerUnitFromSamples(cal.samples);
  const spread = calibrationSpread(cal.samples);

  const onPick = (p: Pt) => {
    setCursor(p);
    if (mode === "calibrate") setPending((q) => (q.length >= 2 ? [p] : [...q, p]));
  };

  const addSample = () => {
    const m = parseFloat(meters);
    if (pending.length !== 2 || !(m > 0)) return;
    const next: Calibration = { ...cal, samples: [...cal.samples, { floor, a: pending[0], b: pending[1], meters: m }] };
    next.metersPerUnit = metersPerUnitFromSamples(next.samples);
    setCal(next);
    saveCalibration(next);
    setPending([]);
    setMeters("");
  };

  const runSweep = () => {
    const from = DEST_BY_ID["L8:elevator-south-west"];
    let ok = 0;
    const fails: string[] = [];
    for (const d of DESTINATIONS) {
      if (!d.entry) continue;
      const r = computeRoute({ kind: "node", nodeId: from.entry!.nodeId, label: "sweep" }, d.id, { allowUnverifiedConnectors: allowUnverified });
      if (r.ok && r.validation.ok) ok++;
      else fails.push(`${d.id}: ${r.ok ? r.validation.problems[0] : r.message}`);
    }
    setSweep(`${ok} of ${ok + fails.length} destinations reachable with walls-validated routes.${fails.length ? " Failures: " + fails.slice(0, 5).join("; ") : ""}`);
  };

  return (
    <div className="flex h-dvh flex-col bg-white text-neutral-900 lg:flex-row">
      <aside className="max-h-[48dvh] shrink-0 space-y-4 overflow-y-auto border-b border-neutral-200 p-4 lg:max-h-none lg:w-[360px] lg:border-b-0 lg:border-r">
        <div className="flex items-baseline justify-between">
          <h1 className="text-[18px] font-semibold">Map inspector</h1>
          <a href={links.homeFromSub} className="text-[13px] font-medium text-[#1F6FEB]">← Map</a>
        </div>
        <p className="text-[12.5px] leading-snug text-neutral-600">Compare the digitized geometry and routing graph with the source plan, check verification status, and calibrate real-world scale.</p>

        <div className="flex gap-1" role="group" aria-label="Floor">
          {FLOOR_IDS.map((f) => (
            <button key={f} onClick={() => setFloor(f)} className={`h-10 flex-1 rounded-lg text-[14px] font-semibold ${f === floor ? "bg-[#1F6FEB] text-white" : "border border-neutral-200"}`}>
              {FLOOR_LEVEL[f]}th
            </button>
          ))}
        </div>

        <label className="block text-[13px]">
          Source plan overlay: {Math.round(showSource * 100)}%
          <input type="range" min={0} max={1} step={0.05} value={showSource} onChange={(e) => setShowSource(+e.target.value)} className="mt-1 w-full" />
        </label>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={showGraph} onChange={(e) => setShowGraph(e.target.checked)} /> Show routing graph
        </label>
        <label className="flex items-start gap-2 text-[13px]">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={allowUnverified}
            onChange={(e) => {
              setAllowUnverified(e.target.checked);
              try {
                window.localStorage.setItem("trsm.allowUnverified", e.target.checked ? "1" : "0");
              } catch {
                /* ignore */
              }
            }}
          />
          <span>Allow unverified connectors in routing (escalators, central stair). For testing only, until confirmed on site.</span>
        </label>

        <section>
          <h2 className="text-[13px] font-semibold">Room entry status, {FLOOR_LEVEL[floor]}th floor</h2>
          <ul className="mt-1 space-y-0.5 text-[12.5px]">
            {Object.entries(counts).map(([k, v]) => (
              <li key={k} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLOR[k] ?? "#000" }} /> {k}: {v}
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-1">
          <h2 className="text-[13px] font-semibold">Vertical connectors</h2>
          {GRAPH.connectors.map((c) => (
            <div key={c.id} className="rounded-lg border border-neutral-200 p-2 text-[12px] leading-snug">
              <div className="font-medium">{c.name} <span className="text-neutral-500">· {c.verification} · {c.enabledByDefault ? "enabled" : "disabled"}</span></div>
              <div className="text-neutral-600">{c.notes.join(" ")}</div>
            </div>
          ))}
        </section>

        <section className="space-y-2 rounded-xl border border-neutral-200 p-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-semibold">Scale calibration</h2>
            <button onClick={() => { setMode(mode === "calibrate" ? "inspect" : "calibrate"); setPending([]); }} className="rounded-md border border-neutral-200 px-2 py-1 text-[12px]">
              {mode === "calibrate" ? "Done" : "Measure"}
            </button>
          </div>
          <p className="text-[12px] leading-snug text-neutral-600">
            The plans are not to scale. Tap two points whose real distance you measured on site, then enter it in metres. Add several measurements: a large spread shows where the drawing is distorted.
          </p>
          {mode === "calibrate" && (
            <div className="space-y-2">
              <p className="text-[12px]">Points: {pending.map((p) => `(${p[0].toFixed(1)}, ${p[1].toFixed(1)})`).join(" → ") || "tap the plan"}</p>
              <div className="flex gap-2">
                <input value={meters} onChange={(e) => setMeters(e.target.value)} placeholder="metres" inputMode="decimal" className="h-9 w-24 rounded-lg border border-neutral-200 px-2 text-[13px]" />
                <button onClick={addSample} disabled={pending.length !== 2} className="h-9 rounded-lg bg-[#1F6FEB] px-3 text-[13px] text-white disabled:opacity-40">Add</button>
              </div>
            </div>
          )}
          <ul className="space-y-0.5 text-[12px]">
            {cal.samples.map((s, i) => (
              <li key={i}>{s.floor}: {Math.hypot(s.a[0] - s.b[0], s.a[1] - s.b[1]).toFixed(1)} units = {s.meters} m</li>
            ))}
          </ul>
          <p className="text-[12.5px]">
            {mpu ? <>Scale: <strong>{mpu.toFixed(4)} m per plan unit</strong>{spread != null && <> · spread {(spread * 100).toFixed(0)}%</>}</> : "Not calibrated: the app shows no distances or times."}
          </p>
          <label className="block text-[12px]">
            Plan-north to magnetic-north offset (degrees, measured on site)
            <input
              defaultValue={cal.planNorthOffsetDeg ?? ""}
              onBlur={(e) => {
                const v = e.target.value.trim() === "" ? null : parseFloat(e.target.value);
                const next = { ...cal, planNorthOffsetDeg: v != null && isFinite(v) ? v : null };
                setCal(next);
                saveCalibration(next);
              }}
              className="mt-1 h-9 w-full rounded-lg border border-neutral-200 px-2 text-[13px]"
            />
          </label>
          <div className="flex gap-2">
            <button onClick={() => { const c = { metersPerUnit: null, samples: [], planNorthOffsetDeg: null }; setCal(c); saveCalibration(c); }} className="rounded-md border border-neutral-200 px-2 py-1 text-[12px]">Reset</button>
            <button onClick={() => navigator.clipboard?.writeText(JSON.stringify(cal, null, 2)).catch(() => {})} className="rounded-md border border-neutral-200 px-2 py-1 text-[12px]">Copy as JSON</button>
          </div>
        </section>

        <section className="space-y-2">
          <button onClick={runSweep} className="h-10 w-full rounded-lg border border-neutral-200 text-[13px] font-medium">Validate routes to every destination</button>
          {sweep && <p className="text-[12px] leading-snug text-neutral-700" data-testid="sweep-result">{sweep}</p>}
        </section>

        {cursor && <p className="font-mono text-[12px] text-neutral-600">Plan point: {cursor[0].toFixed(1)}, {cursor[1].toFixed(1)}</p>}
      </aside>

      <div className="relative min-h-0 flex-1">
        <SvgFloor floor={floor} onPick={onPick} showNumbers>
          {showSource > 0 && <image href={sourceImage(floor)} x={0} y={0} width={1008} height={612} opacity={showSource} style={{ pointerEvents: "none" }} preserveAspectRatio="none" />}
          {showGraph &&
            edges.map((e, i) => {
              const a = nodes.get(e.a)!, b = nodes.get(e.b)!;
              const col = e.kind === "corridor" ? "#2563EB" : STATUS_COLOR[e.verification] ?? "#7C3AED";
              return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={col} strokeWidth={e.kind === "corridor" ? 1 : 0.7} strokeDasharray={e.verification === "unverified" ? "2 1.5" : undefined} />;
            })}
          {showGraph &&
            dests.map((d) =>
              d.entry ? <circle key={d.id} cx={d.entry.x} cy={d.entry.y} r={1.5} fill={STATUS_COLOR[d.entry.status] ?? "#000"} stroke="#fff" strokeWidth={0.4}><title>{`${d.name} ${d.number ?? ""} — ${d.entry.status}`}</title></circle> : null,
            )}
          {pending.map((p, i) => (
            <circle key={i} cx={p[0]} cy={p[1]} r={2.4} fill="#E11D48" />
          ))}
          {pending.length === 2 && <line x1={pending[0][0]} y1={pending[0][1]} x2={pending[1][0]} y2={pending[1][1]} stroke="#E11D48" strokeWidth={1} />}
        </SvgFloor>
      </div>
    </div>
  );
}
