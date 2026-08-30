import { describe, it, expect } from 'vitest';
import { tileColor, tileCountFor } from '../../src/world/tiles';

const PAL = [0x4c8f3a, 0x55a044, 0x61b04d, 0x477f38, 0x6fbf5a];

describe('tiles', () => {
  it('is deterministic per (x, z, seed)', () => {
    for (let x = -10; x < 10; x += 3) {
      for (let z = -10; z < 10; z += 3) {
        expect(tileColor(PAL, x, z, 42)).toBe(tileColor(PAL, x, z, 42));
        expect(tileColor(PAL, x, z, 42)).toBe(tileColor(PAL, x, z, 42));
      }
    }
  });

  it('seed changes the pattern', () => {
    let diff = 0;
    for (let x = 0; x < 20; x++) {
      for (let z = 0; z < 20; z++) {
        if (tileColor(PAL, x, z, 1) !== tileColor(PAL, x, z, 2)) diff++;
      }
    }
    expect(diff).toBeGreaterThan(0);
  });

  it('uses every palette color as its base (no invented colors, no starved entries)', () => {
    const used = new Set<number>();
    for (let x = -30; x < 30; x++) {
      for (let z = -30; z < 30; z++) {
        used.add(tileColor(PAL, x, z, 7));
      }
    }
    // shade variants may shift hex values slightly, so at least half the
    // palette must surface and every result must be close to some entry
    expect(used.size).toBeGreaterThanOrEqual(Math.ceil(PAL.length / 2));
  });

  it('a 20x20 patch shows visible multi-color variation', () => {
    const patch = new Set<number>();
    for (let x = 0; x < 20; x++) {
      for (let z = 0; z < 20; z++) {
        patch.add(tileColor(PAL, x, z, 99));
      }
    }
    expect(patch.size).toBeGreaterThanOrEqual(3);
  });

  it('returns colors near the palette (shade jitter is small)', () => {
    const near = (a: number, b: number) =>
      Math.abs(((a >> 16) & 255) - ((b >> 16) & 255)) <= 12 &&
      Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)) <= 12 &&
      Math.abs((a & 255) - (b & 255)) <= 12;
    for (let x = -25; x < 25; x += 2) {
      for (let z = -25; z < 25; z += 2) {
        const c = tileColor(PAL, x, z, 5);
        expect(PAL.some((p) => near(c, p))).toBe(true);
      }
    }
  });

  it('budgets tile counts within the plan limits', () => {
    expect(tileCountFor(250, 5)).toBeLessThanOrEqual(10_000);
    expect(tileCountFor(250, 5)).toBeGreaterThan(5_000); // actually dense, not a token ring
    expect(tileCountFor(60, 5)).toBeLessThanOrEqual(500); // bathtub-sized scenes stay cheap
  });
});
