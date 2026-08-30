import type { SimConfig, Rocket, Motor } from '../../src/sim/types';
import { vec } from '../../src/sim/vec';

export const testRocket: Rocket = {
  id: 'test', name: 'Test', massEmptyKg: 0.05, diameterM: 0.024,
  dragCoefficient: 0.75, chuteDiameterM: 0.3, chuteCd: 1.2,
  recommendedMotors: ['C6-5'], maxMotorImpulseNs: 12,
  look: { bodyLengthM: 0.3, finCount: 3, bodyColor: 0xffffff, finColor: 0xff0000, noseColor: 0x222222 },
};

export const testMotor: Motor = {
  id: 'C6-5', class: 'C', totalImpulseNs: 10, avgThrustN: 6, burnTimeS: 1.667,
  massTotalKg: 0.0258, massPropKg: 0.0108, delayS: 5,
};

export function makeTestConfig(overrides: Partial<SimConfig> = {}): SimConfig {
  return {
    rocket: testRocket,
    motor: testMotor,
    environment: { groundHeight: 0, wind: { base: vec(0, 0, 0), gust: 0 }, bounds: { radius: 500 } },
    seed: 123,
    challenge: { type: 'none' },
    ...overrides,
  };
}
