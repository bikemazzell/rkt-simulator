import { describe, expect, it } from 'vitest';
import {
  crossedThresholds, stepPopups, POPUP_LIFE_S, LADDER_STEP_M,
} from '../../src/ui/altitudePopup';

describe('crossedThresholds', () => {
  it('returns nothing below the first rung', () => {
    expect(crossedThresholds(0, 49)).toEqual([]);
    expect(crossedThresholds(10, 49.9)).toEqual([]);
  });
  it('returns a single crossed rung', () => {
    expect(crossedThresholds(49, 51)).toEqual([50]);
    expect(crossedThresholds(0, 50)).toEqual([50]); // landing exactly on it counts
  });
  it('returns every rung crossed in one jump', () => {
    expect(crossedThresholds(40, 160)).toEqual([50, 100, 150]);
  });
  it('ignores descending motion', () => {
    expect(crossedThresholds(160, 40)).toEqual([]);
  });
  it('never reports above the ladder cap', () => {
    expect(crossedThresholds(990, 1050)).toEqual([1000]);
  });
  it('handles negative starting altitudes', () => {
    expect(crossedThresholds(-30, 60)).toEqual([50]);
  });
});

describe('stepPopups', () => {
  it('ages popups and drops expired ones', () => {
    const live = stepPopups([{ altitudeM: 50, ageS: 0 }], POPUP_LIFE_S / 2);
    expect(live.length).toBe(1);
    expect(live[0].ageS).toBeCloseTo(POPUP_LIFE_S / 2, 6);
    const dead = stepPopups([{ altitudeM: 50, ageS: POPUP_LIFE_S - 0.01 }], 0.02);
    expect(dead).toEqual([]);
  });
  it('does not mutate the input list', () => {
    const input = [{ altitudeM: 50, ageS: 0 }];
    stepPopups(input, 0.1);
    expect(input[0].ageS).toBe(0);
  });
  it('exposes the ladder step so popups match the rings', () => {
    expect(LADDER_STEP_M).toBe(50);
  });
});
