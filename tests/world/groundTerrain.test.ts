import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTiledGround } from '../../src/world/ground';

const PALETTE = [0x4c8f3a, 0x55a044, 0x61b04d, 0x477f38];

function tilesMesh(root: THREE.Group): THREE.Mesh {
  const mesh = root.children
    .filter((c) => c instanceof THREE.Mesh)
    .find((c) => (c as THREE.Mesh).geometry.getAttribute('color') !== undefined) as THREE.Mesh;
  expect(mesh).toBeDefined();
  return mesh;
}

/** Ascending ramp along the (1,1) diagonal: 4 m terraces every 20 m. */
const ramp = (x: number, z: number): number => 20 + Math.round((x + z) / 20) * 4;

describe('buildTiledGround with terrain', () => {
  it('raises tile tops to the sampled height', () => {
    const root = new THREE.Group();
    buildTiledGround(root, PALETTE, 7, { tiledRadius: 60, heightAt: ramp });
    const pos = tilesMesh(root).geometry.getAttribute('position');
    const heights = new Set<number>();
    for (let i = 0; i < pos.count; i++) heights.add(pos.getY(i));
    expect(heights.size).toBeGreaterThanOrEqual(3); // visibly stepped
  });

  it('skins height steps with outward-facing vertical walls', () => {
    const root = new THREE.Group();
    buildTiledGround(root, PALETTE, 7, { tiledRadius: 60, heightAt: ramp });
    const geo = tilesMesh(root).geometry;
    const normals = geo.getAttribute('normal');
    let tops = 0;
    let walls = 0;
    let downhill = 0;
    for (let i = 0; i < normals.count; i++) {
      const nx = normals.getX(i);
      const ny = normals.getY(i);
      const nz = normals.getZ(i);
      if (ny > 0.99) tops++;
      else if (Math.abs(ny) < 0.01) {
        walls++;
        // Every wall is axis-aligned and unit-length.
        expect(Math.hypot(nx, nz)).toBeGreaterThan(0.9);
        // Interior cliffs (the ramp ascends towards +x/+z) face downhill.
        if (nx < -0.9 || nz < -0.9) downhill++;
      } else {
        throw new Error(`tilted normal ${nx},${ny},${nz}`);
      }
    }
    expect(tops).toBeGreaterThan(0);
    expect(walls).toBeGreaterThan(0);
    expect(downhill).toBeGreaterThan(0); // at least the interior steps
  });

  it('emits no walls for flat terrain (regression: identical to the old ground)', () => {
    const root = new THREE.Group();
    buildTiledGround(root, PALETTE, 7, { tiledRadius: 60, groundY: 20, heightAt: () => 20 });
    const geo = tilesMesh(root).geometry;
    const normals = geo.getAttribute('normal');
    const pos = geo.getAttribute('position');
    for (let i = 0; i < normals.count; i++) {
      expect(normals.getY(i)).toBeGreaterThan(0.99);
    }
    for (let i = 0; i < pos.count; i++) {
      expect(pos.getY(i)).toBe(20);
    }
  });
});
