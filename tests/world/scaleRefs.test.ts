import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/sim/rng';
import {
  SCALE_REFERENCES,
  pickReferences,
  describeSize,
  totalHeightM,
  type ScaleRef,
} from '../../src/world/scaleRefs';

const byId = (id: string): ScaleRef =>
  SCALE_REFERENCES.find((r) => r.id === id)!;

describe('scale reference ladder', () => {
  it('is sorted by strictly increasing height', () => {
    const heights = SCALE_REFERENCES.map((r) => r.heightM);
    for (let i = 1; i < heights.length; i++) {
      expect(heights[i]).toBeGreaterThan(heights[i - 1]);
    }
  });

  it('brackets the playable rocket range (0.27 m to 2.05 m body)', () => {
    const heights = SCALE_REFERENCES.map((r) => r.heightM);
    expect(Math.min(...heights)).toBeLessThanOrEqual(0.30);
    expect(Math.max(...heights)).toBeGreaterThanOrEqual(2.00);
  });

  it('includes person as the anchor', () => {
    expect(SCALE_REFERENCES.some((r) => r.id === 'person')).toBe(true);
  });

  it('spans pocket-size objects, animals and large objects', () => {
    expect(SCALE_REFERENCES.some((r) => r.id === 'baseball' && r.heightM < 0.1)).toBe(true);
    expect(SCALE_REFERENCES.some((r) => r.id === 'book' && r.heightM < 0.3)).toBe(true);
    expect(SCALE_REFERENCES.some((r) => r.id === 'coffee-mug' && r.heightM < 0.15)).toBe(true);
    expect(SCALE_REFERENCES.some((r) => r.id === 'sheep')).toBe(true);
    expect(SCALE_REFERENCES.some((r) => r.id === 'fire-hydrant')).toBe(true);
    expect(SCALE_REFERENCES.some((r) => r.id === 'house' && r.heightM >= 2.8)).toBe(true);
    expect(SCALE_REFERENCES.some((r) => r.id === 'elephant' && r.heightM >= 3.0)).toBe(true);
  });

  it('has no coin rung (never selectable at rocket scale)', () => {
    expect(SCALE_REFERENCES.some((r) => r.id === 'coin')).toBe(false);
  });
});

describe('pickReferences', () => {
  it('is deterministic for a given rng seed', () => {
    expect(pickReferences(0.9, mulberry32(7))).toEqual(pickReferences(0.9, mulberry32(7)));
  });

  it('returns between 3 and 5 references across the range', () => {
    for (let h = 0.15; h <= 2.4; h += 0.05) {
      const picked = pickReferences(h, mulberry32(3));
      expect(picked.length, `h=${h}`).toBeGreaterThanOrEqual(3);
      expect(picked.length, `h=${h}`).toBeLessThanOrEqual(5);
    }
  });

  it('returns height-sorted results', () => {
    const a = pickReferences(0.9, mulberry32(4));
    const heights = a.map((r) => r.heightM);
    for (let i = 1; i < heights.length; i++) {
      expect(heights[i]).toBeGreaterThan(heights[i - 1]);
    }
  });

  it('always brackets the height with the nearest rungs', () => {
    for (let h = 0.15; h <= 2.4; h += 0.05) {
      const picked = pickReferences(h, mulberry32(11));
      const ids = picked.map((r) => r.id);
      let below: ScaleRef | undefined;
      for (const r of SCALE_REFERENCES) if (r.heightM <= h) below = r;
      if (below) expect(ids, `h=${h}`).toContain(below.id);
      const above = SCALE_REFERENCES.find((r) => r.heightM >= h);
      if (above && above !== below) {
        // The above rung is only skippable when it reads as the same height
        // as the below rung (within the 12% redundancy band).
        const redundant = below !== undefined && above.heightM / below.heightM < 1.12;
        if (!redundant) expect(ids, `h=${h}`).toContain(above.id);
      }
    }
  });

  it('never picks two rungs within 12% of each other', () => {
    for (let h = 0.15; h <= 2.4; h += 0.05) {
      const picked = pickReferences(h, mulberry32(23));
      for (let i = 1; i < picked.length; i++) {
        expect(picked[i].heightM / picked[i - 1].heightM, `h=${h}`).toBeGreaterThanOrEqual(1.12);
      }
    }
  });

  it('varies the lineup between visits (seeded randomness)', () => {
    const sets = new Set<string>();
    for (let seed = 1; seed <= 24; seed++) {
      sets.add(pickReferences(0.9, mulberry32(seed)).map((r) => r.id).join(','));
    }
    // Randomized fill should produce a spread of distinct lineups, not one row.
    expect(sets.size).toBeGreaterThanOrEqual(6);
  });

  it('falls back to log-distance fill when no rung exists above', () => {
    // 3.5 m > tallest rung (elephant 3.20)
    const picked = pickReferences(3.5, mulberry32(5));
    expect(picked.some((r) => r.heightM > 3.5)).toBe(false); // nothing above exists
    expect(picked.length).toBeGreaterThanOrEqual(3);
    expect(picked.some((r) => r.id === 'elephant')).toBe(true);
  });

  it('is stable at exact rung heights', () => {
    const atRung = pickReferences(byId('person').heightM, mulberry32(2));
    expect(atRung.filter((r) => r.id === 'person').length).toBe(1);
    expect(atRung.length).toBeGreaterThanOrEqual(3);
  });
});

describe('describeSize', () => {
  it('names the nearest reference for a typical small rocket', () => {
    expect(describeSize(0.41)).toContain('wine bottle');
  });

  it('names the nearest reference for person-scale heights', () => {
    expect(describeSize(1.72)).toContain('person');
    expect(describeSize(1.72)).not.toContain('tall person');
  });

  it('returns a usable phrase for the smallest and largest rockets', () => {
    expect(describeSize(0.3).length).toBeGreaterThan(5);
    expect(describeSize(2.28).length).toBeGreaterThan(5);
  });
});

describe('totalHeightM', () => {
  it('adds nose cone allowance to the body length', () => {
    expect(totalHeightM({ look: { bodyLengthM: 0.35 }, diameterM: 0.0246 } as never)).toBeCloseTo(0.35 + 0.0246 * 1.5, 6);
    expect(totalHeightM({ look: { bodyLengthM: 2.05 }, diameterM: 0.15 } as never)).toBeCloseTo(2.05 + 0.15 * 1.5, 6);
  });
});
