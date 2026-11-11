/**
 * EXPERIMENTAL motion-assisted positioning.
 *
 * Uses the accelerometer to count steps and (optionally) the compass for heading. It does NOT
 * know where you are on its own: it only advances an estimate along the active route from a
 * known starting point (a QR anchor or a manually set location), and its uncertainty grows
 * with every step. Turning the phone never moves the position — only detected steps do.
 */

export type SensorStatus = "idle" | "requesting" | "active" | "denied" | "unsupported" | "error";

export interface StepDetectorOptions {
  /** m/s² above the running mean that counts as a step peak */
  threshold?: number;
  /** fastest plausible cadence (≈3.5 steps/s) */
  minIntervalMs?: number;
}

/**
 * Peak-based step detector on |acceleration including gravity|. Pure and testable:
 * feed (magnitude, timestampMs) samples, it returns true when a step is detected.
 */
export function createStepDetector(opts: StepDetectorOptions = {}) {
  const threshold = opts.threshold ?? 1.6;
  const minInterval = opts.minIntervalMs ?? 280;
  let mean = 9.81;
  let filtered = 9.81;
  let lastStep = -Infinity;
  let armed = true; // must dip below the mean between peaks
  return {
    push(mag: number, t: number): boolean {
      mean = mean * 0.98 + mag * 0.02;
      filtered = filtered * 0.6 + mag * 0.4;
      const dev = filtered - mean;
      if (dev < threshold * 0.25) armed = true;
      if (armed && dev > threshold && t - lastStep > minInterval) {
        armed = false;
        lastStep = t;
        return true;
      }
      return false;
    },
    reset() {
      mean = 9.81;
      filtered = 9.81;
      lastStep = -Infinity;
      armed = true;
    },
  };
}

type PermissionFn = () => Promise<"granted" | "denied" | "default">;

export function motionSupport(): { motion: boolean; orientation: boolean; needsPermission: boolean } {
  if (typeof window === "undefined") return { motion: false, orientation: false, needsPermission: false };
  const DME = (window as unknown as { DeviceMotionEvent?: { requestPermission?: PermissionFn } }).DeviceMotionEvent;
  const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: PermissionFn } }).DeviceOrientationEvent;
  return {
    motion: !!DME,
    orientation: !!DOE,
    needsPermission: typeof DME?.requestPermission === "function" || typeof DOE?.requestPermission === "function",
  };
}

export interface MotionCallbacks {
  onStep: () => void;
  onHeading: (deg: number | null) => void;
  onStatus: (s: SensorStatus, message?: string) => void;
}

/** Must be called from a user gesture (button tap) so iOS can show its permission prompt. */
export async function startMotion(cb: MotionCallbacks): Promise<() => void> {
  const sup = motionSupport();
  if (!sup.motion) {
    cb.onStatus("unsupported", "This browser doesn't expose motion sensors. Use a QR code or set your location on the map.");
    return () => {};
  }
  cb.onStatus("requesting");
  try {
    const w = window as unknown as {
      DeviceMotionEvent: { requestPermission?: PermissionFn };
      DeviceOrientationEvent: { requestPermission?: PermissionFn };
    };
    if (typeof w.DeviceMotionEvent.requestPermission === "function") {
      const r = await w.DeviceMotionEvent.requestPermission();
      if (r !== "granted") {
        cb.onStatus("denied", "Motion access was declined. You can still use QR codes or set your location manually.");
        return () => {};
      }
    }
    if (typeof w.DeviceOrientationEvent?.requestPermission === "function") {
      await w.DeviceOrientationEvent.requestPermission().catch(() => "denied");
    }
  } catch {
    cb.onStatus("denied", "Motion access couldn't be requested. Open the site over HTTPS and try again.");
    return () => {};
  }

  const det = createStepDetector();
  let gotSample = false;
  const onMotion = (e: DeviceMotionEvent) => {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null || a.y == null || a.z == null) return;
    gotSample = true;
    const mag = Math.hypot(a.x, a.y, a.z);
    if (det.push(mag, e.timeStamp || performance.now())) cb.onStep();
  };
  const onOrient = (e: DeviceOrientationEvent & { webkitCompassHeading?: number }) => {
    if (typeof e.webkitCompassHeading === "number") cb.onHeading(e.webkitCompassHeading);
    else if (e.absolute && e.alpha != null) cb.onHeading((360 - e.alpha) % 360);
  };
  window.addEventListener("devicemotion", onMotion);
  const orientEvt = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
  window.addEventListener(orientEvt, onOrient as EventListener);
  const timer = window.setTimeout(() => {
    if (!gotSample) cb.onStatus("unsupported", "No motion data arrived from this device. Use a QR code or set your location on the map.");
  }, 2500);
  cb.onStatus("active");
  return () => {
    window.clearTimeout(timer);
    window.removeEventListener("devicemotion", onMotion);
    window.removeEventListener(orientEvt, onOrient as EventListener);
  };
}
