// Blocky wandering creatures: villagers, funny farm animals, circling birds,
// and the backyard dog's idle head bob. Movement targets are pre-rolled at
// build time so updates stay deterministic (no runtime rng).
import * as THREE from 'three';
import { randRange, type Rng } from '../sim/rng';
import type { Biome } from './biome';
import type { WorldSystem } from './system';
import { scatterPositions, wanderTarget, type Vec2 } from './placement';

const GROUND_CAP = 30;
const BIRD_CAP = 14;
const WANDER_RADIUS = 25;

export interface CreatureOpts {
  groundY: number;
  minR: number;
  maxR: number;
  /** terrain sampler; walkers climb the stepped ground when provided */
  heightAt?: (x: number, z: number) => number;
}

interface Walker {
  group: THREE.Group;
  limbs: THREE.Mesh[];
  targets: Vec2[];
  targetIndex: number;
  speed: number;
  phase: number;
}

interface Bird {
  group: THREE.Group;
  wingL: THREE.Mesh;
  wingR: THREE.Mesh;
  center: Vec2;
  radius: number;
  height: number;
  angle: number;
  angularSpeed: number;
}

interface HeadBob {
  head: THREE.Object3D;
  baseY: number;
  amp: number;
  rate: number;
}

function limb(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  // Pivot at the top of the limb so rotation.x swings it like a joint.
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(0, -h / 2, 0);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

function makeVillager(rng: Rng, mats: CreatureMats): THREE.Group {
  const g = new THREE.Group();
  const robe = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.9, 0.8), mats.villagerRobe());
  robe.position.y = 0.95;
  g.add(robe);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), mats.villagerSkin());
  head.position.y = 2.3;
  g.add(head);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.4, 0.18), mats.villagerSkin());
  nose.position.set(0, 2.25, 0.45);
  g.add(nose);
  g.userData.limbs = [
    limb(0.25, 1.3, 0.25, mats.villagerRobe(), -0.68, 1.8, 0),
    limb(0.25, 1.3, 0.25, mats.villagerRobe(), 0.68, 1.8, 0),
  ];
  for (const arm of g.userData.limbs as THREE.Mesh[]) g.add(arm);
  g.rotation.y = rng() * Math.PI * 2;
  return g;
}

const ANIMAL_KINDS = ['cow', 'sheep', 'pig'] as const;
type AnimalKind = (typeof ANIMAL_KINDS)[number];

function makeAnimal(rng: Rng, kind: AnimalKind, mats: CreatureMats): THREE.Group {
  const g = new THREE.Group();
  const body = mats.animalBody(kind);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 2.2), body);
  torso.position.y = 1.25;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), mats.animalHead(kind));
  head.position.set(0, 1.55, 1.45);
  g.add(head);
  const legMat = mats.animalLeg(kind);
  const legs = [
    limb(0.32, 0.9, 0.32, legMat, -0.5, 0.9, 0.75),
    limb(0.32, 0.9, 0.32, legMat, 0.5, 0.9, 0.75),
    limb(0.32, 0.9, 0.32, legMat, -0.5, 0.9, -0.75),
    limb(0.32, 0.9, 0.32, legMat, 0.5, 0.9, -0.75),
  ];
  for (const leg of legs) g.add(leg);
  g.userData.limbs = legs;
  g.scale.setScalar(randRange(rng, 0.8, 1.25));
  g.rotation.y = rng() * Math.PI * 2;
  return g;
}

