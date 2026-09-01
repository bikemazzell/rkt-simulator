import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { FlightState } from '../../src/sim/types';
import { rockets } from '../../src/data/rockets';
import { buildRocketMesh } from '../../src/world/rocketMesh';
import { RocketVisual } from '../../src/world/effects';

const data = rockets[0];

function state(time: number, y: number, phase: FlightState['phase'] = 'boost'): FlightState {
  return {
    time,
    position: { x: 0, y, z: 0 },
    velocity: { x: 0, y: 10, z: 0 },
    mass: 0.1,
    phase,
    outcome: null,
    apogee: y,
    maxSpeed: 10,
    chuteDeployed: false,
    liftedOff: true,
    impactSpeed: 0,
  } as FlightState;
}

describe('RocketVisual trail', () => {
  it('records a fading trail behind the rocket and expires old points', () => {
    const scene = new THREE.Scene();
    const mesh = buildRocketMesh(data);
    const visual = new RocketVisual(scene, mesh, data);
    try {
      // Climb for 2 s at 60 fps.
      let t = 0;
      for (let i = 0; i < 120; i++) {
        t += 1 / 60;
        visual.update(state(t, t * 10));
      }
      const line = scene.children.find((c) => c instanceof THREE.Line) as THREE.Line;
      expect(line).toBeTruthy();
      const geo = line.geometry as THREE.BufferGeometry;
      expect(geo.drawRange.count).toBeGreaterThanOrEqual(2);
      const during = geo.drawRange.count;
      expect(during).toBeLessThanOrEqual(160); // ~1.5 s of samples
      const pos = geo.attributes.position as THREE.BufferAttribute;
      const yHead = pos.getY(during - 1);
      const yTail = pos.getY(0);
      expect(yHead - yTail).toBeGreaterThan(5); // a real rising path, not one point

      // Stop moving and let sim time run on: the trail drains away.
      for (let i = 0; i < 180; i++) {
        t += 1 / 60;
        visual.update(state(t, t * 10, 'coast'));
      }
      expect(geo.drawRange.count).toBeLessThanOrEqual(160); // window, not unbounded

      // Frozen sim clock (landed): repeated updates must not duplicate points.
      const frozen = geo.drawRange.count;
      for (let i = 0; i < 60; i++) visual.update(state(t, t * 10, 'landed'));
      expect(geo.drawRange.count).toBe(frozen);
    } finally {
      visual.dispose();
    }
    expect(scene.children.find((c) => c instanceof THREE.Line)).toBeUndefined();
  });
});

