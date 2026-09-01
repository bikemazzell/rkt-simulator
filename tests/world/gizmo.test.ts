import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildGimbal, GimbalController, computeLabelScreen, GIMBAL_AXES } from '../../src/world/gizmo';
import { aimDirection, AIM_DEFAULT } from '../../src/sim/aim';

function axisGroup(g: THREE.Group, axis: string): THREE.Group {
  const hits = [] as THREE.Object3D[];
  g.traverse((o) => { if (o.userData?.isGimbalHit && o.userData.axis === axis) hits.push(o); });
  return hits[0]?.parent as THREE.Group;
}

describe('buildGimbal', () => {
  it('builds one ring group per axis with tagged hit torus and label anchor', () => {
    const g = buildGimbal(0.5);
    for (const axis of GIMBAL_AXES) {
      const grp = axisGroup(g, axis);
      expect(grp).toBeTruthy();
      const hit = grp.children.find((c) => c.userData.isGimbalHit);
      const anchor = grp.children.find((c) => c.userData.isGimbalAnchor);
      expect(hit).toBeTruthy();
      expect(anchor).toBeTruthy();
      expect(anchor!.userData.axis).toBe(axis);
    }
  });

  it('rings lie in the plane perpendicular to their axis', () => {
    const g = buildGimbal(1); // radius 0.45 (within clamp range, no clamping)
    g.updateMatrixWorld(true);
    for (const axis of GIMBAL_AXES) {
      const grp = axisGroup(g, axis);
      const ring = grp.children.find((c) => c instanceof THREE.LineLoop) as THREE.LineLoop;
      const pos = ring.geometry.getAttribute('position');
      const axisVec = new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0);
      const ringCenter = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        const p = new THREE.Vector3().fromBufferAttribute(pos, i);
        ringCenter.add(p);
      }
      ringCenter.divideScalar(pos.count);
      expect(ringCenter.distanceTo(new THREE.Vector3(0, 0, 0))).toBeLessThan(1e-6); // centred on axis
      for (let i = 0; i < pos.count; i++) {
        const p = new THREE.Vector3().fromBufferAttribute(pos, i);
        expect(Math.abs(p.dot(axisVec))).toBeLessThan(1e-6); // in-plane
        expect(p.length()).toBeCloseTo(0.45, 5);
      }
    }
  });

  it('radius clamps to [0.35, 0.8] relative to half the rocket height', () => {
    for (const [topY, want] of [[0.2, 0.35], [2, 0.8], [1.2, 0.54]] as const) {
      const g = buildGimbal(topY);
      const ring = axisGroup(g, 'y').children.find((c) => c instanceof THREE.LineLoop) as THREE.LineLoop;
      const pos = ring.geometry.getAttribute('position');
      const p = new THREE.Vector3().fromBufferAttribute(pos, 0);
      expect(p.length()).toBeCloseTo(want, 5);
    }
  });

  it('rings render on top (depthTest off, high renderOrder)', () => {
    const g = buildGimbal(0.5);
    const ring = axisGroup(g, 'x').children.find((c) => c instanceof THREE.LineLoop) as THREE.LineLoop;
    const mat = ring.material as THREE.LineBasicMaterial;
    expect(mat.depthTest).toBe(false);
    expect(ring.renderOrder).toBeGreaterThan(0);
  });
});

