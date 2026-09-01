import { describe, expect, it } from 'vitest';
import {
  RECOVERY_DEVICES, RANDOM_WEIGHTS, resolveRecovery, recoveryRng,
  deviceSink, dominantDevice, streamerArea, helicopterArea,
  STREAMER_TARGET_SINK, HELICOPTER_TARGET_SINK, GLIDER_SINK, TUMBLE_AREA_FACTOR,
} from '../../src/sim/recovery';
import { mulberry32 } from '../../src/sim/rng';
import type { Rocket } from '../../src/sim/types';

const RHO = 1.225;
const G = 9.81;
const rocket = (over: Partial<Rocket> = {}): Rocket => ({
  id: 't', name: 'T', massEmptyKg: 0.1, diameterM: 0.025, dragCoefficient: 0.75,
  chuteDiameterM: 0.4, chuteCd: 1.2, recommendedMotors: [], maxMotorImpulseNs: 10,
  look: { bodyLengthM: 0.5, finCount: 3, bodyColor: 1, finColor: 1, noseColor: 1 },
  ...over,
});

describe('resolveRecovery', () => {
  it('returns a specified list untouched', () => {
    const spec = ['parachute', 'glider'] as const;
    expect(resolveRecovery([...spec], mulberry32(1))).toEqual(['parachute', 'glider']);
  });

  it('rolls one valid device for empty or missing specs (seeded, deterministic)', () => {
    for (const spec of [[], undefined]) {
      for (const seed of [1, 2, 12345]) {
        const a = resolveRecovery(spec, mulberry32(seed));
        const b = resolveRecovery(spec, mulberry32(seed));
        expect(a).toEqual(b);
        expect(a).toHaveLength(1);
        expect(RECOVERY_DEVICES).toContain(a[0]);
      }
    }
  });

  it('weighted roll: parachute most common over many seeds', () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 500; i++) {
      const [d] = resolveRecovery(undefined, mulberry32(i));
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    expect(counts.get('parachute')!).toBeGreaterThan(counts.get('streamer')!);
    expect(counts.get('streamer')!).toBeGreaterThan(counts.get('glider')!);
    // Every device shows up eventually.
    expect(counts.size).toBe(RECOVERY_DEVICES.length);
  });

  it('weights sum to 1', () => {
    const total = RANDOM_WEIGHTS.reduce((s, [, w]) => s + w, 0);
    expect(total).toBeCloseTo(1, 10);
  });
});

describe('recoveryRng', () => {
  it('is an independent stream: differs from the plain flight rng', () => {
    expect(recoveryRng(7)()).not.toEqual(mulberry32(7)());
    expect(recoveryRng(7)()).toEqual(recoveryRng(7)());
  });
});

describe('drag areas and sink rates', () => {
  it('streamer area lands the fixture on the target sink band (6-13 m/s) light and heavy', () => {
    for (const mass of [0.03, 0.1, 0.3, 0.5]) {
      const A = streamerArea(mass);
      const terminal = Math.sqrt((2 * mass * G) / (RHO * 1.1 * A));
      expect(terminal).toBeCloseTo(STREAMER_TARGET_SINK, 6);
      expect(A).toBeGreaterThan(0);
    }
  });

  it('helicopter area hits its gentler target sink', () => {
    const mass = 0.12;
    const A = helicopterArea(mass);
    const terminal = Math.sqrt((2 * mass * G) / (RHO * 1.3 * A));
    expect(terminal).toBeCloseTo(HELICOPTER_TARGET_SINK, 6);
  });

  it('parachute sink uses the catalogue canopy', () => {
    const r = rocket({ massEmptyKg: 0.1, chuteDiameterM: 0.5 });
    const A = Math.PI * 0.25 ** 2;
    expect(deviceSink('parachute', r, 0.1)).toBeCloseTo(Math.sqrt((2 * 0.1 * G) / (RHO * 1.2 * A)), 6);
  });

  it('tumble sink for a typical light rocket stays in a survivable-ish band', () => {
    const v = deviceSink('tumble', rocket({ massEmptyKg: 0.1, diameterM: 0.025, dragCoefficient: 0.75 }), 0.1);
    const A = Math.PI * 0.0125 ** 2 * TUMBLE_AREA_FACTOR;
    expect(v).toBeCloseTo(Math.sqrt((2 * 0.1 * G) / (RHO * 1.2 * A)), 6);
    expect(v).toBeGreaterThan(6);
    expect(v).toBeLessThan(20);
  });

  it('glider sink is the scripted glide value', () => {
    expect(deviceSink('glider', rocket(), 0.1)).toBe(GLIDER_SINK);
    expect(deviceSink('helicopter', rocket(), 0.1)).toBe(HELICOPTER_TARGET_SINK);
    expect(deviceSink('streamer', rocket(), 0.1)).toBe(STREAMER_TARGET_SINK);
  });

  it('chuteless parachute sink is infinite (never dominant)', () => {
    expect(deviceSink('parachute', rocket({ chuteDiameterM: 0 }), 0.1)).toBe(Infinity);
  });
});

describe('dominantDevice', () => {
  it('picks the slowest-sink device for the actual mass', () => {
    const lightBigChute = rocket({ massEmptyKg: 0.08, chuteDiameterM: 0.55 });
    expect(dominantDevice(['parachute', 'streamer'], lightBigChute, 0.08)).toBe('parachute');
    const heavy = rocket({ massEmptyKg: 0.5, chuteDiameterM: 0.3 });
    expect(dominantDevice(['parachute', 'helicopter'], heavy, 0.55)).toBe('helicopter');
    expect(dominantDevice(['tumble', 'glider'], heavy, 0.55)).toBe('glider');
  });

  it('handles a single device', () => {
    expect(dominantDevice(['streamer'], rocket(), 0.1)).toBe('streamer');
  });
});