function makeBird(rng: Rng, mat: THREE.Material): { group: THREE.Group; wingL: THREE.Mesh; wingR: THREE.Mesh } {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.9), mat);
  body.position.y = 0.8;
  g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), mat);
  head.position.set(0, 1.05, 0.5);
  g.add(head);
  const beak = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.3), new THREE.MeshLambertMaterial({ color: 0xffa000 }));
  beak.position.set(0, 1.02, 0.78);
  g.add(beak);
  const wingGeoL = new THREE.BoxGeometry(1.3, 0.06, 0.5);
  wingGeoL.translate(-0.65, 0, 0);
  const wingGeoR = new THREE.BoxGeometry(1.3, 0.06, 0.5);
  wingGeoR.translate(0.65, 0, 0);
  const wingL = new THREE.Mesh(wingGeoL, mat);
  wingL.position.set(-0.25, 0.85, 0);
  const wingR = new THREE.Mesh(wingGeoR, mat);
  wingR.position.set(0.25, 0.85, 0);
  g.add(wingL, wingR);
  g.scale.setScalar(randRange(rng, 0.8, 1.3));
  return { group: g, wingL, wingR };
}

interface CreatureMats {
  villagerRobe(): THREE.Material;
  villagerSkin(): THREE.Material;
  animalBody(kind: AnimalKind): THREE.Material;
  animalHead(kind: AnimalKind): THREE.Material;
  animalLeg(kind: AnimalKind): THREE.Material;
}

function makeMats(rng: Rng): CreatureMats {
  const cache = new Map<string, THREE.Material>();
  const lambert = (color: number) => {
    const key = `c${color}`;
    let m = cache.get(key);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color });
      cache.set(key, m);
    }
    return m;
  };
  const robeColors = [0x6b4a2f, 0x54331d, 0x7a5c3a];
  return {
    villagerRobe: () => lambert(robeColors[Math.floor(rng() * robeColors.length)]),
    villagerSkin: () => lambert(0xc9a07a),
    animalBody: (k) => lambert(k === 'cow' ? 0xf5f5f5 : k === 'sheep' ? 0xe8e8e8 : 0xe79fb1),
    animalHead: (k) => lambert(k === 'cow' ? 0xd98c8c : k === 'sheep' ? 0xc7a17a : 0xe79fb1),
    animalLeg: (k) => lambert(k === 'cow' ? 0xe0e0e0 : k === 'sheep' ? 0x9c9c9c : 0xd98c98),
  };
}

export class CreatureSystem implements WorldSystem {
  private readonly walkers: Walker[] = [];
  private readonly birds: Bird[] = [];
  private readonly bobs: HeadBob[] = [];
  private heightAt: ((x: number, z: number) => number) | null = null;

  constructor(root?: THREE.Group, biome?: Biome, rng?: Rng, opts?: CreatureOpts) {
    if (root && biome && rng && opts) this.populate(root, biome, rng, opts);
  }

  /** Attach an idle head bob to any object (the backyard dog's head). */
  addHeadBob(head: THREE.Object3D, amp = 0.1, rate = 2.2): void {
    this.bobs.push({ head, baseY: head.position.y, amp, rate });
  }

