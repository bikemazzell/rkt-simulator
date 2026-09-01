// Blocky Minecraft-style flora: oaks, birches, pines, palms, cacti, shrubs,
// flowers and instanced grass tufts, plus a wind sway system for canopies.
import * as THREE from 'three';
import { randRange, type Rng } from '../sim/rng';
import type { Biome } from './biome';
import type { WorldSystem } from './system';
import { scatterPositions } from './placement';

const TRUNK_BROWN = 0x6b4423;
const BIRCH_WHITE = 0xd7d3c8;
const GRASS_GREEN = 0x4c8f3a;

type SwayEntry = { obj: THREE.Object3D; baseZ: number; phase: number; amp: number };

export class VegetationSystem implements WorldSystem {
  private readonly swayers: SwayEntry[] = [];

  addSway(obj: THREE.Object3D, amp: number): void {
    this.swayers.push({ obj, baseZ: obj.rotation.z, phase: obj.position.x * 0.7 + obj.position.z * 1.3, amp });
  }

  update(_dt: number, elapsed: number): void {
    const t = elapsed * 1.4;
    for (const s of this.swayers) {
      s.obj.rotation.z = s.baseZ + Math.sin(t + s.phase) * s.amp;
    }
  }

  dispose(): void {
    this.swayers.length = 0;
  }
}

function box(w: number, h: number, d: number, mat: THREE.Material, y: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.y = y;
  return m;
}

function makeOak(rng: Rng, mats: FloraMats): THREE.Group {
  const g = new THREE.Group();
  const th = randRange(rng, 3.5, 5);
  g.add(box(1.2, th, 1.2, mats.trunk, th / 2));
  const leaf = mats.pickLeaf(rng);
  const cw = randRange(rng, 3.6, 4.8);
  g.add(box(cw, 2.6, cw, leaf, th + 1.3));
  g.add(box(cw * 0.55, 1.6, cw * 0.55, leaf, th + 3.2));
  return g;
}

function makeBirch(rng: Rng, mats: FloraMats): THREE.Group {
  const g = new THREE.Group();
  const th = randRange(rng, 4.5, 6);
  g.add(box(1, th, 1, mats.birchTrunk, th / 2));
  const cw = randRange(rng, 2.6, 3.4);
  g.add(box(cw, 2.2, cw, mats.pickLeaf(rng), th + 1.1));
  return g;
}

function makePine(rng: Rng, mats: FloraMats): THREE.Group {
  const g = new THREE.Group();
  const th = randRange(rng, 2, 3);
  g.add(box(1, th, 1, mats.trunk, th / 2));
  let y = th;
  let w = randRange(rng, 2.8, 3.4);
  const tiers = 3;
  for (let i = 0; i < tiers; i++) {
    g.add(box(w, 1.6, w, mats.pineLeaf, y + 0.8));
    y += 1.25;
    w *= 0.68;
  }
  return g;
}

function makePalm(rng: Rng, mats: FloraMats): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.9, 4, 0.9, mats.trunk, 2));
  const upper = box(0.9, 2.4, 0.9, mats.trunk, 5);
  upper.position.x = 0.7;
  g.add(upper);
  const frondMat = mats.pickLeaf(rng);
  for (let i = 0; i < 4; i++) {
    const frond = box(3.4, 0.25, 1, frondMat, 6.4);
    frond.rotation.y = (i / 4) * Math.PI * 2;
    frond.position.x = Math.cos(frond.rotation.y) * 1.4;
    frond.position.z = -Math.sin(frond.rotation.y) * 1.4;
    g.add(frond);
  }
  return g;
}

function makeCactus(rng: Rng, mats: FloraMats): THREE.Group {
  const g = new THREE.Group();
  const h = randRange(rng, 5, 8);
  g.add(box(1.2, h, 1.2, mats.cactus, h / 2));
  const armY = randRange(rng, h * 0.45, h * 0.7);
  const arm = box(3, 1.1, 1.1, mats.cactus, armY);
  arm.position.x = 1.4;
  g.add(arm);
  if (rng() > 0.5) {
    const arm2 = box(2.4, 1.1, 1.1, mats.cactus, armY + 1.2);
    arm2.position.x = -1.2;
    g.add(arm2);
  }
  return g;
}

function makeShrub(rng: Rng, mats: FloraMats): THREE.Group {
  const g = new THREE.Group();
  const s = randRange(rng, 1.1, 1.8);
  g.add(box(s, s * 0.8, s, mats.pickLeaf(rng), (s * 0.8) / 2));
  return g;
}

function makeFlower(rng: Rng, mats: FloraMats): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.15, 0.35, 0.15, mats.stem, 0.175));
  g.add(box(0.3, 0.25, 0.3, mats.pickFlower(rng), 0.45));
  return g;
}

