"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { ANCHORS, FLOOR_LEVEL } from "@/data";
import { SvgFloor } from "@/components/map/SvgFloor";
import { links, SINGLE_FILE } from "@/lib/links";

const BASE_KEY = "trsm.anchorBase.v1";

/** Default link target for printed codes. Builds can bake in the deployed URL. */
function defaultBase(): string {
  const baked = process.env.NEXT_PUBLIC_ANCHOR_BASE;
  if (baked) return baked;
  if (typeof window === "undefined") return "";
  return window.location.origin + window.location.pathname.replace(/anchors\/?$/, "");
}

export function anchorLink(base: string, id: string, style: "query" | "hash") {
  const b = base.replace(/\/?$/, style === "query" ? "/" : "");
  return style === "query" ? `${b}?anchor=${id}` : `${b}#${id}`;
}

export function AnchorSheet() {
  useEffect(() => {
    document.documentElement.classList.add("doc-page");
    return () => document.documentElement.classList.remove("doc-page");
  }, []);
  const [base, setBase] = useState("");
  const [style, setStyle] = useState<"query" | "hash">("query");
  const [svgs, setSvgs] = useState<Record<string, string>>({});

  useEffect(() => {
    let b = defaultBase();
    try {
      b = window.localStorage.getItem(BASE_KEY) || b;
    } catch {
      /* ignore */
    }
    setBase(b);
    if (SINGLE_FILE || process.env.NEXT_PUBLIC_ANCHOR_STYLE === "hash") setStyle("hash");
  }, []);

  useEffect(() => {
    if (!base) return;
    (async () => {
      const out: Record<string, string> = {};
      for (const a of ANCHORS) out[a.id] = await QRCode.toString(anchorLink(base, a.id, style), { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#111418", light: "#FFFFFF" } });
      setSvgs(out);
    })();
  }, [base, style]);

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 text-neutral-900 print:max-w-none print:p-0">
      <header className="no-print mb-6 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-[22px] font-semibold tracking-[-0.01em]">QR positioning anchors</h1>
          <a href={links.homeFromSub} className="text-[14px] font-medium text-[#1F6FEB]">← Back to map</a>
        </div>
        <p className="max-w-3xl text-[14px] leading-relaxed text-neutral-600">
          Each code opens the navigator with your location set to that anchor. These positions are <strong>proposed</strong> from the floor plans and are not installed yet: confirm each mounting spot on site (see the checklist in the README) before printing for real use.
        </p>
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 p-3">
          <label className="min-w-[280px] flex-1 text-[13px] text-neutral-700">
            Link base URL (the deployed app)
            <input
              value={base}
              onChange={(e) => {
                setBase(e.target.value);
                try {
                  window.localStorage.setItem(BASE_KEY, e.target.value);
                } catch {
                  /* ignore */
                }
              }}
              className="mt-1 h-10 w-full rounded-lg border border-neutral-200 px-3 font-mono text-[13px] focus:border-[#1F6FEB] focus:outline-none"
              data-testid="anchor-base"
            />
          </label>
          <label className="text-[13px] text-neutral-700">
            Link format
            <select value={style} onChange={(e) => setStyle(e.target.value as "query" | "hash")} className="mt-1 block h-10 rounded-lg border border-neutral-200 px-2 text-[13px]">
              <option value="query">?anchor=ID (web deployment)</option>
              <option value="hash">#ID (claude.ai artifact)</option>
            </select>
          </label>
          <span className="text-[12px] text-neutral-500">Print with your browser&apos;s print command (Ctrl/Cmd + P).</span>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 print:grid-cols-2 print:gap-3">
        {ANCHORS.map((a) => (
          <article key={a.id} className="break-inside-avoid rounded-2xl border border-neutral-300 p-4 print:rounded-none" data-testid="anchor-card">
            <div className="flex gap-4">
              <div className="h-[132px] w-[132px] shrink-0" aria-label={`QR code for ${a.id}`} dangerouslySetInnerHTML={{ __html: svgs[a.id] ?? "" }} />
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">TRSM Indoor Navigator · prototype</div>
                <div className="mt-1 text-[17px] font-semibold leading-tight">You are here</div>
                <div className="mt-0.5 text-[14px] text-neutral-800">{a.label}</div>
                <div className="text-[13px] text-neutral-600">{FLOOR_LEVEL[a.floor]}th floor</div>
                <div className="mt-2 font-mono text-[12px] text-neutral-700">{a.id}</div>
                <div className="mt-1 break-all font-mono text-[10px] text-neutral-400">{base ? anchorLink(base, a.id, style) : ""}</div>
              </div>
            </div>
            <div className="mt-3 h-28 overflow-hidden rounded-lg border border-neutral-200 print:h-24">
              <SvgFloor floor={a.floor} interactive={false} showNumbers={false} position={{ floor: a.floor, p: [a.x, a.y], heading: null, uncertainty: 0, source: "qr" }} />
            </div>
            <p className="mt-2 text-[10.5px] leading-snug text-neutral-500">Scan with your phone camera. Independent student prototype, not an official TMU sign. Status: {a.status}. Plan position ({a.x.toFixed(0)}, {a.y.toFixed(0)}).</p>
          </article>
        ))}
      </div>
    </div>
  );
}
