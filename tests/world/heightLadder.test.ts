import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { RAINBOW, buildHeightLadder, LADDER_STEP_M, LADDER_MAX_M } from '../../src/world/heightLadder';

function rungs(group: THREE.Group): THREE.Mesh[] {
  return group.children.filter((c) => c.userData.isHeightRung) as THREE.Mesh[];
}

describe('buildHeightLadder', () => {
  it('builds a rung every 50 m up to 1000 m, positioned above baseY', () => {
    const ladder = buildHeightLadder(12);
    const list = rungs(ladder);
    expect(list.length).toBe(LADDER_MAX_M / LADDER_STEP_M);
    for (let i = 0; i < list.length; i++) {
      expect(list[i].position.y).toBeCloseTo(12 + (i + 1) * LADDER_STEP_M, 6);
      expect(list[i].userData.altitudeM).toBe((i + 1) * LADDER_STEP_M);
    }
    expect(ladder.userData.isHeightLadder).toBe(true);
  });

  it('cycles the 7-color rainbow per rung', () => {
    const ladder = buildHeightLadder(0);
    const list = rungs(ladder);
    for (let i = 0; i < list.length; i++) {
      const mat = list[i].material as THREE.MeshBasicMaterial;
      expect(mat.color.getHex()).toBe(RAINBOW[i % RAINBOW.length]);
    }
    expect(list[0].material).not.toBe(list[RAINBOW.length].material);
  });

  it('lays each rung flat (XZ plane), transparent, double-sided', () => {
    const ladder = buildHeightLadder(0);
    for (const rung of rungs(ladder)) {
      expect(Math.abs(Math.abs(rung.rotation.x) - Math.PI / 2)).toBeLessThan(1e-6);
      const mat = rung.material as THREE.MeshBasicMaterial;
      expect(mat.transparent).toBe(true);
      expect(mat.side).toBe(THREE.DoubleSide);
    }
  });

  it('builds independent objects (no shared mutable state)', () => {
    const a = buildHeightLadder(0);
    const b = buildHeightLadder(0);
    expect(a).not.toBe(b);
    expect(rungs(a)[0].geometry).not.toBe(rungs(b)[0].geometry);
  });

  it('floors a non-multiple max to whole steps', () => {
    const ladder = buildHeightLadder(0, { maxM: 970 });
    expect(rungs(ladder).length).toBe(19); // 970 floors down to 950
  });
});
