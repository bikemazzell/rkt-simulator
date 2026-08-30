import { describe, it, expect } from 'vitest';
import { thrustAt, integrateImpulse } from '../../src/sim/thrustCurve';
import type { Motor } from '../../src/sim/types';

const c6: Motor = {
  id: 'C6-5', class: 'C', totalImpulseNs: 10, avgThrustN: 6, burnTimeS: 1.6,
  massTotalKg: 0.0258, massPropKg: 0.0108, delayS: 5,
};

describe('thrustCurve', () => {
  it('is zero outside the burn window', () => {
    expect(thrustAt(c6, -0.1)).toBe(0);
    expect(thrustAt(c6, c6.burnTimeS + 0.1)).toBe(0);
  });
  it('is non-negative throughout the burn', () => {
    for (let t = 0; t <= c6.burnTimeS; t += 0.01) {
      expect(thrustAt(c6, t)).toBeGreaterThanOrEqual(0);
    }
  });
  it('conserves total impulse within 1%', () => {
    const impulse = integrateImpulse(c6);
    expect(impulse).toBeCloseTo(c6.totalImpulseNs, 1);
    expect(Math.abs(impulse - c6.totalImpulseNs) / c6.totalImpulseNs).toBeLessThan(0.01);
  });
  it('conserves impulse even with a timestep that does not divide the burn', () => {
    const impulse = integrateImpulse(c6, 0.07); // 1.6 / 0.07 is non-integer
    expect(Math.abs(impulse - c6.totalImpulseNs) / c6.totalImpulseNs).toBeLessThan(0.02);
  });
  it('has a peak thrust above the average', () => {
    let peak = 0;
    for (let t = 0; t <= c6.burnTimeS; t += 0.005) peak = Math.max(peak, thrustAt(c6, t));
    expect(peak).toBeGreaterThan(c6.avgThrustN);
  });
});
