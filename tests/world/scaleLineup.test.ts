import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Rocket } from '../../src/sim/types';
import { mulberry32 } from '../../src/sim/rng';
import { buildScaleLineup, buildRefMesh } from '../../src/world/scaleLineup';
import { pickReferences, SCALE_REFERENCES } from '../../src/world/scaleRefs';

const makeRocket = (bodyLengthM: number, diameterM: number): Rocket =>
  ({
    id: 'test-rocket',
    name: 'Test Rocket',
    massEmptyKg: 0.1,
    diameterM,
    dragCoefficient: 0.75,
    chuteDiameterM: 0.4,
    chuteCd: 1.2,
    recommendedMotors: ['C6-5'],
    maxMotorImpulseNs: 10,
    look: {
      bodyLengthM,
      finCount: 4,
      bodyColor: 0xffffff,
      finColor: 0xff0000,
      noseColor: 0x00ff00,
    },
  }) as Rocket;

const bboxOf = (obj: THREE.Object3D) => new THREE.Box3().setFromObject(obj);

describe('buildRefMesh', () => {
  it('renders every ladder rung at its declared real height, standing on y=0', () => {
    for (const ref of SCALE_REFERENCES) {
      const mesh = buildRefMesh(ref);
      mesh.updateMatrixWorld(true);
      const bbox = bboxOf(mesh);
      expect(bbox.min.y, ref.id).toBeGreaterThanOrEqual(-0.005);
      expect(bbox.max.y, ref.id).toBeGreaterThan(ref.heightM * 0.85);
      expect(bbox.max.y, ref.id).toBeLessThan(ref.heightM * 1.15);
    }
  });
});

describe('buildScaleLineup', () => {
  const refRadius = (id: string) =>
    Math.max(0.25, (SCALE_REFERENCES.find((r) => r.id === id) ?? { lengthM: 0.5 }).lengthM / 2);

  it('contains tagged reference objects plus the rod hardware (no blast plate)', () => {
    const rocket = makeRocket(0.5, 0.05);
    const lineup = buildScaleLineup(rocket, 0, undefined, mulberry32(7));
    const expected = pickReferences(0.5 + 0.05 * 1.5, mulberry32(7));
    const refIds = lineup.children
      .filter((c) => typeof c.userData.refId === 'string')
      .map((c) => c.userData.refId);
    expect(refIds.length).toBeGreaterThanOrEqual(3);
    for (const id of refIds) expect(expected.some((r) => r.id === id)).toBe(true);
    expect(lineup.children.some((c) => c.userData.isRod)).toBe(true);
    expect(lineup.children.some((c) => c.userData.isRodTip)).toBe(true);
    expect(lineup.children.some((c) => c.userData.isBlastPlate)).toBe(false);
  });

  it('stands every object on groundY (no floating, no sinking)', () => {
    const rocket = makeRocket(0.9, 0.05);
    const groundY = 2.5;
    const lineup = buildScaleLineup(rocket, groundY, undefined, mulberry32(3));
    lineup.updateMatrixWorld(true);
    for (const child of lineup.children) {
      if (child.userData.isRod || child.userData.isRodTip) continue;
      const bbox = bboxOf(child);
      expect(bbox.min.y).toBeCloseTo(groundY, 2);
    }
  });

  it('scatters objects in a ring around the pad, clear of the plate and each other', () => {
    const rocket = makeRocket(0.9, 0.05);
    const lineup = buildScaleLineup(rocket, 0, undefined, mulberry32(4));
    const refs = lineup.children.filter((c) => typeof c.userData.refId === 'string');
    expect(refs.length).toBeGreaterThanOrEqual(3);
    for (const child of refs) {
      // Center outside the 1.6 m plate plus margin.
      expect(Math.hypot(child.position.x, child.position.z)).toBeGreaterThanOrEqual(2.0);
      // Facing the rocket: local +z (long axis) points back at the origin.
      const yaw = child.rotation.y;
      const dx = -child.position.x, dz = -child.position.z;
      const dot = Math.sin(yaw) * dx + Math.cos(yaw) * dz;
      expect(dot).toBeGreaterThan(0);
    }
    for (let i = 0; i < refs.length; i++) {
      for (let j = i + 1; j < refs.length; j++) {
        const a = refs[i], b = refs[j];
        const dist = Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
        expect(dist).toBeGreaterThanOrEqual(refRadius(a.userData.refId) + refRadius(b.userData.refId) + 0.19);
      }
    }
  });

  it('builds a 1 m launch rod with an orange tip beside the rocket body', () => {
    const rocket = makeRocket(0.5, 0.05);
    const lineup = buildScaleLineup(rocket, 0);
    const rod = lineup.children.find((c) => c.userData.isRod)!;
    const tip = lineup.children.find((c) => c.userData.isRodTip)!;
    const bbox = bboxOf(rod);
    expect(bbox.max.y - bbox.min.y).toBeCloseTo(1.0, 2);
    expect(rod.position.x).toBeCloseTo(0.05 / 2 + 0.06, 3);
    expect(bbox.min.y).toBeCloseTo(0, 2);
    // Safety tip caps the rod (visible marker so the rod reads as hardware).
    const tipBox = bboxOf(tip);
    expect(tipBox.max.y).toBeGreaterThan(0.9);
    expect(tipBox.max.y).toBeLessThanOrEqual(1.0 + 1e-6);
  });

  it('keeps every object inside the maxExtent budget, dropping what cannot fit', () => {
    // total height 1.775 → the 4.5 m car (a height bracket) is always picked;
    // inside a 2.6 m budget its own half-length cannot fit anywhere, so it and
    // the other long refs must drop while the small refs stay.
    const rocket = makeRocket(1.55, 0.15);
    const unclamped = buildScaleLineup(rocket, 0, undefined, mulberry32(9));
    const clamped = buildScaleLineup(rocket, 0, 2.6, mulberry32(9));
    const idsClamped = clamped.children.filter((c) => c.userData.refId).length;
    const idsFull = unclamped.children.filter((c) => c.userData.refId).length;
    expect(idsClamped).toBeLessThan(idsFull);
    expect(idsClamped).toBeGreaterThanOrEqual(2);
    for (const child of clamped.children) {
      child.updateMatrixWorld(true);
      const bbox = bboxOf(child);
      expect(bbox.max.x).toBeLessThanOrEqual(2.6 + 1e-6);
      expect(bbox.min.x).toBeGreaterThanOrEqual(-2.6 - 1e-6);
      expect(bbox.max.z).toBeLessThanOrEqual(2.6 + 1e-6);
      expect(bbox.min.z).toBeGreaterThanOrEqual(-2.6 - 1e-6);
    }
  });

  it('is deterministic per seed but varies across seeds', () => {
    const rocket = makeRocket(1.2, 0.066);
    const a = buildScaleLineup(rocket, 0, undefined, mulberry32(5));
    const b = buildScaleLineup(rocket, 0, undefined, mulberry32(5));
    const sig = (l: typeof a) => l.children
      .filter((c) => c.userData.refId)
      .map((c) => `${c.userData.refId}@${c.position.x.toFixed(2)},${c.position.z.toFixed(2)}`).join(' | ');
    expect(sig(a)).toEqual(sig(b));
    const sets = new Set<string>();
    for (let seed = 1; seed <= 16; seed++) {
      sets.add(sig(buildScaleLineup(rocket, 0, undefined, mulberry32(seed))));
    }
    expect(sets.size).toBeGreaterThanOrEqual(4);
  });
});
