import { describe, it, expect } from 'vitest';
import { formatAltitude, formatSpeed, formatLength, phaseLabel } from '../../src/ui/format';

describe('ui formatters', () => {
  it('formats altitude with unit', () => {
    expect(formatAltitude(123.4)).toBe('123 m');
  });
  it('formats speed with one decimal', () => {
    expect(formatSpeed(45.67)).toBe('45.7 m/s');
  });
  it('formats lengths in cm below one metre', () => {
    expect(formatLength(0.41)).toBe('41 cm');
    expect(formatLength(0.98)).toBe('98 cm');
  });
  it('formats short lengths in metres with two decimals', () => {
    expect(formatLength(1.234)).toBe('1.23 m');
    expect(formatLength(2)).toBe('2.00 m');
  });
  it('formats long lengths in whole metres', () => {
    expect(formatLength(10.7)).toBe('11 m');
  });
  it('labels phases readably', () => {
    expect(phaseLabel('boost')).toBe('Boost');
    expect(phaseLabel('apogee')).toBe('Apogee');
  });
});
