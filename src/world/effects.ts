import * as THREE from 'three';
import type { FlightState, RecoveryDevice, Rocket } from '../sim/types';
import { buildFlame, buildParachute, buildStreamer, buildRotor, buildGliderWings } from './rocketMesh';
import { dominantDevice } from '../sim/recovery';

const EXPLOSION_COLORS = [0xff3020, 0xff8c00, 0xffe14d, 0xffffff];
const EXPLOSION_COUNT = 16;
const EXPLOSION_LIFE = 1.3; // seconds

// Exhaust trail: world-space points dropped behind the rocket, kept for a
// short window so the flight path reads in orbit mode without cluttering.
const TRAIL_SECONDS = 1.5;
const TRAIL_MAX = 256;

// Attitude tracking: the nose follows the velocity vector while flying freely
// (weathercocking) and points back up once the recovery is out — the rocket
// hangs nose-up from canopy, streamer, or rotor while descending.
const ATTITUDE_RATE = 5;          // slerp responsiveness, 1/s
const ATTITUDE_MIN_SPEED = 1.5;   // m/s below which there is no direction to follow
const HELI_SPIN_RAD = 4;          // rad/s yaw under the rotor
const TUMBLE_SPIN_RAD = Math.PI * 2 * 0.8; // end-over-end, ~0.8 rev/s
const GLIDER_BANK_RAD = 0.35;     // ~20° bank on the glide circle
const ROTOR_SPIN_RAD = 20;        // visual blade spin, rad/s
const STREAMER_FLAP_RAD = 0.25;   // ribbon flap amplitude
const SWAY_RAD = 0.06;            // gentle pendulum sway under canopy/streamer
const UP = new THREE.Vector3(0, 1, 0);
const NOSE_UP_DEVICES: RecoveryDevice[] = ['parachute', 'streamer', 'helicopter'];

interface Debris { mesh: THREE.Mesh; vel: THREE.Vector3; }

/** Environment wind (m/s) used to lean a hanging recovery downwind. */
export interface RocketVisualOpts { wind?: { x: number; z: number } }

export class RocketVisual {
  private readonly flame: THREE.Mesh;
  private readonly chute: THREE.Mesh;
  private readonly streamer: THREE.Group;
  private readonly rotor: THREE.Group;
  private readonly wings: THREE.Group;
  private readonly data: Rocket;
  private readonly wind: { x: number; z: number } | undefined;
  private explosion: THREE.Group | null = null;
  private readonly debris: Debris[] = [];
  private readonly debrisGeo = new THREE.SphereGeometry(1, 8, 8);
  private explosionAge = 0;
  private exploded = false;
  private wrecked = false;
  private scorch: THREE.Mesh | null = null;
  private readonly trail: THREE.Line;
  private readonly trailPos = new Float32Array(TRAIL_MAX * 3);
  private readonly trailCol = new Float32Array(TRAIL_MAX * 3);
  private readonly trailTimes: number[] = [];
  private readonly trailPts: number[] = [];
  private trailCount = 0;
  private lastAttitudeTime: number | null = null;
  private lastDeviceTime: number | null = null;

  /** The rocket group this visual animates (its position/attitude are driven by update()). */
  get flightMesh(): THREE.Group { return this.rocket; }

  constructor(
    private readonly scene: THREE.Scene,
    private readonly rocket: THREE.Group,
    data: Rocket,
    opts?: RocketVisualOpts,
  ) {
    this.data = data;
    this.wind = opts?.wind;
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

    // Recovery devices (visibility is keyed on the deployed list per update).
    this.streamer = buildStreamer(data);
    this.streamer.visible = false;
    // Ribbons stand above the nose: their geometry hangs down from the pivot.
    this.streamer.position.y = topY + 0.02;
    rocket.add(this.streamer);
    this.rotor = buildRotor(data);
    this.rotor.visible = false;
    this.rotor.position.y = topY + 0.01;
    rocket.add(this.rotor);
    this.wings = buildGliderWings(data);
    this.wings.visible = false;
    rocket.add(this.wings);

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
    this.updateRecoveryVisibility(state);
    this.animateDevices(state);
    this.updateAttitude(state);
    if ((state.phase === 'failed' || state.outcome === 'cato') && !this.exploded) {
      this.explode(state.impactSpeed);
    }
    if (this.explosion) this.animateExplosion();
  }

  /** Devices carried on this flight: the resolved list, or the legacy
   *  chute-only inference for hand-built states without one. */
  private deployedDevices(state: FlightState): RecoveryDevice[] {
    if (state.recoveryDeployed !== undefined) return state.recoveryDeployed;
    return state.chuteDeployed && this.data.chuteDiameterM > 0 ? ['parachute'] : [];
  }

  private updateRecoveryVisibility(state: FlightState): void {
    const packed = !(state.phase === 'coast' || state.phase === 'apogee' || state.phase === 'descent')
      || !state.chuteDeployed;
    const devices = this.deployedDevices(state);
    this.chute.visible = !packed && devices.includes('parachute');
    this.streamer.visible = !packed && devices.includes('streamer');
    this.rotor.visible = !packed && devices.includes('helicopter');
    this.wings.visible = !packed && devices.includes('glider');
  }

  /** Purely visual device motion: streamer flutter and rotor spin. */
  private animateDevices(state: FlightState): void {
    const dt = this.lastDeviceTime === null ? 0 : Math.max(0, state.time - this.lastDeviceTime);
    this.lastDeviceTime = state.time;
    if (dt <= 0) return; // frozen sim clock between frames
    if (this.streamer.visible) {
      this.streamer.children.forEach((ribbon, i) => {
        ribbon.rotation.z = (i === 0 ? 0.18 : -0.18) + Math.sin(state.time * 10 + i * Math.PI) * STREAMER_FLAP_RAD;
      });
    }
    if (this.rotor.visible) this.rotor.rotation.y += ROTOR_SPIN_RAD * dt;
  }

