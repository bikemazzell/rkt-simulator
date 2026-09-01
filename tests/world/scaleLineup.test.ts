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
  it('contains one tagged object per picked reference plus the rod hardware', () => {
    const rocket = makeRocket(0.5, 0.05);
    const lineup = buildScaleLineup(rocket, 0, undefined, mulberry32(7));
    const expected = pickReferences(0.5 + 0.05 * 1.5, mulberry32(7));
    const refIds = lineup.children
      .filter((c) => typeof c.userData.refId === 'string')
      .map((c) => c.userData.refId);
    expect(refIds.sort()).toEqual(expected.map((r) => r.id).sort());
    expect(lineup.children.some((c) => c.userData.isRod)).toBe(true);
    expect(lineup.children.some((c) => c.userData.isBlastPlate)).toBe(true);
    expect(lineup.children.some((c) => c.userData.isRodTip)).toBe(true);
  });

  it('stands every object on groundY (no floating, no sinking)', () => {
    const rocket = makeRocket(0.9, 0.05);
    const groundY = 2.5;
    const lineup = buildScaleLineup(rocket, groundY, undefined, mulberry32(3));
    lineup.updateMatrixWorld(true);
    for (const child of lineup.children) {
      if (child.userData.isRod || child.userData.isBlastPlate || child.userData.isRodTip) continue;
      const bbox = bboxOf(child);
      expect(bbox.min.y).toBeCloseTo(groundY, 2);
    }
  });

  it('lays the row out in order with increasing x', () => {
    const rocket = makeRocket(0.9, 0.05);
    const lineup = buildScaleLineup(rocket, 0, undefined, mulberry32(4));
    const xs = lineup.children
      .filter((c) => typeof c.userData.refId === 'string')
      .map((c) => c.position.x);
    expect(xs.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
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

  it('drops references whose row end exceeds maxX (sea raft budget)', () => {
    // total height 1.775 → a 4.5 m car often wants in; the raft ends at 6.5 m,
    // so less-relevant refs get cut.
    const rocket = makeRocket(1.55, 0.15);
    const unclamped = buildScaleLineup(rocket, 0, undefined, mulberry32(9));
    const clamped = buildScaleLineup(rocket, 0, 6.5, mulberry32(9));
    const idsClamped = clamped.children.filter((c) => c.userData.refId).length;
    const idsFull = unclamped.children.filter((c) => c.userData.refId).length;
    expect(idsClamped).toBeLessThan(idsFull);
    expect(idsClamped).toBeGreaterThanOrEqual(1);
    for (const child of clamped.children) {
      child.updateMatrixWorld(true);
      const bbox = bboxOf(child);
      expect(bbox.max.x).toBeLessThanOrEqual(6.5 + 1e-6);
    }
  });

  it('is deterministic per seed but varies across seeds', () => {
    const rocket = makeRocket(1.2, 0.066);
    const a = buildScaleLineup(rocket, 0, undefined, mulberry32(5));
    const b = buildScaleLineup(rocket, 0, undefined, mulberry32(5));
    expect(a.children.map((c) => c.userData.refId)).toEqual(b.children.map((c) => c.userData.refId));
    const sets = new Set<string>();
    for (let seed = 1; seed <= 16; seed++) {
      const ids = buildScaleLineup(rocket, 0, undefined, mulberry32(seed))
        .children.map((c) => c.userData.refId).join(',');
      sets.add(ids);
    }
    expect(sets.size).toBeGreaterThanOrEqual(4);
  });
});
