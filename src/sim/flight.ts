import type { FlightState, FlightPhase, Motor, SimConfig } from './types';
import { vec } from './vec';

export function initialFlightState(config: SimConfig): FlightState {
  return {
    time: 0,
    position: config.launchOrigin
      ? vec(config.launchOrigin.x, config.launchOrigin.y, config.launchOrigin.z)
      : vec(0, config.environment.launchY ?? config.environment.groundHeight, 0),
    velocity: vec(0, 0, 0),
    mass: config.rocket.massEmptyKg + config.motor.massTotalKg,
    phase: 'idle',
    outcome: null,
    apogee: 0,
    maxSpeed: 0,
    chuteDeployed: false,
    recoveryDeployed: [],
    liftedOff: false,
    impactSpeed: 0,
  };
}

export function advancePhase(state: FlightState, motor: Motor): FlightPhase {
  const burning = state.time <= motor.burnTimeS;
  switch (state.phase) {
    case 'boost':
      return burning ? 'boost' : 'coast';
    case 'coast':
      return state.velocity.y <= 0 ? 'apogee' : 'coast';
    case 'apogee':
      return 'descent';
    default:
      return state.phase;
  }
}
