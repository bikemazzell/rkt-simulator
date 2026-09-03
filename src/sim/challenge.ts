import type { ChallengeConfig, ChallengeResult, EnvParams, FlightSummary, Vec3 } from './types';
import { horizontalDistance } from './vec';

export function scoreChallenge(
  config: ChallengeConfig, env: EnvParams, summary: FlightSummary, landing: Vec3,
): ChallengeResult {
  // 'height-ladder' is visual-only: it falls through with no score.
  if (config.type === 'landing-zone') {
    const zone = env.targetZone;
    if (!zone) return { score: 0, detail: 'no landing zone in this environment' };
    const dist = horizontalDistance(landing, zone.center);
    const score = dist >= zone.radius ? 0 : Math.round(100 * (1 - dist / zone.radius));
    return { score, detail: `landed ${dist.toFixed(0)} m from zone center` };
  }
  return { score: 0, detail: 'no challenge' };
}
