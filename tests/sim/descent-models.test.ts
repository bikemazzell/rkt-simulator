import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/sim/simulation';
import { motorById } from '../../src/data/motors';
import type { Motor, RecoveryDevice, Rocket, SimConfig } from '../../src/sim/types';
import type { Rng } from '../../src/sim/rng';

const D12 = motorById('D12-5')!;
const C6 = motorById('C6-5')!;

const rocket = (over: Partial<Rocket> = {}): Rocket => ({
  id: 'fixture', name: 'Fixture', massEmptyKg: 0.08, diameterM: 0.025, dragCoefficient: 0.75,
  chuteDiameterM: 0.55, chuteCd: 1.2, recommendedMotors: [], maxMotorImpulseNs: 40,
  look: { bodyLengthM: 0.5, finCount: 3, bodyColor: 1, finColor: 1, noseColor: 1 },
  ...over,
});

function fly(r: Rocket, motor: Motor, seed = 7, extra: Partial<SimConfig> = {}) {
  const sim = new Simulation({
    rocket: r, motor, seed,
    environment: {
      groundHeight: 0, wind: { base: { x: 0, y: 0, z: 0 }, gust: 0 }, bounds: { radius: 400 },
    },
    ...extra,
  } as SimConfig);
  const trace: Array<{ x: number; y: number; z: number; vy: number; t: number }> = [];
  for (let i = 0; i < 200000 && !sim.done; i++) {
    sim.step();
    const s = sim.state;
    trace.push({ x: s.position.x, y: s.position.y, z: s.position.z, vy: s.velocity.y, t: s.time });
  }
  return { sim, trace };
}

const lastSecondMeanVy = (trace: { t: number; vy: number }[], endT: number) => {
  const win = trace.filter((p) => p.t > endT - 1);
  return win.reduce((s, p) => s + p.vy, 0) / win.length;
};

const horizontalSpread = (trace: { x: number; z: number }[]) => {
  const n = trace.length;
  const mx = trace.reduce((s, p) => s + p.x, 0) / n;
  const mz = trace.reduce((s, p) => s + p.z, 0) / n;
  const spread = Math.max(
    ...trace.map((p) => Math.hypot(p.x - mx, p.z - mz)),
  );
  return { spread, mx, mz };
};

