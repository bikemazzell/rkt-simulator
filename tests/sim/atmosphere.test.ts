import { describe, it, expect } from 'vitest';
import { airDensity, windAt } from '../../src/sim/atmosphere';
import { mulberry32 } from '../../src/sim/rng';
import { vec } from '../../src/sim/vec';

describe('atmosphere', () => {
  it('has sea-level density near 1.225 kg/m^3', () => {
    expect(airDensity(0)).toBeCloseTo(1.225, 2);
  });
  it('density decreases with altitude', () => {
    expect(airDensity(1000)).toBeLessThan(airDensity(0));
    expect(airDensity(3000)).toBeLessThan(airDensity(1000));
    expect(airDensity(3000)).toBeGreaterThan(0);
  });
  it('windAt returns horizontal vectors near the base', () => {
    const rng = mulberry32(3);
    const wind = { base: vec(2, 0, 0), gust: 1 };
    for (let i = 0; i < 100; i++) {
      const w = windAt(wind, rng);
      expect(w.y).toBe(0);
      expect(Math.abs(w.x - 2)).toBeLessThanOrEqual(1);
      expect(Math.abs(w.z)).toBeLessThanOrEqual(1);
    }
  });
});
