import type { Motor } from '../sim/types';

// Estes naming: the letter bounds total impulse, the number is average thrust (N).
// burnTimeS is therefore totalImpulseNs / avgThrustN (a catalog consistency test enforces this).
export const motors: Motor[] = [
  { id: 'A8-3',  class: 'A', totalImpulseNs: 2.5,  avgThrustN: 8,   burnTimeS: 0.313, massTotalKg: 0.0162, massPropKg: 0.0032, delayS: 3 },
  { id: 'B6-4',  class: 'B', totalImpulseNs: 5.0,  avgThrustN: 6,   burnTimeS: 0.833, massTotalKg: 0.0189, massPropKg: 0.0062, delayS: 4 },
  { id: 'C6-5',  class: 'C', totalImpulseNs: 10.0, avgThrustN: 6,   burnTimeS: 1.667, massTotalKg: 0.0258, massPropKg: 0.0108, delayS: 5 },
  { id: 'C11-5', class: 'C', totalImpulseNs: 10.0, avgThrustN: 11,  burnTimeS: 0.909, massTotalKg: 0.0252, massPropKg: 0.0108, delayS: 5 },
  { id: 'D12-5', class: 'D', totalImpulseNs: 20.0, avgThrustN: 12,  burnTimeS: 1.667, massTotalKg: 0.0428, massPropKg: 0.0211, delayS: 5 },
  { id: 'E12-6', class: 'E', totalImpulseNs: 30.0, avgThrustN: 12,  burnTimeS: 2.5,   massTotalKg: 0.0570, massPropKg: 0.0353, delayS: 6 },
];

export function motorById(id: string): Motor | undefined {
  return motors.find((m) => m.id === id);
}
