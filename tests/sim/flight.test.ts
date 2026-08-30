import { describe, it, expect } from 'vitest';
import { initialFlightState } from '../../src/sim/flight';
import { makeTestConfig } from './fixtures';

describe('flight', () => {
  it('starts idle on the pad at ground height', () => {
    const config = makeTestConfig();
    const s = initialFlightState(config);
    expect(s.phase).toBe('idle');
    expect(s.position.y).toBe(config.environment.groundHeight);
    expect(s.mass).toBeCloseTo(config.rocket.massEmptyKg + config.motor.massTotalKg);
  });
});
