import * as THREE from 'three';
import type { WorldSystem } from './system';
import {
  DEFAULT_START_PHASE,
  phaseAt,
  skyColors,
  lightLevels,
  sunDirection,
  moonDirection,
  sunColor,
} from './daynight';

/**
 * Owns the scene's ambient presentation: day/night clock, hemisphere + sun +
 * moon lights, background color, and fog. Renderables (sky dome, clouds, ...)
 * arrive as subsystems in later tasks; this class stays the single owner of
 * `scene.background` and `scene.fog` and reverts both on dispose.
 */
export class AmbientSystem implements WorldSystem {
  private readonly hemi = new THREE.HemisphereLight(0xffffff, 0x3a3f4a, 1.0);
  private readonly sun = new THREE.DirectionalLight(0xffffff, 1.2);
  private readonly moon = new THREE.DirectionalLight(0x8fa4cc, 0);
  private readonly bgColor = new THREE.Color(0x87ceeb);
  // Gentle horizon haze that reaches far enough not to swallow the ground on
  // high flights (the rocket can climb well past the old 2600 m fog wall).
  private readonly fog = new THREE.Fog(0xbfe3f2, 1200, 11000);

  constructor(
    private readonly scene: THREE.Scene,
    root: THREE.Group,
    private readonly startPhase: number = DEFAULT_START_PHASE,
  ) {
    root.add(this.hemi, this.sun, this.moon);
    scene.background = this.bgColor;
    scene.fog = this.fog;
  }

  update(_dt: number, elapsed: number): void {
    const phase = phaseAt(this.startPhase, elapsed);
    const sky = skyColors(phase);
    const lv = lightLevels(phase);

    this.bgColor.setHex(sky.top);
    this.fog.color.setHex(sky.horizon);

    this.hemi.intensity = lv.hemi;

    const sd = sunDirection(phase);
    this.sun.position.set(sd.x * 300, sd.y * 300, sd.z * 300);
    this.sun.intensity = lv.sun;
    this.sun.color.setHex(sunColor(phase));

    const md = moonDirection(phase);
    this.moon.position.set(md.x * 300, md.y * 300, md.z * 300);
    this.moon.intensity = lv.moon;
  }

  dispose(): void {
    this.scene.fog = null;
    this.scene.background = null;
  }
}
