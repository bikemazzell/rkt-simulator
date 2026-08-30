import { describe, it, expect } from 'vitest';
import { formatAltitude, formatSpeed, phaseLabel } from '../../src/ui/format';

describe('ui formatters', () => {
  it('formats altitude with unit', () => {
    expect(formatAltitude(123.4)).toBe('123 m');
  });
  it('formats speed with one decimal', () => {
    expect(formatSpeed(45.67)).toBe('45.7 m/s');
  });
  it('labels phases readably', () => {
    expect(phaseLabel('boost')).toBe('Boost');
    expect(phaseLabel('apogee')).toBe('Apogee');
  });
});
