import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Rocket } from '../../src/sim/types';
import { buildRocketMesh, buildParachute, buildFlame } from '../../src/world/rocketMesh';

const makeRocket = (bodyLengthM: number, diameterM: number, chuteDiameterM = 0.4): Rocket =>
  ({
    id: 'test-rocket',
    name: 'Test Rocket',
    massEmptyKg: 0.1,
    diameterM,
    dragCoefficient: 0.75,
    chuteDiameterM,
    chuteCd: 1.2,
    recommendedMotors: ['C6-5'],
    maxMotorImpulseNs: 10,
    look: {
      bodyLengthM,
      finCount: 4,
      bodyColor: 0xffffff,
      finColor: 0xff0000,
      noseColor: 0x00ff00,
    },
  }) as Rocket;

describe('buildRocketMesh (true scale)', () => {
  it('renders body and nose at real-world meters', () => {
    const rocket = makeRocket(0.5, 0.05);
    const mesh = buildRocketMesh(rocket);
    const bbox = new THREE.Box3().setFromObject(mesh);
    const height = bbox.max.y - bbox.min.y;
    const radius = 0.05 / 2;
    const expected = 0.5 + radius * 3; // body + nose cone
    expect(height).toBeCloseTo(expected, 3);
  });

  it('does not clamp small rockets up to fake minimums', () => {
    const rocket = makeRocket(0.274, 0.024); // smallest in the fleet
    const mesh = buildRocketMesh(rocket);
    const bbox = new THREE.Box3().setFromObject(mesh);
    const height = bbox.max.y - bbox.min.y;
    expect(height).toBeLessThan(0.4); // 0.274 + tiny nose
    expect(height).toBeGreaterThan(0.27);
  });

  it('exposes topY and radius in userData for effects', () => {
    const rocket = makeRocket(0.5, 0.05);
    const mesh = buildRocketMesh(rocket);
    expect(mesh.userData.topY).toBeCloseTo(0.5 + (0.05 / 2) * 3, 6);
    expect(mesh.userData.radius).toBeCloseTo(0.025, 6);
  });

  it('sits on y=0 (no sink into the pad)', () => {
    const rocket = makeRocket(0.5, 0.05);
    const bbox = new THREE.Box3().setFromObject(buildRocketMesh(rocket));
    expect(bbox.min.y).toBeCloseTo(0, 6);
  });
});

describe('buildParachute', () => {
  it('sizes the canopy from the chute diameter', () => {
    const chute = buildParachute(0xff5533, 0.4);
    const geo = chute.geometry as THREE.SphereGeometry;
    expect(geo.parameters.radius).toBeCloseTo(0.2, 6);
    expect(chute.userData.radiusM).toBeCloseTo(0.2, 6);
  });

  it('guards against degenerate radius for 0-chute (tumble) rockets', () => {
    const chute = buildParachute(0xff5533, 0);
    const geo = chute.geometry as THREE.SphereGeometry;
    expect(geo.parameters.radius).toBeCloseTo(0.05, 6);
  });
});

describe('buildFlame', () => {
  it('sizes from the rocket and bakes the nozzle position', () => {
    const rocket = makeRocket(0.5, 0.05);
    const flame = buildFlame(rocket);
    const bbox = new THREE.Box3().setFromObject(flame);
    const len = bbox.max.y - bbox.min.y;
    expect(len).toBeCloseTo(0.5 * 0.9, 3); // ~0.9x body length
    expect(bbox.max.y).toBeCloseTo(0, 4); // base flush with the nozzle at y=0
    expect(bbox.min.y).toBeCloseTo(-0.5 * 0.9, 3); // pointing down, tip at -len
  });

  it('stays visible for the smallest rocket', () => {
    const rocket = makeRocket(0.274, 0.024);
    const flame = buildFlame(rocket);
    const bbox = new THREE.Box3().setFromObject(flame);
    expect(bbox.max.x - bbox.min.x).toBeGreaterThan(0.02);
  });
});
