import { describe, it, expect } from 'vitest';
import { rockets } from '../../src/data/rockets';
import { motorById } from '../../src/data/motors';

describe('recommended motors (scrape)', () => {
  it('every rocket has at least one resolvable recommended motor', () => {
    for (const r of rockets) {
      expect(r.recommendedMotors.length, r.id).toBeGreaterThan(0);
      for (const id of r.recommendedMotors) {
        expect(motorById(id), `${r.id}: ${id}`).toBeDefined();
      }
    }
  });

  it('no rocket recommends ONLY delay-0 (booster) motors — solo flights need a delay', () => {
    for (const r of rockets) {
      const delays = r.recommendedMotors.map((id) => motorById(id)?.delayS ?? -1);
      expect(delays.some((d) => d > 0), `${r.id}: ${delays.join(',')}`).toBe(true);
    }
  });

  it('Destination Mars Leaper flies the delayed A10-3, not the booster A10-0', () => {
    const leaper = rockets.find((r) => r.id === 'destination-mars-leaper')!;
    expect(leaper.recommendedMotors).toContain('A10-3');
    expect(leaper.recommendedMotors).not.toContain('A10-0');
  });
});
