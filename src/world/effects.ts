import * as THREE from 'three';
import type { FlightState, Rocket } from '../sim/types';
import { buildFlame, buildParachute } from './rocketMesh';

const EXPLOSION_COLORS = [0xff3020, 0xff8c00, 0xffe14d, 0xffffff];
const EXPLOSION_COUNT = 16;
const EXPLOSION_LIFE = 1.3; // seconds

// Exhaust trail: world-space points dropped behind the rocket, kept for a
// short window so the flight path reads in orbit mode without cluttering.
const TRAIL_SECONDS = 1.5;
const TRAIL_MAX = 256;

// Attitude tracking: the nose follows the velocity vector while flying freely
// (weathercocking) and points back up once the chute is out — the rocket hangs
// nose-up from the canopy while descending.
const ATTITUDE_RATE = 5;          // slerp responsiveness, 1/s
const ATTITUDE_MIN_SPEED = 1.5;   // m/s below which there is no direction to follow
const UP = new THREE.Vector3(0, 1, 0);

interface Debris { mesh: THREE.Mesh; vel: THREE.Vector3; }

export class RocketVisual {
  private readonly flame: THREE.Mesh;
  private readonly chute: THREE.Mesh;
  private explosion: THREE.Group | null = null;
  private readonly debris: Debris[] = [];
  private readonly debrisGeo = new THREE.SphereGeometry(1, 8, 8);
  private explosionAge = 0;
  private exploded = false;
  private readonly trail: THREE.Line;
  private readonly trailPos = new Float32Array(TRAIL_MAX * 3);
  private readonly trailCol = new Float32Array(TRAIL_MAX * 3);
  private readonly trailTimes: number[] = [];
  private readonly trailPts: number[] = [];
  private trailCount = 0;
  private lastAttitudeTime: number | null = null;

  /** The rocket group this visual animates (its position/attitude are driven by update()). */
  get flightMesh(): THREE.Group { return this.rocket; }

  constructor(
    private readonly scene: THREE.Scene,
    private readonly rocket: THREE.Group,
    data: Rocket,
  ) {
    scene.add(rocket);
    this.flame = buildFlame(data);
    this.flame.visible = false;
    rocket.add(this.flame);
    this.chute = buildParachute(0xff5533, data.chuteDiameterM);
    this.chute.visible = false;
    rocket.add(this.chute);
    // Sit the canopy just above the nose tip regardless of the rocket's length.
    const topY = typeof rocket.userData.topY === 'number' ? rocket.userData.topY : 8;
    const chuteR = typeof this.chute.userData.radiusM === 'number'
      ? this.chute.userData.radiusM
      : 0.25;
    this.chute.position.y = topY + chuteR;

    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3));
    trailGeo.setAttribute('color', new THREE.BufferAttribute(this.trailCol, 3));
    trailGeo.setDrawRange(0, 0);
    this.trail = new THREE.Line(
      trailGeo,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7 }),
    );
    this.trail.frustumCulled = false; // dynamic bounds; avoid per-frame recompute
    scene.add(this.trail);
  }

  update(state: FlightState): void {
    this.rocket.position.set(state.position.x, state.position.y, state.position.z);
    this.pushTrail(state.time, state.position.x, state.position.y, state.position.z);
    this.flame.visible = state.phase === 'boost';
    if (this.flame.visible) {
      // Position is baked into buildFlame (base flush with the nozzle);
      // only cosmetic scale jitter happens here.
      this.flame.scale.y = 0.7 + Math.random() * 0.6;
    }
    this.chute.visible = state.chuteDeployed &&
      (state.phase === 'coast' || state.phase === 'apogee' || state.phase === 'descent');
    this.updateAttitude(state);
    if ((state.phase === 'failed' || state.outcome === 'cato') && !this.exploded) {
      this.explode();
    }
    if (this.explosion) this.animateExplosion();
  }

  /**
   * Point the nose along the direction of travel: while thrusting/coasting the
   * rocket weathercocks into the airflow (velocity-aligned), and once the chute
   * is out it hangs nose-up under the canopy. Before liftoff the launch-aim
   * tilt is kept; after landing the last attitude is frozen.
   */
  private updateAttitude(state: FlightState): void {
    if (!state.liftedOff || state.phase === 'landed' || state.phase === 'failed') return;
    const v = state.velocity;
    const speed = Math.hypot(v.x, v.y, v.z);
    if (speed < ATTITUDE_MIN_SPEED) return;
    const dt = this.lastAttitudeTime === null ? 0 : Math.max(0, state.time - this.lastAttitudeTime);
    this.lastAttitudeTime = state.time;
    if (dt <= 0) return; // sim clock frozen between steps — nothing new to track

    const target = new THREE.Vector3(v.x / speed, v.y / speed, v.z / speed);
    if (state.chuteDeployed) target.set(0, 1, 0); // hang nose-up from the canopy
    const desired = new THREE.Quaternion().setFromUnitVectors(UP, target);
    const k = 1 - Math.exp(-ATTITUDE_RATE * dt);
    this.rocket.quaternion.slerp(desired, k);
  }

  explode(): void {
    this.exploded = true;
    this.rocket.visible = false;
    this.trail.visible = false;
    this.explosion = new THREE.Group();
    this.explosion.position.copy(this.rocket.position);
    for (let i = 0; i < EXPLOSION_COUNT; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: EXPLOSION_COLORS[i % EXPLOSION_COLORS.length], transparent: true, opacity: 1,
      });
      const mesh = new THREE.Mesh(this.debrisGeo, mat);
      // True-scale debris: centimeter-ish fragments, not boulders.
      mesh.scale.setScalar(0.06 + Math.random() * 0.14);
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

  private pushTrail(time: number, x: number, y: number, z: number): void {
    // Once the sim is done its clock freezes; don't stack duplicate points.
    if (this.trailTimes.length > 0 && time === this.trailTimes[this.trailTimes.length - 1]) return;
    // Drop expired points from the head so the trail fades behind the rocket.
    while (this.trailTimes.length > 0 && time - this.trailTimes[0] > TRAIL_SECONDS) {
      this.trailTimes.shift();
      this.trailPts.splice(0, 3);
    }
    if (this.trailTimes.length >= TRAIL_MAX) {
      this.trailTimes.shift();
      this.trailPts.splice(0, 3);
    }
    this.trailTimes.push(time);
    this.trailPts.push(x, y, z);
    this.trailCount = this.trailTimes.length;
    const head = this.trailCount - 1;
    for (let i = 0; i < this.trailCount; i++) {
      const o = i * 3;
      this.trailPos[o] = this.trailPts[o];
      this.trailPos[o + 1] = this.trailPts[o + 1];
      this.trailPos[o + 2] = this.trailPts[o + 2];
      // Darken towards the tail so the line reads as fading exhaust.
      const t = head === 0 ? 1 : i / head;
      const shade = 0.25 + 0.75 * t;
      this.trailCol[o] = shade;
      this.trailCol[o + 1] = shade;
      this.trailCol[o + 2] = shade;
    }
    const geo = this.trail.geometry as THREE.BufferGeometry;
    geo.setDrawRange(0, this.trailCount);
    (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.scene.remove(this.rocket);
    this.scene.remove(this.trail);
    (this.trail.geometry as THREE.BufferGeometry).dispose();
    (this.trail.material as THREE.Material).dispose();
    this.disposeExplosion();
    this.debrisGeo.dispose();
  }
}
