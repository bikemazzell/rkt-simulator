// Pure weather selection: a weighted dice roll over the biome's weather
// weights. No three.js imports so the logic is unit-testable; the render side
// lives in weatherFx.ts.
import type { Rng } from '../sim/rng';
import type { WeatherWeights } from './biome';

export const WEATHER_KINDS = ['clear', 'rain', 'storm', 'snow'] as const;
export type WeatherKind = (typeof WEATHER_KINDS)[number];

export function isWeatherKind(v: string): v is WeatherKind {
  return (WEATHER_KINDS as readonly string[]).includes(v);
}

/** Weighted pick, deterministic per (weights, rng stream). Zero weights never win. */
export function pickWeather(weights: WeatherWeights, rng: Rng): WeatherKind {
  const entries: Array<[WeatherKind, number]> = [
    ['clear', weights.clear],
    ['rain', weights.rain],
    ['storm', weights.storm],
    ['snow', weights.snow],
  ];
  let total = 0;
  for (const [, w] of entries) total += Math.max(0, w);
  if (total <= 0) return 'clear'; // defensive: an all-zero biome stays calm
  let roll = rng() * total;
  for (const [kind, w] of entries) {
    roll -= Math.max(0, w);
    if (roll < 0) return kind;
  }
  return 'clear'; // floating-point edge: the roll landed exactly on total
}
