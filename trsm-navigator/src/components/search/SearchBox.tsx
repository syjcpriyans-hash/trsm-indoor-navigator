"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Clock, Search, X } from "lucide-react";
import { CATEGORY_LABEL, groupByCategory, search, suggestions } from "@/features/indoor-map/search";
import { DEST_BY_ID, FLOOR_LEVEL } from "@/data";
import type { Category, Destination } from "@/types/map";
import { clearRecent, loadRecent } from "@/lib/store";
import { CategoryIcon } from "@/components/ui";

const QUICK: { label: string; q: string; c: Category }[] = [
  { label: "Washrooms", q: "washroom", c: "washroom" },
  { label: "Elevators", q: "elevator", c: "elevator" },
  { label: "Labs", q: "lab", c: "lab" },
  { label: "Lecture halls", q: "lecture", c: "lecture" },
  { label: "Study spaces", q: "study lounge commons", c: "study" },
  { label: "Food", q: "kitchen bagels", c: "food" },
];

function subtitle(d: Destination) {
  const parts: string[] = [];
  if (d.number && d.hasName) parts.push(d.number);
  parts.push(`${FLOOR_LEVEL[d.floor]}th floor`);
  if (d.category !== "room") parts.push(CATEGORY_LABEL[d.category].replace(/s$/, ""));
  return parts.join(" · ");
}

