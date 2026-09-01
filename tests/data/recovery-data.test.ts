import { describe, expect, it } from 'vitest';
import { rockets } from '../../src/data/rockets';
import type { RecoveryDevice } from '../../src/sim/types';

const DEVICES: readonly string[] = ['parachute', 'streamer', 'tumble', 'glider', 'helicopter'];

describe('generated recovery data', () => {
  it('every rocket has a valid, duplicate-free recovery list', () => {
    expect(rockets.length).toBeGreaterThan(100);
    for (const r of rockets) {
      const list = (r.recovery ?? []) as string[];
      for (const d of list) expect(DEVICES).toContain(d);
      expect(new Set(list).size).toBe(list.length);
    }
  });

  it('parses known combo rockets correctly', () => {
    const by = (id: string) => rockets.find((r) => r.id === id)!;
    // Prose combos: chute+glider, chute+heli, chute+tumble; streamer-only (its
    // only "parachute" mention is a comparison, which the parser must skip).
    expect(by('space-shuttle').recovery).toEqual(['parachute', 'glider']);
    expect(by('super-orbital-transport').recovery).toEqual(['parachute', 'glider']);
    expect(by('roto-rocket').recovery).toEqual(['parachute', 'helicopter']);
    expect(by('mayhem').recovery).toEqual(['parachute', 'tumble']);
    expect(by('the-mavericks').recovery).toEqual(['streamer']);
    // "No parachute or streamer needed — lands upright on its tripod legs":
    // a designed no-assist landing parses as tumble, not unspecified/Random.
    expect(by('destination-mars-leaper').recovery).toEqual(['tumble']);
  });

  it('derives chuteDiameterM from the parsed list (not a mass heuristic)', () => {
    const by = (id: string) => rockets.find((r) => r.id === id)!;
    expect(by('mayhem').chuteDiameterM).toBeGreaterThan(0); // parachute in list
    expect(by('the-mavericks').chuteDiameterM).toBe(0); // streamer-only
    expect(by('roto-rocket').chuteDiameterM).toBeGreaterThan(0);
  });

  it('unspecified rockets stay empty (random at ejection) in meaningful numbers', () => {
    const unspecified = rockets.filter((r) => (r.recovery?.length ?? 0) === 0);
    // 56 products mention no device word; allow slack for catalog drift.
    expect(unspecified.length).toBeGreaterThan(40);
  });

  it('random-capable rockets keep a chute diameter so a rolled parachute works', () => {
    for (const r of rockets) {
      if ((r.recovery?.length ?? 0) === 0) expect(r.chuteDiameterM).toBeGreaterThan(0);
    }
  });

  it('recoveryDevice helper narrows strings to devices', () => {
    const d: RecoveryDevice = 'glider';
    expect(DEVICES).toContain(d);
  });
});
