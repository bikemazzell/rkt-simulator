import { describe, it, expect } from 'vitest';
import {
  DAY_LENGTH_SEC,
  sunElevation,
  sunDirection,
  moonDirection,
  skyColors,
  lightLevels,
  starAlpha,
  sunColor,
  phaseAt,
} from '../../src/world/daynight';

const ch = (hex: number, shift: number) => (hex >> shift) & 255;
const red = (h: number) => ch(h, 16);
const green = (h: number) => ch(h, 8);
const blue = (h: number) => ch(h, 0);

describe('daynight', () => {
  it('phaseAt advances with elapsed time and wraps within [0,1)', () => {
    expect(phaseAt(0.1, 0)).toBeCloseTo(0.1, 10);
    expect(phaseAt(0.1, DAY_LENGTH_SEC / 4)).toBeCloseTo(0.35, 10);
    // Full day elapsed -> back to the start phase.
    expect(phaseAt(0.1, DAY_LENGTH_SEC)).toBeCloseTo(0.1, 10);
    // Many days later still lands in [0,1).
    const p = phaseAt(0.3, DAY_LENGTH_SEC * 123.456);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThan(1);
  });

  it('phaseAt stays in [0,1) even with start phases at or beyond the wrap point', () => {
    for (const start of [0, 0.5, 0.999, 1, 7.25]) {
      const p = phaseAt(start, DAY_LENGTH_SEC * 0.13);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(1);
    }
    expect(phaseAt(0.9, DAY_LENGTH_SEC * 0.2)).toBeCloseTo(0.1, 10);
  });

  it('sun sits on the horizon at sunrise/sunset, peaks at noon, bottoms at midnight', () => {
    expect(sunElevation(0)).toBeCloseTo(0, 2);
    expect(sunElevation(0.5)).toBeCloseTo(0, 2);
    expect(sunElevation(0.25)).toBeCloseTo(1, 2);
    expect(sunElevation(0.75)).toBeCloseTo(-1, 2);
  });

  it('sun is above the horizon through the day half and below through the night half', () => {
    for (let i = 1; i < 50; i++) expect(sunElevation(i / 100)).toBeGreaterThan(0);      // (0, 0.5)
    for (let i = 51; i < 100; i++) expect(sunElevation(i / 100)).toBeLessThan(0);       // (0.5, 1)
  });

  it('sun/moon directions are normalized and opposite', () => {
    for (const p of [0, 0.13, 0.25, 0.4, 0.5, 0.62, 0.75, 0.9]) {
      const s = sunDirection(p);
      const m = moonDirection(p);
      expect(Math.hypot(s.x, s.y, s.z)).toBeCloseTo(1, 6);
      expect(Math.hypot(m.x, m.y, m.z)).toBeCloseTo(1, 6);
      expect(s.x + m.x).toBeCloseTo(0, 6);
      expect(s.y + m.y).toBeCloseTo(0, 6);
    }
  });

  it('noon sky is blue, midnight sky is dark', () => {
    const noon = skyColors(0.25);
    expect(blue(noon.top)).toBeGreaterThan(red(noon.top));
    const night = skyColors(0.75);
    expect(red(night.top) + green(night.top) + blue(night.top)).toBeLessThan(120);
    expect(red(night.horizon) + green(night.horizon) + blue(night.horizon)).toBeLessThan(160);
  });

  it('sunrise/sunset horizons are warm', () => {
    for (const p of [0.02, 0.48]) {
      const h = skyColors(p).horizon;
      expect(red(h)).toBeGreaterThan(blue(h));
    }
  });

  it('sky colors are continuous across the whole cycle (no keyframe jumps)', () => {
    let prev = skyColors(0);
    for (let i = 1; i <= 2000; i++) {
      const p = (i / 2000) % 1;
      const cur = skyColors(p);
      for (const [a, b] of [[prev.top, cur.top], [prev.horizon, cur.horizon]] as const) {
        expect(Math.abs(red(a) - red(b))).toBeLessThanOrEqual(6);
        expect(Math.abs(green(a) - green(b))).toBeLessThanOrEqual(6);
        expect(Math.abs(blue(a) - blue(b))).toBeLessThanOrEqual(6);
      }
      prev = cur;
    }
  });

  it('lights are bright at noon and dim at midnight, moon light appears at night', () => {
    const noon = lightLevels(0.25);
    const night = lightLevels(0.75);
    expect(noon.sun).toBeGreaterThan(night.sun);
    expect(noon.hemi).toBeGreaterThan(night.hemi);
    expect(night.sun).toBe(0);
    expect(night.moon).toBeGreaterThan(0);
    expect(noon.moon).toBe(0);
    for (let i = 0; i <= 100; i++) {
      const lv = lightLevels(i / 100);
      expect(lv.hemi).toBeGreaterThan(0);
      expect(lv.sun).toBeGreaterThanOrEqual(0);
      expect(lv.moon).toBeGreaterThanOrEqual(0);
    }
  });

  it('stars fade in only at night', () => {
    expect(starAlpha(0.25)).toBe(0);
    expect(starAlpha(0.75)).toBeGreaterThan(0.9);
    for (let i = 0; i <= 100; i++) {
      const a = starAlpha(i / 100);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
    }
  });

  it('sun color is warm near the horizon and neutral at noon', () => {
    expect(red(sunColor(0.02))).toBeGreaterThan(blue(sunColor(0.02)));
    expect(blue(sunColor(0.25))).toBeGreaterThanOrEqual(red(sunColor(0.25)) - 20);
  });

  it('exposes a positive day length constant', () => {
    expect(DAY_LENGTH_SEC).toBeGreaterThan(0);
  });
});
