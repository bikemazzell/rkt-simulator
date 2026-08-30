import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Vec3 } from '../sim/types';

export type CameraMode = 'orbit' | 'follow';

export class SceneManager {
  readonly scene = new THREE.Scene();
  readonly worldGroup = new THREE.Group();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private mode: CameraMode = 'orbit';

  constructor(private readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(this.renderer.domElement);
    this.scene.add(this.worldGroup);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 5000);
    this.camera.position.set(40, 30, 60);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setCameraMode(mode: CameraMode): void { this.mode = mode; }

  clearWorld(): void {
    for (const child of [...this.worldGroup.children]) {
      this.worldGroup.remove(child);
      child.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const mat = mesh.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose?.();
      });
    }
  }

  reset(): void {
    this.camera.position.set(40, 30, 60);
    this.controls.target.set(0, 10, 0);
    this.controls.update();
  }

  render(rocketPos: Vec3): void {
    if (this.mode === 'follow') {
      const target = new THREE.Vector3(rocketPos.x, rocketPos.y, rocketPos.z);
      const desired = target.clone().add(new THREE.Vector3(30, 15, 40));
      this.camera.position.lerp(desired, 0.08);
      this.controls.target.lerp(target, 0.2);
    }
    this.controls.update();
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
