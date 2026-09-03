import { describe, it, expect } from 'vitest';
import { scoreChallenge } from '../../src/sim/challenge';
import { vec } from '../../src/sim/vec';
import type { FlightSummary, EnvParams } from '../../src/sim/types';

const env: EnvParams = {
  groundHeight: 0, wind: { base: vec(0, 0, 0), gust: 0 },
  bounds: { radius: 500 }, targetZone: { center: vec(50, 0, 0), radius: 20 },
};
const summary = (apogee: number): FlightSummary => ({
  apogee, maxSpeed: 100, flightTime: 20, outcome: 'nominal', driftDistanceM: 0,
});

describe('scoreChallenge', () => {
  it('returns no score for height-ladder (visual-only challenge)', () => {
    const r = scoreChallenge({ type: 'height-ladder' }, env, summary(100), vec(0, 0, 0));
    expect(r.score).toBe(0);
    expect(r.detail).toBe('no challenge');
  });
  it('scores landing at zone center as 100', () => {
    const r = scoreChallenge({ type: 'landing-zone' }, env, summary(100), vec(50, 0, 0));
    expect(r.score).toBe(100);
  });
  it('scores landing outside the zone as 0', () => {
    const r = scoreChallenge({ type: 'landing-zone' }, env, summary(100), vec(200, 0, 0));
    expect(r.score).toBe(0);
  });
  it('returns 0 for no challenge', () => {
    expect(scoreChallenge({ type: 'none' }, env, summary(100), vec(0, 0, 0)).score).toBe(0);
  });
});
