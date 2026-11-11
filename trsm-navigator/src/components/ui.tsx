"use client";
import {
  ArrowUpDown, BookOpen, Briefcase, Coffee, DoorClosed, Droplet, FlaskConical, MapPin, Presentation, ShieldAlert, Toilet, Users,
  ArrowUp, CornerUpLeft, CornerUpRight, ArrowUpLeft, ArrowUpRight, Undo2, Flag, CircleDot, TrendingUp, Footprints,
} from "lucide-react";
import type { Category, Verification } from "@/types/map";
import type { InstructionIcon } from "@/features/routing/instructions";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export const CATEGORY_ICON: Record<Category, typeof MapPin> = {
  lecture: Presentation, lab: FlaskConical, meeting: Users, food: Coffee, study: BookOpen, services: Briefcase,
  safety: ShieldAlert, room: DoorClosed, washroom: Toilet, elevator: ArrowUpDown, water: Droplet, landmark: MapPin,
};

export const INSTRUCTION_ICON: Record<InstructionIcon, typeof MapPin> = {
  start: CircleDot, straight: ArrowUp, left: CornerUpLeft, right: CornerUpRight, "slight-left": ArrowUpLeft, "slight-right": ArrowUpRight,
  uturn: Undo2, elevator: ArrowUpDown, escalator: TrendingUp, stair: Footprints, arrive: Flag,
};

export function CategoryIcon({ c, size = 16 }: { c: Category; size?: number }) {
  const I = CATEGORY_ICON[c];
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-neutral-100 text-neutral-700">
      <I size={size} strokeWidth={1.9} />
    </span>
  );
}

export function Button({ variant = "secondary", className = "", children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  const v = {
    primary: "bg-[#1F6FEB] text-white hover:bg-[#1A5FCC] active:bg-[#164FAB] shadow-sm",
    secondary: "bg-white text-neutral-800 border border-neutral-200 hover:bg-neutral-50 active:bg-neutral-100",
    ghost: "text-neutral-700 hover:bg-neutral-100 active:bg-neutral-200",
    danger: "bg-white text-red-700 border border-red-200 hover:bg-red-50",
  }[variant];
  return (
    <button
      {...rest}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-[14px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F6FEB]/50 disabled:cursor-not-allowed disabled:opacity-50 ${v} ${className}`}
    >
      {children}
    </button>
  );
}

const STATUS: Record<string, { label: string; cls: string }> = {
  "source-indicated": { label: "Entrance shown on plan", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  estimated: { label: "Door position estimated", cls: "bg-neutral-100 text-neutral-700 ring-neutral-200" },
  "nearest-corridor": { label: "Access not shown on plan", cls: "bg-amber-50 text-amber-800 ring-amber-200" },
  unverified: { label: "Access unconfirmed", cls: "bg-amber-50 text-amber-800 ring-amber-200" },
  "plan-aligned": { label: "Matches all three plans", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  "verified-onsite": { label: "Verified on site", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
};

export function StatusBadge({ status }: { status: Verification }) {
  const s = STATUS[status] ?? { label: status, cls: "bg-neutral-100 text-neutral-700 ring-neutral-200" };
  return <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${s.cls}`}>{s.label}</span>;
}

export function Toggle({ checked, onChange, label, hint, id }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode; id: string }) {
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start justify-between gap-3 py-1">
      <span className="text-[14px] text-neutral-800">
        {label}
        {hint && <span className="mt-0.5 block text-[12px] leading-snug text-neutral-500">{hint}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input id={id} type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-6 w-10 rounded-full bg-neutral-300 transition-colors peer-checked:bg-[#1F6FEB] peer-focus-visible:ring-2 peer-focus-visible:ring-[#1F6FEB]/50" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </span>
    </label>
  );
}
