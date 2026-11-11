"use client";
import { forwardRef, memo } from "react";
import { ArrowUpDown, Droplet, DoorOpen, MapPin, Toilet, TrendingUp } from "lucide-react";
import type { LabelItem } from "./labels";

const ICONS = {
  elevator: ArrowUpDown,
  washroom: Toilet,
  exit: DoorOpen,
  water: Droplet,
  escalator: TrendingUp,
  marker: MapPin,
  stairs: TrendingUp,
};

const ICON_STYLE: Record<string, string> = {
  elevator: "bg-amber-400 text-neutral-900",
  washroom: "bg-orange-400 text-white",
  exit: "bg-emerald-600 text-white",
  water: "bg-cyan-600 text-white",
  escalator: "bg-blue-800 text-white",
  marker: "bg-violet-700 text-white",
  stairs: "bg-neutral-500 text-white",
};

/** Absolutely-positioned DOM labels; the projector inside the canvas moves them each frame. */
export const LabelLayer = memo(
  forwardRef<HTMLDivElement, { items: LabelItem[]; onSelect: (id: string) => void }>(function LabelLayer({ items, onSelect }, ref) {
    return (
      <div ref={ref} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {items.map((it, i) => {
          const Icon = it.icon ? ICONS[it.icon] : null;
          const base = "absolute left-0 top-0 hidden select-none whitespace-nowrap will-change-transform";
          if (it.kind === "pin") {
            return (
              <div key={it.key} data-i={i} className={base}>
                <div className="-translate-x-1/2 -translate-y-full flex flex-col items-center">
                  <div className="rounded-full bg-[#1F6FEB] px-2.5 py-1 text-[12px] font-semibold text-white shadow-md">{it.text}</div>
                  <div className="h-2.5 w-[2px] bg-[#1F6FEB]" />
                  <div className="h-2 w-2 rounded-full border-2 border-white bg-[#1F6FEB] shadow" />
                </div>
              </div>
            );
          }
          if (it.kind === "start") {
            return (
              <div key={it.key} data-i={i} className={base}>
                <div className="-translate-x-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full border-[3px] border-[#1F6FEB] bg-white shadow" />
              </div>
            );
          }
          if (it.kind === "transfer") {
            return (
              <div key={it.key} data-i={i} className={base}>
                <div className="-translate-x-1/2 -translate-y-1/2 flex items-center gap-1 rounded-full border border-[#1F6FEB]/30 bg-white px-2 py-0.5 text-[11px] font-medium text-[#1F4FB0] shadow-sm">
                  <ArrowUpDown size={12} strokeWidth={2.2} />
                  {it.text}
                </div>
              </div>
            );
          }
          if (it.kind === "icon" && Icon) {
            const clickable = !!it.destinationId;
            return (
              <div key={it.key} data-i={i} className={base + (clickable ? " pointer-events-auto cursor-pointer" : "")} onClick={clickable ? () => onSelect(it.destinationId!) : undefined}>
                <div className="-translate-x-1/2 -translate-y-1/2 flex items-center gap-1">
                  <span className={`grid h-[18px] w-[18px] place-items-center rounded-[5px] shadow-sm ring-1 ring-white ${ICON_STYLE[it.icon!]}`}>
                    <Icon size={11} strokeWidth={2.4} />
                  </span>
                  {it.icon === "marker" && <span className="label-halo text-[11px] font-semibold text-neutral-800">{it.text}</span>}
                </div>
              </div>
            );
          }
          const cls =
            it.kind === "name"
              ? "label-halo text-[11.5px] font-semibold tracking-[-0.005em] text-neutral-800"
              : it.kind === "area"
                ? "label-halo text-[10.5px] font-medium uppercase tracking-[0.06em] text-neutral-500"
                : "label-halo text-[10px] font-medium tabular-nums text-neutral-500";
          return (
            <div key={it.key} data-i={i} className={base}>
              <div className={"-translate-x-1/2 -translate-y-1/2 " + cls}>{it.text}</div>
            </div>
          );
        })}
      </div>
    );
  }),
);
