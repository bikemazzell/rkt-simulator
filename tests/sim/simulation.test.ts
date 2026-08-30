import { describe, it, expect } from 'vitest';
import { Simulation } from '../../src/sim/simulation';
import { makeTestConfig } from './fixtures';
import type { FlightPhase } from '../../src/sim/types';

function runToCompletion(sim: Simulation, maxSteps = 200000): void {
  let n = 0;
  while (!sim.done && n < maxSteps) { sim.step(); n++; }
}

function firstNominalSeed(): number {
  for (let seed = 0; seed < 100; seed++) {
    const sim = new Simulation(makeTestConfig({ seed }));
    runToCompletion(sim);
    if (sim.state.outcome === 'nominal') return seed;
  }
  throw new Error('no nominal flight found in 100 seeds');
}

describe('Simulation', () => {
  it('rises off the pad (does not land at ignition)', () => {
    const sim = new Simulation(makeTestConfig());
    for (let i = 0; i < 300; i++) sim.step(); // ~2.5 s
    expect(sim.state.liftedOff).toBe(true);
    expect(sim.state.apogee).toBeGreaterThan(1);
  });

  it('visits boost -> coast -> apogee -> descent in that exact order, then terminates', () => {
    const sim = new Simulation(makeTestConfig());
    const seq: FlightPhase[] = [];
    let n = 0;
    while (!sim.done && n < 200000) {
      sim.step();
      if (seq[seq.length - 1] !== sim.state.phase) seq.push(sim.state.phase);
      n++;
    }
    const order: FlightPhase[] = ['boost', 'coast', 'apogee', 'descent'];
    let idx = 0;
    for (const p of seq) if (p === order[idx]) idx++;
    expect(idx).toBe(order.length);            // all four appeared, in order
    expect(sim.done).toBe(true);
    expect(['landed', 'failed']).toContain(sim.state.phase);
  });

  it('a nominal flight deploys the chute and lands softly', () => {
    const sim = new Simulation(makeTestConfig({ seed: firstNominalSeed() }));
    runToCompletion(sim);
    expect(sim.state.chuteDeployed).toBe(true);
    expect(sim.state.phase).toBe('landed');
    expect(sim.state.position.y).toBeCloseTo(0, 1);
  });

  it('reaches a plausible apogee for a C6 on a light rocket', () => {
    const sim = new Simulation(makeTestConfig());
    runToCompletion(sim);
    expect(sim.state.apogee).toBeGreaterThan(30);
    expect(sim.state.apogee).toBeLessThan(600);
  });

  it('is deterministic for a fixed seed', () => {
    const a = new Simulation(makeTestConfig({ seed: 9 }));
    const b = new Simulation(makeTestConfig({ seed: 9 }));
    runToCompletion(a); runToCompletion(b);
    expect(a.state.apogee).toBe(b.state.apogee);
    expect(a.summary().driftDistanceM).toBe(b.summary().driftDistanceM);
  });

  it('bigger total impulse yields higher apogee', () => {
    const base = makeTestConfig();
    const small = new Simulation(base);
    const bigMotor = { ...base.motor, totalImpulseNs: 20, avgThrustN: 12, burnTimeS: 1.667 };
    const big = new Simulation(makeTestConfig({
      motor: bigMotor,
      rocket: { ...base.rocket, maxMotorImpulseNs: 25 },
    }));
    runToCompletion(small); runToCompletion(big);
    expect(big.state.apogee).toBeGreaterThan(small.state.apogee);
  });

  it('a too-short ejection delay lowers apogee via early chute drag', () => {
    const base = makeTestConfig({ seed: 4 });
    const early = new Simulation({ ...base, motor: { ...base.motor, delayS: 0 } });
    const proper = new Simulation({ ...base, motor: { ...base.motor, delayS: 5 } });
    runToCompletion(early); runToCompletion(proper);
    if (early.state.chuteDeployed && proper.state.chuteDeployed) {
      expect(early.state.apogee).toBeLessThanOrEqual(proper.state.apogee);
    }
  });

  it('a tumble-recovery rocket (no chute) can still land softly', () => {
    const rocket = { ...makeTestConfig().rocket, massEmptyKg: 0.013, chuteDiameterM: 0 };
    for (let seed = 0; seed < 100; seed++) {
      const sim = new Simulation(makeTestConfig({ seed, rocket }));
      runToCompletion(sim);
      if (sim.state.outcome === 'nominal') {
        expect(sim.state.phase).toBe('landed');
        expect(sim.state.impactSpeed).toBeLessThanOrEqual(15);
        return;
      }
    }
    throw new Error('no nominal tumble-recovery flight found in 100 seeds');
  });

  it('a motor that cannot lift the rocket fails without an infinite loop', () => {
    const heavy = makeTestConfig({
      rocket: { ...makeTestConfig().rocket, massEmptyKg: 5 }, // absurdly heavy -> TWR < 1
    });
    const sim = new Simulation(heavy);
    runToCompletion(sim);
    expect(sim.done).toBe(true);
    expect(sim.state.phase).toBe('failed');
    expect(sim.state.liftedOff).toBe(false);
  });
});
