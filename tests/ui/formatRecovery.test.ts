import { describe, expect, it } from 'vitest';
import { formatRecovery } from '../../src/ui/ui';
import type { RecoveryDevice } from '../../src/sim/types';

describe('formatRecovery', () => {
  it('labels an unspecified list as Random', () => {
    expect(formatRecovery(undefined)).toBe('Random');
    expect(formatRecovery([])).toBe('Random');
  });

  it('capitalises a single device', () => {
    expect(formatRecovery(['parachute'] as RecoveryDevice[])).toBe('Parachute');
    expect(formatRecovery(['helicopter'] as RecoveryDevice[])).toBe('Helicopter');
  });

  it('joins combos with + in list order', () => {
    expect(formatRecovery(['parachute', 'glider'])).toBe('Parachute + Glider');
    expect(formatRecovery(['streamer', 'tumble'])).toBe('Streamer + Tumble');
  });
});
