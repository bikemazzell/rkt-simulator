import * as THREE from 'three';
import type { FlightState } from '../sim/types';
import { buildFlame, buildParachute } from './rocketMesh';

const EXPLOSION_COLORS = [0xff3020, 0xff8c00, 0xffe14d, 0xffffff];
const EXPLOSION_COUNT = 16;
const EXPLOSION_LIFE = 1.3; // seconds

interface Debris { mesh: THREE.Mesh; vel: THREE.Vector3; }

export class RocketVisual {
  private readonly flame: THREE.Mesh;
  private readonly chute: THREE.Mesh;
  private explosion: THREE.Group | null = null;
  private readonly debris: Debris[] = [];
  private readonly debrisGeo = new THREE.SphereGeometry(1, 8, 8);
  private explosionAge = 0;
  private exploded = false;

  constructor(private readonly scene: THREE.Scene, private readonly rocket: THREE.Group) {
    scene.add(rocket);
    this.flame = buildFlame();
    this.flame.visible = false;
    rocket.add(this.flame);
    this.chute = buildParachute();
    this.chute.visible = false;
    rocket.add(this.chute);
    // Sit the canopy above the nose tip regardless of the rocket's length.
    const topY = typeof rocket.userData.topY === 'number' ? rocket.userData.topY : 8;
    this.chute.position.y = topY + 3;
  }

  update(state: FlightState): void {
    this.rocket.position.set(state.position.x, state.position.y, state.position.z);
    this.flame.visible = state.phase === 'boost';
    if (this.flame.visible) {
      this.flame.position.y = -1;
      this.flame.scale.y = 0.7 + Math.random() * 0.6; // cosmetic jitter (world layer)
    }
    this.chute.visible = state.chuteDeployed &&
      (state.phase === 'coast' || state.phase === 'apogee' || state.phase === 'descent');
    if ((state.phase === 'failed' || state.outcome === 'cato') && !this.exploded) {
      this.explode();
    }
    if (this.explosion) this.animateExplosion();
  }

  explode(): void {
    this.exploded = true;
    this.rocket.visible = false;
    this.explosion = new THREE.Group();
    this.explosion.position.copy(this.rocket.position);
    for (let i = 0; i < EXPLOSION_COUNT; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: EXPLOSION_COLORS[i % EXPLOSION_COLORS.length], transparent: true, opacity: 1,
      });
      const mesh = new THREE.Mesh(this.debrisGeo, mat);
      mesh.scale.setScalar(0.8 + Math.random() * 1.8);
      const vel = new THREE.Vector3().randomDirection().multiplyScalar(8 + Math.random() * 16);
      vel.y = Math.abs(vel.y) * 0.7 + 4; // bias the burst upward
      this.debris.push({ mesh, vel });
      this.explosion.add(mesh);
    }
    this.scene.add(this.explosion);
  }

  private animateExplosion(): void {
    if (!this.explosion) return;
    const dt = 1 / 60;
    this.explosionAge += dt;
    const fade = Math.max(0, 1 - this.explosionAge / EXPLOSION_LIFE);
    for (const { mesh, vel } of this.debris) {
      mesh.position.addScaledVector(vel, dt);
      vel.y -= 22 * dt; // gravity arc
      mesh.scale.multiplyScalar(0.975);
      (mesh.material as THREE.MeshBasicMaterial).opacity = fade;
    }
    if (this.explosionAge >= EXPLOSION_LIFE) this.disposeExplosion();
  }

  private disposeExplosion(): void {
    if (!this.explosion) return;
    this.scene.remove(this.explosion);
    for (const { mesh } of this.debris) (mesh.material as THREE.MeshBasicMaterial).dispose();
    this.debris.length = 0;
    this.explosion = null;
  }

  dispose(): void {
    this.scene.remove(this.rocket);
    this.disposeExplosion();
    this.debrisGeo.dispose();
  }
}
