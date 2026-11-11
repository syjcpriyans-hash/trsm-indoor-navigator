/**
 * Real-world scale calibration.
 *
 * The source plans state "MAP IS NOT TO SCALE", so plan units cannot be converted to metres
 * from the drawings. An administrator measures one or more known distances on site and enters
 * them on /inspect; the resulting metres-per-plan-unit factor is stored locally (and can be
 * exported into the dataset). Until then the UI shows no distances or times.
 */
export interface CalibrationSample {
  floor: string;
  a: [number, number];
  b: [number, number];
  meters: number;
}

export interface Calibration {
  metersPerUnit: number | null;
  samples: CalibrationSample[];
  /** Rotation from plan-north (up on the drawings) to magnetic north, degrees; null = unknown. */
  planNorthOffsetDeg: number | null;
}

const KEY = "trsm.calibration.v1";
export const EMPTY_CALIBRATION: Calibration = { metersPerUnit: null, samples: [], planNorthOffsetDeg: null };

export function loadCalibration(): Calibration {
  if (typeof window === "undefined") return EMPTY_CALIBRATION;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY_CALIBRATION;
    const c = JSON.parse(raw) as Calibration;
    return { ...EMPTY_CALIBRATION, ...c };
  } catch {
    return EMPTY_CALIBRATION;
  }
}

export function saveCalibration(c: Calibration) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* storage unavailable (private mode) — calibration stays in memory */
  }
}

export function metersPerUnitFromSamples(samples: CalibrationSample[]): number | null {
  const valid = samples.filter((s) => s.meters > 0 && Math.hypot(s.a[0] - s.b[0], s.a[1] - s.b[1]) > 5);
  if (!valid.length) return null;
  const ratios = valid.map((s) => s.meters / Math.hypot(s.a[0] - s.b[0], s.a[1] - s.b[1]));
  return ratios.reduce((a, b) => a + b, 0) / ratios.length;
}

/** Spread between samples, as a fraction — large values show the plan's non-uniform scale. */
export function calibrationSpread(samples: CalibrationSample[]): number | null {
  const valid = samples.filter((s) => s.meters > 0);
  if (valid.length < 2) return null;
  const r = valid.map((s) => s.meters / Math.hypot(s.a[0] - s.b[0], s.a[1] - s.b[1]));
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  return (Math.max(...r) - Math.min(...r)) / mean;
}

export function formatDistance(units: number, mpu: number | null): string | null {
  if (!mpu) return null;
  const m = units * mpu;
  if (m < 10) return `${Math.max(1, Math.round(m))} m`;
  return `${Math.round(m / 5) * 5} m`;
}

/** Walking estimate: 1.2 m/s plus 45 s per elevator ride (assumptions, shown as approximate). */
export function formatTime(units: number, transitions: number, mpu: number | null): string | null {
  if (!mpu) return null;
  const s = (units * mpu) / 1.2 + transitions * 45;
  const min = Math.max(1, Math.round(s / 60));
  return `${min} min`;
}
