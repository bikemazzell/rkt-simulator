import { describe, it, expect } from 'vitest';
import { applyOutcome, catoProbability, chuteFailProbability, tipOffProbability } from '../../src/sim/outcomes';
import { initialFlightState } from '../../src/sim/flight';
import { mulberry32 } from '../../src/sim/rng';
import { makeTestConfig } from './fixtures';

describe('outcomes', () => {
  it('CATO probability rises when motor impulse exceeds the rocket limit', () => {
    const safe = makeTestConfig();
    const overloaded = makeTestConfig({
      motor: { ...makeTestConfig().motor, totalImpulseNs: 30 },
    });
    expect(catoProbability(overloaded)).toBeGreaterThan(catoProbability(safe));
  });

  it('an overloaded motor eventually CATOs across seeds', () => {
    let catos = 0;
    for (let seed = 0; seed < 50; seed++) {
      const config = makeTestConfig({
        seed, motor: { ...makeTestConfig().motor, totalImpulseNs: 40 },
      });
      const s = initialFlightState(config);
      applyOutcome(s, config, mulberry32(seed), 'ignition');
      if (s.outcome === 'cato') catos++;
    }
    expect(catos).toBeGreaterThan(0);
  });

  it('deploys the chute at ejection when the deploy roll succeeds', () => {
    let deployed = false;
    for (let seed = 0; seed < 20; seed++) {
      const config = makeTestConfig({ seed });
      const s = initialFlightState(config);
      applyOutcome(s, config, mulberry32(seed), 'ejection');
      if (s.chuteDeployed) {
        deployed = true;
        expect(s.outcome === 'nominal' || s.outcome === null).toBe(true);
        break;
      }
    }
    expect(deployed).toBe(true); // a healthy chute deploys for most seeds
  });

  it('sets chute-fail and leaves the chute stowed when the roll fails', () => {
    let failed = false;
    const rocket = { ...makeTestConfig().rocket, chuteDiameterM: 0 };
    for (let seed = 0; seed < 40; seed++) {
      const config = makeTestConfig({ seed, rocket });
      const s = initialFlightState(config);
      applyOutcome(s, config, mulberry32(seed), 'ejection');
      if (s.outcome === 'chute-fail') {
        failed = true;
        expect(s.chuteDeployed).toBe(false);
        break;
      }
    }
    expect(failed).toBe(true);
  });

  it('tumble-recovery rockets have higher chute-fail probability', () => {
    const withChute = makeTestConfig();
    const tumble = makeTestConfig({
      rocket: { ...makeTestConfig().rocket, chuteDiameterM: 0 },
    });
    expect(chuteFailProbability(tumble)).toBeGreaterThan(chuteFailProbability(withChute));
  });

  it('high wind raises tip-off probability', () => {
    const calm = makeTestConfig();
    const windy = makeTestConfig({
      environment: { ...makeTestConfig().environment, wind: { base: { x: 12, y: 0, z: 0 }, gust: 4 } },
    });
    expect(tipOffProbability(windy)).toBeGreaterThan(tipOffProbability(calm));
  });

  it('is deterministic for a fixed seed', () => {
    const config = makeTestConfig({ seed: 5, motor: { ...makeTestConfig().motor, totalImpulseNs: 40 } });
    const a = initialFlightState(config); applyOutcome(a, config, mulberry32(5), 'ignition');
    const b = initialFlightState(config); applyOutcome(b, config, mulberry32(5), 'ignition');
    expect(a.outcome).toBe(b.outcome);
  });
});
