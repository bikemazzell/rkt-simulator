import { describe, it, expect } from 'vitest';
import { mulberry32, randRange, randInt } from '../../src/sim/rng';

describe('mulberry32', () => {
  it('is deterministic for a fixed seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('produces values in [0, 1)', () => {
    const r = mulberry32(1);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('different seeds diverge', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it('randRange and randInt stay in bounds', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 500; i++) {
      const f = randRange(r, 5, 10);
      expect(f).toBeGreaterThanOrEqual(5);
      expect(f).toBeLessThan(10);
      const n = randInt(r, 2, 4);
      expect([2, 3, 4]).toContain(n);
    }
  });
});
