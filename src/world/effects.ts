import * as THREE from 'three';
import type { FlightState } from '../sim/types';
import { buildFlame, buildParachute } from './rocketMesh';

const EXPLOSION_COUNT = 120;

export class RocketVisual {
  private readonly flame: THREE.Mesh;
  private readonly chute: THREE.Mesh;
  private explosion: THREE.Points | null = null;
  private explosionVel: Float32Array | null = null;
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
    const positions = new Float32Array(EXPLOSION_COUNT * 3);
    this.explosionVel = new Float32Array(EXPLOSION_COUNT * 3);
    for (let i = 0; i < EXPLOSION_COUNT; i++) {
      const dir = new THREE.Vector3().randomDirection().multiplyScalar(6 + Math.random() * 10);
      this.explosionVel[i * 3] = dir.x;
      this.explosionVel[i * 3 + 1] = dir.y;
      this.explosionVel[i * 3 + 2] = dir.z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xff6600, size: 1.5, transparent: true, opacity: 1 });
    this.explosion = new THREE.Points(geo, mat);
    this.explosion.position.copy(this.rocket.position);
    this.scene.add(this.explosion);
  }

  private animateExplosion(): void {
    if (!this.explosion || !this.explosionVel) return;
    this.explosionAge += 1 / 60;
    const attr = this.explosion.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < EXPLOSION_COUNT; i++) {
      attr.setXYZ(i,
        attr.getX(i) + this.explosionVel[i * 3] / 60,
        attr.getY(i) + this.explosionVel[i * 3 + 1] / 60,
        attr.getZ(i) + this.explosionVel[i * 3 + 2] / 60);
    }
    attr.needsUpdate = true;
    const mat = this.explosion.material as THREE.PointsMaterial;
    mat.opacity = Math.max(0, 1 - this.explosionAge); // fade over ~1 s
  }

  dispose(): void {
    this.scene.remove(this.rocket);
    if (this.explosion) this.scene.remove(this.explosion);
  }
}
