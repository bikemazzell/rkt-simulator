import { describe, it, expect } from 'vitest';
import { motors, motorById } from '../../src/data/motors';
import { rockets, compatibleMotors } from '../../src/data/rockets';
import type { MotorClass } from '../../src/sim/types';

describe('catalog', () => {
  it('has Estes classes A-E among motors', () => {
    const classes = new Set(motors.map((m) => m.class));
    const expected: MotorClass[] = ['A', 'B', 'C', 'D', 'E'];
    for (const c of expected) expect(classes.has(c)).toBe(true);
  });
  it('every motor has positive impulse and burn time', () => {
    for (const m of motors) {
      expect(m.totalImpulseNs).toBeGreaterThan(0);
      expect(m.burnTimeS).toBeGreaterThan(0);
      expect(m.massPropKg).toBeLessThanOrEqual(m.massTotalKg);
    }
  });
  it('avgThrust is consistent with impulse / burn time (within 5%)', () => {
    for (const m of motors) {
      const derived = m.totalImpulseNs / m.burnTimeS;
      expect(Math.abs(derived - m.avgThrustN) / m.avgThrustN, m.id).toBeLessThan(0.05);
    }
  });
  it('has at least 12 rockets with unique ids', () => {
    expect(rockets.length).toBeGreaterThanOrEqual(12);
    expect(new Set(rockets.map((r) => r.id)).size).toBe(rockets.length);
  });
  it('every rocket recommends only motors that exist', () => {
    for (const r of rockets) {
      for (const id of r.recommendedMotors) {
        expect(motorById(id), `${r.id} -> ${id}`).toBeDefined();
      }
      expect(r.recommendedMotors.length).toBeGreaterThan(0);
    }
  });
  it('compatibleMotors returns the rocket recommended motors', () => {
    const r = rockets[0];
    const ids = compatibleMotors(r).map((m) => m.id);
    expect(ids.sort()).toEqual([...r.recommendedMotors].sort());
  });
});
