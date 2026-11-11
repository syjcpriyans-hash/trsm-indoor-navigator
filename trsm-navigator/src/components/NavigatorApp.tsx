"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { QrCode, X } from "lucide-react";
import { DEST_BY_ID, FLOOR_BY_ID } from "@/data";
import { pointInPolygon } from "@/lib/geometry";
import { SINGLE_FILE } from "@/lib/links";
import { lockViewport } from "@/lib/lockViewport";
import { useApp } from "@/lib/store";
import { loadCalibration } from "@/features/indoor-map/calibration";
import { anchorIdFromUrl, validateAnchorId } from "@/features/positioning/qr";
import { useNavigationEngine } from "@/features/demo/useNavigationEngine";
import type { SensorStatus } from "@/features/positioning/motion";
import { SearchBox } from "@/components/search/SearchBox";
import { MapControlsPanel } from "@/components/controls/MapControlsPanel";
import { Panel } from "@/components/navigation/Sheet";
import { QrDialog } from "@/components/navigation/QrDialog";
import {
  ArrivedPanelBody, ArrivedPanelFooter, DirectionsPanelBody, DirectionsPanelFooter, ExplorePanel, InstructionBanner,
  NavigatingPanelBody, NavigatingPanelFooter, PlacePanelBody, PlacePanelFooter,
} from "@/components/navigation/Panels";
import { SvgFloor } from "@/components/map/SvgFloor";
import { AnchorSheet } from "@/components/admin/AnchorSheet";
import { Inspector } from "@/components/admin/Inspector";

const MapCanvas = dynamic(() => import("@/components/map/MapCanvas"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center bg-[#F4F5F7]" role="status">
      <div className="flex flex-col items-center gap-3 text-[13px] text-neutral-500">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-[#1F6FEB]" />
        Loading the map…
      </div>
    </div>
  ),
});

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-[9px] bg-[#111418]" style={{ width: size, height: size }} aria-hidden>
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 64 64">
        <path d="M10 48 L32 14 L54 48 Z" fill="none" stroke="#fff" strokeWidth="5" strokeLinejoin="round" />
        <circle cx="32" cy="40" r="7" fill="#3B82F6" stroke="#fff" strokeWidth="3" />
      </svg>
    </span>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <Logo />
      <span className="text-[15px] font-semibold tracking-[-0.01em] text-neutral-900">
        TRSM <span className="font-normal text-neutral-500">Indoor Navigator</span>
      </span>
      <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Prototype</span>
    </div>
  );
}

function SvgFallback() {
  const floor = useApp((s) => s.floor);
  const route = useApp((s) => s.route);
  const position = useApp((s) => s.position);
  const selectedId = useApp((s) => s.selectedId);
  return (
    <SvgFloor
      floor={floor}
      route={route}
      position={position}
      selectedId={selectedId}
      onPick={(p) => {
        const st = useApp.getState();
        if (st.pickingStartOnMap) {
          st.setStart({ kind: "point", floor: st.floor, x: p[0], y: p[1], label: "Pinned location" }, "map");
          return;
        }
        const fl = FLOOR_BY_ID[st.floor];
        const sp = fl.spaces.find((s) => pointInPolygon(p, s.polygon));
        const d = sp && Object.values(DEST_BY_ID).find((x) => x.spaceIds.includes(sp.id));
        if (d) st.select(d.id, { focus: false });
      }}
    />
  );
}