describe('RocketVisual attitude', () => {
  const UP = new THREE.Vector3(0, 1, 0);

  function noseDir(mesh: THREE.Object3D): THREE.Vector3 {
    return UP.clone().applyQuaternion(mesh.quaternion);
  }

  function aimedState(time: number, v: { x: number; y: number; z: number }, over: Partial<FlightState> = {}): FlightState {
    return { ...state(time, 10), velocity: { ...v }, ...over } as FlightState;
  }

  it('aligns the nose with the velocity vector during boost', () => {
    const scene = new THREE.Scene();
    const mesh = buildRocketMesh(data);
    const visual = new RocketVisual(scene, mesh, data);
    try {
      // Two updates so the slerp has sim-time delta to converge.
      visual.update(aimedState(1, { x: 10, y: 0, z: 0 }));
      visual.update(aimedState(6, { x: 10, y: 0, z: 0 })); // 5 s gap → k ~ 1
      const nose = noseDir(mesh);
      expect(nose.x).toBeGreaterThan(0.999);
      expect(Math.abs(nose.y)).toBeLessThan(0.05);
    } finally { visual.dispose(); }
  });

  it('keeps the rail/aim tilt before liftoff', () => {
    const scene = new THREE.Scene();
    const mesh = buildRocketMesh(data);
    const visual = new RocketVisual(scene, mesh, data);
    try {
      mesh.rotation.z = -Math.PI / 4; // 45° aim (negative z tilts the nose toward +X)
      visual.update(aimedState(0.1, { x: 0, y: 0.2, z: 0 }, { liftedOff: false }));
      const nose = noseDir(mesh);
      expect(nose.x).toBeGreaterThan(0.65); // still tilted ~45°
      expect(nose.y).toBeGreaterThan(0.65);
    } finally { visual.dispose(); }
  });

  it('points nose-up while descending under the chute', () => {
    const scene = new THREE.Scene();
    const mesh = buildRocketMesh(data);
    const visual = new RocketVisual(scene, mesh, data);
    try {
      visual.update(aimedState(1, { x: 0, y: -10, z: 0 }, { chuteDeployed: true, phase: 'descent' }));
      visual.update(aimedState(6, { x: 0, y: -10, z: 0 }, { chuteDeployed: true, phase: 'descent' }));
      const nose = noseDir(mesh);
      expect(nose.y).toBeGreaterThan(0.999);
    } finally { visual.dispose(); }
  });

  it('keeps the nose on the velocity vector while still ascending after ejection', () => {
    const scene = new THREE.Scene();
    const mesh = buildRocketMesh(data);
    const visual = new RocketVisual(scene, mesh, data);
    try {
      // Ejection fired at burnout+delay; at 45° aim the rocket is still
      // climbing fast — the nose must keep following the arc, not snap up.
      visual.update(aimedState(1, { x: 10, y: 10, z: 0 }, { chuteDeployed: true, phase: 'coast' }));
      visual.update(aimedState(6, { x: 10, y: 10, z: 0 }, { chuteDeployed: true, phase: 'coast' }));
      const nose = noseDir(mesh);
      expect(nose.x).toBeGreaterThan(0.6);   // still 45° along the trajectory
      expect(nose.y).toBeGreaterThan(0.6);
    } finally { visual.dispose(); }
  });

  it('does not hang nose-up for chuteless (streamer/tumble) recovery', () => {
    const chuteless = { ...data, chuteDiameterM: 0 };
    const scene = new THREE.Scene();
    const mesh = buildRocketMesh(chuteless);
    const visual = new RocketVisual(scene, mesh, chuteless);
    try {
      visual.update(aimedState(1, { x: 8, y: -6, z: 0 }, { chuteDeployed: true, phase: 'descent' }));
      visual.update(aimedState(6, { x: 8, y: -6, z: 0 }, { chuteDeployed: true, phase: 'descent' }));
      const nose = noseDir(mesh);
      const speed = Math.hypot(8, -6);
      const dot = nose.dot(new THREE.Vector3(8 / speed, -6 / speed, 0));
      expect(dot).toBeGreaterThan(0.98); // nose-over: follows the fall, no canopy hang
      expect(nose.y).toBeLessThan(0);
    } finally { visual.dispose(); }
  });

  it('ignores near-zero velocity (no defined direction)', () => {
    const scene = new THREE.Scene();
    const mesh = buildRocketMesh(data);
    const visual = new RocketVisual(scene, mesh, data);
    try {
      visual.update(aimedState(1, { x: 0.2, y: 0.1, z: 0 }));
      const nose = noseDir(mesh);
      expect(nose.y).toBeGreaterThan(0.999); // still upright
    } finally { visual.dispose(); }
  });

  it('freezes attitude once landed', () => {
    const scene = new THREE.Scene();
    const mesh = buildRocketMesh(data);
    const visual = new RocketVisual(scene, mesh, data);
    try {
      visual.update(aimedState(1, { x: 10, y: 0, z: 0 }));
      visual.update(aimedState(6, { x: 10, y: 0, z: 0 }));
      const before = noseDir(mesh).clone();
      visual.update(aimedState(7, { x: 0, y: -20, z: 0 }, { phase: 'landed' }));
      const after = noseDir(mesh);
      expect(after.distanceTo(before)).toBeLessThan(0.001);
    } finally { visual.dispose(); }
  });
});