export function SearchBox({
  placeholder = "Where do you want to go?",
  onPick,
  autoFocus,
  compact,
  testId = "search",
  onFocusChange,
  leading,
  trailing,
}: {
  placeholder?: string;
  onPick: (d: Destination) => void;
  autoFocus?: boolean;
  compact?: boolean;
  testId?: string;
  onFocusChange?: (f: boolean) => void;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => setRecent(loadRecent()), [open]);
  useEffect(() => onFocusChange?.(open), [open, onFocusChange]);
  useEffect(() => {
    const onDoc = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, []);

  const hits = useMemo(() => search(q, 40), [q]);
  const groups = useMemo(() => groupByCategory(hits), [hits]);
  const flat = useMemo(() => groups.flatMap((g) => g.hits.map((h) => h.destination)), [groups]);
  const sugg = useMemo(() => (q.trim().length >= 3 && hits.length === 0 ? suggestions(q) : []), [q, hits.length]);
  useEffect(() => setActive(0), [q]);

  const pick = (d: Destination) => {
    onPick(d);
    setQ("");
    setOpen(false);
    input.current?.blur();
  };

  const listId = `${testId}-list`;
  let idx = -1;
  return (
    <div ref={root} className="relative w-full">
      <div className={`flex items-center gap-2 rounded-2xl border border-black/[0.07] bg-white pl-3 pr-1.5 shadow-[0_2px_10px_rgba(16,24,40,0.08)] ${compact ? "h-12" : "h-[52px]"}`}>
        {open ? (
          <button aria-label="Close search" className="grid h-9 w-9 place-items-center rounded-full text-neutral-600 hover:bg-neutral-100" onClick={() => { setOpen(false); setQ(""); input.current?.blur(); }}>
            <ArrowLeft size={19} />
          </button>
        ) : (
          leading ?? <Search size={18} className="mx-1 text-neutral-500" aria-hidden />
        )}
        <input
          ref={input}
          data-testid={testId}
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, Math.max(0, flat.length - 1)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter" && flat[active]) {
              e.preventDefault();
              pick(flat[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
              input.current?.blur();
            }
          }}
          placeholder={placeholder}
          className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-neutral-900 placeholder:text-neutral-500 focus:outline-none"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label="Search rooms, facilities and landmarks"
          aria-activedescendant={open && flat[active] ? `${testId}-opt-${active}` : undefined}
          enterKeyHint="search"
          autoComplete="off"
          spellCheck={false}
        />
        {q && (
          <button aria-label="Clear search" className="grid h-9 w-9 place-items-center rounded-full text-neutral-500 hover:bg-neutral-100" onClick={() => { setQ(""); input.current?.focus(); }}>
            <X size={18} />
          </button>
        )}
        {!q && !open && trailing}
      </div>

      {open && (
        <div id={listId} role="listbox" className="scroll-y absolute left-0 right-0 top-[calc(100%+6px)] z-40 max-h-[min(58dvh,520px)] rounded-2xl border border-neutral-200 bg-white py-1.5 shadow-[0_12px_32px_rgba(16,24,40,0.14)]">
          {!q.trim() && (
            <div className="px-3 pb-2 pt-1">
              <div className="flex flex-wrap gap-1.5">
                {QUICK.map((c) => (
                  <button key={c.label} onClick={() => setQ(c.q)} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 text-[13px] text-neutral-700 hover:bg-neutral-50">
                    {c.label}
                  </button>
                ))}
              </div>
              {recent.length > 0 && (
                <div className="mt-3">
                  <div className="flex items-center justify-between px-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                    Recent
                    <button className="text-[12px] font-medium normal-case tracking-normal text-[#1F6FEB]" onClick={() => { clearRecent(); setRecent([]); }}>
                      Clear
                    </button>
                  </div>
                  {recent.map((id) => {
                    const d = DEST_BY_ID[id];
                    return (
                      <button key={id} onClick={() => pick(d)} className="flex w-full items-center gap-3 rounded-xl px-1 py-2 text-left hover:bg-neutral-50">
                        <span className="grid h-8 w-8 place-items-center rounded-lg bg-neutral-100 text-neutral-500"><Clock size={16} /></span>
                        <span className="min-w-0">
                          <span className="block truncate text-[14px] font-medium text-neutral-900">{d.name}</span>
                          <span className="block text-[12px] text-neutral-500">{subtitle(d)}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="px-1 pt-3 text-[12px] leading-snug text-neutral-500">Search by room number (e.g. 2-148), name, or facility.</p>
            </div>
          )}
          {q.trim() && hits.length === 0 && (
            <div className="px-4 py-3" data-testid="search-empty">
              <p className="text-[14px] text-neutral-800">No matches for &ldquo;{q}&rdquo;.</p>
              {sugg.length > 0 ? (
                <div className="mt-2">
                  <p className="text-[12px] text-neutral-500">Did you mean</p>
                  {sugg.map((d) => (
                    <button key={d.id} onClick={() => pick(d)} className="mt-1 flex w-full items-center gap-3 rounded-xl px-1 py-2 text-left hover:bg-neutral-50">
                      <CategoryIcon c={d.category} />
                      <span>
                        <span className="block text-[14px] font-medium text-[#1F4FB0]">{d.name}</span>
                        <span className="block text-[12px] text-neutral-500">{subtitle(d)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-[12px] text-neutral-500">Only the 7th, 8th and 9th floors of TRSM are mapped. Try a room number like 1-067.</p>
              )}
            </div>
          )}
          {groups.map((g) => (
            <div key={g.category + g.hits[0].destination.id} className="pb-1">
              <div className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{g.hits[0].match === "exact-number" ? "Best match" : CATEGORY_LABEL[g.category]}</div>
              {g.hits.map((h) => {
                idx++;
                const i = idx;
                const d = h.destination;
                return (
                  <button
                    key={d.id}
                    id={`${testId}-opt-${i}`}
                    role="option"
                    aria-selected={i === active}
                    data-testid="search-result"
                    data-dest={d.id}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(d)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left ${i === active ? "bg-neutral-100/80" : "hover:bg-neutral-50"}`}
                  >
                    <CategoryIcon c={d.category} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-neutral-900">{d.name}</span>
                      <span className="block truncate text-[12px] text-neutral-500">{subtitle(d)}</span>
                    </span>
                    <span className="shrink-0 rounded-md bg-neutral-100 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-neutral-600">{FLOOR_LEVEL[d.floor]}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
