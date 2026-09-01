import type { SimConfig, FlightState, FlightSummary, Vec3, RecoveryDevice } from './types';
import { initialFlightState, advancePhase } from './flight';
import { thrustAt } from './thrustCurve';
import { stepMotion, thrustAxis } from './integrator';
import { windAt } from './atmosphere';
import { vec, horizontalDistance, length } from './vec';
import { mulberry32, type Rng } from './rng';
import { applyOutcome } from './outcomes';
import {
  chuteArea, streamerArea, helicopterArea, tumbleArea,
  dominantDevice, resolveRecovery, recoveryRng,
  STREAMER_CD, HELICOPTER_CD, GLIDER_SINK, GLIDER_SPEED,
} from './recovery';

export const DT = 1 / 120;
const HARD_LANDING_MPS = 15;    // impact speed above which a landing is a crash
const MAX_FLIGHT_TIME = 600;    // absolute safety terminal (s)

// Recovery-device choreography: the helicopter's tight spiral and the glider's
// banking circle are horizontal velocity overrides applied after the physical
// step — vertical motion stays under the (device-sized) drag physics.
const HELI_PERIOD_S = 2.5;      // one full spiral turn
const HELI_RADIUS_M = 1.5;
const GLIDE_RADIUS_M = 15;      // banking circle
const GLIDE_BLEND_S = 1;        // ease from ballistic to glide over this long

export class Simulation {
  readonly state: FlightState;
  private readonly config: SimConfig;
  private readonly rng: Rng;
  private readonly recRng: Rng;
  private readonly launchPos: Vec3;
  private readonly thrustDir: Vec3;
  private ejected = false;
  private heliPhase: number | null = null;
  private glide: { phase: number; dir: 1 | -1; blend: number } | null = null;

  constructor(config: SimConfig) {
    this.config = config;
    this.rng = mulberry32(config.seed);
    // Recovery resolution (random devices, spiral/circle phases) draws from its
    // own stream so adding it never shifts the shared flight rng sequence.
    this.recRng = recoveryRng(config.seed);
    this.state = initialFlightState(config);
    this.launchPos = { ...this.state.position };
    this.thrustDir = thrustAxis(config.initialDirection);
  }

  get done(): boolean {
    return this.state.phase === 'landed' || this.state.phase === 'failed';
  }

