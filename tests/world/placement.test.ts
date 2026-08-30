import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../src/sim/rng';
import { scatterPositions, wanderTarget } from '../../src/world/placement';

describe('scatterPositions', () => {
  it('is deterministic for a given seed', () => {
    const a = scatterPositions(mulberry32(42), 50, { minR: 30, maxR: 250 });
    const b = scatterPositions(mulberry32(42), 50, { minR: 30, maxR: 250 });
    expect(a).toEqual(b);
  });

  it('changes pattern when the seed changes', () => {
    const a = scatterPositions(mulberry32(1), 50, { minR: 30, maxR: 250 });
    const b = scatterPositions(mulberry32(2), 50, { minR: 30, maxR: 250 });
    expect(a).not.toEqual(b);
  });

  it('keeps every point inside the annulus [minR, maxR]', () => {
    const pts = scatterPositions(mulberry32(7), 400, { minR: 30, maxR: 250 });
    for (const p of pts) {
      const r = Math.hypot(p.x, p.z);
      expect(r).toBeGreaterThanOrEqual(30 - 1e-6);
      expect(r).toBeLessThanOrEqual(250 + 1e-6);
    }
    expect(pts.length).toBe(400);
  });

  it('spreads points around the full ring (not one sector)', () => {
    const pts = scatterPositions(mulberry32(9), 400, { minR: 10, maxR: 100 });
    const quadrants = [0, 0, 0, 0];
    for (const p of pts) {
      const q = (p.x >= 0 ? 1 : 0) + (p.z >= 0 ? 2 : 0);
      quadrants[q]++;
    }
    for (const q of quadrants) expect(q).toBeGreaterThan(50);
  });

  it('concentrates density near the outer edge (uniform area, not radius)', () => {
    const pts = scatterPositions(mulberry32(11), 1000, { minR: 0, maxR: 100 });
    let outer = 0;
    for (const p of pts) if (Math.hypot(p.x, p.z) > 70) outer++;
    // Uniform-area scatter puts ~51% beyond 0.7R; a linear-radius scatter
    // would only put 30% there.
    expect(outer).toBeGreaterThan(450);
  });
});

describe('wanderTarget', () => {
  it('is deterministic for a given seed', () => {
    const from = { x: 10, z: -5 };
    expect(wanderTarget(mulberry32(3), from, 20)).toEqual(wanderTarget(mulberry32(3), from, 20));
  });

  it('never steps further than radius from the origin point', () => {
    const from = { x: 10, z: -5 };
    const rng = mulberry32(5);
    for (let i = 0; i < 200; i++) {
      const t = wanderTarget(rng, from, 20);
      expect(Math.hypot(t.x - from.x, t.z - from.z)).toBeLessThanOrEqual(20 + 1e-6);
    }
  });

  it('always moves a meaningful distance (>= radius/2)', () => {
    const from = { x: 0, z: 0 };
    const rng = mulberry32(13);
    for (let i = 0; i < 100; i++) {
      const t = wanderTarget(rng, from, 20);
      expect(Math.hypot(t.x - from.x, t.z - from.z)).toBeGreaterThanOrEqual(10 - 1e-6);
    }
  });
});
