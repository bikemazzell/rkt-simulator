import type { Vec3, Wind } from './types';
import { vec } from './vec';
import { randRange, type Rng } from './rng';

const SEA_LEVEL_DENSITY = 1.225; // kg/m^3
const SCALE_HEIGHT = 8500;       // m, exponential atmosphere approximation

export function airDensity(altitudeM: number): number {
  const h = Math.max(0, altitudeM);
  return SEA_LEVEL_DENSITY * Math.exp(-h / SCALE_HEIGHT);
}

export function windAt(wind: Wind, rng: Rng): Vec3 {
  const gx = randRange(rng, -wind.gust, wind.gust);
  const gz = randRange(rng, -wind.gust, wind.gust);
  return vec(wind.base.x + gx, 0, wind.base.z + gz);
}
