import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { mulberry32 } from '../../src/sim/rng';
import {
  WATER_PALETTE,
  buildWater,
  shimmerIndex,
  type WaterSpec,
} from '../../src/world/water';

describe('shimmerIndex', () => {
  it('is deterministic and within palette range', () => {
    for (let gx = 0; gx < 12; gx++) {
      for (let gz = 0; gz < 12; gz++) {
        const a = shimmerIndex(gx, gz, 3);
        expect(a).toBe(shimmerIndex(gx, gz, 3));
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThan(WATER_PALETTE.length);
      }
    }
  });

  it('varies across space at a fixed tick', () => {
    const seen = new Set<number>();
    for (let gx = 0; gx < 8; gx++) {
      for (let gz = 0; gz < 8; gz++) seen.add(shimmerIndex(gx, gz, 5));
    }
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });

  it('changes over time for at least one cell', () => {
    let changed = 0;
    for (let gx = 0; gx < 8; gx++) {
      for (let gz = 0; gz < 8; gz++) {
        if (shimmerIndex(gx, gz, 0) !== shimmerIndex(gx, gz, 6)) changed++;
      }
    }
    expect(changed).toBeGreaterThan(0);
  });
});

describe('buildWater', () => {
  it('parents capped quad meshes to the root', () => {
    const root = new THREE.Group();
    const rng = mulberry32(7);
    const sys = buildWater(root, rng, [{ radius: 25, x: 10, z: -5, y: 0.02 }]);
    expect(sys).not.toBeNull();
    const meshes = root.children.filter((c) => c instanceof THREE.Mesh);
    expect(meshes.length).toBe(1);
    const geo = (meshes[0] as THREE.Mesh).geometry as THREE.BufferGeometry;
    const quads = geo.index ? geo.index.count / 6 : 0;
    expect(quads).toBeGreaterThan(0);
    // Grid is capped at 64x64 quads so the shimmer stays cheap.
    expect(quads).toBeLessThanOrEqual(64 * 64);
  });

  it('caps huge water bodies to the 64x64 grid budget', () => {
    const root = new THREE.Group();
    const rng = mulberry32(7);
    buildWater(root, rng, [{ radius: 5000, y: 0 }]);
    const geo = (root.children[0] as THREE.Mesh).geometry as THREE.BufferGeometry;
    expect(geo.index ? geo.index.count / 6 : 0).toBeLessThanOrEqual(64 * 64);
  });

  it('supports several bodies in one system', () => {
    const root = new THREE.Group();
    const rng = mulberry32(7);
    const specs: WaterSpec[] = [
      { radius: 10, x: 30, z: 30, y: 0.02 },
      { radius: 6, x: -40, z: 12, y: 0.02 },
    ];
    buildWater(root, rng, specs);
    expect(root.children.filter((c) => c instanceof THREE.Mesh).length).toBe(2);
  });

  it('fills each quad with one palette color (blocky look)', () => {
    const root = new THREE.Group();
    const rng = mulberry32(7);
    buildWater(root, rng, [{ radius: 25, y: 0.02 }]);
    const mesh = root.children[0] as THREE.Mesh;
    const geo = mesh.geometry as THREE.BufferGeometry;
    const colors = geo.getAttribute('color') as THREE.BufferAttribute;
    const index = geo.index!;
    // Every triangle must have all three vertices share one exact color.
    for (let t = 0; t < index.count; t += 3) {
      const va = index.getX(t);
      const vb = index.getX(t + 1);
      const vc = index.getX(t + 2);
      expect(colors.getX(va)).toBe(colors.getX(vb));
      expect(colors.getX(va)).toBe(colors.getX(vc));
    }
    // And that color matches a palette entry (converted to linear like the mesh).
    const linear = WATER_PALETTE.map((h) => new THREE.Color().setHex(h));
    const ok = (v: number) =>
      linear.some((p) => Math.abs(p.r - colors.getX(v)) < 1e-3 && Math.abs(p.g - colors.getY(v)) < 1e-3);
    const usedVerts = (index.count / 6) * 4; // only quads that survived disc clipping
    for (let v = 0; v < usedVerts; v += 97) expect(ok(v)).toBe(true);
  });

  it('shimmers on update but not on every call (throttled writes)', () => {
    const root = new THREE.Group();
    const rng = mulberry32(7);
    const sys = buildWater(root, rng, [{ radius: 30, y: 0.02 }]);
    expect(sys).not.toBeNull();
    const mesh = root.children[0] as THREE.Mesh;
    const colors = mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
    const before = Array.from(colors.array as Float32Array);
    // Small dt with no tick change -> no rewrite.
    sys!.update(0.016, 0.05);
    expect(Array.from(colors.array as Float32Array)).toEqual(before);
    // Enough elapsed time -> colors change somewhere.
    let changed = false;
    sys!.update(0.016, 2.5);
    const after = colors.array as Float32Array;
    for (let i = 0; i < after.length; i++) {
      if (Math.abs(after[i] - before[i]) > 1e-6) changed = true;
    }
    expect(changed).toBe(true);
  });

  it('dispose removes meshes and frees geometry', () => {
    const root = new THREE.Group();
    const rng = mulberry32(7);
    const sys = buildWater(root, rng, [{ radius: 12, y: 0 }]);
    const geo = (root.children[0] as THREE.Mesh).geometry;
    sys!.dispose();
    expect(root.children.length).toBe(0);
    expect(geo.getAttribute('position')).toBeDefined(); // not destroyed, just unlinked
  });
});
