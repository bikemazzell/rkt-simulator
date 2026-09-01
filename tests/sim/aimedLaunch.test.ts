import { describe, it, expect } from 'vitest';
import { Simulation } from '../../src/sim/simulation';
import { stepMotion } from '../../src/sim/integrator';
import { makeTestConfig } from './fixtures';
import { aimDirection } from '../../src/sim/aim';
import { vec } from '../../src/sim/vec';

function runToCompletion(sim: Simulation, maxSteps = 400000): void {
  let n = 0;
  while (!sim.done && n < maxSteps) { sim.step(); n++; }
}

// Angle (deg) between the horizontal parts of two vectors, ignoring magnitude.
function horizontalAngleDeg(a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dot = a.x * b.x + a.z * b.z;
  const magA = Math.hypot(a.x, a.z);
  const magB = Math.hypot(b.x, b.z);
  if (magA === 0 || magB === 0) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot / (magA * magB)))) * 180 / Math.PI;
}

describe('aimed launch', () => {
  it('integrator thrusts along thrustDirection (normalized), gravity still down', () => {
    const r = stepMotion({
      position: vec(0, 0, 0), velocity: vec(0, 0, 0), mass: 1,
      thrustN: 10, refArea: 0, dragCoefficient: 0, wind: vec(0, 0, 0), dt: 0.1,
      thrustDirection: vec(2, 0, 0), // non-unit on purpose
    });
    expect(r.velocity.x).toBeCloseTo(1, 6);      // 10 * 1 * 0.1
    expect(r.velocity.y).toBeCloseTo(-0.981, 6); // -9.81 * 0.1
    expect(r.velocity.z).toBeCloseTo(0, 6);
  });

  it('integrator falls back to straight up for zero or NaN thrustDirection', () => {
    const base = { position: vec(0, 0, 0), velocity: vec(0, 0, 0), mass: 1, thrustN: 10, refArea: 0, dragCoefficient: 0, wind: vec(0, 0, 0), dt: 0.1 };
    const zero = stepMotion({ ...base, thrustDirection: vec(0, 0, 0) });
    const nan = stepMotion({ ...base, thrustDirection: vec(NaN, NaN, NaN) });
    const up = stepMotion({ ...base, thrustDirection: vec(0, 1, 0) });
    expect(zero.velocity.y).toBeCloseTo(up.velocity.y, 9);
    expect(nan.velocity.y).toBeCloseTo(up.velocity.y, 9);
    expect(zero.velocity.x).toBeCloseTo(0, 9);
    expect(nan.velocity.x).toBeCloseTo(0, 9);
  });

  it('a 45° aim (toward +X) flies a downrange arc: drift matches aimDirection, apogee drops', () => {
    const aim = { x: 0, y: 0, z: -45 };
    const dir = aimDirection(aim); // unit: (+0.707, +0.707, 0)
    expect(dir.x).toBeGreaterThan(0.7);
    const aimed = new Simulation(makeTestConfig({ seed: 123, initialDirection: dir }));
    const straight = new Simulation(makeTestConfig({ seed: 123 }));
    runToCompletion(aimed); runToCompletion(straight);
    expect(aimed.state.position.x).toBeGreaterThan(15);
    expect(horizontalAngleDeg(aimed.state.position, dir)).toBeLessThan(15);
    expect(aimed.state.apogee).toBeGreaterThan(0);
    expect(aimed.state.apogee).toBeLessThan(straight.state.apogee);
  });

  it('a 90° horizontal aim never leaves the pad: frozen on it, tip-off outcome, zero drift', () => {
    const dir = aimDirection({ x: 0, y: 0, z: 90 }); // (-1, 0, 0)
    const sim = new Simulation(makeTestConfig({ seed: 123, initialDirection: dir }));
    runToCompletion(sim);
    expect(sim.state.phase).toBe('failed');
    expect(sim.state.outcome).toBe('tip-off');
    expect(sim.state.position.x).toBeCloseTo(0, 6);
    expect(sim.state.position.z).toBeCloseTo(0, 6);
    expect(sim.state.position.y).toBeCloseTo(0, 6);
    expect(sim.summary().driftDistanceM).toBeCloseTo(0, 6);
  });

  it('explicit straight-up direction is bit-identical to no direction at all', () => {
    const explicit = new Simulation(makeTestConfig({ seed: 5, initialDirection: vec(0, 1, 0) }));
    const absent = new Simulation(makeTestConfig({ seed: 5 }));
    runToCompletion(explicit); runToCompletion(absent);
    expect(explicit.state.apogee).toBe(absent.state.apogee);
    expect(explicit.state.time).toBe(absent.state.time);
    expect(explicit.summary().driftDistanceM).toBe(absent.summary().driftDistanceM);
  });

  it('a NaN direction falls back to straight up (same flight as baseline)', () => {
    const nan = new Simulation(makeTestConfig({ seed: 5, initialDirection: vec(NaN, NaN, NaN) }));
    const base = new Simulation(makeTestConfig({ seed: 5 }));
    runToCompletion(nan); runToCompletion(base);
    expect(nan.state.apogee).toBe(base.state.apogee);
    expect(nan.state.position.x).toBeCloseTo(base.state.position.x, 6);
  });
});
