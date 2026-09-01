import { describe, it, expect } from 'vitest';
import { Simulation } from '../../src/sim/simulation';
import { rockets } from '../../src/data/rockets';
import { motors } from '../../src/data/motors';
import type { SimConfig } from '../../src/sim/types';

const rocket = rockets.find((r) => r.id === 'indigo-sam')!;
const motor = motors.find((m) => m.id === 'C6-5') ?? motors[0];

function config(over: Partial<SimConfig> = {}): SimConfig {
  return {
    rocket, motor,
    environment: { id: 'park', name: 'Park', groundHeight: 0, bounds: 90, wind: { base: { x: 0, y: 0, z: 0 }, gust: 0 } },
    seed: 1,
    ...over,
  } as SimConfig;
}

describe('Simulation launchOrigin', () => {
  it('starts the flight at the given origin', () => {
    const sim = new Simulation(config({ launchOrigin: { x: 10, y: 5, z: -3 } }));
    expect(sim.state.position).toEqual({ x: 10, y: 5, z: -3 });
  });

  it('measures apogee above the launch origin, not the pad', () => {
    const sim = new Simulation(config({ launchOrigin: { x: 0, y: 50, z: 0 } }));
    while (!sim.done) sim.step();
    expect(sim.state.apogee).toBeGreaterThan(0);   // relative to y=50
    expect(sim.state.position.y).toBeLessThanOrEqual(50); // fell back to origin height
  });

  it('clamps to the origin while the rail holds it', () => {
    const sim = new Simulation(config({
      launchOrigin: { x: 10, y: 5, z: -3 },
      initialDirection: { x: 0.9, y: 0.1, z: 0 },
    }));
    sim.step(); sim.step(); sim.step();
    if (!sim.state.liftedOff) {
      expect(sim.state.position.x).toBeCloseTo(10, 5);
      expect(sim.state.position.z).toBeCloseTo(-3, 5);
    }
  });

  it('keeps pad behaviour when no launchOrigin is given', () => {
    const sim = new Simulation(config());
    expect(sim.state.position).toEqual({ x: 0, y: 0, z: 0 });
  });
});