/** Hash routes used by the single-file build (and accepted by the web build too). */
function useHashView(): "map" | "anchors" | "inspect" {
  const [v, setV] = useState<"map" | "anchors" | "inspect">("map");
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.replace(/^#/, "");
      if (h === "anchors" || h === "inspect") setV(h);
      else {
        setV("map");
        if (/^TRSM-[7-9]-\d{2}$/i.test(h)) {
          const st = useApp.getState();
          const chk = validateAnchorId(h);
          st.setNotice(chk.ok ? st.applyAnchor(chk.anchor.id).message : chk.message);
        } else if (/^trsm-/i.test(h)) {
          useApp.getState().setNotice(`"${h}" isn't a registered location code. Your location wasn't changed.`);
        }
      }
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  return v;
}

export default function NavigatorApp() {
  const view = useHashView();
  if (view === "anchors") return <AnchorSheet />;
  if (view === "inspect") return <Inspector />;
  return <MapApp />;
}

function MapApp() {
  const phase = useApp((s) => s.phase);
  const notice = useApp((s) => s.notice);
  const announce = useApp((s) => s.announce);
  const picking = useApp((s) => s.pickingStartOnMap);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [azimuth, setAzimuth] = useState(0);
  const [qrOpen, setQrOpen] = useState(false);
  const [sensorMsg, setSensorMsg] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const onSensor = useCallback((s: SensorStatus, msg?: string) => {
    if (s === "active") setSensorMsg(null);
    else if (msg) setSensorMsg(msg);
  }, []);
  useNavigationEngine(onSensor);

  useEffect(() => lockViewport(), []);

  // boot: capabilities, preferences, deep links
  useEffect(() => {
    const st = useApp.getState();
    (window as unknown as { __TRSM__: typeof useApp }).__TRSM__ = useApp; // read-only test hook
    const params = new URLSearchParams(window.location.search);
    setWebgl(params.get("render") === "svg" ? false : hasWebGL());
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    st.setReducedMotion(mq.matches);
    const onMq = () => useApp.getState().setReducedMotion(mq.matches);
    mq.addEventListener?.("change", onMq);
    st.setCalibration(loadCalibration());
    try {
      if (window.localStorage.getItem("trsm.allowUnverified") === "1") useApp.setState({ allowUnverified: true });
    } catch {
      /* ignore */
    }
    const dest = params.get("to");
    const anchorId = anchorIdFromUrl(window.location.href);
    if (anchorId) {
      const v = validateAnchorId(anchorId);
      if (v.ok) st.setNotice(st.applyAnchor(v.anchor.id).message);
      else st.setNotice(v.message);
    }
    if (dest && DEST_BY_ID[dest]) {
      st.select(dest);
      if (useApp.getState().start) st.openDirections();
    } else if (dest) st.setNotice(`Destination "${dest}" isn't in the map data.`);
    try {
      if (!SINGLE_FILE && "serviceWorker" in navigator && location.protocol === "https:" && process.env.NODE_ENV === "production") {
        navigator.serviceWorker.register("sw.js").catch(() => {});
      }
    } catch {
      /* sandboxed frames refuse service workers */
    }
    return () => mq.removeEventListener?.("change", onMq);
  }, []);

  // auto-dismiss notices
  useEffect(() => {
    if (!notice || picking) return;
    const t = setTimeout(() => useApp.getState().setNotice(null), 5200);
    return () => clearTimeout(t);
  }, [notice, picking]);

  const navigating = phase === "navigating";
  const openQr = () => setQrOpen(true);

  const content =
    phase === "explore" ? { body: <ExplorePanel onQr={openQr} />, footer: null, maxH: "46dvh" } :
    phase === "place" ? { body: <PlacePanelBody />, footer: <PlacePanelFooter />, maxH: "46dvh" } :
    phase === "directions" ? { body: <DirectionsPanelBody onQr={openQr} />, footer: <DirectionsPanelFooter />, maxH: "54dvh" } :
    phase === "navigating" ? { body: <NavigatingPanelBody sensorMsg={sensorMsg} />, footer: <NavigatingPanelFooter onQr={openQr} />, maxH: "44dvh" } :
    { body: <ArrivedPanelBody />, footer: <ArrivedPanelFooter />, maxH: "40dvh" };

  const qrButton = (
    <button aria-label="Scan a location QR code" onClick={openQr} className="grid h-10 w-10 place-items-center rounded-xl text-neutral-700 active:bg-neutral-100" data-testid="top-qr">
      <QrCode size={20} />
    </button>
  );

  return (
    <main className="fixed inset-0 overflow-hidden bg-[#F4F5F7] text-neutral-900">
      <h1 className="sr-only">TRSM Indoor Navigator: 3D map of Ted Rogers School of Management floors 7 to 9</h1>

      {/* the only thing that moves */}
      <div className="absolute inset-0" data-map-surface>
        {webgl === null ? null : webgl ? (
          <MapCanvas onAzimuth={setAzimuth} />
        ) : (
          <div className="absolute inset-0" data-testid="svg-fallback">
            <SvgFallback />
            <div className="absolute left-1/2 top-24 -translate-x-1/2 rounded-full bg-white px-3 py-1 text-[12px] text-neutral-600 shadow lg:top-4">3D isn&apos;t available in this browser. Showing the 2D plan.</div>
          </div>
        )}
      </div>

      {/* phone top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 px-3 pt-[max(10px,env(safe-area-inset-top))] lg:hidden">
        {navigating ? (
          <InstructionBanner />
        ) : (
          <div className="pointer-events-auto">
            <SearchBox onPick={(d) => useApp.getState().select(d.id)} onFocusChange={setSearchOpen} leading={<span className="mx-0.5"><Logo size={26} /></span>} trailing={qrButton} />
          </div>
        )}
      </div>

      {/* right-hand map controls */}
      <div className={`pointer-events-none absolute right-3 z-20 transition-[top] lg:right-4 lg:top-4 ${navigating ? "top-[188px]" : "top-[76px]"} ${searchOpen ? "opacity-0" : ""}`}>
        <MapControlsPanel azimuth={azimuth} />
      </div>

      {/* notices */}
      {notice && (
        <div className={`pointer-events-none absolute inset-x-0 z-50 flex justify-start pl-3 pr-[70px] lg:left-[432px] lg:right-24 lg:justify-center lg:px-4 lg:top-6 ${navigating ? "top-[188px]" : "top-[76px]"}`}>
          <div className="pointer-events-auto flex max-w-md items-start gap-2 rounded-2xl bg-neutral-900/95 px-4 py-3 text-[14px] leading-snug text-white shadow-lg" role="status" data-testid="notice">
            <span>{notice}</span>
            <button aria-label="Dismiss" onClick={() => useApp.getState().setNotice(null)} className="-mr-1 grid h-6 w-6 shrink-0 place-items-center rounded-full text-white/70">
              <X size={15} />
            </button>
          </div>
        </div>
      )}

      {/* fixed panel */}
      <div className="pointer-events-none absolute inset-0 z-30">
        <Panel
          maxH={content.maxH}
          footer={content.footer}
          top={
            <div className="space-y-3 border-b border-neutral-100 px-5 pb-4 pt-5">
              {navigating ? <InstructionBanner /> : <><Brand /><SearchBox onPick={(d) => useApp.getState().select(d.id)} trailing={qrButton} /></>}
            </div>
          }
        >
          {content.body}
        </Panel>
      </div>

      <div className="pointer-events-none absolute bottom-4 right-4 z-10 hidden max-w-xs text-right text-[11px] leading-snug text-neutral-500 lg:block">
        Independent prototype · not an official TMU service · plans not to scale
      </div>

      <div className="sr-only" aria-live="polite" aria-atomic="true" data-testid="live-region">{announce}</div>
      {qrOpen && <QrDialog onClose={() => setQrOpen(false)} />}
    </main>
  );
}
