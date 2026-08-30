import { describe, it, expect } from 'vitest';
import { biomeFor, BIOME_ENV_IDS } from '../../src/world/biome';

const ALL_IDS = ['park', 'urban', 'mountain', 'desert', 'sea', 'rooftop', 'bathtub', 'backyard-dog'];

describe('biome', () => {
  it('covers every environment id', () => {
    expect(BIOME_ENV_IDS.sort()).toEqual([...ALL_IDS].sort());
    for (const id of ALL_IDS) {
      expect(biomeFor(id).envId).toBe(id);
    }
  });

  it('throws on unknown ids', () => {
    expect(() => biomeFor('moon')).toThrow();
  });

  it('every ground palette has at least 3 distinct colors', () => {
    for (const id of ALL_IDS) {
      const pal = biomeFor(id).groundPalette;
      expect(pal.length).toBeGreaterThanOrEqual(3);
      expect(new Set(pal).size).toBe(pal.length);
    }
  });

  it('weather weights are non-negative and sum to 1', () => {
    for (const id of ALL_IDS) {
      const w = biomeFor(id).weather;
      const sum = w.clear + w.rain + w.storm + w.snow;
      expect(sum).toBeCloseTo(1, 6);
      for (const v of Object.values(w)) expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('desert never snows and never storms', () => {
    const w = biomeFor('desert').weather;
    expect(w.snow).toBe(0);
    expect(w.storm).toBe(0);
  });

  it('sea has no ground creatures (birds only)', () => {
    const c = biomeFor('sea').creatures;
    expect(c.villagers).toBe(0);
    expect(c.animals).toBe(0);
    expect(c.birds).toBeGreaterThan(0);
  });

  it('rooftop creatures walk at street level', () => {
    expect(biomeFor('rooftop').creatures.groundY).toBe(0);
  });

  it('flora and creature counts are non-negative integers', () => {
    for (const id of ALL_IDS) {
      const b = biomeFor(id);
      for (const v of Object.values(b.flora)) {
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
      for (const k of ['villagers', 'animals', 'birds'] as const) {
        expect(Number.isInteger(b.creatures[k])).toBe(true);
        expect(b.creatures[k]).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
