import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { FlightState } from '../../src/sim/types';
import { rockets } from '../../src/data/rockets';
import { buildRocketMesh, buildStreamer, buildRotor, buildGliderWings } from '../../src/world/rocketMesh';
import { RocketVisual } from '../../src/world/effects';

const data = rockets[0]; // indigo-sam, ~0.35 m body

function state(time: number, v: { x: number; y: number; z: number }, over: Partial<FlightState> = {}): FlightState {
  return {
    time,
    position: { x: 0, y: 10, z: 0 },
    velocity: { ...v },
    mass: 0.1,
    phase: 'descent',
    outcome: null,
    apogee: 30,
    maxSpeed: 20,
    chuteDeployed: true,
    recoveryDeployed: [],
    liftedOff: true,
    impactSpeed: 0,
    ...over,
  } as FlightState;
}

function makeVisual() {
  const scene = new THREE.Scene();
  const mesh = buildRocketMesh(data);
  const visual = new RocketVisual(scene, mesh, data);
  return { scene, mesh, visual };
}

function tagged(root: THREE.Object3D, tag: string): THREE.Object3D | undefined {
  let found: THREE.Object3D | undefined;
  root.traverse((o) => { if (o.userData[tag]) found = o; });
  return found;
}

describe('recovery device builders', () => {
  it('builds a streamer with ribbon strands above the nose', () => {
    const s = buildStreamer(data);
    expect(s.userData.isStreamer).toBe(true);
    expect(s.children.length).toBeGreaterThanOrEqual(2);
    s.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(s);
    expect(box.max.y - box.min.y).toBeGreaterThan(0.3); // a real ribbon, true-scale
  });

  it('builds a helicopter rotor with blades wider than the body', () => {
    const r = buildRotor(data);
    expect(r.userData.isRotor).toBe(true);
    r.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(r);
    const span = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
    expect(span).toBeGreaterThan(data.diameterM * 2);
  });

  it('builds glider wings spanning past the body', () => {
    const w = buildGliderWings(data);
    expect(w.userData.isGliderWings).toBe(true);
    w.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(w);
    expect(box.max.x - box.min.x).toBeGreaterThan(data.diameterM * 2);
  });
});

describe('RocketVisual recovery visibility', () => {
  it('shows only the canopy for parachute recovery', () => {
    const { mesh, visual } = makeVisual();
    try {
      visual.update(state(1, { x: 0, y: -4, z: 0 }, { recoveryDeployed: ['parachute'] }));
      expect(tagged(mesh, 'isStreamer')).toBeTruthy();
      expect((tagged(mesh, 'isStreamer') as THREE.Object3D).visible).toBe(false);
      expect(mesh.children.some((c) => c.userData.radiusM !== undefined && c.visible)).toBe(true);
      expect((tagged(mesh, 'isRotor') as THREE.Object3D).visible).toBe(false);
      expect((tagged(mesh, 'isGliderWings') as THREE.Object3D).visible).toBe(false);
    } finally { visual.dispose(); }
  });

  it('shows the streamer, not the canopy, for streamer recovery', () => {
    const { mesh, visual } = makeVisual();
    try {
      visual.update(state(1, { x: 0, y: -8, z: 0 }, { recoveryDeployed: ['streamer'] }));
      expect((tagged(mesh, 'isStreamer') as THREE.Object3D).visible).toBe(true);
      expect(mesh.children.some((c) => c.userData.radiusM !== undefined && c.visible)).toBe(false);
    } finally { visual.dispose(); }
  });

  it('shows the rotor for helicopter recovery', () => {
    const { mesh, visual } = makeVisual();
    try {
      visual.update(state(1, { x: 0, y: -3, z: 0 }, { recoveryDeployed: ['helicopter'] }));
      expect((tagged(mesh, 'isRotor') as THREE.Object3D).visible).toBe(true);
      expect(mesh.children.some((c) => c.userData.radiusM !== undefined && c.visible)).toBe(false);
    } finally { visual.dispose(); }
  });

  it('shows wings for glider recovery', () => {
    const { mesh, visual } = makeVisual();
    try {
      visual.update(state(1, { x: 7, y: -2.7, z: 0 }, { recoveryDeployed: ['glider'] }));
      expect((tagged(mesh, 'isGliderWings') as THREE.Object3D).visible).toBe(true);
      expect(mesh.children.some((c) => c.userData.radiusM !== undefined && c.visible)).toBe(false);
    } finally { visual.dispose(); }
  });

  it('renders every device in a combo (parachute + glider)', () => {
    const { mesh, visual } = makeVisual();
    try {
      visual.update(state(1, { x: 0, y: -2.7, z: 0 }, { recoveryDeployed: ['parachute', 'glider'] }));
      expect(mesh.children.some((c) => c.userData.radiusM !== undefined && c.visible)).toBe(true);
      expect((tagged(mesh, 'isGliderWings') as THREE.Object3D).visible).toBe(true);
    } finally { visual.dispose(); }
  });

  it('keeps everything packed away before deployment (boost)', () => {
    const { mesh, visual } = makeVisual();
    try {
      visual.update(state(1, { x: 0, y: 30, z: 0 }, {
        phase: 'boost', chuteDeployed: false, recoveryDeployed: ['parachute', 'streamer'],
      }));
      expect(mesh.children.some((c) => c.userData.radiusM !== undefined && c.visible)).toBe(false);
      expect((tagged(mesh, 'isStreamer') as THREE.Object3D).visible).toBe(false);
    } finally { visual.dispose(); }
  });

  it('flaps the streamer ribbons while descending', () => {
    const { mesh, visual } = makeVisual();
    try {
      visual.update(state(1, { x: 0, y: -8, z: 0 }, { recoveryDeployed: ['streamer'] }));
      const ribbons = (tagged(mesh, 'isStreamer') as THREE.Group).children;
      const a = ribbons.map((r) => r.rotation.z);
      visual.update(state(1.3, { x: 0, y: -8, z: 0 }, { recoveryDeployed: ['streamer'] }));
      const b = ribbons.map((r) => r.rotation.z);
      const moved = a.some((v, i) => Math.abs(v - b[i]) > 0.01);
      expect(moved).toBe(true);
    } finally { visual.dispose(); }
  });

  it('spins the rotor blades while descending', () => {
    const { mesh, visual } = makeVisual();
    try {
      visual.update(state(1, { x: 0, y: -3, z: 0 }, { recoveryDeployed: ['helicopter'] }));
      const rotor = tagged(mesh, 'isRotor') as THREE.Group;
      const y0 = rotor.rotation.y;
      visual.update(state(1.5, { x: 0, y: -3, z: 0 }, { recoveryDeployed: ['helicopter'] }));
      expect(Math.abs(rotor.rotation.y - y0)).toBeGreaterThan(2); // visibly spinning
    } finally { visual.dispose(); }
  });
});

