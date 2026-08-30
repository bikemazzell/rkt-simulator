import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { mulberry32 } from '../../src/sim/rng';
import { BIOME_ENV_IDS, biomeFor } from '../../src/world/biome';
import { CreatureSystem } from '../../src/world/creatures';

describe('CreatureSystem', () => {
  it('scatters the biome mix (park: 8 villagers + 8 animals + 12 birds)', () => {
    const root = new THREE.Group();
    const biome = biomeFor('park');
    const sys = new CreatureSystem(root, biome, mulberry32(51), { groundY: 0, minR: 30, maxR: 250 });
    expect(sys).toBeTruthy();
    expect(root.children.length).toBe(8 + 8 + 12);
  });

  it('respects the ground and bird caps for every biome', () => {
    for (const id of BIOME_ENV_IDS) {
      const root = new THREE.Group();
      new CreatureSystem(root, biomeFor(id), mulberry32(3), { groundY: 0, minR: 30, maxR: 250 });
      const c = biomeFor(id).creatures;
      const ground = Math.min(c.villagers, 30) + Math.min(c.animals, 30);
      const birds = Math.min(c.birds, 14);
      expect(root.children.length).toBeLessThanOrEqual(30 + 14);
      expect(root.children.length).toBe(Math.min(ground, 30) + birds);
    }
  });

  it('is deterministic for a given seed', () => {
    const a = new THREE.Group();
    const b = new THREE.Group();
    new CreatureSystem(a, biomeFor('park'), mulberry32(9), { groundY: 0, minR: 30, maxR: 250 });
    new CreatureSystem(b, biomeFor('park'), mulberry32(9), { groundY: 0, minR: 30, maxR: 250 });
    expect(a.children.map((c) => c.position.toArray())).toEqual(b.children.map((c) => c.position.toArray()));
  });

  it('walkers wander over time and stay inside the world bounds', () => {
    const root = new THREE.Group();
    const sys = new CreatureSystem(root, biomeFor('park'), mulberry32(12), { groundY: 5, minR: 30, maxR: 250 });
    const walker = root.children[0];
    const start = walker.position.clone();
    let moved = false;
    for (let t = 0; t < 60; t += 1 / 30) {
      sys.update(1 / 30, t);
      if (walker.position.distanceTo(start) > 0.5) moved = true;
      const r = Math.hypot(walker.position.x, walker.position.z);
      expect(r).toBeLessThanOrEqual(250 + 30); // wander slack inside spawn ring
    }
    expect(moved).toBe(true);
    expect(walker.position.y).toBe(5); // grounded
  });

  it('birds circle: they move but stay near their spawn ring', () => {
    const root = new THREE.Group();
    const sys = new CreatureSystem(root, biomeFor('sea'), mulberry32(8), { groundY: 0, minR: 30, maxR: 700 });
    // sea = birds only
    expect(root.children.length).toBe(10);
    const bird = root.children[0];
    const positions: THREE.Vector3[] = [];
    for (let t = 0; t < 10; t += 1 / 30) {
      sys.update(1 / 30, t);
      positions.push(bird.position.clone());
    }
    const spread = Math.hypot(
      Math.max(...positions.map((p) => p.x)) - Math.min(...positions.map((p) => p.x)),
      Math.max(...positions.map((p) => p.z)) - Math.min(...positions.map((p) => p.z)),
    );
    expect(spread).toBeGreaterThan(5); // actually flying a circle
    expect(bird.position.y).toBeGreaterThan(20); // airborne
  });

  it('head bob oscillates the attached object', () => {
    const head = new THREE.Mesh();
    head.position.y = 3;
    const sys = new CreatureSystem();
    sys.addHeadBob(head, 0.2, 3);
    const ys: number[] = [];
    for (let t = 0; t < 3; t += 0.05) ys.push(head.position.y);
    for (let t = 0; t < 3; t += 0.05) {
      sys.update(0.05, t);
      ys.push(head.position.y);
    }
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.2);
  });
});

describe('CreatureSystem on terrain', () => {
  it('walkers climb the terrain as they wander', () => {
    const root = new THREE.Group();
    const biome = biomeFor('park');
    const heightAt = (x: number, z: number): number => Math.round((x + z) / 20) * 4;
    const sys = new CreatureSystem(root, biome, mulberry32(77), {
      groundY: 0, minR: 30, maxR: 250, heightAt,
    });
    const walkers = root.children.filter((c) => c.userData && c.userData.limbs);
    expect(walkers.length).toBe(biome.creatures.villagers + biome.creatures.animals);
    for (const w of walkers) {
      expect(w.position.y).toBe(heightAt(w.position.x, w.position.z));
    }
    // After walking for a while they must still be glued to the ground.
    for (let i = 0; i < 240; i++) sys.update(1 / 30, i / 30);
    for (const w of walkers) {
      expect(w.position.y).toBe(heightAt(w.position.x, w.position.z));
    }
  });
});
