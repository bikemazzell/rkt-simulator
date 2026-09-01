import { describe, expect, it } from 'vitest';
import { rocketFrame } from '../../src/world/scene';

describe('rocketFrame (adaptive preview camera)', () => {
  it('keeps the default framing when no height hint is given', () => {
    const f = rocketFrame(undefined);
    expect(f.pos.x).toBeCloseTo(-3.5, 6);
    expect(f.pos.y).toBeCloseTo(1.7, 6);
    expect(f.pos.z).toBeCloseTo(6.5, 6);
    expect(f.target.x).toBeCloseTo(1.2, 6);
    expect(f.target.y).toBeCloseTo(0.8, 6);
  });

  it('pulls the camera closer for a small rocket along the same direction', () => {
    const f = rocketFrame(0.5); // 0.5 m rocket -> 4 m orbit
    const d = Math.hypot(f.pos.x - f.target.x, f.pos.y - f.target.y, f.pos.z - f.target.z);
    expect(d).toBeCloseTo(4, 3);
    // same azimuth/elevation as the default view
    const def = rocketFrame(undefined);
    const dirF = [f.pos.x - f.target.x, f.pos.y - f.target.y, f.pos.z - f.target.z];
    const dirD = [def.pos.x - def.target.x, def.pos.y - def.target.y, def.pos.z - def.target.z];
    const dot = dirF.reduce((a, v, i) => a + v * dirD[i], 0) /
      (Math.hypot(...dirF) * Math.hypot(...dirD));
    expect(dot).toBeGreaterThan(0.9999);
  });

  it('clamps the orbit distance at both ends', () => {
    const near = rocketFrame(0.05); // 0.4 m -> clamped to 2.2
    const far = rocketFrame(2.05); // 16.4 m -> clamped to 7.6
    const dNear = Math.hypot(near.pos.x - near.target.x, near.pos.y - near.target.y, near.pos.z - near.target.z);
    const dFar = Math.hypot(far.pos.x - far.target.x, far.pos.y - far.target.y, far.pos.z - far.target.z);
    expect(dNear).toBeCloseTo(2.2, 3);
    expect(dFar).toBeCloseTo(7.6, 3);
  });
});
