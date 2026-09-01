export interface Vec3 { x: number; y: number; z: number; }

export type MotorClass = '1/8A' | '1/4A' | '1/2A' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

export interface Motor {
  id: string;
  class: MotorClass;
  totalImpulseNs: number;
  avgThrustN: number;
  burnTimeS: number;
  massTotalKg: number;
  massPropKg: number;
  delayS: number;
  /** Novelty: if set, a violent random lateral kick at ignition (m/s). */
  chaos?: number;
}

export interface RocketLook {
  bodyLengthM: number;
  finCount: number;
  bodyColor: number;
  finColor: number;
  noseColor: number;
}

export interface Rocket {
  id: string;
  name: string;
  massEmptyKg: number;
  diameterM: number;
  dragCoefficient: number;
  chuteDiameterM: number;
  chuteCd: number;
  recommendedMotors: string[];
  maxMotorImpulseNs: number;
  look: RocketLook;
}

export type FlightPhase =
  | 'idle' | 'boost' | 'coast' | 'apogee' | 'descent' | 'landed' | 'failed';

export type Outcome = 'nominal' | 'cato' | 'chute-fail' | 'tip-off';

export interface Wind { base: Vec3; gust: number; }

export interface FlightState {
  time: number;
  position: Vec3;
  velocity: Vec3;
  mass: number;
  phase: FlightPhase;
  outcome: Outcome | null;
  apogee: number;
  maxSpeed: number;
  chuteDeployed: boolean;
  liftedOff: boolean;
  impactSpeed: number;
}

export interface EnvParams {
  groundHeight: number;
  /** Height of the launch surface (pad/rocket base) when it differs from terrain — e.g. bathtub water surface. */
  launchY?: number;
  wind: Wind;
  bounds: { radius: number };
  targetZone?: { center: Vec3; radius: number };
}

export type ChallengeType = 'none' | 'target-altitude' | 'landing-zone';

export interface ChallengeConfig {
  type: ChallengeType;
  targetAltitudeM?: number;
  toleranceM?: number;
}

export interface ChallengeResult { score: number; detail: string; }

export interface SimConfig {
  rocket: Rocket;
  motor: Motor;
  environment: EnvParams;
  seed: number;
  challenge: ChallengeConfig;
  /**
   * Landing-surface height at a horizontal position, matching the rendered
   * terrain (set by the environment build). When absent the sim lands on the
   * flat pad level (`launchY ?? groundHeight`). Pad support and the apogee
   * baseline always use the pad level regardless of this sampler.
   */
  groundAt?: (x: number, z: number) => number;
  /**
   * Launch attitude as a unit vector in world space (the direction the nose
   * points at ignition). Absent, zero, or non-finite falls back to straight
   * up. The attitude stays fixed in world space for the whole flight.
   */
  initialDirection?: Vec3;
}

export interface FlightSummary {
  apogee: number;
  maxSpeed: number;
  flightTime: number;
  outcome: Outcome;
  driftDistanceM: number;
  challenge?: ChallengeResult;
}