interface FloraMats {
  trunk: THREE.Material;
  birchTrunk: THREE.Material;
  pineLeaf: THREE.Material;
  cactus: THREE.Material;
  stem: THREE.Material;
  leaves: THREE.Material[];
  flowers: THREE.Material[];
  pickLeaf(rng: Rng): THREE.Material;
  pickFlower(rng: Rng): THREE.Material;
}

function makeMats(): FloraMats {
  const lambert = (color: number) => new THREE.MeshLambertMaterial({ color });
  const leaves = [0x2e7d32, 0x388e3c, 0x43a047, 0x51b35a].map(lambert);
  const flowers = [0xe53935, 0xfdd835, 0xec407a, 0x8e24aa].map(lambert);
  return {
    trunk: lambert(TRUNK_BROWN),
    birchTrunk: lambert(BIRCH_WHITE),
    pineLeaf: lambert(0x1b5e20),
    cactus: lambert(0x2f6b3a),
    stem: lambert(0x33691e),
    leaves,
    flowers,
    pickLeaf: (rng) => leaves[Math.floor(rng() * leaves.length)],
    pickFlower: (rng) => flowers[Math.floor(rng() * flowers.length)],
  };
}

function treeKindFor(envId: string, rng: Rng): (mats: FloraMats) => THREE.Group {
  switch (envId) {
    case 'park':
      return (m) => (rng() > 0.4 ? makeOak(rng, m) : makeBirch(rng, m));
    case 'urban':
      return (m) => makeOak(rng, m);
    case 'mountain':
      return (m) => makePine(rng, m);
    case 'desert':
      return (m) => makeCactus(rng, m);
    case 'sea':
      return (m) => makePalm(rng, m);
    case 'rooftop':
    case 'backyard-dog':
      return (m) => makeShrub(rng, m); // hedges
    default:
      return (m) => makeOak(rng, m);
  }
}

const GRASS_CAP = 2000;

function buildGrass(
  root: THREE.Group,
  rng: Rng,
  count: number,
  groundY: number,
  minR: number,
  maxR: number,
  heightAt?: (x: number, z: number) => number,
): void {
  const n = Math.min(count, GRASS_CAP);
  if (n <= 0) return;
  const geo = new THREE.BoxGeometry(0.22, 0.4, 0.22);
  const mat = new THREE.MeshLambertMaterial({ color: GRASS_GREEN });
  const grass = new THREE.InstancedMesh(geo, mat, n);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const col = new THREE.Color();
  const spots = scatterPositions(rng, n, { minR, maxR });
  for (let i = 0; i < n; i++) {
    const p = spots[i];
    const y = heightAt ? heightAt(p.x, p.z) : groundY;
    pos.set(p.x, y + 0.2, p.z);
    q.setFromAxisAngle(new THREE.Vector3(1, 0, 0.3).normalize(), randRange(rng, -0.15, 0.15));
    scl.set(1, randRange(rng, 0.6, 1.4), 1);
    m.compose(pos, q, scl);
    grass.setMatrixAt(i, m);
    const shade = randRange(rng, 0.75, 1.15);
    col.setRGB(Math.min(1, 0.30 * shade), Math.min(1, 0.55 * shade), Math.min(1, 0.23 * shade));
    grass.setColorAt(i, col);
  }
  grass.instanceMatrix.needsUpdate = true;
  root.add(grass);
}

export interface VegetationOpts {
  groundY: number;
  minR: number;
  maxR: number;
  /** terrain sampler; plants sit on the stepped ground when provided */
  heightAt?: (x: number, z: number) => number;
}

/** Scatter the biome's flora; returns the sway system (or null when empty). */
export function buildVegetation(root: THREE.Group, biome: Biome, rng: Rng, opts: VegetationOpts): VegetationSystem | null {
  const { groundY, minR, maxR, heightAt } = opts;
  const ground = (x: number, z: number): number => (heightAt ? heightAt(x, z) : groundY);
  const flora = biome.flora;
  const mats = makeMats();
  const sway = new VegetationSystem();
  let placed = 0;

  const makeTree = treeKindFor(biome.envId, rng);
  for (const p of scatterPositions(rng, flora.trees, { minR, maxR })) {
    const tree = makeTree(mats);
    tree.position.set(p.x, ground(p.x, p.z), p.z);
    tree.rotation.y = rng() * Math.PI * 2;
    root.add(tree);
    sway.addSway(tree, randRange(rng, 0.02, 0.045));
    placed++;
  }
  for (const p of scatterPositions(rng, flora.shrubs, { minR, maxR })) {
    const shrub = makeShrub(rng, mats);
    shrub.position.set(p.x, ground(p.x, p.z), p.z);
    root.add(shrub);
    sway.addSway(shrub, 0.05);
    placed++;
  }
  for (const p of scatterPositions(rng, flora.flowers, { minR, maxR })) {
    const flower = makeFlower(rng, mats);
    flower.position.set(p.x, ground(p.x, p.z), p.z);
    root.add(flower);
    placed++;
  }
  buildGrass(root, rng, flora.grass, groundY, minR, maxR, heightAt);

  return placed > 0 ? sway : null;
}