  step(): void {
    if (this.done) return;
    const s = this.state;
    const { rocket, motor, environment } = this.config;
    // Base level for the rail hold, liftoff compare, and the apogee baseline:
    // the pad level normally, or the explicit launch origin's height when
    // relaunching from a resting spot above/below the pad.
    const origin = this.config.launchOrigin;
    const base = origin !== undefined && Number.isFinite(origin.y)
      ? origin.y
      : environment.launchY ?? environment.groundHeight;
    // Landing surface follows the rendered terrain when the environment
    // provides a sampler, so rockets drifting over hills rest ON the hill,
    // not at pad level inside it.
    const sampled = this.config.groundAt?.(s.position.x, s.position.z);
    const surface = sampled !== undefined && Number.isFinite(sampled) ? sampled : base;

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
    // Recovery devices resolve first (random rockets roll here), then the fail
    // roll runs on the shared rng — separate streams keep the order safe.
    // A rocket whose ONLY device is a catalogue tumble needs no ejection charge
    // (it passively destabilises at burnout), so its delay is capped short —
    // otherwise a long-delay motor ends the hop before recovery ever engages.
    const explicitTumble = rocket.recovery?.length === 1 && rocket.recovery[0] === 'tumble';
    const ejectAt = motor.burnTimeS + (explicitTumble ? Math.min(motor.delayS, 0.5) : motor.delayS);
    if (!this.ejected && s.liftedOff && s.time >= ejectAt) {
      this.ejected = true;
      s.recoveryDeployed = resolveRecovery(rocket.recovery, this.recRng);
      applyOutcome(s, this.config, this.rng, 'ejection');
    }

    // Device-sized drag: the dominant device (slowest computed sink) sets the
    // recovery area; every combo member still renders once deployed.
    const bodyArea = Math.PI * (rocket.diameterM / 2) ** 2;
    const devices: RecoveryDevice[] = s.chuteDeployed ? (s.recoveryDeployed ?? []) : [];
    const dominant = devices.length > 0 ? dominantDevice(devices, rocket, s.mass) : null;
    let refArea = bodyArea;
    let cd = rocket.dragCoefficient;
    if (dominant === 'parachute') {
      refArea = chuteArea(rocket);
      cd = rocket.chuteCd;
    } else if (dominant === 'streamer') {
      refArea = streamerArea(s.mass);
      cd = STREAMER_CD;
    } else if (dominant === 'tumble') {
      refArea = tumbleArea(rocket);
      cd = rocket.chuteCd;
    } else if (dominant === 'helicopter') {
      refArea = helicopterArea(s.mass);
      cd = HELICOPTER_CD;
    } else if (dominant === 'glider') {
      // Body drag until the glide captures; the kinematic override below then
      // flies the circle.
      refArea = bodyArea;
      cd = rocket.dragCoefficient;
    }

    const next = stepMotion({
      position: s.position, velocity: s.velocity, mass: s.mass,
      thrustN, refArea, dragCoefficient: cd,
      wind: windAt(environment.wind, this.rng), dt: DT,
      thrustDirection: this.thrustDir,
    });
    s.position = next.position;
    s.velocity = next.velocity;
    this.applyRecoveryKinematics(s, environment);

    // Pad support: before liftoff the pad holds the rocket up during the thrust
    // ramp. An angled aim must not slide the rocket sideways off the pad — the
    // launch rail pins it horizontally until the vertical thrust component
    // actually lifts it (a 90° aim therefore ends in a pad tip-off).
    if (!s.liftedOff) {
      if (s.position.y > base) {
        s.liftedOff = true;
      } else {
        s.position = vec(this.launchPos.x, base, this.launchPos.z);
        s.velocity = vec(0, s.velocity.y < 0 ? 0 : s.velocity.y, 0);
      }
    }

    s.apogee = Math.max(s.apogee, s.position.y - base);
    s.maxSpeed = Math.max(s.maxSpeed, length(s.velocity));

    const nextPhase = advancePhase(s, motor);
    if (nextPhase !== s.phase) s.phase = nextPhase;

    // Landing, only once airborne. Classify hard impacts as crashes, keeping
    // phase and outcome consistent (a `failed` phase always has a crash outcome,
    // never a leftover `nominal` from the ejection roll). A deployed recovery
    // that still hits hard is a "hard landing"; a failed deployment stays the
    // original "chute-fail".
    if (s.liftedOff && s.position.y <= surface) {
      s.impactSpeed = Math.abs(s.velocity.y);
      s.position = vec(s.position.x, surface, s.position.z);
      s.velocity = vec(0, 0, 0);
      const hardLanding = !s.chuteDeployed || s.impactSpeed > HARD_LANDING_MPS;
      s.phase = hardLanding ? 'failed' : 'landed';
      if (hardLanding) {
        if (s.outcome !== 'cato') s.outcome = s.chuteDeployed ? 'hard-landing' : 'chute-fail';
      } else if (s.outcome === null) {
        s.outcome = 'nominal';
      }
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

  /**
   * Horizontal choreography for helicopter and glider recoveries: vertical
   * motion stays physical (device-sized drag); only the horizontal velocity is
   * overridden so the descent reads as its device — a tight spiral for the
   * rotor, a banking circle that drifts with the wind for the glider. The
   * rocket that is left with nothing (failed deployment) falls ballistically.
   */
  private applyRecoveryKinematics(s: FlightState, environment: SimConfig['environment']): void {
    const devices = s.chuteDeployed ? (s.recoveryDeployed ?? []) : [];
    if (devices.length === 0 || !s.liftedOff) return;
    const dominant = dominantDevice(devices, this.config.rocket, s.mass);
    const wind = environment.wind.base;
    if (dominant === 'helicopter') {
      if (this.heliPhase === null) this.heliPhase = this.recRng() * Math.PI * 2;
      const omega = (Math.PI * 2) / HELI_PERIOD_S;
      this.heliPhase += omega * DT;
      const v = omega * HELI_RADIUS_M;
      // Rotating tangent at fixed speed traces the spiral on its own; the wind
      // base carries the whole circle downwind.
      s.velocity = {
        x: -Math.sin(this.heliPhase) * v + wind.x,
        y: s.velocity.y,
        z: Math.cos(this.heliPhase) * v + wind.z,
      };
    } else if (dominant === 'glider' && s.velocity.y < 0) {
      if (this.glide === null) {
        // Capture the current heading (falling straight over the top after
        // apogee has none — fly toward +X by default). The tangent
        // (-sin φ, cos φ) at this phase reproduces the heading for both bank
        // directions; `dir` only sets the sign of the phase progression.
        const dir: 1 | -1 = this.recRng() < 0.5 ? 1 : -1;
        const hSpeed = Math.hypot(s.velocity.x, s.velocity.z);
        const headingX = hSpeed > 0.5 ? s.velocity.x / hSpeed : 1;
        const headingZ = hSpeed > 0.5 ? s.velocity.z / hSpeed : 0;
        this.glide = { phase: Math.atan2(-headingX, headingZ), dir, blend: 0 };
      }
      const g = this.glide;
      const vh = Math.sqrt(GLIDER_SPEED ** 2 - GLIDER_SINK ** 2); // horizontal share of the glide speed
      g.blend = Math.min(1, g.blend + DT / GLIDE_BLEND_S);
      g.phase += g.dir * (vh / GLIDE_RADIUS_M) * DT;
      const b = g.blend;
      s.velocity = {
        x: s.velocity.x + (-Math.sin(g.phase) * vh + wind.x - s.velocity.x) * b,
        y: s.velocity.y + (-GLIDER_SINK - s.velocity.y) * b,
        z: s.velocity.z + (Math.cos(g.phase) * vh + wind.z - s.velocity.z) * b,
      };
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
