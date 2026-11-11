"use client";
import { LocateFixed, Maximize2 } from "lucide-react";
import { FLOOR_IDS, FLOOR_LEVEL } from "@/data";
import { useApp } from "@/lib/store";

export function MapControlsPanel({ azimuth }: { azimuth: number }) {
  const floor = useApp((s) => s.floor);
  const setFloor = useApp((s) => s.setFloor);
  const viewMode = useApp((s) => s.viewMode);
  const setViewMode = useApp((s) => s.setViewMode);
  const route = useApp((s) => s.route);
  const phase = useApp((s) => s.phase);
  const position = useApp((s) => s.position);
  const follow = useApp((s) => s.follow);
  const routeFloors = new Set(route && phase !== "explore" && phase !== "place" ? route.legs.map((l) => l.floor) : []);

  const recenter = () => {
    const st = useApp.getState();
    if (st.phase === "navigating" && st.position) {
      st.setFloor(st.position.floor);
      st.setFollow(true);
    } else if (st.position) {
      st.setFloor(st.position.floor);
      st.requestCamera({ kind: "focus", floor: st.position.floor, x: st.position.p[0], y: st.position.p[1], distance: 240 });
    } else if (st.route && st.phase === "directions") st.requestCamera({ kind: "route" });
    else st.requestCamera({ kind: "fit" });
  };

  const card = "rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_10px_rgba(16,24,40,0.08)]";
  const needle = (-azimuth * 180) / Math.PI;
  return (
    <div className="pointer-events-auto flex flex-col items-end gap-2">
      <div className={`${card} flex flex-col overflow-hidden`} role="group" aria-label="Floor">
        <div className="pt-1.5 text-center text-[9.5px] font-semibold uppercase tracking-[0.08em] text-neutral-400">Floor</div>
        {[...FLOOR_IDS].reverse().map((f) => {
          const on = f === floor;
          return (
            <button
              key={f}
              data-testid={`floor-${FLOOR_LEVEL[f]}`}
              aria-pressed={on}
              aria-label={`${FLOOR_LEVEL[f]}th floor`}
              onClick={() => setFloor(f, { fromUser: true })}
              className={`relative grid h-11 w-11 place-items-center text-[16px] font-semibold tabular-nums transition-colors ${on ? "bg-[#1F6FEB] text-white" : "text-neutral-700 active:bg-neutral-100"}`}
            >
              {FLOOR_LEVEL[f]}
              {routeFloors.has(f) && !on && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#1F6FEB]" />}
            </button>
          );
        })}
      </div>
      <button
        className={`${card} grid h-11 w-11 place-items-center`}
        aria-label="Reset orientation to plan north"
        title="Reset to north"
        data-testid="compass"
        onClick={() => useApp.getState().requestCamera({ kind: "north" })}
      >
        <svg width="22" height="22" viewBox="0 0 22 22" style={{ transform: `rotate(${needle}deg)`, transition: "transform 80ms linear" }} aria-hidden>
          <path d="M11 2 L14.2 11 L11 10 L7.8 11 Z" fill="#E5484D" />
          <path d="M11 20 L7.8 11 L11 12 L14.2 11 Z" fill="#9AA1AA" />
        </svg>
      </button>
      <button
        className={`${card} grid h-11 w-11 place-items-center text-[13px] font-semibold text-neutral-800`}
        aria-label={viewMode === "3d" ? "Switch to 2D overhead view" : "Switch to 3D angled view"}
        data-testid="view-toggle"
        onClick={() => setViewMode(viewMode === "3d" ? "2d" : "3d")}
      >
        {viewMode === "3d" ? "2D" : "3D"}
      </button>
      <button
        className={`${card} grid h-11 w-11 place-items-center ${position && !follow && phase === "navigating" ? "text-[#1F6FEB]" : "text-neutral-700"}`}
        aria-label={position ? "Recenter on your position" : "Fit the floor"}
        data-testid="recenter"
        onClick={recenter}
      >
        {position ? <LocateFixed size={20} /> : <Maximize2 size={18} />}
      </button>
    </div>
  );
}
