import { describe, expect, it } from 'vitest';
import { makeHeightAt, terrainHeight, withEdgeFade, type TerrainProfile } from '../../src/world/heightmap';

const base: TerrainProfile = {
  seed: 12345,
  baseY: 10,
  amplitude: 12,
  step: 3,
  feature: 90,
  flatten: [],
};

describe('terrainHeight', () => {
  it('is deterministic per (profile, x, z)', () => {
    for (let x = -200; x <= 200; x += 37) {
      for (let z = -200; z <= 200; z += 41) {
        expect(terrainHeight(base, x, z)).toBe(terrainHeight(base, x, z));
      }
    }
  });

  it('varies with the seed', () => {
    const other = { ...base, seed: 54321 };
    let differs = false;
    for (let x = -150; x <= 150; x += 13) {
      for (let z = -150; z <= 150; z += 17) {
        if (terrainHeight(base, x, z) !== terrainHeight(other, x, z)) differs = true;
      }
    }
    expect(differs).toBe(true);
  });

  it('returns baseY plus exact multiples of the step (blocky terraces)', () => {
    for (let x = -300; x <= 300; x += 7) {
      for (let z = -300; z <= 300; z += 11) {
        const h = terrainHeight(base, x, z);
        const rel = h - base.baseY;
        expect(rel % base.step).toBe(0);
        expect(rel).toBeGreaterThanOrEqual(0);
        expect(rel).toBeLessThanOrEqual(base.amplitude + base.step); // rounding headroom only
      }
    }
  });

  it('produces several distinct levels across a patch', () => {
    const seen = new Set<number>();
    for (let x = -250; x <= 250; x += 5) {
      for (let z = -250; z <= 250; z += 5) seen.add(terrainHeight(base, x, z));
    }
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });

  it('collapses to the base plane when amplitude is zero', () => {
    const flat = { ...base, amplitude: 0 };
    for (let x = -100; x <= 100; x += 9) {
      for (let z = -100; z <= 100; z += 13) {
        expect(terrainHeight(flat, x, z)).toBe(base.baseY);
      }
    }
  });

  it('is exactly the disc height inside a flatten disc core', () => {
    const p: TerrainProfile = {
      ...base,
      flatten: [{ x: 100, z: -60, r: 40, y: base.baseY }],
    };
    // Well inside the core (r/2): forced flat at the disc's y.
    for (const [dx, dz] of [[0, 0], [15, 0], [0, -15], [10, 10]] as const) {
      expect(terrainHeight(p, 100 + dx, -60 + dz)).toBe(base.baseY);
    }
  });

  it('leaves terrain untouched outside a flatten disc', () => {
    const p: TerrainProfile = {
      ...base,
      flatten: [{ x: 100, z: -60, r: 40, y: base.baseY }],
    };
    for (let x = -200; x <= 200; x += 23) {
      for (let z = -200; z <= 200; z += 29) {
        if (Math.hypot(x - 100, z + 60) <= 40) continue;
        expect(terrainHeight(p, x, z)).toBe(terrainHeight(base, x, z));
      }
    }
  });

  it('blend zone stays between the disc height and the raw terrain', () => {
    const p: TerrainProfile = {
      ...base,
      flatten: [{ x: 0, z: 0, r: 60, y: base.baseY }],
    };
    let sawBlend = false;
    for (let d = 31; d < 60; d += 2) {
      const raw = terrainHeight(base, d, 0);
      const blended = terrainHeight(p, d, 0);
      if (raw !== base.baseY) {
        expect(blended).toBeGreaterThanOrEqual(Math.min(base.baseY, raw));
        expect(blended).toBeLessThanOrEqual(Math.max(base.baseY, raw));
        if (blended !== raw && blended !== base.baseY) sawBlend = true;
      }
    }
    expect(sawBlend).toBe(true);
  });
});

describe('makeHeightAt', () => {
  it('returns a closure matching terrainHeight', () => {
    const h = makeHeightAt(base);
    for (let x = -100; x <= 100; x += 17) {
      for (let z = -100; z <= 100; z += 19) {
        expect(h(x, z)).toBe(terrainHeight(base, x, z));
      }
    }
  });
});

describe('withEdgeFade', () => {
  const raw = makeHeightAt(base);
  const faded = withEdgeFade(raw, base.baseY, 175, 250);

  it('leaves the inner field untouched inside fadeStart', () => {
    for (const [x, z] of [[0, 0], [100, 60], [-170, 0], [0, -174]] as const) {
      expect(faded(x, z)).toBe(raw(x, z));
    }
  });

  it('collapses exactly to baseY at and beyond fadeEnd (no cliff ring)', () => {
      for (const [x, z] of [[250, 0], [-250, 0], [0, 250], [178, 178], [400, 0]] as const) {
      expect(faded(x, z)).toBe(base.baseY);
    }
  });

  it('blends monotonically between raw and baseY in the fade band', () => {
    let sawPartial = false;
    for (let d = 176; d < 250; d += 3) {
      const inner = raw(d, 0);
      if (inner === base.baseY) continue;
      const v = faded(d, 0);
      expect(v).toBeGreaterThanOrEqual(Math.min(base.baseY, inner));
      expect(v).toBeLessThanOrEqual(Math.max(base.baseY, inner));
      if (v !== inner && v !== base.baseY) sawPartial = true;
    }
    expect(sawPartial).toBe(true);
  });
});
