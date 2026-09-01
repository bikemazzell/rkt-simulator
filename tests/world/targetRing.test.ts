import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTargetAltitudeRing } from '../../src/world/targetRing';

describe('buildTargetAltitudeRing', () => {
  it('places the ring at baseY + altitude', () => {
    const ring = buildTargetAltitudeRing(150, 12);
    expect(ring.position.y).toBeCloseTo(162, 6);
    expect(ring.userData.isTargetRing).toBe(true);
    expect(ring.userData.altitudeM).toBe(150);
  });

  it('lays the torus flat with a faint disc inside it', () => {
    const ring = buildTargetAltitudeRing(100, 0);
    const torus = ring.children.find((c) => c.userData.isTargetRingTorus) as THREE.Mesh;
    const disc = ring.children.find((c) => c.userData.isTargetRingDisc) as THREE.Mesh;
    expect(torus).toBeDefined();
    expect(disc).toBeDefined();
    // Flat: rotated onto the XZ plane either way up.
    expect(Math.abs(Math.abs(torus.rotation.x) - Math.PI / 2)).toBeLessThan(1e-6);
    expect((torus.material as THREE.MeshBasicMaterial).transparent).toBe(true);
    const discMat = disc.material as THREE.MeshBasicMaterial;
    expect(discMat.transparent).toBe(true);
    expect(discMat.opacity).toBeLessThan(0.15);
    expect(discMat.depthWrite).toBe(false);
  });

  it('beacon line spans from the pad (local -alt) up to the ring', () => {
    const ring = buildTargetAltitudeRing(80, 2.5);
    ring.updateMatrixWorld(true);
    const beacon = ring.children.find((c) => c.userData.isTargetRingBeacon) as THREE.Line;
    expect(beacon).toBeDefined();
    const pos = beacon.geometry.getAttribute('position') as THREE.BufferAttribute;
    expect(pos.getY(0)).toBeCloseTo(-80, 6);
    expect(pos.getY(1)).toBeCloseTo(0, 6);
    // World space: base (2.5) up to ring height (82.5).
    const a = new THREE.Vector3().fromBufferAttribute(pos, 0).applyMatrix4(beacon.matrixWorld);
    const b = new THREE.Vector3().fromBufferAttribute(pos, 1).applyMatrix4(beacon.matrixWorld);
    expect(a.y).toBeCloseTo(2.5, 6);
    expect(b.y).toBeCloseTo(82.5, 6);
  });

  it('builds independent objects (no shared mutable state)', () => {
    const a = buildTargetAltitudeRing(50, 0);
    const b = buildTargetAltitudeRing(50, 0);
    expect(a).not.toBe(b);
    expect((a.children[0] as THREE.Mesh).geometry).not.toBe((b.children[0] as THREE.Mesh).geometry);
    expect(a.position.y).toBeCloseTo(b.position.y, 6);
  });
});
