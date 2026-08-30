import { describe, it, expect } from 'vitest';
import { Sfx } from '../../src/audio/sfx';

describe('Sfx', () => {
  it('is muted by default', () => {
    expect(new Sfx().muted).toBe(true);
  });
  it('toggles mute', () => {
    const s = new Sfx();
    expect(s.toggleMute()).toBe(false);
    expect(s.muted).toBe(false);
    expect(s.toggleMute()).toBe(true);
  });
  it('play never throws even without WebAudio', () => {
    const s = new Sfx();
    s.toggleMute();
    expect(() => s.play('launch')).not.toThrow();
  });
});
