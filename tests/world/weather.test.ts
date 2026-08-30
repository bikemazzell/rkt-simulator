import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/sim/rng';
import { biomeFor } from '../../src/world/biome';
import { WEATHER_KINDS, isWeatherKind, pickWeather } from '../../src/world/weather';

describe('pickWeather', () => {
  it('is deterministic per seed', () => {
    for (const envId of ['park', 'mountain', 'sea', 'urban']) {
      const w = biomeFor(envId).weather;
      expect(pickWeather(w, mulberry32(42))).toBe(pickWeather(w, mulberry32(42)));
    }
  });

  it('only ever returns a known kind', () => {
    for (let seed = 0; seed < 200; seed++) {
      for (const envId of ['park', 'mountain', 'desert', 'sea']) {
        const kind = pickWeather(biomeFor(envId).weather, mulberry32(seed));
        expect(isWeatherKind(kind)).toBe(true);
        expect(WEATHER_KINDS).toContain(kind);
      }
    }
  });

  it('never picks zero-weight kinds (no snow in the desert, no storms either)', () => {
    const desert = biomeFor('desert').weather;
    for (let seed = 0; seed < 500; seed++) {
      const kind = pickWeather(desert, mulberry32(seed));
      expect(kind).not.toBe('snow');
      expect(kind).not.toBe('storm');
    }
  });

  it('respects the weights roughly across many seeds', () => {
    const mountain = biomeFor('mountain').weather;
    const counts: Record<string, number> = { clear: 0, rain: 0, storm: 0, snow: 0 };
    const N = 4000;
    for (let seed = 0; seed < N; seed++) counts[pickWeather(mountain, mulberry32(seed))]++;
    // Mountain weights: 0.5 / 0.1 / 0.05 / 0.35 — allow generous slack.
    expect(counts.clear / N).toBeGreaterThan(0.4);
    expect(counts.snow / N).toBeGreaterThan(0.25);
    expect(counts.storm / N).toBeLessThan(0.12);
  });

  it('falls back to clear when all weights are zero', () => {
    expect(pickWeather({ clear: 0, rain: 0, storm: 0, snow: 0 }, mulberry32(1))).toBe('clear');
  });

  it('honours a forced single kind', () => {
    expect(pickWeather({ clear: 0, rain: 1, storm: 0, snow: 0 }, mulberry32(3))).toBe('rain');
  });
});

describe('isWeatherKind', () => {
  it('accepts the four kinds and rejects anything else', () => {
    for (const k of WEATHER_KINDS) expect(isWeatherKind(k)).toBe(true);
    expect(isWeatherKind('sunny')).toBe(false);
    expect(isWeatherKind('')).toBe(false);
    expect(isWeatherKind('Rain')).toBe(false);
  });
});