describe('RocketVisual recovery attitude', () => {
  const UP = new THREE.Vector3(0, 1, 0);
  const noseDir = (mesh: THREE.Object3D) => UP.clone().applyQuaternion(mesh.quaternion);

  it('hangs nose-up under a streamer when sinking slowly', () => {
    const { mesh, visual } = makeVisual();
    try {
      visual.update(state(1, { x: 0, y: -9, z: 0 }, { recoveryDeployed: ['streamer'] }));
      visual.update(state(6, { x: 0, y: -9, z: 0 }, { recoveryDeployed: ['streamer'] }));
      expect(noseDir(mesh).y).toBeGreaterThan(0.9);
    } finally { visual.dispose(); }
  });

  it('spins (yaws) nose-up under the helicopter rotor', () => {
    const { mesh, visual } = makeVisual();
    try {
      const heli = (t: number) => state(t, { x: 0, y: -3, z: 0 }, { recoveryDeployed: ['helicopter'] });
      visual.update(heli(1));
      visual.update(heli(6));
      const nose = noseDir(mesh);
      expect(nose.y).toBeGreaterThan(0.9); // nose-up ...
      // ... and yawing: a lateral body marker rotates around the nose axis
      // (the nose itself cannot show yaw — spin is about that very axis).
      const sideYaw = (t: number) => {
        visual.update(heli(t));
        const side = new THREE.Vector3(1, 0, 0).applyQuaternion(mesh.quaternion);
        return Math.atan2(side.z, side.x);
      };
      const y1 = sideYaw(6.1);
      const y2 = sideYaw(6.6);
      const d = Math.abs(y2 - y1);
      const spun = Math.min(d, Math.PI * 2 - d);
      // 4 rad/s of spin partially pulled back by the nose-up slerp; net >0.5
      // rad per 0.5 s still proves continuous autorotation.
      expect(spun).toBeGreaterThan(0.5);
    } finally { visual.dispose(); }
  });

  it('tumbles end-over-end during tumble recovery', () => {
    const { mesh, visual } = makeVisual();
    try {
      visual.update(state(1, { x: 0, y: -10, z: 0 }, { recoveryDeployed: ['tumble'] }));
      const n1 = noseDir(mesh).clone();
      visual.update(state(1.5, { x: 0, y: -10, z: 0 }, { recoveryDeployed: ['tumble'] }));
      const n2 = noseDir(mesh);
      const angle = n1.angleTo(n2);
      expect(angle).toBeGreaterThan(1.5); // ~5 rad/s × 0.5 s end-over-end
    } finally { visual.dispose(); }
  });

  it('flies the glider nose-first along the glide path with bank', () => {
    const { mesh, visual } = makeVisual();
    try {
      const v = { x: 7.5, y: -2.7, z: 0 };
      visual.update(state(1, v, { recoveryDeployed: ['glider'] }));
      visual.update(state(6, v, { recoveryDeployed: ['glider'] }));
      const nose = noseDir(mesh);
      const speed = Math.hypot(v.x, v.y);
      const dir = new THREE.Vector3(v.x / speed, v.y / speed, 0);
      expect(nose.dot(dir)).toBeGreaterThan(0.97); // nose on the glide path
      // Banked: rolled off the pure alignment around the nose axis.
      const pure = new THREE.Quaternion().setFromUnitVectors(UP, dir);
      const pureNoseUp = new THREE.Vector3(0, 1, 0).applyQuaternion(pure);
      const rollAngle = new THREE.Quaternion()
        .premultiply(pure.clone().invert())
        .multiply(mesh.quaternion);
      void rollAngle; void pureNoseUp;
      // Compare full rotation distance: banked quaternion is >0.15 rad off pure alignment.
      const q1 = new THREE.Quaternion().setFromUnitVectors(UP, dir);
      expect(mesh.quaternion.angleTo(q1)).toBeGreaterThan(0.15);
    } finally { visual.dispose(); }
  });
});