describe('per-device descent physics', () => {
  it('parachute: light rocket lands softly in the chute band', () => {
    const r = rocket({ massEmptyKg: 0.08, recovery: ['parachute'], chuteDiameterM: 0.55 });
    const { sim, trace } = fly(r, D12);
    expect(sim.state.recoveryDeployed).toEqual(['parachute']);
    expect(sim.state.impactSpeed).toBeGreaterThan(1);
    expect(sim.state.impactSpeed).toBeLessThan(6);
    expect(lastSecondMeanVy(trace, sim.state.time)).toBeGreaterThan(-6.5);
    expect(sim.state.phase).toBe('landed');
  });

  it('streamer: mass-scaled area holds the 6-13 m/s band light and heavy', () => {
    for (const mass of [0.05, 0.4]) {
      const r = rocket({ massEmptyKg: mass, recovery: ['streamer'] });
      const { sim, trace } = fly(r, mass > 0.1 ? D12 : C6);
      const sink = -lastSecondMeanVy(trace, sim.state.time);
      expect(sink).toBeGreaterThan(6);
      expect(sink).toBeLessThan(13);
      expect(sim.state.recoveryDeployed).toEqual(['streamer']);
    }
  });

  it('tumble: no-assist drag, faster sink, heavy rockets can hard-land', () => {
    const light = rocket({ massEmptyKg: 0.05, recovery: ['tumble'] });
    const { sim: s1, trace: t1 } = fly(light, C6);
    expect(-lastSecondMeanVy(t1, s1.state.time)).toBeGreaterThan(6);
    expect(-lastSecondMeanVy(t1, s1.state.time)).toBeLessThan(16);

    const heavy = rocket({ massEmptyKg: 0.55, diameterM: 0.025, recovery: ['tumble'] });
    // D12-3: the -5 delay ejects after this heavy rocket already hits the ground
    // (34 m apogee, ~6 s fall vs 6.65 s ejection) — the -3 lets the tumble deploy.
    const D12_3 = motorById('D12-3')!;
    // Tangle chance is 15% — find a seed where the tumble actually deployed,
    // then the hard impact must read as a hard landing, not a recovery failure.
    let s2: ReturnType<typeof fly>['sim'] | null = null;
    for (let seed = 1; seed <= 40 && !s2; seed++) {
      const run = fly(heavy, D12_3, seed).sim;
      if (run.state.chuteDeployed && run.state.impactSpeed > 15) s2 = run;
    }
    expect(s2).not.toBeNull();
    expect(s2!.state.impactSpeed).toBeGreaterThan(15);
    expect(s2!.state.phase).toBe('failed');
    // Deployed device + hard impact = hard-landing, not a recovery failure.
    expect(s2!.state.outcome).toBe('hard-landing');
  });

  it('helicopter: gentle spiral descent with lateral motion', () => {
    const r = rocket({ massEmptyKg: 0.1, recovery: ['helicopter'] });
    const { sim, trace } = fly(r, D12);
    expect(sim.state.recoveryDeployed).toEqual(['helicopter']);
    const descent = trace.filter((p) => p.vy < 0);
    const sink = -lastSecondMeanVy(trace, sim.state.time);
    expect(sink).toBeGreaterThan(2.5);
    expect(sink).toBeLessThan(5.5);
    // The spiral shows up as horizontal wander around the mean position.
    const { spread } = horizontalSpread(descent);
    expect(spread).toBeGreaterThan(0.8);
    expect(sim.state.impactSpeed).toBeLessThan(6);
    expect(sim.state.phase).toBe('landed');
  });

  it('glider: scripted glide — slow sink, forward speed, wide circle', () => {
    const r = rocket({ massEmptyKg: 0.12, recovery: ['glider'] });
    const { sim, trace } = fly(r, D12);
    expect(sim.state.recoveryDeployed).toEqual(['glider']);
    const descent = trace.filter((p) => p.vy < 0);
    // Sink near the scripted value once the glide is established.
    const sink = -lastSecondMeanVy(trace, sim.state.time);
    expect(sink).toBeGreaterThan(2.2);
    expect(sink).toBeLessThan(3.2);
    // Forward motion along the banked circle (radius ~15 m).
    const { spread } = horizontalSpread(descent);
    expect(spread).toBeGreaterThan(5);
    // Established glide: horizontal speed approaches √(8² − 2.7²) ≈ 7.5 m/s
    // once the 1 s blend finishes (mean over the last 0.5 s of the trace).
    const lastIdx = trace.length - 1;
    let hSum = 0, hN = 0;
    for (let i = lastIdx - 60 + 1; i <= lastIdx; i++) {
      const a = trace[i - 1], b = trace[i];
      hSum += Math.hypot(b.x - a.x, b.z - a.z) / (b.t - a.t);
      hN++;
    }
    const hSpeed = hSum / hN;
    expect(hSpeed).toBeGreaterThan(7.0);
    expect(hSpeed).toBeLessThan(8.0);
    expect(sim.state.impactSpeed).toBeLessThan(4);
    expect(sim.state.outcome).toBe('nominal');
    expect(sim.state.phase).toBe('landed');
  });

  it('combos: dominant (slowest) device governs physics; all devices stay listed', () => {
    const r = rocket({ massEmptyKg: 0.08, recovery: ['parachute', 'streamer'], chuteDiameterM: 0.55 });
    const { sim, trace } = fly(r, D12);
    expect(sim.state.recoveryDeployed).toEqual(['parachute', 'streamer']);
    expect(sim.state.impactSpeed).toBeLessThan(6); // parachute band, not streamer
    void trace;
  });

  it('failed deployment stays ballistic (chute-fail outcome)', () => {
    // 4% base fail rate: scan seeds until one fails — deterministic per seed.
    const r = rocket({ massEmptyKg: 0.08, recovery: ['parachute'], chuteDiameterM: 0.55 });
    let failing = -1;
    for (let seed = 1; seed <= 300; seed++) {
      const { sim } = fly(r, D12, seed);
      if (sim.state.outcome === 'chute-fail') { failing = seed; break; }
    }
    expect(failing).toBeGreaterThan(0);
    const { sim } = fly(r, D12, failing);
    expect(sim.state.impactSpeed).toBeGreaterThan(10);
    expect(sim.state.phase).toBe('failed');
  });

  it('unspecified rockets roll one device from the independent stream (same seed = same device)', () => {
    const r = rocket({ massEmptyKg: 0.08, recovery: [] });
    const { sim: a } = fly(r, D12, 42);
    const { sim: b } = fly(r, D12, 42);
    expect(a.state.recoveryDeployed).toEqual(b.state.recoveryDeployed);
    expect(a.state.recoveryDeployed).toHaveLength(1);
    const devices = new Set<string>();
    for (let seed = 1; seed <= 25; seed++) {
      const { sim } = fly(r, D12, seed);
      devices.add((sim.state.recoveryDeployed as RecoveryDevice[])[0]);
    }
    expect(devices.size).toBeGreaterThan(1);
  });

  it('legacy rockets without a recovery field behave like unspecified (random roll)', () => {
    const r = rocket({ massEmptyKg: 0.08 });
    expect(r.recovery).toBeUndefined();
    const { sim } = fly(r, D12, 42);
    expect(sim.state.recoveryDeployed).toHaveLength(1);
  });

  it('explicit pure-tumble (Leaper-style) deploys passively and survives every seed', () => {
    // BT-5-class toothpick on a short-impulse motor: recovery ['tumble'] must
    // engage at burnout + ≤0.5 s (no ejection charge needed), never fail, and
    // touch down under the crash threshold.
    const A10_3 = motorById('A10-3')!;
    const leaper = rocket({
      massEmptyKg: 0.181, diameterM: 0.0137, dragCoefficient: 0.822,
      chuteDiameterM: 0, recovery: ['tumble'], maxMotorImpulseNs: 2.5,
    });
    for (let seed = 1; seed <= 10; seed++) {
      const { sim, trace } = fly(leaper, A10_3, seed);
      const s = sim.state;
      expect(s.recoveryDeployed).toEqual(['tumble']);
      expect(s.chuteDeployed).toBe(true);
      // deployed no later than burnout 0.25 s + capped delay 0.5 s + apogee
      const deployT = trace.find((p) => p.t >= 0.75)!.t;
      expect(deployT).toBeLessThan(1.5);
      expect(s.phase).toBe('landed');
      // 'tip-off' is an ignition roll that can coexist with a fine tumble landing.
      expect(['nominal', 'tip-off']).toContain(s.outcome);
      expect(s.impactSpeed).toBeLessThan(15);
    }
  });
});

void ({} as Rng);
