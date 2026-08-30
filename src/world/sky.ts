import * as THREE from 'three';
import type { WorldSystem } from './system';
import { mulberry32 } from '../sim/rng';
import {
  DEFAULT_START_PHASE,
  phaseAt,
  skyColors,
  sunDirection,
  moonDirection,
  sunColor,
  starAlpha,
} from './daynight';

// Sky geometry lives far out but inside the camera far plane (5000).
const DOME_RADIUS = 4000;
const CELESTIAL_DISTANCE = 3400;
const STAR_SHELL = 3700;
const STAR_COUNT = 380;

const tmpTop = new THREE.Color();
const tmpHorizon = new THREE.Color();
const tmpMix = new THREE.Color();

/**
 * Renders the sky: a vertex-colored dome (horizon -> zenith gradient), square
 * Minecraft-style sun and moon discs, and twinkling stars that fade in at
 * night. The dome tracks the same day/night clock as the AmbientSystem, so
 * both stay in lockstep from (startPhase, elapsed).
 */
export class SkySystem implements WorldSystem {
  private readonly dome: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private readonly sun: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly moon: THREE.Group;
  private readonly moonDisc: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly stars: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;

  constructor(
    root: THREE.Group,
    private readonly startPhase: number = DEFAULT_START_PHASE,
    seed = 1,
  ) {
    // Dome: upper hemisphere plus a lip below the horizon so no background
    // peeks through at grazing angles. Vertex colors updated every frame.
    const domeGeo = new THREE.SphereGeometry(DOME_RADIUS, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.62);
    const vertCount = domeGeo.getAttribute('position').count;
    domeGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(vertCount * 3), 3));
    this.dome = new THREE.Mesh(
      domeGeo,
      new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }),
    );
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    root.add(this.dome);

    // Square sun (Minecraft-style) with a bright core square.
    this.sun = new THREE.Mesh(
      new THREE.PlaneGeometry(300, 300),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8, fog: false, depthWrite: false }),
    );
    this.sun.renderOrder = -8;
    root.add(this.sun);

    // Square moon with darker crater squares.
    this.moon = new THREE.Group();
    this.moonDisc = new THREE.Mesh(
      new THREE.PlaneGeometry(320, 320),
      new THREE.MeshBasicMaterial({ color: 0xdfe4f0, fog: false, depthWrite: false }),
    );
    this.moon.add(this.moonDisc);
    const craterMat = new THREE.MeshBasicMaterial({ color: 0xb8bfd2, fog: false, depthWrite: false });
    const craterGeo = new THREE.PlaneGeometry(64, 64);
    const craterSpots: Array<[number, number, number]> = [
      [-68, 44, 1], [58, -30, 0.7], [14, 80, 0.55], [-36, -64, 0.85],
    ];
    for (const [cx, cy, scale] of craterSpots) {
      const crater = new THREE.Mesh(craterGeo, craterMat);
      crater.position.set(cx, cy, 2);
      crater.scale.setScalar(scale);
      crater.renderOrder = -6;
      this.moon.add(crater);
    }
    this.moonDisc.renderOrder = -7;
    root.add(this.moon);

    // Stars: seeded scatter on the upper shell.
    const rng = mulberry32(seed);
    const positions = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      const u = rng() * 2 - 1;
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(Math.max(0, 1 - u * u));
      positions[i * 3] = Math.cos(a) * r * STAR_SHELL;
      positions[i * 3 + 1] = Math.abs(u) * STAR_SHELL + 60; // keep above the horizon lip
      positions[i * 3 + 2] = Math.sin(a) * r * STAR_SHELL;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 2.5,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0,
        fog: false,
        depthWrite: false,
      }),
    );
    this.stars.renderOrder = -9;
    this.stars.frustumCulled = false;
    root.add(this.stars);
  }

  update(_dt: number, elapsed: number, cameraPos?: { x: number; y: number; z: number }): void {
    // Follow the camera so the sky always surrounds the viewer, even on extreme
    // flights that climb far above the ground (a proper skybox).
    const cx = cameraPos?.x ?? 0, cy = cameraPos?.y ?? 0, cz = cameraPos?.z ?? 0;
    this.dome.position.set(cx, cy, cz);
    this.stars.position.set(cx, cy, cz);

    const phase = phaseAt(this.startPhase, elapsed);
    const sky = skyColors(phase);
    tmpTop.setHex(sky.top);
    tmpHorizon.setHex(sky.horizon);

    // Dome gradient: horizon color at/below the equator, zenith at the top.
    const pos = this.dome.geometry.getAttribute('position');
    const col = this.dome.geometry.getAttribute('color');
    for (let i = 0; i < pos.count; i++) {
      const t = Math.min(1, Math.max(0, pos.getY(i) / DOME_RADIUS));
      const ease = t * t * (3 - 2 * t); // denser color near the horizon
      tmpMix.copy(tmpHorizon).lerp(tmpTop, ease);
      col.setXYZ(i, tmpMix.r, tmpMix.g, tmpMix.b);
    }
    col.needsUpdate = true;

    // Sun and moon ride their direction; face the world center so a camera
    // near the origin always sees them square-on.
    const sd = sunDirection(phase);
    this.sun.position.set(cx + sd.x * CELESTIAL_DISTANCE, cy + sd.y * CELESTIAL_DISTANCE, cz + sd.z * CELESTIAL_DISTANCE);
    this.sun.lookAt(cx, cy, cz);
    this.sun.material.color.setHex(sunColor(phase));
    this.sun.visible = sd.y > -0.12;

    const md = moonDirection(phase);
    this.moon.position.set(cx + md.x * CELESTIAL_DISTANCE, cy + md.y * CELESTIAL_DISTANCE, cz + md.z * CELESTIAL_DISTANCE);
    this.moon.lookAt(cx, cy, cz);
    this.moonDisc.material.color.setHex(0xdfe4f0);
    this.moon.visible = md.y > -0.12;

    // Stars fade in at night with a gentle global twinkle.
    const alpha = starAlpha(phase);
    this.stars.material.opacity = alpha * (0.8 + 0.2 * Math.sin(elapsed * 2.1));
    this.stars.visible = alpha > 0.01;
  }

  dispose(): void {
    this.dome.geometry.dispose();
    this.dome.material.dispose();
    this.sun.geometry.dispose();
    this.sun.material.dispose();
    // Moon children share two geometries/materials.
    this.moonDisc.geometry.dispose();
    this.moonDisc.material.dispose();
    this.moon.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj !== this.moonDisc) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    });
    this.stars.geometry.dispose();
    this.stars.material.dispose();
  }
}
