import { describe, it, expect } from 'vitest';
import { Simulation } from '../../src/sim/simulation';
import { makeTestConfig } from './fixtures';
import { vec } from '../../src/sim/vec';

function runToCompletion(sim: Simulation, maxSteps = 200000): void {
  let n = 0;
  while (!sim.done && n < maxSteps) { sim.step(); n++; }
}

describe('Simulation terrain-aware landing', () => {
  it('drifting downwind lands on the hill it passes over', () => {
    const environment = { groundHeight: 0, wind: { base: vec(6, 0, 0), gust: 0 }, bounds: { radius: 500 } };
    const sim = new Simulation(makeTestConfig({
      environment,
      seed: 7,
      groundAt: (x: number) => (x > 15 ? 6 : 0),
    }));
    runToCompletion(sim);
    expect(sim.state.position.x).toBeGreaterThan(15);
    expect(sim.state.position.y).toBeCloseTo(6, 1);
  });

  it('drifting downwind into a valley lands below pad level, on the valley floor', () => {
    const environment = { groundHeight: 0, wind: { base: vec(6, 0, 0), gust: 0 }, bounds: { radius: 500 } };
    const sim = new Simulation(makeTestConfig({
      environment,
      seed: 7,
      groundAt: (x: number) => (x > 15 ? -6 : 0),
    }));
    runToCompletion(sim);
    expect(sim.state.position.x).toBeGreaterThan(15);
    expect(sim.state.position.y).toBeCloseTo(-6, 1);
  });

  it('falls back to pad ground when the sampler returns NaN', () => {
    const sim = new Simulation(makeTestConfig({ groundAt: () => NaN }));
    runToCompletion(sim);
    expect(sim.state.position.y).toBeCloseTo(0, 1);
  });

  it('apogee stays relative to the pad; terrain far from the pad cannot change it', () => {
    // No wind: the flight never reaches the hill at x > 15, so the trajectory
    // and apogee must match the sampler-less flat flight exactly.
    const hill = new Simulation(makeTestConfig({ seed: 5, groundAt: (x: number) => (x > 15 ? 60 : 0) }));
    const flat = new Simulation(makeTestConfig({ seed: 5 }));
    runToCompletion(hill); runToCompletion(flat);
    expect(hill.state.apogee).toBe(flat.state.apogee);
  });
});
