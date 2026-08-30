// Rain, snow, and thunderstorm effects: instanced blocky particles falling in
// a column around the launch site, plus a strobing lightning light and a
// tightened fog during storms. All randomness is pre-rolled in the constructor
// so update(dt, elapsed) is fully deterministic.
import * as THREE from 'three';
import { randRange, type Rng } from '../sim/rng';
import type { WorldSystem } from './system';
import type { WeatherKind } from './weather';

const FIELD_RADIUS = 140; // particle field radius around the pad
const FIELD_HEIGHT = 170; // spawn band above the ground
const RAIN_COUNT = 900;
const STORM_COUNT = 1400;
const SNOW_COUNT = 650;
const RAIN_FALL = 42; // m/s — driving rain
const SNOW_FALL = 4.5; // m/s — lazy flakes
const FLASH_LEN = 0.14; // seconds a strike stays visible
const FLASH_PEAK = 3.5;

// [near, far] linear-fog profiles. The AmbientSystem owns the fog object and
// its color; the weather only tightens and restores the distances.
const FOG_PROFILES: Record<WeatherKind, [number, number]> = {
  clear: [1200, 11000],
  rain: [500, 3400],
  storm: [90, 1300],
  snow: [280, 2600],
};

export interface WeatherOpts {
  /** ground level the precipitation vanishes into (defaults to 0) */
  groundY?: number;
  /** ambient wind direction, tilts the rain streaks */
  wind?: { x: number; z: number };
}

const dummy = new THREE.Object3D();

export class WeatherSystem implements WorldSystem {
  readonly kind: WeatherKind;

  private readonly root: THREE.Group;
  private readonly groundY: number;
  private readonly fog: THREE.Fog | null;
  private readonly baseFog: [number, number] | null;

  private readonly particles: THREE.InstancedMesh | null = null;
  private readonly material: THREE.MeshBasicMaterial | null = null;
  private readonly light: THREE.DirectionalLight | null = null;

  // Pre-rolled per-particle state (never touched by update's randomness).
  private readonly px!: Float32Array;
  private readonly pz!: Float32Array;
  private readonly py!: Float32Array;
  private readonly speed!: Float32Array;
  private readonly phase!: Float32Array;
  private readonly rate!: Float32Array;
  private readonly amp!: Float32Array;
  private readonly slantZ!: Float32Array;

  private readonly lightningPeriod!: number;
  private readonly lightningOffset!: number;
  private readonly tiltX!: number;

  constructor(root: THREE.Group, scene: THREE.Scene, kind: WeatherKind, rng: Rng, opts: WeatherOpts = {}) {
    this.root = root;
    this.kind = kind;
    this.groundY = opts.groundY ?? 0;
    this.fog = scene.fog instanceof THREE.Fog ? scene.fog : null;
    this.baseFog = this.fog ? [this.fog.near, this.fog.far] : null;

    if (kind === 'clear') return; // inert: calm skies cost nothing

    const count = kind === 'storm' ? STORM_COUNT : kind === 'rain' ? RAIN_COUNT : SNOW_COUNT;
    const snow = kind === 'snow';

    this.px = new Float32Array(count);
    this.pz = new Float32Array(count);
    this.py = new Float32Array(count);
    this.speed = new Float32Array(count);
    this.phase = new Float32Array(count);
    this.rate = new Float32Array(count);
    this.amp = new Float32Array(count);
    this.slantZ = new Float32Array(count);

    // Rain streaks tilt with the ambient wind (snow drifts instead).
    const wind = opts.wind ?? { x: 0, z: 0 };
    const wlen = Math.hypot(wind.x, wind.z);
    const tilt = snow ? 0 : 0.18;
    this.tiltX = wlen > 1e-6 ? (wind.z / wlen) * tilt : 0;
    const tiltZ = wlen > 1e-6 ? -(wind.x / wlen) * tilt : 0;

    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * FIELD_RADIUS; // uniform over the disc
      this.px[i] = Math.cos(a) * r;
      this.pz[i] = Math.sin(a) * r;
      this.py[i] = this.groundY + rng() * FIELD_HEIGHT;
      this.speed[i] = randRange(rng, 0.85, 1.15);
      this.phase[i] = rng() * Math.PI * 2;
      this.rate[i] = randRange(rng, 0.8, 2.0);
      this.amp[i] = randRange(rng, 1.5, 3.0);
      this.slantZ[i] = tiltZ + randRange(rng, -0.04, 0.04);
    }

