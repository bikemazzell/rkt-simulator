import { describe, it, expect } from 'vitest';
import { stepMotion, G, type StepInput } from '../../src/sim/integrator';
import { vec } from '../../src/sim/vec';

function simulateNoDragConstantThrust(mass: number, thrustN: number, burnTimeS: number) {
  const dt = 1 / 240;
  let position = vec(0, 0, 0);
  let velocity = vec(0, 0, 0);
  let apogee = 0;
  for (let t = 0; t < 60; t += dt) {
    const thrust = t < burnTimeS ? thrustN : 0;
    const base: StepInput = {
      position, velocity, mass, thrustN: thrust, refArea: 0,
      dragCoefficient: 0, wind: vec(0, 0, 0), dt,
    };
    const next = stepMotion(base);
    position = next.position;
    velocity = next.velocity;
    apogee = Math.max(apogee, position.y);
    if (t > burnTimeS && velocity.y < 0 && position.y <= 0) break;
  }
  return apogee;
}

describe('integrator', () => {
  it('matches closed-form no-drag apogee within 2%', () => {
    const mass = 0.1, thrustN = 10, burnTimeS = 1;
    const a = thrustN / mass - G;            // 90.19 m/s^2
    const vBurnout = a * burnTimeS;          // 90.19 m/s
    const hBurnout = 0.5 * a * burnTimeS * burnTimeS;
    const expected = hBurnout + (vBurnout * vBurnout) / (2 * G);
    const apogee = simulateNoDragConstantThrust(mass, thrustN, burnTimeS);
    expect(Math.abs(apogee - expected) / expected).toBeLessThan(0.02);
  });

  it('drag reduces apogee versus no drag', () => {
    const dt = 1 / 240;
    const run = (refArea: number) => {
      let position = vec(0, 0, 0), velocity = vec(0, 200, 0), apogee = 0;
      for (let t = 0; t < 60; t += dt) {
        const next = stepMotion({
          position, velocity, mass: 0.1, thrustN: 0, refArea,
          dragCoefficient: 0.75, wind: vec(0, 0, 0), dt,
        });
        position = next.position; velocity = next.velocity;
        apogee = Math.max(apogee, position.y);
        if (velocity.y < 0) break;
      }
      return apogee;
    };
    expect(run(0.002)).toBeLessThan(run(0));
  });

  it('wind induces horizontal drift', () => {
    const next = stepMotion({
      position: vec(0, 100, 0), velocity: vec(0, 0, 0), mass: 0.1,
      thrustN: 0, refArea: 0.002, dragCoefficient: 0.75,
      wind: vec(5, 0, 0), dt: 1 / 120,
    });
    expect(next.velocity.x).toBeGreaterThan(0);
  });
});