  /**
   * Point the nose along the direction of travel: while thrusting/coasting the
   * rocket weathercocks into the airflow (velocity-aligned); once recovery is
   * out it hangs nose-up under canopy/streamer/rotor (helicopter also yaw-
   * spins), tumbles end-over-end with no assist, or flies nose-first with a
   * bank when the glider wings carry it. Before liftoff the launch-aim tilt
   * is kept; after landing the last attitude is frozen.
   */
  private updateAttitude(state: FlightState): void {
    if (!state.liftedOff || state.phase === 'landed' || state.phase === 'failed') return;
    const dt = this.lastAttitudeTime === null ? 0 : Math.max(0, state.time - this.lastAttitudeTime);
    // Always advance the clock, even on the slow-speed early return below, so
    // the frame after a near-stall (apogee passage) doesn't snap the nose with
    // an accumulated dt.
    this.lastAttitudeTime = state.time;
    const v = state.velocity;
    const speed = Math.hypot(v.x, v.y, v.z);
    if (speed < ATTITUDE_MIN_SPEED) return;
    if (dt <= 0) return; // sim clock frozen between steps — nothing new to track

    const devices = this.deployedDevices(state);
    const dominant = devices.length ? dominantDevice(devices, this.data, state.mass) : null;

    if (dominant === 'tumble') {
      // No assist: end-over-end somersaults all the way down.
      this.rocket.rotateX(TUMBLE_SPIN_RAD * dt);
      return;
    }

    if (dominant !== null && NOSE_UP_DEVICES.includes(dominant)) {
      // Hang nose-up under the recovery the moment it is out — ascent or
      // descent. The body trails the drifting canopy, so a strong wind leans
      // the nose downwind, and the whole pendulum sways gently.
      const w = this.wind;
      const wx = w?.x ?? 0;
      const wz = w?.z ?? 0;
      const windMag = Math.hypot(wx, wz);
      const lean = Math.min(0.5, Math.atan2(windMag, 8));
      const target = UP.clone();
      if (windMag > 0.01 && lean > 0.001) {
        target.addScaledVector(new THREE.Vector3(wx / windMag, 0, wz / windMag), Math.tan(lean)).normalize();
      }
      const desired = new THREE.Quaternion().setFromUnitVectors(UP, target);
      if (dominant !== 'helicopter') {
        // The rotor's spin dwarfs any pendulum sway — only canopy/streamer sway.
        desired.multiply(new THREE.Quaternion().setFromAxisAngle(UP, Math.sin(state.time * 1.3) * SWAY_RAD));
      }
      const k = 1 - Math.exp(-ATTITUDE_RATE * dt);
      this.rocket.quaternion.slerp(desired, k);
      if (dominant === 'helicopter') {
        this.rocket.rotateY(HELI_SPIN_RAD * dt); // spiral under the rotor
      }
      return;
    }

    const target = new THREE.Vector3(v.x / speed, v.y / speed, v.z / speed);
    const bank = dominant === 'glider'; // wings out: fly the glide path, rolled into the turn
    const desired = new THREE.Quaternion().setFromUnitVectors(UP, target);
    if (bank) desired.multiply(new THREE.Quaternion().setFromAxisAngle(UP, GLIDER_BANK_RAD));
    const k = 1 - Math.exp(-ATTITUDE_RATE * dt);
    this.rocket.quaternion.slerp(desired, k);
  }

  explode(impactSpeed = 0): void {
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
    this.layScorch(impactSpeed);
  }

  /** Scorch decal where the wreck came down; grows with impact speed. */
  private layScorch(impactSpeed: number): void {
    const radius = 0.35 + 0.5 * Math.min(Math.max(impactSpeed, 0) / 25, 1);
    const geo = new THREE.CircleGeometry(radius, 24);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x111111, transparent: true, opacity: 0.55, depthWrite: false,
    });
    const p = this.rocket.position;
    this.scorch = new THREE.Mesh(geo, mat);
    this.scorch.position.set(p.x, p.y + 0.02, p.z);
    this.scorch.userData.isScorch = true;
    this.scene.add(this.scorch);
  }

  /** Once the burst clears, the rocket remains as a charred wreck on its side. */
  private leaveWreck(): void {
    if (this.wrecked) return;
    this.wrecked = true;
    this.rocket.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined;
      if (m && 'color' in m) m.color.multiplyScalar(0.22);
    });
    // Topple over around a random horizontal axis (visual only).
    const a = Math.random() * Math.PI * 2;
    const tilt = 1.2 + Math.random() * 0.9; // ~70°..120° from vertical
    const axis = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    this.rocket.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, tilt));
    this.rocket.visible = true;
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
    if (this.explosionAge >= EXPLOSION_LIFE) {
      this.disposeExplosion();
      this.leaveWreck();
    }
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
    // Free the body/flame/chute/device geometries+materials too — the rocket
    // group lives in scene.scene (not worldGroup), so clearWorld never sees it.
    this.rocket.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose?.();
    });
    this.scene.remove(this.trail);
    (this.trail.geometry as THREE.BufferGeometry).dispose();
    (this.trail.material as THREE.Material).dispose();
    this.disposeExplosion();
    if (this.scorch) {
      this.scene.remove(this.scorch);
      this.scorch.geometry.dispose();
      (this.scorch.material as THREE.Material).dispose();
      this.scorch = null;
    }
    this.debrisGeo.dispose();
  }
}
