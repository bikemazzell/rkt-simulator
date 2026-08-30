import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { mulberry32 } from '../../src/sim/rng';
import { biomeFor } from '../../src/world/biome';
import { buildVegetation } from '../../src/world/vegetation';

describe('buildVegetation', () => {
  it('scatters the biome flora mix as root children (park)', () => {
    const root = new THREE.Group();
    const biome = biomeFor('park');
    const sway = buildVegetation(root, biome, mulberry32(21), { groundY: 0, minR: 30, maxR: 250 });
    expect(sway).toBeTruthy();
    // 60 trees + 30 shrubs + 80 flowers + 1 instanced grass
    expect(root.children.length).toBe(biome.flora.trees + biome.flora.shrubs + biome.flora.flowers + 1);
    const grass = root.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    expect(grass).toBeTruthy();
    expect(grass.count).toBe(Math.min(biome.flora.grass, 2000));
  });

  it('respects the launch clearance ring', () => {
    const root = new THREE.Group();
    buildVegetation(root, biomeFor('park'), mulberry32(4), { groundY: 0, minR: 30, maxR: 250 });
    for (const child of root.children) {
      if (child instanceof THREE.InstancedMesh) continue; // instances carry their own offsets
      const r = Math.hypot(child.position.x, child.position.z);
      expect(r).toBeGreaterThanOrEqual(30 - 1e-6);
      expect(r).toBeLessThanOrEqual(250 + 1e-6);
    }
  });

  it('desert gets cacti (blocky green columns), not leafy oaks', () => {
    const root = new THREE.Group();
    buildVegetation(root, biomeFor('desert'), mulberry32(6), { groundY: 0, minR: 30, maxR: 600 });
    const cactus = root.children[0];
    // Cactus trunk: 1.2 wide box, much taller than wide.
    const trunk = cactus.children[0] as THREE.Mesh;
    const geo = trunk.geometry as THREE.BoxGeometry;
    expect(geo.parameters.height).toBeGreaterThan(geo.parameters.width * 3);
  });

  it('returns null for a biome with no flora (sea)', () => {
    const root = new THREE.Group();
    const sway = buildVegetation(root, biomeFor('sea'), mulberry32(6), { groundY: 0, minR: 30, maxR: 600 });
    expect(sway).toBeNull();
    expect(root.children.length).toBe(0);
  });

  it('sway system oscillates tree tilt over time', () => {
    const root = new THREE.Group();
    const sway = buildVegetation(root, biomeFor('park'), mulberry32(21), { groundY: 0, minR: 30, maxR: 250 })!;
    const tree = root.children[0];
    const before = tree.rotation.z;
    let after = before;
    for (let t = 0; t < 10; t += 0.1) {
      sway.update(0.1, t);
      after = tree.rotation.z;
      if (Math.abs(after - before) > 1e-4) break;
    }
    expect(Math.abs(after - before)).toBeGreaterThan(1e-4);
    sway.dispose();
    expect(sway.update(0, 0)).toBeUndefined();
  });
});

describe('buildVegetation on terrain', () => {
  it('plants sit on the sampled terrain height', () => {
    const root = new THREE.Group();
    const biome = biomeFor('park');
    const heightAt = (x: number, z: number): number => Math.round((x + z) / 20) * 4;
    buildVegetation(root, biome, mulberry32(33), { groundY: 0, minR: 30, maxR: 250, heightAt });
    const plants = root.children.filter((c) => !(c instanceof THREE.InstancedMesh));
    expect(plants.length).toBeGreaterThan(0);
    for (const p of plants) {
      expect(p.position.y).toBe(heightAt(p.position.x, p.position.z));
    }
    // Grass instances follow the terrain too.
    const grass = root.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    const a = grass.instanceMatrix.array as Float32Array;
    for (let i = 0; i < grass.count; i += 37) {
      const x = a[i * 16 + 12];
      const y = a[i * 16 + 13];
      const z = a[i * 16 + 14];
      expect(y).toBeCloseTo(heightAt(x, z) + 0.45, 5);
    }
  });
});
