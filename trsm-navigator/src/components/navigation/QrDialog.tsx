"use client";
import { useEffect, useRef, useState } from "react";
import { QrCode, X } from "lucide-react";
import { ANCHORS, FLOOR_LEVEL } from "@/data";
import { anchorIdFromScan, validateAnchorId } from "@/features/positioning/qr";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui";

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

export function QrDialog({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [cam, setCam] = useState<"off" | "starting" | "on" | "unavailable">("off");
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const hasDetector = typeof window !== "undefined" && "BarcodeDetector" in window;

  const apply = (raw: string) => {
    const id = anchorIdFromScan(raw) ?? raw;
    const v = validateAnchorId(id);
    if (!v.ok) {
      setErr(v.message);
      return;
    }
    const res = useApp.getState().applyAnchor(v.anchor.id);
    useApp.getState().setNotice(res.message);
    onClose();
  };

  useEffect(() => () => stream.current?.getTracks().forEach((t) => t.stop()), []);

  const startCam = async () => {
    if (!hasDetector || !navigator.mediaDevices?.getUserMedia) {
      setCam("unavailable");
      return;
    }
    setCam("starting");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (video.current) {
        video.current.srcObject = stream.current;
        await video.current.play();
      }
      setCam("on");
      const det = new (window as unknown as { BarcodeDetector: new (o: object) => Detector }).BarcodeDetector({ formats: ["qr_code"] });
      const loop = async () => {
        if (!stream.current || !video.current) return;
        try {
          const r = await det.detect(video.current);
          if (r[0]?.rawValue) {
            stream.current.getTracks().forEach((t) => t.stop());
            apply(r[0].rawValue);
            return;
          }
        } catch {
          /* keep scanning */
        }
        requestAnimationFrame(loop);
      };
      loop();
    } catch {
      setCam("unavailable");
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-neutral-900/30 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="qr-title">
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-md sm:rounded-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 id="qr-title" className="text-[17px] font-semibold text-neutral-900">Set your location with a QR code</h2>
            <p className="mt-1 text-[13px] leading-snug text-neutral-600">Scanning a TRSM positioning code places you exactly at that spot. Rescan another code any time to correct your position.</p>
          </div>
          <button aria-label="Close" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full text-neutral-500 hover:bg-neutral-100">
            <X size={20} />
          </button>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl bg-neutral-900/95">
          {cam === "on" || cam === "starting" ? (
            <video ref={video} className="aspect-[4/3] w-full object-cover" playsInline muted />
          ) : (
            <div className="grid aspect-[4/3] place-items-center p-6 text-center">
              <div>
                <QrCode className="mx-auto text-white/80" size={36} />
                <p className="mt-2 text-[13px] text-white/80">
                  {cam === "unavailable"
                    ? "In-app scanning isn't available in this browser. Point your phone's camera app at the code instead: it opens this page at your location."
                    : "Use your phone's camera app, or scan here if your browser supports it."}
                </p>
                {cam === "off" && hasDetector && (
                  <Button variant="secondary" className="mt-3" onClick={startCam}>
                    Scan with camera
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            apply(code);
          }}
        >
          <input
            value={code}
            onChange={(e) => { setCode(e.target.value); setErr(null); }}
            placeholder="Code, e.g. TRSM-8-03"
            aria-label="Positioning code"
            data-testid="anchor-code"
            className="h-11 min-w-0 flex-1 rounded-xl border border-neutral-200 px-3 text-[15px] uppercase placeholder:normal-case focus:border-[#1F6FEB] focus:outline-none"
          />
          <Button variant="primary" type="submit">Set</Button>
        </form>
        {err && <p className="mt-2 text-[13px] text-red-700" role="alert" data-testid="anchor-error">{err}</p>}

        <details className="mt-4 rounded-xl border border-neutral-200 p-3">
          <summary className="cursor-pointer text-[13px] font-medium text-neutral-800">Testing without printed codes</summary>
          <p className="mt-2 text-[12px] text-neutral-500">Proposed anchor positions (not yet installed). Tap one to simulate scanning it.</p>
          <div className="mt-2 grid gap-1">
            {ANCHORS.map((a) => (
              <button key={a.id} data-testid={`sim-${a.id}`} onClick={() => apply(a.id)} className="flex items-center justify-between rounded-lg px-2 py-2 text-left text-[13px] hover:bg-neutral-50">
                <span className="text-neutral-800">{a.label}</span>
                <span className="font-mono text-[11px] text-neutral-500">{a.id} · {FLOOR_LEVEL[a.floor]}F</span>
              </button>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}
