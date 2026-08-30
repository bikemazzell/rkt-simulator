import type { SimConfig, FlightState, FlightSummary, Vec3, Rocket } from './types';
import { initialFlightState, advancePhase } from './flight';
import { thrustAt } from './thrustCurve';
import { stepMotion } from './integrator';
import { windAt } from './atmosphere';
import { vec, horizontalDistance, length } from './vec';
import { mulberry32, type Rng } from './rng';
import { applyOutcome } from './outcomes';

export const DT = 1 / 120;
const HARD_LANDING_MPS = 15;    // impact speed above which a landing is a crash
const MAX_FLIGHT_TIME = 600;    // absolute safety terminal (s)
const TUMBLE_AREA_FACTOR = 8;   // tumbling/streamer recovery presents ~8x body area

// Effective recovery drag area once recovery has deployed. A parachute uses the
// canopy; a chuteless (streamer/tumble) rocket uses an inflated body area so a light
// rocket still descends survivably rather than ballistically.
function recoveryArea(rocket: Rocket): number {
  return rocket.chuteDiameterM > 0
    ? Math.PI * (rocket.chuteDiameterM / 2) ** 2
    : Math.PI * (rocket.diameterM / 2) ** 2 * TUMBLE_AREA_FACTOR;
}

export class Simulation {
  readonly state: FlightState;
  private readonly config: SimConfig;
  private readonly rng: Rng;
  private readonly launchPos: Vec3;
  private ejected = false;

  constructor(config: SimConfig) {
    this.config = config;
    this.rng = mulberry32(config.seed);
    this.state = initialFlightState(config);
    this.launchPos = { ...this.state.position };
  }

  get done(): boolean {
    return this.state.phase === 'landed' || this.state.phase === 'failed';
  }

  step(): void {
    if (this.done) return;
    const s = this.state;
    const { rocket, motor, environment } = this.config;
    const ground = environment.groundHeight;

    if (s.phase === 'idle') {
      s.phase = 'boost';
      applyOutcome(s, this.config, this.rng, 'ignition');
      if (s.outcome === 'cato') return; // CATO on the pad
    }

    s.time += DT;

    const thrustN = s.time <= motor.burnTimeS ? thrustAt(motor, s.time) : 0;
    const burnedProp = motor.massPropKg * Math.min(1, s.time / motor.burnTimeS);
    s.mass = rocket.massEmptyKg + motor.massTotalKg - burnedProp;

    // Ejection charge fires once at burnout + delay, only after the rocket has
    // left the pad (may be before or after apogee). A pad-stuck rocket never ejects.
    if (!this.ejected && s.liftedOff && s.time >= motor.burnTimeS + motor.delayS) {
      this.ejected = true;
      applyOutcome(s, this.config, this.rng, 'ejection');
    }

    const refArea = s.chuteDeployed ? recoveryArea(rocket) : Math.PI * (rocket.diameterM / 2) ** 2;
    const cd = s.chuteDeployed ? rocket.chuteCd : rocket.dragCoefficient;

    const next = stepMotion({
      position: s.position, velocity: s.velocity, mass: s.mass,
      thrustN, refArea, dragCoefficient: cd,
      wind: windAt(environment.wind, this.rng), dt: DT,
    });
    s.position = next.position;
    s.velocity = next.velocity;

    // Pad support: before liftoff the pad holds the rocket up during the thrust ramp.
    if (!s.liftedOff) {
      if (s.position.y > ground) {
        s.liftedOff = true;
      } else {
        s.position = vec(s.position.x, ground, s.position.z);
        if (s.velocity.y < 0) s.velocity = vec(s.velocity.x, 0, s.velocity.z);
      }
    }

    s.apogee = Math.max(s.apogee, s.position.y - ground);
    s.maxSpeed = Math.max(s.maxSpeed, length(s.velocity));

    const nextPhase = advancePhase(s, motor);
    if (nextPhase !== s.phase) s.phase = nextPhase;

    // Landing, only once airborne. Classify hard impacts as crashes.
    if (s.liftedOff && s.position.y <= ground) {
      s.impactSpeed = Math.abs(s.velocity.y);
      s.position = vec(s.position.x, ground, s.position.z);
      s.velocity = vec(0, 0, 0);
      const hardLanding = !s.chuteDeployed || s.impactSpeed > HARD_LANDING_MPS;
      if (s.phase !== 'failed') s.phase = hardLanding ? 'failed' : 'landed';
      if (s.outcome === null) s.outcome = hardLanding ? 'chute-fail' : 'nominal';
      return;
    }

    // Termination safety nets.
    if (!s.liftedOff && s.time > motor.burnTimeS + motor.delayS + 1) {
      s.phase = 'failed';           // never left the pad (thrust-to-weight < 1)
      if (s.outcome === null) s.outcome = 'tip-off';
    } else if (s.time > MAX_FLIGHT_TIME) {
      s.phase = s.liftedOff ? 'landed' : 'failed';
      if (s.outcome === null) s.outcome = s.liftedOff ? 'nominal' : 'tip-off';
    }
  }

  summary(): FlightSummary {
    const s = this.state;
    return {
      apogee: s.apogee,
      maxSpeed: s.maxSpeed,
      flightTime: s.time,
      outcome: s.outcome ?? 'nominal',
      driftDistanceM: horizontalDistance(this.launchPos, s.position),
    };
  }
}
