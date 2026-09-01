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
