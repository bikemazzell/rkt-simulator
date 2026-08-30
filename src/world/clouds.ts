// Flat Minecraft-style cloud slabs drifting on the wind, wrapping around
// the world so the sky is never empty.
import * as THREE from 'three';
import { randRange, type Rng } from '../sim/rng';
import type { WorldSystem } from './system';

const CLOUD_CAP = 20;
const WRAP_LIMIT = 1400;
const DRIFT_SPEED = 6; // visual m/s; sim wind values are tiny, so we scale up

/** Reflect a coordinate back into [-limit, limit] (teleport wrap). */
export function wrapCoordinate(v: number, limit: number): number {
  if (v > limit) return v - 2 * limit;
  if (v < -limit) return v + 2 * limit;
  return v;
}

function makeCloud(rng: Rng, mat: THREE.Material): THREE.Group {
  const cloud = new THREE.Group();
  const puffs = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < puffs; i++) {
    const w = randRange(rng, 24, 48);
    const d = randRange(rng, 16, 32);
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, 4, d), mat);
    box.position.set(randRange(rng, -16, 16), rng() > 0.6 ? 4 : 0, randRange(rng, -12, 12));
    cloud.add(box);
  }
  return cloud;
}

export class CloudSystem implements WorldSystem {
  private readonly clouds: THREE.Group[] = [];
  private readonly drift = new THREE.Vector2(1, 0.3).normalize().multiplyScalar(DRIFT_SPEED);
  private readonly root: THREE.Group;
  private readonly mat = new THREE.MeshLambertMaterial({ color: 0xffffff });

  constructor(root: THREE.Group, rng: Rng, windXZ: { x: number; z: number }) {
    this.root = root;
    const count = Math.min(CLOUD_CAP, 12 + Math.floor(rng() * 7));
    for (let i = 0; i < count; i++) {
      const cloud = makeCloud(rng, this.mat);
      const a = rng() * Math.PI * 2;
      const r = randRange(rng, 150, 1200);
      cloud.position.set(Math.cos(a) * r, randRange(rng, 160, 240), Math.sin(a) * r);
      root.add(cloud);
      this.clouds.push(cloud);
    }
    const len = Math.hypot(windXZ.x, windXZ.z);
    if (len > 1e-6) this.drift.set(windXZ.x / len, windXZ.z / len).multiplyScalar(DRIFT_SPEED);
  }

  update(dt: number): void {
    for (const cloud of this.clouds) {
      cloud.position.x = wrapCoordinate(cloud.position.x + this.drift.x * dt, WRAP_LIMIT);
      cloud.position.z = wrapCoordinate(cloud.position.z + this.drift.y * dt, WRAP_LIMIT);
    }
  }

  dispose(): void {
    for (const cloud of this.clouds) {
      this.root.remove(cloud);
      for (const child of cloud.children) {
        (child as THREE.Mesh).geometry.dispose();
      }
    }
    this.mat.dispose();
    this.clouds.length = 0;
  }
}
