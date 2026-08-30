import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { mulberry32 } from '../../src/sim/rng';
import { CloudSystem, wrapCoordinate } from '../../src/world/clouds';

describe('wrapCoordinate', () => {
  it('reflects out-of-range coordinates back into the band', () => {
    expect(wrapCoordinate(1450, 1400)).toBe(-1350);
    expect(wrapCoordinate(-1500, 1400)).toBe(1300);
    expect(wrapCoordinate(100, 1400)).toBe(100);
  });
});

describe('CloudSystem', () => {
  it('builds a capped, deterministic cloud field', () => {
    const rootA = new THREE.Group();
    const a = new CloudSystem(rootA, mulberry32(31), { x: 2, z: 1 });
    const rootB = new THREE.Group();
    new CloudSystem(rootB, mulberry32(31), { x: 2, z: 1 });
    expect(a).toBeTruthy();
    expect(rootA.children.length).toBeLessThanOrEqual(20);
    expect(rootA.children.length).toBeGreaterThan(5);
    expect(rootA.children.map((c) => c.position.toArray())).toEqual(rootB.children.map((c) => c.position.toArray()));
  });

  it('drifts clouds along the wind direction and wraps at the limit', () => {
    const root = new THREE.Group();
    const sys = new CloudSystem(root, mulberry32(31), { x: 1, z: 0 });
    const first = root.children[0];
    const x0 = first.position.x;
    sys.update(1);
    expect(first.position.x).toBeCloseTo(x0 + 6, 5); // DRIFT_SPEED 6 along +x
    // March far past the wrap limit.
    first.position.x = 1399;
    sys.update(1);
    expect(first.position.x).toBeLessThan(0);
  });

  it('falls back to a default drift when there is no wind', () => {
    const root = new THREE.Group();
    const sys = new CloudSystem(root, mulberry32(31), { x: 0, z: 0 });
    const first = root.children[0];
    first.position.set(0, first.position.y, 0); // away from the wrap edges
    sys.update(1);
    expect(Math.hypot(first.position.x, first.position.z)).toBeCloseTo(6, 5);
  });

  it('dispose removes all clouds from the root', () => {
    const root = new THREE.Group();
    const sys = new CloudSystem(root, mulberry32(31), { x: 1, z: 0 });
    sys.dispose();
    expect(root.children.length).toBe(0);
  });
});
