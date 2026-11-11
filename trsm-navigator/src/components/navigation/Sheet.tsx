"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useApp } from "@/lib/store";

/** Fixed panel: a bottom card on phones, a sidebar on large screens. It never drags or scrolls the page. */
export function Panel({ children, footer, top, maxH = "52dvh" }: { children: ReactNode; footer?: ReactNode; top?: ReactNode; maxH?: string }) {
  const [desktop, setDesktop] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const setPanelH = useApp((s) => s.setPanelH);

  useEffect(() => {
    const on = () => setDesktop(window.innerWidth >= 1024);
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || desktop) return;
    const ro = new ResizeObserver(() => setPanelH(el.getBoundingClientRect().height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [desktop, setPanelH]);

  if (desktop) {
    return (
      <aside className="pointer-events-auto absolute bottom-4 left-4 top-4 z-30 flex w-[400px] flex-col overflow-hidden rounded-[22px] border border-black/[0.06] bg-white shadow-[0_10px_40px_rgba(16,24,40,0.12)]" data-testid="panel">
        {top}
        <div className="scroll-y min-h-0 flex-1 px-5 pb-5 pt-4">{children}</div>
        {footer && <div className="shrink-0 border-t border-neutral-100 bg-white px-5 py-3">{footer}</div>}
      </aside>
    );
  }
  return (
    <section
      ref={ref}
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-[22px] bg-white shadow-[0_-8px_30px_rgba(16,24,40,0.12)]"
      style={{ maxHeight: maxH, paddingBottom: "max(10px, env(safe-area-inset-bottom))" }}
      data-testid="panel"
      aria-label="Navigation panel"
    >
      <div className="scroll-y min-h-0 flex-1 px-4 pb-3 pt-4">{children}</div>
      {footer && <div className="shrink-0 border-t border-neutral-100 px-4 pt-3">{footer}</div>}
    </section>
  );
}
