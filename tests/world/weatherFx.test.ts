import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { mulberry32 } from '../../src/sim/rng';
import { WeatherSystem } from '../../src/world/weatherFx';

// The ambient layer creates this exact fog before any weather system exists.
function ambientFog(): THREE.Fog {
  return new THREE.Fog(0xbfe3f2, 1200, 11000);
}

function particleY(mesh: THREE.InstancedMesh, i: number): number {
  const a = mesh.instanceMatrix.array as Float32Array;
  return a[i * 16 + 13];
}

function particleX(mesh: THREE.InstancedMesh, i: number): number {
  const a = mesh.instanceMatrix.array as Float32Array;
  return a[i * 16 + 12];
}

function findParticles(root: THREE.Group): THREE.InstancedMesh {
  return root.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
}

describe('WeatherSystem', () => {
  it('clear weather adds nothing and is inert', () => {
    const root = new THREE.Group();
    const scene = new THREE.Scene();
    scene.fog = ambientFog();
    const sys = new WeatherSystem(root, scene, 'clear', mulberry32(1), { groundY: 0 });
    expect(root.children.length).toBe(0);
    sys.update(0.016, 1.0);
    sys.dispose();
    expect(root.children.length).toBe(0);
  });

  it('rain parents one instanced mesh capped at 1500 particles', () => {
    const root = new THREE.Group();
    const sys = new WeatherSystem(root, new THREE.Scene(), 'rain', mulberry32(2), { groundY: 0 });
    const mesh = findParticles(root);
    expect(mesh).toBeDefined();
    expect(mesh.count).toBeGreaterThan(0);
    expect(mesh.count).toBeLessThanOrEqual(1500);
    sys.dispose();
  });

  it('rain particles fall and wrap within the ground-to-sky band', () => {
    const root = new THREE.Group();
    const groundY = 5;
    const sys = new WeatherSystem(root, new THREE.Scene(), 'rain', mulberry32(3), { groundY });
    const mesh = findParticles(root);
    const before = particleY(mesh, 0);
    sys.update(0.1, 0.5);
    expect(particleY(mesh, 0)).toBeLessThan(before);
    // Run long enough for every particle to wrap at least once.
    for (let i = 0; i < 600; i++) sys.update(1 / 30, i / 30);
    const a = mesh.instanceMatrix.array as Float32Array;
    for (let p = 0; p < mesh.count; p += 97) {
      const y = a[p * 16 + 13];
      const x = a[p * 16 + 12];
      const z = a[p * 16 + 14];
      expect(y).toBeGreaterThanOrEqual(groundY);
      expect(y).toBeLessThanOrEqual(groundY + 200);
      expect(Math.hypot(x, z)).toBeLessThanOrEqual(150);
    }
    sys.dispose();
  });

  it('snow falls far slower than rain and sways sideways', () => {
    const rainRoot = new THREE.Group();
    const snowRoot = new THREE.Group();
    const rain = new WeatherSystem(rainRoot, new THREE.Scene(), 'rain', mulberry32(4), { groundY: 0 });
    const snow = new WeatherSystem(snowRoot, new THREE.Scene(), 'snow', mulberry32(4), { groundY: 0 });
    const rainMesh = findParticles(rainRoot);
    const snowMesh = findParticles(snowRoot);
    expect(snowMesh.count).toBeGreaterThan(0);
    expect(snowMesh.count).toBeLessThanOrEqual(1500);

    const y0r = particleY(rainMesh, 0);
    const y0s = particleY(snowMesh, 0);
    rain.update(0.5, 0.5);
    snow.update(0.5, 0.5);
    const dropRain = y0r - particleY(rainMesh, 0);
    const dropSnow = y0s - particleY(snowMesh, 0);
    expect(dropSnow).toBeLessThan(dropRain / 5);

    // Sway: same particle's x must change as time passes (fall moves y, not x).
    let swayed = false;
    for (let p = 0; p < snowMesh.count; p += 13) {
      const xA = particleX(snowMesh, p);
      snow.update(0.016, 2.3);
      const xB = particleX(snowMesh, p);
      if (Math.abs(xB - xA) > 1e-6) swayed = true;
    }
    expect(swayed).toBe(true);
    rain.dispose();
    snow.dispose();
  });

  it('storm tightens the fog and dispose restores it', () => {
    const root = new THREE.Group();
    const scene = new THREE.Scene();
    scene.fog = ambientFog();
    const sys = new WeatherSystem(root, scene, 'storm', mulberry32(5), { groundY: 0 });
    sys.update(0.016, 0.1);
    const fog = scene.fog as THREE.Fog;
    expect(fog.near).toBeLessThan(300);
    expect(fog.far).toBeLessThan(2000);
    sys.dispose();
    expect(fog.near).toBe(1200);
    expect(fog.far).toBe(11000);
    expect(root.children.length).toBe(0);
  });

  it('storm lightning flashes briefly between long dark gaps', () => {
    const root = new THREE.Group();
    const scene = new THREE.Scene();
    const sys = new WeatherSystem(root, scene, 'storm', mulberry32(6), { groundY: 0 });
    const light = root.children.find((c) => c instanceof THREE.DirectionalLight) as THREE.DirectionalLight;
    expect(light).toBeDefined();
    let flashes = 0;
    let dark = 0;
    let peak = 0;
    for (let t = 0; t < 16; t += 0.05) {
      sys.update(0.05, t);
      if (light.intensity > 1) { flashes++; peak = Math.max(peak, light.intensity); }
      else dark++;
    }
    expect(peak).toBeGreaterThan(2); // a real flash
    expect(flashes).toBeLessThan(dark / 5); // mostly dark between strikes
    sys.dispose();
  });

  it('is deterministic per seed', () => {
    const run = (): Float32Array => {
      const root = new THREE.Group();
      const sys = new WeatherSystem(root, new THREE.Scene(), 'storm', mulberry32(9), { groundY: 0 });
      for (let i = 0; i < 50; i++) sys.update(1 / 30, i / 30);
      const arr = Array.from(findParticles(root).instanceMatrix.array as Float32Array);
      sys.dispose();
      return new Float32Array(arr);
    };
    expect(Array.from(run())).toEqual(Array.from(run()));
  });
});
