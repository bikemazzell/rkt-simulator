// Pure day/night cycle math. Phase in [0,1): 0.0 sunrise, 0.25 noon, 0.5
// sunset, 0.75 midnight. The sun travels a tilted great circle; the moon rides
// the exact opposite side. All colors are hex ints. No three.js imports.

export const DAY_LENGTH_SEC = 240;
export const DEFAULT_START_PHASE = 0.1;

/** Current cycle phase in [0,1) for a start phase and elapsed seconds. */
export function phaseAt(startPhase: number, elapsed: number): number {
  return (((startPhase + elapsed / DAY_LENGTH_SEC) % 1) + 1) % 1;
}

export interface SkyVec { x: number; y: number; z: number; }
export interface SkyColors { top: number; horizon: number; }
export interface LightLevels { hemi: number; sun: number; moon: number; }

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

export function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (lerpChannel(ar, br, t) << 16) | (lerpChannel(ag, bg, t) << 8) | lerpChannel(ab, bb, t);
}

/** Signed sun elevation: sin of the orbital angle. >0 = day, <0 = night. */
export function sunElevation(phase: number): number {
  return Math.sin(phase * Math.PI * 2);
}

const SUN_TILT_Z = 0.3;

export function sunDirection(phase: number): SkyVec {
  const a = phase * Math.PI * 2;
  const v = { x: Math.cos(a), y: Math.sin(a), z: SUN_TILT_Z };
  const len = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

export function moonDirection(phase: number): SkyVec {
  const s = sunDirection(phase);
  return { x: -s.x, y: -s.y, z: -s.z };
}

interface SkyKey { phase: number; top: number; horizon: number; }

// Keyframed sky palette around the cycle (wraps at 1.0 -> 0.0).
const SKY_KEYS: SkyKey[] = [
  { phase: 0.0, top: 0x2e4a6b, horizon: 0xff9a5a }, // sunrise
  { phase: 0.07, top: 0x5fa8dc, horizon: 0xcfe8f5 }, // morning
  { phase: 0.25, top: 0x4a9fe0, horizon: 0xbfe3f2 }, // noon
  { phase: 0.43, top: 0x5fa8dc, horizon: 0xcfe8f5 }, // afternoon
  { phase: 0.5, top: 0x35507a, horizon: 0xff7a3c }, // sunset
  { phase: 0.57, top: 0x1a244a, horizon: 0x8a4a5a }, // dusk
  { phase: 0.75, top: 0x05070f, horizon: 0x0d1224 }, // midnight
  { phase: 0.93, top: 0x101828, horizon: 0x1a2030 }, // pre-dawn
];

export function skyColors(phase: number): SkyColors {
  const p = ((phase % 1) + 1) % 1;
  let a = SKY_KEYS[SKY_KEYS.length - 1];
  let b = SKY_KEYS[0];
  let span = 1 - a.phase + b.phase; // wrap segment pre-dawn -> sunrise
  let t = (p - a.phase + 1) % 1;
  for (let i = 0; i < SKY_KEYS.length; i++) {
    const k = SKY_KEYS[i];
    const next = SKY_KEYS[(i + 1) % SKY_KEYS.length];
    const segLen = (i === SKY_KEYS.length - 1) ? 1 - k.phase + next.phase : next.phase - k.phase;
    const rel = p - k.phase;
    if (rel >= 0 && rel < segLen) {
      a = k; b = next; span = segLen; t = rel; break;
    }
  }
  const f = t / span;
  return { top: lerpColor(a.top, b.top, f), horizon: lerpColor(a.horizon, b.horizon, f) };
}

export function lightLevels(phase: number): LightLevels {
  const elev = sunElevation(phase);
  const day = clamp01(elev * 2.5);
  const night = clamp01(-elev * 4);
  return {
    hemi: 0.22 + 0.85 * day,
    sun: 1.25 * day,
    moon: 0.3 * night,
  };
}

export function starAlpha(phase: number): number {
  return clamp01((-sunElevation(phase) - 0.05) * 4);
}

/** Warm near the horizon, neutral white at altitude. */
export function sunColor(phase: number): number {
  const t = clamp01(sunElevation(phase) * 2);
  return lerpColor(0xffa050, 0xf5f5f0, t);
}
