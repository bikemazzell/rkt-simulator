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

/** The streamer's hinged pivot chain, root → tip (pre-order walk of a nest). */
function streamerPivots(root: THREE.Object3D): THREE.Object3D[] {
  const pivots: THREE.Object3D[] = [];
  root.traverse((o) => { if (o.userData.isStreamerSegment !== undefined) pivots.push(o); });
  return pivots;
}

/** Local rest-pose height of a block mesh (geometry spans 0..segLen). */
function blockHeight(mesh: THREE.Object3D): number {
  const box = new THREE.Box3().setFromObject(mesh);
  return box.max.y - box.min.y;
}

describe('recovery device builders', () => {
  it('builds the streamer as a chain of small hinged blocks climbing off the nose', () => {
    const s = buildStreamer(data);
    expect(s.userData.isStreamer).toBe(true);
    const pivots = streamerPivots(s);
    expect(pivots.length).toBeGreaterThanOrEqual(8);
    const len = Math.max(0.5, data.look.bodyLengthM * 1.5);
    const segLen = len / pivots.length;
    // Chained: pivot i hangs off pivot i-1 at the block tip, and each pivot
    // owns exactly one thin block of the strip's segment length.
    for (let i = 0; i < pivots.length; i++) {
      const blocks = pivots[i].children.filter((c) => (c as THREE.Mesh).isMesh);
      expect(blocks.length).toBe(1);
      expect(blockHeight(blocks[0])).toBeGreaterThan(segLen * 0.75);
      expect(blockHeight(blocks[0])).toBeLessThan(segLen * 1.25);
      if (i > 0) {
        expect(pivots[i].parent).toBe(pivots[i - 1]);
        expect(pivots[i].position.y).toBeCloseTo(segLen, 6);
      }
    }
    // Rest pose: the whole strip stands straight up from the group origin —
    // no geometry drapes down past the hinge onto the body.
    s.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(s);
    expect(box.min.y).toBeGreaterThanOrEqual(-1e-6);
    expect(box.max.y).toBeCloseTo(len, 2);
    expect(pivots[0].position.length()).toBeLessThan(1e-9);
    const tip = pivots[pivots.length - 1].getWorldPosition(new THREE.Vector3());
    tip.y += segLen; // the last block extends one more segment to the tip
    expect(tip.y).toBeCloseTo(len, 2);
    expect(Math.hypot(tip.x, tip.z)).toBeLessThan(1e-6);
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

  it('keeps every segment flapping as the sim clock advances', () => {
    const { mesh, visual } = makeVisual();
    try {
      const st = (t: number) => state(t, { x: 0, y: -8, z: 0 }, { recoveryDeployed: ['streamer'] });
      visual.update(st(1)); // prime: first update has dt=0 and skips animation
      visual.update(st(1.3));
      const pivots = streamerPivots(tagged(mesh, 'isStreamer')!);
      expect(pivots.length).toBeGreaterThanOrEqual(8); // guards the every() below
      const a = pivots.map((p) => p.rotation.z);
      visual.update(st(1.6));
      const b = pivots.map((p) => p.rotation.z);
      expect(a.every((v, i) => Math.abs(v - b[i]) > 1e-4)).toBe(true);
    } finally { visual.dispose(); }
  });

  it('curves the strip mid-flap — segments point in several world directions', () => {
    const { mesh, visual } = makeVisual();
    try {
      const st = (t: number) => state(t, { x: 0, y: -8, z: 0 }, { recoveryDeployed: ['streamer'] });
      visual.update(st(1)); // prime
      visual.update(st(1.173));
      const pivots = streamerPivots(tagged(mesh, 'isStreamer')!);
      mesh.updateMatrixWorld(true);
      const dirs = pivots.map((p) =>
        new THREE.Vector3(0, 1, 0).applyQuaternion(p.getWorldQuaternion(new THREE.Quaternion())));
      // A strip, not a tilted rod: several joints bend away from the axis...
      const offAxis = dirs.filter((d) => Math.hypot(d.x, d.z) > 0.02).length;
      expect(offAxis).toBeGreaterThanOrEqual(3);
      // ...and consecutive segments disagree in direction (real curvature).
      let bent = 0;
      for (let i = 1; i < dirs.length; i++) if (dirs[i].angleTo(dirs[i - 1]) > 0.015) bent++;
      expect(bent).toBeGreaterThanOrEqual(3);
    } finally { visual.dispose(); }
  });

  it('whips the strip tip through world space without folding under', () => {
    const { mesh, visual } = makeVisual();
    try {
      const st = (t: number) => state(t, { x: 0, y: -8, z: 0 }, { recoveryDeployed: ['streamer'] });
      const pivots = streamerPivots(tagged(mesh, 'isStreamer')!);
      const segLen = blockHeight(pivots[pivots.length - 1].children[0]);
      const root = pivots[0];
      const last = pivots[pivots.length - 1];
      const tipXs: number[] = [];
      const rootXs: number[] = [];
      let minAbove = Infinity;
      for (let t = 1; t <= 4.001; t += 0.05) {
        visual.update(st(t));
        mesh.updateMatrixWorld(true);
        const rp = root.getWorldPosition(new THREE.Vector3());
        const lp = last.getWorldPosition(new THREE.Vector3());
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(last.getWorldQuaternion(new THREE.Quaternion()));
        const ep = lp.addScaledVector(up, segLen);
        tipXs.push(ep.x);
        rootXs.push(rp.x);
        minAbove = Math.min(minAbove, ep.y - rp.y);
      }
      const span = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
      expect(span(tipXs)).toBeGreaterThan(0.04); // the tip visibly sweeps
      expect(span(tipXs)).toBeGreaterThan(span(rootXs) * 2); // tip moves, not the anchor
      expect(minAbove).toBeGreaterThan(0); // never folds below its hinge
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
