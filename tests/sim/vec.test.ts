import { describe, it, expect } from 'vitest';
import { vec, add, sub, scale, length, normalize, horizontalDistance } from '../../src/sim/vec';

describe('vec', () => {
  it('adds and subtracts', () => {
    expect(add(vec(1, 2, 3), vec(4, 5, 6))).toEqual(vec(5, 7, 9));
    expect(sub(vec(4, 5, 6), vec(1, 2, 3))).toEqual(vec(3, 3, 3));
  });
  it('scales and measures length', () => {
    expect(scale(vec(1, 2, 3), 2)).toEqual(vec(2, 4, 6));
    expect(length(vec(3, 4, 0))).toBe(5);
  });
  it('normalizes and handles zero', () => {
    expect(length(normalize(vec(0, 5, 0)))).toBeCloseTo(1);
    expect(normalize(vec(0, 0, 0))).toEqual(vec(0, 0, 0));
  });
  it('computes horizontal distance ignoring y', () => {
    expect(horizontalDistance(vec(0, 100, 0), vec(3, 0, 4))).toBe(5);
  });
});