    const geo = snow ? new THREE.BoxGeometry(0.42, 0.42, 0.42) : new THREE.BoxGeometry(0.14, 2.2, 0.14);
    this.material = new THREE.MeshBasicMaterial({
      color: snow ? 0xffffff : 0x9fc4e0,
      transparent: true,
      opacity: snow ? 0.9 : 0.55,
    });
    this.particles = new THREE.InstancedMesh(geo, this.material, count);
    this.particles.frustumCulled = false;
    this.particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    root.add(this.particles);
    this.paint(0);

    if (kind === 'storm') {
      this.light = new THREE.DirectionalLight(0xdfe9ff, 0);
      this.light.position.set(60, 300, 40);
      root.add(this.light);
      this.lightningPeriod = randRange(rng, 6, 11);
      this.lightningOffset = rng() * this.lightningPeriod;
    }
  }

  update(dt: number, elapsed: number): void {
    if (!this.particles) return;
    const snow = this.kind === 'snow';
    const fall = (snow ? SNOW_FALL : RAIN_FALL) * dt;
    for (let i = 0; i < this.particles.count; i++) {
      this.py[i] -= fall * this.speed[i];
      if (this.py[i] < this.groundY) this.py[i] += FIELD_HEIGHT;
      let x = this.px[i];
      let z = this.pz[i];
      if (snow) {
        x += Math.sin(elapsed * this.rate[i] + this.phase[i]) * this.amp[i];
        z += Math.cos(elapsed * this.rate[i] * 0.8 + this.phase[i]) * this.amp[i];
      }
      dummy.position.set(x, this.py[i], z);
      dummy.rotation.set(snow ? 0 : this.tiltX, 0, snow ? 0 : this.slantZ[i]);
      dummy.updateMatrix();
      this.particles.setMatrixAt(i, dummy.matrix);
    }
    this.particles.instanceMatrix.needsUpdate = true;

    if (this.light) {
      const t = (elapsed + this.lightningOffset) % this.lightningPeriod;
      this.light.intensity = t < FLASH_LEN ? FLASH_PEAK * (1 - t / FLASH_LEN) : 0;
    }

    if (this.fog) {
      const [near, far] = FOG_PROFILES[this.kind];
      this.fog.near = near;
      this.fog.far = far;
    }
  }

  /** Write every instance matrix for a fixed elapsed time. */
  private paint(elapsed: number): void {
    if (!this.particles) return;
    const snow = this.kind === 'snow';
    for (let i = 0; i < this.particles.count; i++) {
      let x = this.px[i];
      let z = this.pz[i];
      if (snow) {
        x += Math.sin(elapsed * this.rate[i] + this.phase[i]) * this.amp[i];
        z += Math.cos(elapsed * this.rate[i] * 0.8 + this.phase[i]) * this.amp[i];
      }
      dummy.position.set(x, this.py[i], z);
      dummy.rotation.set(snow ? 0 : this.tiltX, 0, snow ? 0 : this.slantZ[i]);
      dummy.updateMatrix();
      this.particles.setMatrixAt(i, dummy.matrix);
    }
    this.particles.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    if (this.particles) {
      this.root.remove(this.particles);
      this.particles.geometry.dispose();
      this.particles.dispose(); // free the instance buffer
    }
    this.material?.dispose();
    if (this.light) this.root.remove(this.light);
    if (this.fog && this.baseFog) {
      this.fog.near = this.baseFog[0];
      this.fog.far = this.baseFog[1];
    }
  }
}
