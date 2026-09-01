import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { AIM_DEFAULT, normalizeAngle, aimDirection, type AimAngles } from '../../src/sim/aim';

describe('normalizeAngle', () => {
  it('maps into (-180, 180]', () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(35)).toBe(35);
    expect(normalizeAngle(270)).toBe(-90);
    expect(normalizeAngle(-90)).toBe(-90);
    expect(normalizeAngle(190)).toBe(-170);
    expect(normalizeAngle(-270)).toBe(90);
    expect(normalizeAngle(-180)).toBe(180);
    expect(normalizeAngle(180)).toBe(180);
    expect(normalizeAngle(720.5)).toBeCloseTo(0.5, 10);
  });

  it('treats non-finite input as 0', () => {
    expect(normalizeAngle(Number.NaN)).toBe(0);
    expect(normalizeAngle(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('aimDirection (Euler XYZ applied to up)', () => {
  it('default aim points straight up', () => {
    const d = aimDirection(AIM_DEFAULT);
    expect(d.x).toBeCloseTo(0, 10);
    expect(d.y).toBeCloseTo(1, 10);
    expect(d.z).toBeCloseTo(0, 10);
  });

  it('X +90° tilts the nose toward +Z; X −90° toward −Z', () => {
    const p = aimDirection({ x: 90, y: 0, z: 0 });
    expect(p.x).toBeCloseTo(0, 10);
    expect(p.y).toBeCloseTo(0, 10);
    expect(p.z).toBeCloseTo(1, 10);
    const m = aimDirection({ x: -90, y: 0, z: 0 });
    expect(m.z).toBeCloseTo(-1, 10);
  });

  it('Z +90° tilts the nose toward −X; Z −90° toward +X', () => {
    const p = aimDirection({ x: 0, y: 0, z: 90 });
    expect(p.x).toBeCloseTo(-1, 10);
    expect(p.y).toBeCloseTo(0, 10);
    expect(p.z).toBeCloseTo(0, 10);
    const m = aimDirection({ x: 0, y: 0, z: -90 });
    expect(m.x).toBeCloseTo(1, 10);
  });

  it('Y (spin) alone never changes the direction', () => {
    for (const y of [42.5, 90, 180, -137]) {
      const alone = aimDirection({ x: 0, y, z: 0 });
      expect(alone.y).toBeCloseTo(1, 10);
      expect(alone.x).toBeCloseTo(0, 10);
      expect(alone.z).toBeCloseTo(0, 10);
    }
  });

  it('Y combined with a Z tilt rotates the tilt plane around the vertical', () => {
    // z=-20 with y=0 tilts toward +X; the same tilt spun by y=90 points +Z-ish
    const base = aimDirection({ x: 0, y: 0, z: -20 });
    const spun = aimDirection({ x: 0, y: 90, z: -20 });
    expect(base.x).toBeGreaterThan(0.3);   // sin 20° toward +X
    expect(spun.x).toBeCloseTo(0, 10);
    expect(spun.z).toBeLessThan(-0.3);     // same tilt, now pointing −Z
    expect(spun.y).toBeCloseTo(base.y, 10); // tilt magnitude preserved
  });

  it('matches the closed form of Rx·Ry·Rz·(0,1,0)', () => {
    const a: AimAngles = { x: 30, y: 77, z: -20 };
    const d = aimDirection(a);
    const rad = Math.PI / 180;
    const { x, y, z } = { x: a.x * rad, y: a.y * rad, z: a.z * rad };
    expect(d.x).toBeCloseTo(-Math.sin(z) * Math.cos(y), 10);
    expect(d.y).toBeCloseTo(Math.cos(z) * Math.cos(x) - Math.sin(z) * Math.sin(y) * Math.sin(x), 10);
    expect(d.z).toBeCloseTo(Math.cos(z) * Math.sin(x) + Math.sin(z) * Math.sin(y) * Math.cos(x), 10);
  });

  it('always returns a unit vector, including unnormalized inputs', () => {
    for (const a of [{ x: 35, y: -359, z: 450 }, { x: -123.4, y: 12, z: 89 }, { x: 0, y: 720, z: 0 }]) {
      const d = aimDirection(a);
      expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 10);
    }
  });

  it('matches THREE.Euler("XYZ").applyTo(up) over a sampled grid (parity)', () => {
    const samples = [-137, -45, 0, 30, 115];
    for (const xd of samples) for (const yd of samples) for (const zd of samples) {
      const ours = aimDirection({ x: xd, y: yd, z: zd });
      const e = new THREE.Euler(xd * (Math.PI / 180), yd * (Math.PI / 180), zd * (Math.PI / 180), 'XYZ');
      const v = new THREE.Vector3(0, 1, 0).applyEuler(e);
      expect(ours.x).toBeCloseTo(v.x, 9);
      expect(ours.y).toBeCloseTo(v.y, 9);
      expect(ours.z).toBeCloseTo(v.z, 9);
    }
  });
});
