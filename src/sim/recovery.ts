// Recovery-device physics helpers. The catalogue names devices in prose; this
// module resolves them (unspecified rockets roll one at ejection), computes the
// drag area each device needs to hit its target sink rate for the actual
// post-burnout mass, and picks the dominant (slowest-sinking) device of a combo.
import { mulberry32, type Rng } from './rng';
import type { RecoveryDevice, Rocket } from './types';

export const RECOVERY_DEVICES = ['parachute', 'streamer', 'tumble', 'glider', 'helicopter'] as const;

/** Weights for the "Random" roll on rockets whose copy names no device. */
export const RANDOM_WEIGHTS: readonly [RecoveryDevice, number][] = [
  ['parachute', 0.55],
  ['streamer', 0.20],
  ['tumble', 0.10],
  ['helicopter', 0.08],
  ['glider', 0.07],
];

// Target sink rates and drag coefficients per device. Areas are derived from
// A = 2mg / (rho * Cd * v_target^2) so every rocket, light or heavy, lands in
// the device's designed descent band rather than a fixed area that only fits
// one mass.
export const RHO = 1.225;
export const HELICOPTER_TARGET_SINK = 3.5; // m/s under autorotating blades
export const HELICOPTER_CD = 1.3;
export const STREAMER_TARGET_SINK = 9; // m/s under a fluttering ribbon
export const STREAMER_CD = 1.1;
export const GLIDER_SINK = 2.7; // m/s — scripted 3:1 glide at ~8 m/s
export const GLIDER_SPEED = 8; // m/s along the glide path
export const TUMBLE_AREA_FACTOR = 14; // body cross-section multiplier (kept from the original tumble model)

/** Resolve the devices that actually deploy. A named list is honoured; an
 *  unspecified rocket rolls a single device from the seeded rng. */
export function resolveRecovery(spec: RecoveryDevice[] | undefined, rng: Rng): RecoveryDevice[] {
  if (spec && spec.length > 0) return spec;
  let r = rng();
  for (const [device, weight] of RANDOM_WEIGHTS) {
    if ((r -= weight) <= 0) return [device];
  }
  return ['parachute'];
}

/** Independent rng stream for recovery rolls, so adding the ejection-time draw
 *  never shifts the shared flight-rng sequence (pinned seed tests stay put). */
export function recoveryRng(seed: number): Rng {
  return mulberry32((seed ^ 0x5eed) >>> 0);
}

export function chuteArea(rocket: Rocket): number {
  return Math.PI * (rocket.chuteDiameterM / 2) ** 2;
}

export function streamerArea(massKg: number): number {
  return (2 * massKg * 9.81) / (RHO * STREAMER_CD * STREAMER_TARGET_SINK ** 2);
}

export function helicopterArea(massKg: number): number {
  return (2 * massKg * 9.81) / (RHO * HELICOPTER_CD * HELICOPTER_TARGET_SINK ** 2);
}

export function tumbleArea(rocket: Rocket): number {
  // Inflated-body drag, floored so skinny BT-5-class bodies still tumble
  // survivably instead of falling ballistically through the crash threshold.
  return Math.max(Math.PI * (rocket.diameterM / 2) ** 2 * TUMBLE_AREA_FACTOR, 0.02);
}

/** Steady-state sink rate of a device for a given rocket + current mass
 *  (parachute canopy scales with the catalogue diameter; the scripted glider
 *  and target-sink devices are constants by construction). */
export function deviceSink(device: RecoveryDevice, rocket: Rocket, massKg: number): number {
  switch (device) {
    case 'parachute':
      return rocket.chuteDiameterM > 0
        ? Math.sqrt((2 * massKg * 9.81) / (RHO * rocket.chuteCd * chuteArea(rocket)))
        : Infinity;
    case 'streamer': return STREAMER_TARGET_SINK;
    case 'helicopter': return HELICOPTER_TARGET_SINK;
    case 'glider': return GLIDER_SINK;
    case 'tumble':
      return Math.sqrt((2 * massKg * 9.81) / (RHO * rocket.chuteCd * tumbleArea(rocket)));
  }
}

/** The device that governs descent physics: the slowest sink rate at the
 *  post-burnout mass. All devices in the list still render. */
export function dominantDevice(devices: RecoveryDevice[], rocket: Rocket, massKg: number): RecoveryDevice {
  return devices.reduce((best, d) =>
    deviceSink(d, rocket, massKg) < deviceSink(best, rocket, massKg) ? d : best);
}
