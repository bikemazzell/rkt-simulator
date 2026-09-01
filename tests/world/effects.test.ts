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

  it('hangs nose-up as soon as the canopy is out, even while still ascending', () => {
    const scene = new THREE.Scene();
    const mesh = buildRocketMesh(data);
    const visual = new RocketVisual(scene, mesh, data);
    try {
      // Ejection fired mid-climb on a 45° arc — the rocket now hangs from the
      // canopy, so the nose swings up immediately instead of following the arc.
      visual.update(aimedState(1, { x: 10, y: 10, z: 0 }, { chuteDeployed: true, phase: 'coast', recoveryDeployed: ['parachute'] }));
      visual.update(aimedState(6, { x: 10, y: 10, z: 0 }, { chuteDeployed: true, phase: 'coast', recoveryDeployed: ['parachute'] }));
      const nose = noseDir(mesh);
      expect(nose.y).toBeGreaterThan(0.9); // canopy out → nose-up, ascent or not
    } finally { visual.dispose(); }
  });

  it('leans the hanging nose downwind under a strong wind', () => {
    const scene = new THREE.Scene();
    const mesh = buildRocketMesh(data);
    const visual = new RocketVisual(scene, mesh, data, { wind: { x: 6, z: 0 } });
    try {
      visual.update(aimedState(1, { x: 0, y: -5, z: 0 }, { chuteDeployed: true, phase: 'descent', recoveryDeployed: ['parachute'] }));
      visual.update(aimedState(6, { x: 0, y: -5, z: 0 }, { chuteDeployed: true, phase: 'descent', recoveryDeployed: ['parachute'] }));
      const nose = noseDir(mesh);
      expect(nose.x).toBeGreaterThan(0.15); // tilted downwind (+x)
      expect(nose.y).toBeGreaterThan(0.75); // but still mostly up
    } finally { visual.dispose(); }
  });

  it('sways the hanging nose gently over time', () => {
    const scene = new THREE.Scene();
    const mesh = buildRocketMesh(data);
    const visual = new RocketVisual(scene, mesh, data);
    try {
      const yaw = () => {
        const side = new THREE.Vector3(1, 0, 0).applyQuaternion(mesh.quaternion);
        return Math.atan2(side.z, side.x); // yaw around the (upright) nose axis
      };
      visual.update(aimedState(1, { x: 0, y: -5, z: 0 }, { chuteDeployed: true, phase: 'descent', recoveryDeployed: ['parachute'] }));
      visual.update(aimedState(2, { x: 0, y: -5, z: 0 }, { chuteDeployed: true, phase: 'descent', recoveryDeployed: ['parachute'] }));
      const y1 = yaw();
      visual.update(aimedState(3, { x: 0, y: -5, z: 0 }, { chuteDeployed: true, phase: 'descent', recoveryDeployed: ['parachute'] }));
      const y2 = yaw();
      expect(Math.abs(y2 - y1)).toBeGreaterThan(0.005); // the sway moved it
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

describe('RocketVisual crash wreck', () => {
  const UP = new THREE.Vector3(0, 1, 0);

  function crash(imp: number): FlightState {
    return {
      ...state(5, 0, 'failed'),
      outcome: 'chute-fail',
      impactSpeed: imp,
    } as FlightState;
  }

  function scorchOf(scene: THREE.Scene): THREE.Mesh | undefined {
    return scene.children.find((c) => (c as THREE.Mesh).userData?.isScorch) as THREE.Mesh | undefined;
  }

  function runToWreck(visual: RocketVisual, imp: number, updates = 100): void {
    visual.update(crash(imp)); // triggers explode()
    for (let i = 0; i < updates; i++) visual.update(crash(imp)); // 1/60 per update → past 1.3 s
  }

  it('leaves a charred, tilted wreck and a scorch mark at the crash site', () => {
    const scene = new THREE.Scene();
    const mesh = buildRocketMesh(data);
    const visual = new RocketVisual(scene, mesh, data);
    try {
      visual.update(crash(30));
      expect(mesh.visible).toBe(false); // hidden while the burst plays
      for (let i = 0; i < 100; i++) visual.update(crash(30));
      expect(mesh.visible).toBe(true); // the wreck remains

      // Materials charred: every coloured material is dark now.
      let darkest = 1;
      mesh.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined;
        if (m && 'color' in m) darkest = Math.min(darkest, m.color.r + m.color.g + m.color.b);
      });
      expect(darkest).toBeLessThan(1.0);

      // Lying on its side rather than upright.
      const nose = UP.clone().applyQuaternion(mesh.quaternion);
      expect(nose.y).toBeLessThan(0.7);

      // Scorch decal on the ground, scaled with the impact.
      const scorch = scorchOf(scene);
      expect(scorch).toBeTruthy();
      const r = (scorch!.geometry as THREE.CircleGeometry).parameters.radius;
      expect(r).toBeGreaterThan(0.5);
    } finally {
      visual.dispose();
    }
    expect(scorchOf(scene)).toBeUndefined(); // decal disposed with the visual
  });

  it('scales the scorch radius with impact speed', () => {
    const sceneA = new THREE.Scene();
    const visualA = new RocketVisual(sceneA, buildRocketMesh(data), data);
    runToWreck(visualA, 5);
    const rSoft = (scorchOf(sceneA)!.geometry as THREE.CircleGeometry).parameters.radius;
    visualA.dispose();

    const sceneB = new THREE.Scene();
    const visualB = new RocketVisual(sceneB, buildRocketMesh(data), data);
    runToWreck(visualB, 25);
    const rHard = (scorchOf(sceneB)!.geometry as THREE.CircleGeometry).parameters.radius;
    visualB.dispose();

    expect(rHard).toBeGreaterThan(rSoft);
  });
});