  private populate(root: THREE.Group, biome: Biome, rng: Rng, opts: CreatureOpts): void {
    const { groundY, minR, maxR } = opts;
    this.heightAt = opts.heightAt ?? null;
    const ground = (x: number, z: number): number => (this.heightAt ? this.heightAt(x, z) : groundY);
    const c = biome.creatures;
    const villagers = Math.min(c.villagers, GROUND_CAP);
    const animals = Math.min(c.animals, GROUND_CAP - villagers);
    const birdCount = Math.min(c.birds, BIRD_CAP);
    const mats = makeMats(rng);

    const spawns = scatterPositions(rng, villagers + animals, { minR, maxR });
    for (let i = 0; i < villagers; i++) {
      const group = makeVillager(rng, mats);
      group.position.set(spawns[i].x, ground(spawns[i].x, spawns[i].z), spawns[i].z);
      root.add(group);
      this.walkers.push({
        group,
        limbs: group.userData.limbs as THREE.Mesh[],
        targets: prerollTargets(rng, spawns[i], maxR),
        targetIndex: 0,
        speed: randRange(rng, 1.2, 2.4),
        phase: rng() * Math.PI * 2,
      });
    }
    for (let i = 0; i < animals; i++) {
      const kind = ANIMAL_KINDS[Math.floor(rng() * ANIMAL_KINDS.length)];
      const group = makeAnimal(rng, kind, mats);
      const spawn = spawns[villagers + i];
      group.position.set(spawn.x, ground(spawn.x, spawn.z), spawn.z);
      root.add(group);
      this.walkers.push({
        group,
        limbs: group.userData.limbs as THREE.Mesh[],
        targets: prerollTargets(rng, spawn, maxR),
        targetIndex: 0,
        speed: randRange(rng, 1.0, 2.0),
        phase: rng() * Math.PI * 2,
      });
    }
    const birdMat = new THREE.MeshLambertMaterial({ color: biome.envId === 'bathtub' ? 0xffd21e : 0xd9dde3 });
    for (const center of scatterPositions(rng, birdCount, { minR: minR * 0.5, maxR: maxR * 0.7 })) {
      const { group, wingL, wingR } = makeBird(rng, birdMat);
      const radius = randRange(rng, 15, 50);
      group.position.set(center.x, ground(center.x, center.z) + randRange(rng, 25, 60), center.z);
      root.add(group);
      this.birds.push({
        group,
        wingL,
        wingR,
        center,
        radius,
        height: group.position.y,
        angle: rng() * Math.PI * 2,
        angularSpeed: rng() > 0.5 ? randRange(rng, 0.35, 0.7) : -randRange(rng, 0.35, 0.7),
      });
    }
  }

  update(dt: number, elapsed: number): void {
    for (const w of this.walkers) {
      const target = w.targets[w.targetIndex];
      const dx = target.x - w.group.position.x;
      const dz = target.z - w.group.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.8) {
        w.targetIndex = (w.targetIndex + 1) % w.targets.length;
        continue;
      }
      const step = Math.min(dist, w.speed * dt);
      w.group.position.x += (dx / dist) * step;
      w.group.position.z += (dz / dist) * step;
      if (this.heightAt) w.group.position.y = this.heightAt(w.group.position.x, w.group.position.z);
      const desired = Math.atan2(dx, dz);
      let diff = desired - w.group.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      w.group.rotation.y += diff * Math.min(1, dt * 6);
      w.phase += dt * w.speed * 3.2;
      for (let i = 0; i < w.limbs.length; i++) {
        w.limbs[i].rotation.x = Math.sin(w.phase + (i % 2) * Math.PI) * 0.55;
      }
    }
    for (const b of this.birds) {
      b.angle += b.angularSpeed * dt;
      b.group.position.x = b.center.x + Math.cos(b.angle) * b.radius;
      b.group.position.z = b.center.z + Math.sin(b.angle) * b.radius;
      b.group.position.y = b.height + Math.sin(elapsed * 1.7 + b.angle) * 2;
      b.group.rotation.y = -b.angle; // face along the circle tangent
      const flap = Math.sin(elapsed * 9 + b.angle * 3) * 0.7;
      b.wingL.rotation.z = flap;
      b.wingR.rotation.z = -flap;
    }
    for (const h of this.bobs) {
      h.head.position.y = h.baseY + Math.sin(elapsed * h.rate) * h.amp;
    }
  }

  dispose(): void {
    this.walkers.length = 0;
    this.birds.length = 0;
    this.bobs.length = 0;
  }
}

function clampToRadius(p: Vec2, maxR: number): Vec2 {
  const r = Math.hypot(p.x, p.z);
  if (r <= maxR) return p;
  return { x: (p.x / r) * maxR, z: (p.z / r) * maxR };
}

function prerollTargets(rng: Rng, spawn: Vec2, maxR: number): Vec2[] {
  const targets: Vec2[] = [];
  for (let i = 0; i < 8; i++) {
    targets.push(clampToRadius(wanderTarget(rng, spawn, WANDER_RADIUS), maxR));
  }
  return targets;
}
