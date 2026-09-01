import { describe, expect, it } from 'vitest';
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

  it('has no coin rung (never selectable at rocket scale)', () => {
    expect(SCALE_REFERENCES.some((r) => r.id === 'coin')).toBe(false);
  });
});

describe('pickReferences', () => {
  it('always includes person', () => {
    for (const h of [0.28, 0.41, 0.6, 1.0, 1.5, 1.9, 2.05, 2.3]) {
      const picked = pickReferences(h);
      expect(picked.some((r) => r.id === 'person'), `h=${h}`).toBe(true);
    }
  });

  it('returns between 3 and 5 references across the range', () => {
    for (let h = 0.15; h <= 2.4; h += 0.05) {
      const picked = pickReferences(h);
      expect(picked.length, `h=${h}`).toBeGreaterThanOrEqual(3);
      expect(picked.length, `h=${h}`).toBeLessThanOrEqual(5);
    }
  });

  it('returns height-sorted results and is deterministic', () => {
    const a = pickReferences(0.9);
    const b = pickReferences(0.9);
    expect(a).toEqual(b);
    const heights = a.map((r) => r.heightM);
    for (let i = 1; i < heights.length; i++) {
      expect(heights[i]).toBeGreaterThan(heights[i - 1]);
    }
  });

  it('brackets the queried height when both sides exist', () => {
    const h = 0.41; // typical BT-50 rocket total height
    const picked = pickReferences(h);
    const below = picked.filter((r) => r.heightM <= h);
    const above = picked.filter((r) => r.heightM >= h);
    expect(below.length).toBeGreaterThan(0);
    expect(above.length).toBeGreaterThan(0);
    // nearest rung on each side of the ladder must be in the result
    expect(below[below.length - 1].id).toBe('wine-bottle');
    expect(above[0].id).toBe('dog');
  });

  it('drops redundant fill candidates within 12% of a picked rung', () => {
    // cow 1.45 vs car 1.50 are within 12% — never both in a lineup
    for (let h = 0.15; h <= 2.4; h += 0.05) {
      const picked = pickReferences(h);
      const ids = picked.map((r) => r.id);
      const hasCow = ids.includes('cow');
      const hasCar = ids.includes('car');
      expect(hasCow && hasCar, `h=${h}`).toBe(false);
    }
  });

  it('falls back to log-distance fill when no rung exists above', () => {
    // falcon-9 total height ~2.28 m > tallest rung (tall person 2.00)
    const picked = pickReferences(2.28);
    expect(picked.some((r) => r.heightM > 2.28)).toBe(false); // nothing above exists
    expect(picked.length).toBeGreaterThanOrEqual(3);
    expect(picked.some((r) => r.id === 'tall-person')).toBe(true);
    expect(picked.some((r) => r.id === 'person')).toBe(true);
  });

  it('is stable at exact rung heights', () => {
    const atRung = pickReferences(byId('person').heightM);
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
