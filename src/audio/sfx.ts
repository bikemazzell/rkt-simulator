type SfxName = 'launch' | 'chute' | 'boom';

const TONES: Record<SfxName, { freq: number; dur: number; type: OscillatorType }> = {
  launch: { freq: 90, dur: 0.6, type: 'sawtooth' },
  chute: { freq: 500, dur: 0.15, type: 'triangle' },
  boom: { freq: 60, dur: 0.5, type: 'square' },
};

export class Sfx {
  muted = true;
  private ctx: AudioContext | null = null;

  private ensureCtx(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      const g = globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
      const Ctor = g.AudioContext ?? g.webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      return this.ctx;
    } catch {
      return null;
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  play(name: SfxName): void {
    if (this.muted) return;
    const ctx = this.ensureCtx();
    if (!ctx) return;
    try {
      const { freq, dur, type } = TONES[name];
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch {
      // Audio is best-effort; never block a launch.
    }
  }
}
