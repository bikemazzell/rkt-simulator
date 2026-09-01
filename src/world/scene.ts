import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Vec3 } from '../sim/types';
import type { WorldSystem } from './system';

export type CameraMode = 'orbit' | 'follow';

export class SceneManager {
  readonly scene = new THREE.Scene();
  readonly worldGroup = new THREE.Group();
  readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private mode: CameraMode = 'orbit';
  private readonly heldKeys = new Set<string>();
  private readonly clock = new THREE.Clock();
  private readonly worldSystems: WorldSystem[] = [];
  private worldElapsed = 0;
  private groundFloor = 0;

  constructor(private readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(this.renderer.domElement);
    this.scene.add(this.worldGroup);

    // Large far plane so high flights stay in view; near raised to 0.5 keeps
    // depth precision better than the old 0.1/5000 despite the bigger range.
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.5, 15000);
    this.camera.position.set(-3.5, 1.7, 6.5);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.minDistance = 1; // allow close inspection of true-scale (<2 m) rockets
    // Orbit low for dramatic up-shots, but never deep underground (the hard
    // ground-floor clamp in render() catches the rest).
    this.controls.maxPolarAngle = Math.PI / 2 + 0.12;
    this.resize();
    window.addEventListener('resize', () => this.resize());

    // Continuous WASD panning (held keys keep moving) in orbit mode.
    const isTyping = () => {
      const a = document.activeElement;
      return a instanceof HTMLInputElement || a instanceof HTMLSelectElement;
    };
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (!isTyping() && 'wasdqe'.includes(k)) this.heldKeys.add(k);
    });
    window.addEventListener('keyup', (e) => this.heldKeys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.heldKeys.clear());
  }

  setCameraMode(mode: CameraMode): void { this.mode = mode; }

  /** Canvas owning pointer events (OrbitControls and the gimbal attach here). */
  get domElement(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  /** Toggle OrbitControls (e.g. while dragging a gizmo ring). */
  setControlsEnabled(enabled: boolean): void { this.controls.enabled = enabled; }

  /** Set the plane the camera may not sink below (the env's ground height). */
  setGroundFloor(y: number): void { this.groundFloor = y; }

  private applyPan(dt: number): void {
    if (this.mode !== 'orbit' || this.heldKeys.size === 0) return;
    const forward = new THREE.Vector3().subVectors(this.controls.target, this.camera.position);
    forward.y = 0;
    if (forward.lengthSq() === 0) return;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const move = new THREE.Vector3();
    if (this.heldKeys.has('w')) move.add(forward);
    if (this.heldKeys.has('s')) move.sub(forward);
    if (this.heldKeys.has('d')) move.add(right);
    if (this.heldKeys.has('a')) move.sub(right);
    if (this.heldKeys.has('q')) move.y += 1; // rise
    if (this.heldKeys.has('e')) move.y -= 1; // descend
    if (move.lengthSq() === 0) return;
    // Pan speed scales with zoom distance so close-ups of a true-scale rocket
    // stay controllable (1.5 m/s floor) while far shots still glide.
    const speed = Math.max(1.5, this.camera.position.distanceTo(this.controls.target) * 0.9);
    move.normalize().multiplyScalar(speed * dt);
    this.camera.position.add(move);
    this.controls.target.add(move);
    // Q/E panning must not drive the orbit target underground either.
    const targetFloor = this.groundFloor + 0.15;
    if (this.controls.target.y < targetFloor) this.controls.target.y = targetFloor;
  }

  registerWorldSystem(sys: WorldSystem): void {
    this.worldSystems.push(sys);
  }

  clearWorld(): void {
    // Systems first: they own scene-level state (fog, background) and may
    // remove their own renderables; then the mesh traversal cleans the rest.
    for (const sys of this.worldSystems) sys.dispose();
    this.worldSystems.length = 0;
    this.scene.fog = null;
    this.scene.background = null;
    for (const child of [...this.worldGroup.children]) {
      this.worldGroup.remove(child);
      child.traverse((obj) => {
        const instanced = obj as THREE.InstancedMesh;
        if (instanced.isInstancedMesh) instanced.dispose(); // free instance buffers
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const mat = mesh.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose?.();
      });
    }
  }

  reset(): void {
    this.camera.position.set(-3.5, 1.7, 6.5);
    this.controls.target.set(1.2, 0.8, 0);
    this.controls.update();
  }

  /**
   * Debug/verification helper: place the orbit camera deterministically.
   * Azimuth degrees from +z towards +x; elevation degrees (negative places the
   * camera below the target height, i.e. looking up); distance from target.
   */
  setOrbitView(azimuthDeg: number, elevationDeg: number, distance: number, targetY = 10): void {
    const az = (azimuthDeg * Math.PI) / 180;
    const el = (elevationDeg * Math.PI) / 180;
    this.controls.target.set(0, targetY, 0);
    this.camera.position.set(
      Math.sin(az) * Math.cos(el) * distance,
      targetY + Math.sin(el) * distance,
      Math.cos(az) * Math.cos(el) * distance,
    );
    this.controls.update();
  }

  render(rocketPos: Vec3): void {
    const dt = this.clock.getDelta();
    if (this.mode === 'follow') {
      // Rigid, zero-lag follow: snap the orbit target to the rocket and translate
      // the camera by the same delta. The rocket stays fixed in frame (only the
      // world slides) so there is no smoothing overshoot/jitter, while the user's
      // own scroll-zoom and orbit angle are preserved.
      const desired = new THREE.Vector3(rocketPos.x, rocketPos.y, rocketPos.z);
      const delta = desired.sub(this.controls.target);
      this.controls.target.add(delta);
      this.camera.position.add(delta);
    }
    this.applyPan(dt);
    this.controls.update();
    // Real-time ambient animation (day/night, clouds, creatures). Deliberately
    // NOT scaled by the sim speed multiplier; the world keeps its own pace.
    // Runs after the camera moves so sky/backdrop systems can recenter on it,
    // keeping the world around the rocket at any altitude.
    this.worldElapsed += dt;
    for (const sys of this.worldSystems) sys.update(dt, this.worldElapsed, this.camera.position);
    // Never let orbit/pan/follow place the camera below the ground plane.
    const minY = this.groundFloor + 0.12;
    if (this.camera.position.y < minY) this.camera.position.y = minY;
    this.renderer.render(this.scene, this.camera);
  }

  resize(): void {
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
