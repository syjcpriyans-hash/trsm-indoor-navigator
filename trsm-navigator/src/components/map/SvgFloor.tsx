"use client";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { DEST_BY_ID, FLOOR_BY_ID, PLAN_BOUNDS } from "@/data";
import type { FloorId, PolygonJSON, Pt } from "@/types/map";
import type { RouteOk } from "@/features/routing/route";
import type { LivePosition } from "@/lib/store";
import { FILL_COLOR } from "./sceneUtils";

const path = (p: PolygonJSON) => [p.outer, ...p.holes].map((r) => "M" + r.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L") + "Z").join(" ");

export function SvgFloor({
  floor,
  route,
  progress = 0,
  position,
  selectedId,
  onPick,
  children,
  interactive = true,
  showNumbers = true,
}: {
  floor: FloorId;
  route?: RouteOk | null;
  progress?: number;
  position?: LivePosition | null;
  selectedId?: string | null;
  onPick?: (p: Pt) => void;
  children?: ReactNode;
  interactive?: boolean;
  showNumbers?: boolean;
}) {
  const f = FLOOR_BY_ID[floor];
  const pad = 8;
  const full = { x: PLAN_BOUNDS.minX - pad, y: PLAN_BOUNDS.minY - pad, w: PLAN_BOUNDS.maxX - PLAN_BOUNDS.minX + pad * 2, h: PLAN_BOUNDS.maxY - PLAN_BOUNDS.minY + pad * 2 };
  const [vb, setVb] = useState(full);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; vb: typeof vb; moved: boolean } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; vb: typeof vb } | null>(null);

  const toPlan = (cx: number, cy: number): Pt => {
    const r = svg.current!.getBoundingClientRect();
    const s = Math.max(vb.w / r.width, vb.h / r.height);
    const ox = (r.width * s - vb.w) / 2, oy = (r.height * s - vb.h) / 2;
    return [vb.x - ox + (cx - r.left) * s, vb.y - oy + (cy - r.top) * s];
  };

  const sel = selectedId ? DEST_BY_ID[selectedId] : null;
  const legs = useMemo(() => route?.legs.filter((l) => l.floor === floor) ?? [], [route, floor]);

  return (
    <svg
      ref={svg}
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      className="h-full w-full touch-none select-none"
      style={{ background: "#F7F8FA" }}
      onWheel={
        interactive
          ? (e) => {
              const p = toPlan(e.clientX, e.clientY);
              const k = e.deltaY > 0 ? 1.12 : 1 / 1.12;
              setVb((v) => ({ x: p[0] - (p[0] - v.x) * k, y: p[1] - (p[1] - v.y) * k, w: v.w * k, h: v.h * k }));
            }
          : undefined
      }
      onPointerDown={(e) => {
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        (e.target as Element).setPointerCapture?.(e.pointerId);
        if (pointers.current.size === 2) {
          const [a, b] = [...pointers.current.values()];
          pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), vb };
        } else drag.current = { x: e.clientX, y: e.clientY, vb, moved: false };
      }}
      onPointerMove={(e) => {
        if (!interactive) return;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pinch.current && pointers.current.size === 2) {
          const [a, b] = [...pointers.current.values()];
          const k = pinch.current.d / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
          const v = pinch.current.vb;
          setVb({ x: v.x + (v.w - v.w * k) / 2, y: v.y + (v.h - v.h * k) / 2, w: v.w * k, h: v.h * k });
          return;
        }
        const d = drag.current;
        if (!d) return;
        const r = svg.current!.getBoundingClientRect();
        const s = Math.max(d.vb.w / r.width, d.vb.h / r.height);
        const dx = (e.clientX - d.x) * s, dy = (e.clientY - d.y) * s;
        if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 5) d.moved = true;
        if (d.moved) setVb({ ...d.vb, x: d.vb.x - dx, y: d.vb.y - dy });
      }}
      onPointerUp={(e) => {
        pointers.current.delete(e.pointerId);
        if (pointers.current.size < 2) pinch.current = null;
        const d = drag.current;
        drag.current = null;
        if (d && !d.moved && onPick) onPick(toPlan(e.clientX, e.clientY));
      }}
      role="img"
      aria-label={`${f.label} floor plan`}
    >
      <path d={path(f.outline)} fill="#DADDE2" stroke="#2B3036" strokeWidth={1.4} />
      <path d={path(f.walkable)} fill="#F1F2F4" fillRule="evenodd" />
      {f.courtyard && <path d={path(f.courtyard)} fill="#C6CAD0" />}
      {f.outdoorSeating.map((o, i) => (
        <path key={i} d={path(o)} fill="#D6D9DE" />
      ))}
      {f.hatched.map((h, i) => (
        <path key={i} d={path(h)} fill="url(#hatch)" />
      ))}
      {f.stairs.map((h, i) => (
        <path key={i} d={path(h)} fill="#D2D6DB" stroke="#9AA1AA" strokeWidth={0.4} />
      ))}
      <defs>
        <pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="5" height="5" fill="#E7E9EC" />
          <line x1="0" y1="0" x2="0" y2="5" stroke="#9AA1AA" strokeWidth="1.2" />
        </pattern>
      </defs>
      {f.spaces.map((s) => (
        <path key={s.id} d={path(s.polygon)} fill={sel?.spaceIds.includes(s.id) ? "#9CC2F7" : FILL_COLOR[s.fill]} stroke="#5B626C" strokeWidth={0.45} />
      ))}
      {showNumbers &&
        f.spaces.map((s) =>
          s.labelAt && (s.number || s.name) ? (
            <text key={s.id + "t"} x={s.labelAt[0]} y={s.labelAt[1]} fontSize={s.name ? 5.2 : 4.4} textAnchor="middle" dominantBaseline="middle" fill={s.name ? "#1F2328" : "#6B7280"} fontWeight={s.name ? 600 : 500}>
              {s.name && s.name.length < 26 ? s.name : s.number}
            </text>
          ) : null,
        )}
      {legs.map((l, i) => (
        <g key={i}>
          <polyline points={l.points.map((p) => p.join(",")).join(" ")} fill="none" stroke="#FFFFFF" strokeWidth={5.2} strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={l.points.map((p) => p.join(",")).join(" ")} fill="none" stroke="#1F6FEB" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ))}
      {sel && sel.floor === floor && sel.entry && <circle cx={sel.entry.x} cy={sel.entry.y} r={3.6} fill="#1F6FEB" stroke="#fff" strokeWidth={1.4} />}
      {position && position.floor === floor && (
        <g>
          <circle cx={position.p[0]} cy={position.p[1]} r={Math.max(5, position.uncertainty)} fill="#1F6FEB" opacity={0.14} />
          <circle cx={position.p[0]} cy={position.p[1]} r={3.4} fill="#1F6FEB" stroke="#fff" strokeWidth={1.5} />
        </g>
      )}
      {children}
    </svg>
  );
}