describe('GimbalController', () => {
  it('set() normalizes to (-180, 180] and fires change', () => {
    const c = new GimbalController(buildGimbal(0.5));
    let changed = 0;
    c.onChange(() => { changed++; });
    c.set('x', 270);
    expect(c.angles.x).toBe(-90);
    c.set('y', -180);
    expect(c.angles.y).toBe(180);
    c.set('z', 35);
    expect(c.angles.z).toBe(35);
    expect(changed).toBe(3);
  });

  it('reset() returns to straight up and normalize() tidies angles', () => {
    const c = new GimbalController(buildGimbal(0.5));
    c.set('x', 190);
    c.set('z', -270); // −270 + 360 = 90
    c.normalize();
    expect(c.angles.x).toBe(-170);
    expect(c.angles.z).toBe(90);
    c.reset();
    expect(c.angles).toEqual(AIM_DEFAULT);
  });

  it('applyTo sets XYZ Euler rotation in radians; direction() matches sim aimDirection', () => {
    const c = new GimbalController(buildGimbal(0.5));
    c.set('x', 30); c.set('y', -45); c.set('z', 115);
    const mesh = new THREE.Mesh();
    c.applyTo(mesh);
    expect(mesh.rotation.order).toBe('XYZ');
    expect(mesh.rotation.x).toBeCloseTo(THREE.MathUtils.degToRad(30), 6);
    expect(mesh.rotation.y).toBeCloseTo(THREE.MathUtils.degToRad(-45), 6);
    expect(mesh.rotation.z).toBeCloseTo(THREE.MathUtils.degToRad(115), 6);
    const d = c.direction();
    const want = aimDirection(c.angles);
    expect(d.x).toBeCloseTo(want.x, 6);
    expect(d.y).toBeCloseTo(want.y, 6);
    expect(d.z).toBeCloseTo(want.z, 6);
    // And rotating an up-vector by the applied Euler reproduces the direction.
    const rotated = new THREE.Vector3(0, 1, 0).applyEuler(mesh.rotation);
    expect(rotated.x).toBeCloseTo(want.x, 6);
    expect(rotated.y).toBeCloseTo(want.y, 6);
    expect(rotated.z).toBeCloseTo(want.z, 6);
  });

  it('attachRod tilts the rod group with the same angles', () => {
    const c = new GimbalController(buildGimbal(0.5));
    const rod = new THREE.Group();
    c.attachRod(rod);
    c.set('x', 25);
    expect(rod.rotation.order).toBe('XYZ');
    expect(rod.rotation.x).toBeCloseTo(THREE.MathUtils.degToRad(25), 6);
  });

  it('hitTest returns the ring axis under the ray, nearest wins, else null', () => {
    const c = new GimbalController(buildGimbal(0.5)); // ring radius clamps to 0.35
    // Ray aimed at (0, 0.2475, 0.2475): on the X ring (Y-Z plane, r 0.35), off Y/Z rings.
    const hitX = new THREE.Ray(new THREE.Vector3(5, 0.2475, 0.2475), new THREE.Vector3(-1, 0, 0));
    expect(c.hitTest(hitX)).toBe('x');
    const miss = new THREE.Ray(new THREE.Vector3(5, 0.2475, 0.2475), new THREE.Vector3(1, 0, 0)); // pointing away
    expect(c.hitTest(miss)).toBeNull();
  });

  it('drag math: pointer sweep around +X nudges x by the swept angle (right-hand)', () => {
    const c = new GimbalController(buildGimbal(0.5));
    expect(c.beginDrag('x', new THREE.Ray(new THREE.Vector3(5, 1, 0), new THREE.Vector3(-1, 0, 0)))).toBe(true);
    // Sweep the intersection point from +Y (0°) to +Z (90°): right-hand +90° about +X.
    const delta = c.dragTo(new THREE.Ray(new THREE.Vector3(5, 0, 1), new THREE.Vector3(-1, 0, 0)));
    expect(delta).toBeCloseTo(90, 3);
    expect(c.angles.x).toBeCloseTo(90, 3);
    // Continuing back the other way subtracts.
    const back = c.dragTo(new THREE.Ray(new THREE.Vector3(5, 1, 0), new THREE.Vector3(-1, 0, 0)));
    expect(back).toBeCloseTo(-90, 3);
    expect(c.angles.x).toBeCloseTo(0, 3);
  });

  it('drag falls back to a camera-forward plane when the ray is parallel to the axis', () => {
    const c = new GimbalController(buildGimbal(0.5));
    // Ray parallel to the X axis (looking down it); fallback plane (-1,1,0)/√2
    // through the centre is crossed ahead of the origin at t = 2.5.
    const along = new THREE.Ray(new THREE.Vector3(-2, 0.5, 0), new THREE.Vector3(1, 0, 0));
    const fb = new THREE.Vector3(-1, 1, 0).normalize();
    expect(c.beginDrag('x', along, fb)).toBe(true);
    const d = c.dragTo(along, fb);
    expect(Number.isFinite(d)).toBe(true); // no NaN, angle measurable on fallback plane
    const d2 = c.dragTo(along, fb);
    expect(d2).toBeCloseTo(0, 6); // same ray → no drift
  });

  it('beginDrag on a ray that misses every plane returns false and clears drag', () => {
    const c = new GimbalController(buildGimbal(0.5));
    const parallelNoFallback = new THREE.Ray(new THREE.Vector3(2, 0.5, 0), new THREE.Vector3(1, 0, 0));
    expect(c.beginDrag('x', parallelNoFallback)).toBe(false);
    expect(c.dragTo(new THREE.Ray(new THREE.Vector3(5, 1, 0), new THREE.Vector3(-1, 0, 0)))).toBe(0);
  });
});

describe('computeLabelScreen', () => {
  it('projects an anchor in front of the camera and hides behind/off-screen ones', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.5, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const front = computeLabelScreen(new THREE.Vector3(0, 0, 0), camera, 200, 100);
    expect(front.visible).toBe(true);
    expect(front.x).toBeCloseTo(100, 1);
    expect(front.y).toBeCloseTo(50, 1);
    const behind = computeLabelScreen(new THREE.Vector3(0, 0, 10), camera, 200, 100);
    expect(behind.visible).toBe(false);
    const off = computeLabelScreen(new THREE.Vector3(50, 0, 0), camera, 200, 100);
    expect(off.visible).toBe(false);
  });
});
