import type { FlightState, RecoveryDevice, SimConfig } from './types';
import { G } from './integrator';
import { randRange, type Rng } from './rng';

export type DecisionPoint = 'ignition' | 'ejection';

const BASE_CHUTE_FAIL = 0.04;
const TUMBLE_CHUTE_FAIL = 0.15;
const BASE_TIPOFF = 0.03;

export function catoProbability(config: SimConfig): number {
  const { motor, rocket } = config;
  const overload = motor.totalImpulseNs / rocket.maxMotorImpulseNs;
  if (overload <= 1) return 0; // within rated impulse: no CATO (keeps sim deterministic-friendly)
  return Math.min(0.9, (overload - 1) * 0.8);
}

// Fail odds key on the resolved device list (rolled before this runs): a
// rocket that recovered a parachute has the gentle 4% chance, everything
// else (streamer/tumble/rotor/wing complexity) tangles more often.
export function chuteFailProbability(devices: RecoveryDevice[] | undefined): number {
  return devices?.includes('parachute') ? BASE_CHUTE_FAIL : TUMBLE_CHUTE_FAIL;
}

export function tipOffProbability(config: SimConfig): number {
  const { motor, rocket, environment } = config;
  const liftoffMass = rocket.massEmptyKg + motor.massTotalKg;
  const twr = motor.avgThrustN / (liftoffMass * G);
  const windSpeed = Math.hypot(environment.wind.base.x, environment.wind.base.z);
  const twrTerm = twr < 1.5 ? (1.5 - twr) * 0.25 : 0;   // sluggish rockets tip
  const windTerm = Math.min(0.3, windSpeed * 0.02);      // wind pushes the rail
  return Math.min(0.6, BASE_TIPOFF + twrTerm + windTerm);
}

export function applyOutcome(
  state: FlightState, config: SimConfig, rng: Rng, point: DecisionPoint,
): void {
  if (point === 'ignition') {
    if (rng() < catoProbability(config)) {
      state.phase = 'failed';
      state.outcome = 'cato';
      return;
    }
    const chaos = config.motor.chaos ?? 0;
    if (chaos > 0) {
      // Novelty motor that survived ignition: hurl it off in a semi-random
      // direction. The (huge) thrust still lifts it, so it screams up and away.
      state.outcome = 'tip-off';
      const angle = randRange(rng, 0, Math.PI * 2);
      const speed = randRange(rng, chaos * 0.5, chaos);
      state.velocity = { x: Math.cos(angle) * speed, y: state.velocity.y, z: Math.sin(angle) * speed };
      return;
    }
    if (rng() < tipOffProbability(config)) {
      state.outcome = 'tip-off';
      // Seeded lateral kick; persists into flight as an angled, drifting path.
      const angle = randRange(rng, 0, Math.PI * 2);
      const speed = randRange(rng, 3, 8);
      state.velocity = { x: Math.cos(angle) * speed, y: state.velocity.y, z: Math.sin(angle) * speed };
    }
    return;
  }
  // ejection (fired once at burnout + delay, only after liftoff); the recovery
  // list is already resolved on the state at this point
  if (rng() < chuteFailProbability(state.recoveryDeployed)) {
    if (state.outcome === null) state.outcome = 'chute-fail';
    state.chuteDeployed = false;
    state.recoveryDeployed = []; // nothing came out: ballistic
  } else {
    state.chuteDeployed = true; // recovery deployed (chute/streamer/rotor/wings)
    if (state.outcome === null) state.outcome = 'nominal';
  }
}
