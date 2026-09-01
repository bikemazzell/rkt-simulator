import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Rocket } from '../../src/sim/types';
import { buildScaleLineup } from '../../src/world/scaleLineup';
import { pickReferences } from '../../src/world/scaleRefs';

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

describe('buildScaleLineup', () => {
  it('contains one tagged object per picked reference plus the rod', () => {
    const rocket = makeRocket(0.5, 0.05);
    const lineup = buildScaleLineup(rocket, 0);
    const expected = pickReferences(0.5 + 0.05 * 1.5);
    const refIds = lineup.children
      .filter((c) => typeof c.userData.refId === 'string')
      .map((c) => c.userData.refId);
    expect(refIds.sort()).toEqual(expected.map((r) => r.id).sort());
    expect(lineup.children.some((c) => c.userData.isRod)).toBe(true);
  });

  it('stands every object on groundY (no floating, no sinking)', () => {
    const rocket = makeRocket(0.9, 0.05);
    const groundY = 2.5;
    const lineup = buildScaleLineup(rocket, groundY);
    lineup.updateMatrixWorld(true);
    for (const child of lineup.children) {
      if (child.userData.isRod || child.userData.isBlastPlate) continue;
      const bbox = bboxOf(child);
      expect(bbox.min.y).toBeCloseTo(groundY, 2);
    }
  });

  it('renders each reference near its real height', () => {
    const rocket = makeRocket(0.9, 0.05);
    const lineup = buildScaleLineup(rocket, 0);
    const expected = pickReferences(0.9 + 0.05 * 1.5);
    for (const child of lineup.children) {
      const refId = child.userData.refId as string | undefined;
      if (!refId) continue;
      const ref = expected.find((r) => r.id === refId)!;
      const height = bboxOf(child).max.y;
      expect(height, refId).toBeGreaterThan(ref.heightM * 0.85);
      expect(height, refId).toBeLessThan(ref.heightM * 1.15);
    }
  });

  it('lays the row out in order with increasing x', () => {
    const rocket = makeRocket(0.9, 0.05);
    const lineup = buildScaleLineup(rocket, 0);
    const xs = lineup.children
      .filter((c) => typeof c.userData.refId === 'string')
      .map((c) => c.position.x);
    expect(xs.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
  });

  it('builds a 1 m launch rod beside the rocket body', () => {
    const rocket = makeRocket(0.5, 0.05);
    const lineup = buildScaleLineup(rocket, 0);
    const rod = lineup.children.find((c) => c.userData.isRod)!;
    const bbox = bboxOf(rod);
    expect(bbox.max.y - bbox.min.y).toBeCloseTo(1.0, 2);
    expect(rod.position.x).toBeCloseTo(0.05 / 2 + 0.04, 3);
    expect(bbox.min.y).toBeCloseTo(0, 2);
  });

  it('drops references whose row end exceeds maxX (sea raft budget)', () => {
    // total height 1.775 → lineup wants [car, child, person, tall-person];
    // the 4.5 m car pushes the row past 6.5 m, so less-relevant refs get cut.
    const rocket = makeRocket(1.55, 0.15);
    const unclamped = buildScaleLineup(rocket, 0);
    const clamped = buildScaleLineup(rocket, 0, 6.5);
    const idsClamped = clamped.children.filter((c) => c.userData.refId).length;
    const idsFull = unclamped.children.filter((c) => c.userData.refId).length;
    expect(idsClamped).toBeLessThan(idsFull);
    expect(idsClamped).toBeGreaterThanOrEqual(1);
    for (const child of clamped.children) {
      const bbox = bboxOf(child);
      expect(bbox.max.x).toBeLessThanOrEqual(6.5 + 1e-6);
    }
  });

  it('is deterministic (same inputs, identical layout)', () => {
    const rocket = makeRocket(1.2, 0.066);
    const a = buildScaleLineup(rocket, 0);
    const b = buildScaleLineup(rocket, 0);
    const ax = a.children.map((c) => c.position.x);
    const bx = b.children.map((c) => c.position.x);
    expect(ax).toEqual(bx);
  });
});
