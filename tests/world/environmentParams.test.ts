import { describe, it, expect } from 'vitest';
import { makeParamsFor } from '../../src/world/environments/params';

const IDS = ['park', 'urban', 'mountain', 'desert', 'sea', 'rooftop', 'bathtub', 'backyard-dog'];

describe('environment params', () => {
  it('produces params for every environment id', () => {
    for (const id of IDS) {
      const p = makeParamsFor(id, 1);
      expect(p.bounds.radius).toBeGreaterThan(0);
      expect(Number.isFinite(p.groundHeight)).toBe(true);
      expect(p.wind.gust).toBeGreaterThanOrEqual(0);
    }
  });
  it('is deterministic for a fixed seed', () => {
    expect(makeParamsFor('sea', 7)).toEqual(makeParamsFor('sea', 7));
  });
  it('different seeds can differ', () => {
    const a = makeParamsFor('urban', 1);
    const b = makeParamsFor('urban', 2);
    expect(a).not.toEqual(b);
  });
  it('sea has stronger base wind than desert', () => {
    const seaWind = Math.hypot(makeParamsFor('sea', 3).wind.base.x, makeParamsFor('sea', 3).wind.base.z);
    const desertWind = Math.hypot(makeParamsFor('desert', 3).wind.base.x, makeParamsFor('desert', 3).wind.base.z);
    expect(seaWind).toBeGreaterThan(desertWind);
  });
  it('landing-zone environments expose a target zone', () => {
    expect(makeParamsFor('park', 1).targetZone).toBeDefined();
  });
  it('bathtub floats the pad above water via launchY without raising the floor', () => {
    const p = makeParamsFor('bathtub', 1);
    expect(p.groundHeight).toBe(0);
    expect(p.launchY).toBe(2.5);
  });
  it('other environments do not define launchY', () => {
    for (const id of ['park', 'urban', 'mountain', 'desert', 'sea', 'rooftop', 'backyard-dog']) {
      expect(makeParamsFor(id, 1).launchY).toBeUndefined();
    }
  });
});
