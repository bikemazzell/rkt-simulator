import type { Rocket, Motor } from '../sim/types';
import { motorById } from './motors';

export const rockets: Rocket[] = [
  { id: 'alpha', name: 'Alpha', massEmptyKg: 0.034, diameterM: 0.024, dragCoefficient: 0.75, chuteDiameterM: 0.30, chuteCd: 1.2, recommendedMotors: ['A8-3', 'B6-4', 'C6-5'], maxMotorImpulseNs: 12, look: { bodyLengthM: 0.31, finCount: 3, bodyColor: 0xffffff, finColor: 0xd22222, noseColor: 0x222222 } },
  { id: 'wizard', name: 'Wizard', massEmptyKg: 0.013, diameterM: 0.018, dragCoefficient: 0.7, chuteDiameterM: 0.0, chuteCd: 0.8, recommendedMotors: ['A8-3', 'B6-4', 'C6-5'], maxMotorImpulseNs: 12, look: { bodyLengthM: 0.23, finCount: 3, bodyColor: 0xffe14d, finColor: 0x2244cc, noseColor: 0x2244cc } },
  { id: 'big-bertha', name: 'Big Bertha', massEmptyKg: 0.061, diameterM: 0.041, dragCoefficient: 0.8, chuteDiameterM: 0.46, chuteCd: 1.2, recommendedMotors: ['B6-4', 'C6-5'], maxMotorImpulseNs: 12, look: { bodyLengthM: 0.61, finCount: 4, bodyColor: 0xffffff, finColor: 0x111111, noseColor: 0x111111 } },
  { id: 'der-red-max', name: 'Der Red Max', massEmptyKg: 0.074, diameterM: 0.041, dragCoefficient: 0.8, chuteDiameterM: 0.46, chuteCd: 1.2, recommendedMotors: ['C6-5', 'D12-5'], maxMotorImpulseNs: 25, look: { bodyLengthM: 0.55, finCount: 3, bodyColor: 0xb31217, finColor: 0x111111, noseColor: 0x111111 } },
  { id: 'v2', name: 'V2', massEmptyKg: 0.085, diameterM: 0.051, dragCoefficient: 0.85, chuteDiameterM: 0.46, chuteCd: 1.2, recommendedMotors: ['C11-5', 'D12-5', 'E12-6'], maxMotorImpulseNs: 32, look: { bodyLengthM: 0.43, finCount: 4, bodyColor: 0xdad4c2, finColor: 0x2b2b2b, noseColor: 0x2b2b2b } },
  { id: 'baby-bertha', name: 'Baby Bertha', massEmptyKg: 0.035, diameterM: 0.041, dragCoefficient: 0.8, chuteDiameterM: 0.30, chuteCd: 1.2, recommendedMotors: ['A8-3', 'B6-4', 'C6-5'], maxMotorImpulseNs: 12, look: { bodyLengthM: 0.29, finCount: 3, bodyColor: 0x2e8b57, finColor: 0xffd700, noseColor: 0xffd700 } },
  { id: 'hi-flier', name: 'Hi-Flier', massEmptyKg: 0.021, diameterM: 0.019, dragCoefficient: 0.7, chuteDiameterM: 0.30, chuteCd: 1.2, recommendedMotors: ['B6-4', 'C6-5'], maxMotorImpulseNs: 12, look: { bodyLengthM: 0.44, finCount: 3, bodyColor: 0xff7f00, finColor: 0x111111, noseColor: 0x111111 } },
  { id: 'crossfire-isx', name: 'Crossfire ISX', massEmptyKg: 0.031, diameterM: 0.024, dragCoefficient: 0.72, chuteDiameterM: 0.30, chuteCd: 1.2, recommendedMotors: ['A8-3', 'B6-4', 'C6-5'], maxMotorImpulseNs: 12, look: { bodyLengthM: 0.36, finCount: 4, bodyColor: 0x1f6fe0, finColor: 0xffd000, noseColor: 0xffd000 } },
  { id: 'mean-machine', name: 'Mean Machine', massEmptyKg: 0.113, diameterM: 0.033, dragCoefficient: 0.9, chuteDiameterM: 0.46, chuteCd: 1.2, recommendedMotors: ['D12-5', 'E12-6'], maxMotorImpulseNs: 32, look: { bodyLengthM: 1.78, finCount: 3, bodyColor: 0x00a651, finColor: 0xffffff, noseColor: 0xffffff } },
  { id: 'photon-probe', name: 'Photon Probe', massEmptyKg: 0.042, diameterM: 0.033, dragCoefficient: 0.78, chuteDiameterM: 0.30, chuteCd: 1.2, recommendedMotors: ['B6-4', 'C6-5', 'D12-5'], maxMotorImpulseNs: 25, look: { bodyLengthM: 0.40, finCount: 3, bodyColor: 0x8e44ad, finColor: 0x1abc9c, noseColor: 0x1abc9c } },
  { id: 'nike-smoke', name: 'Nike Smoke', massEmptyKg: 0.057, diameterM: 0.041, dragCoefficient: 0.82, chuteDiameterM: 0.46, chuteCd: 1.2, recommendedMotors: ['C6-5', 'D12-5'], maxMotorImpulseNs: 25, look: { bodyLengthM: 0.66, finCount: 4, bodyColor: 0xf5f5f5, finColor: 0xd22222, noseColor: 0xd22222 } },
  { id: 'star-orbiter', name: 'Star Orbiter', massEmptyKg: 0.091, diameterM: 0.041, dragCoefficient: 0.83, chuteDiameterM: 0.46, chuteCd: 1.2, recommendedMotors: ['D12-5', 'E12-6'], maxMotorImpulseNs: 32, look: { bodyLengthM: 0.74, finCount: 4, bodyColor: 0x0b3d91, finColor: 0xffffff, noseColor: 0xffffff } },
];

export function rocketById(id: string): Rocket | undefined {
  return rockets.find((r) => r.id === id);
}

export function compatibleMotors(rocket: Rocket): Motor[] {
  return rocket.recommendedMotors
    .map((id) => motorById(id))
    .filter((m): m is Motor => m !== undefined);
}
