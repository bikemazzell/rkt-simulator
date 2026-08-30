import type { Motor } from './types';

const RISE_FRAC = 0.15;
const TAPER_FRAC = 0.25;

// Unscaled shape in [0, 1]: linear rise, flat sustain, linear taper.
function shape(tNorm: number): number {
  if (tNorm <= 0 || tNorm >= 1) return 0;
  if (tNorm < RISE_FRAC) return tNorm / RISE_FRAC;
  if (tNorm > 1 - TAPER_FRAC) return (1 - tNorm) / TAPER_FRAC;
  return 1;
}

// Analytic mean of `shape` over [0,1] (area of the trapezoid / 1).
const SHAPE_MEAN = 1 - RISE_FRAC / 2 - TAPER_FRAC / 2;

function peakThrust(motor: Motor): number {
  // avgThrust = peak * SHAPE_MEAN, but scale to totalImpulse for exactness.
  return motor.totalImpulseNs / (motor.burnTimeS * SHAPE_MEAN);
}

export function thrustAt(motor: Motor, t: number): number {
  if (t < 0 || t > motor.burnTimeS) return 0;
  return peakThrust(motor) * shape(t / motor.burnTimeS);
}

export function integrateImpulse(motor: Motor, dt = 0.001): number {
  let sum = 0;
  for (let t = 0; t < motor.burnTimeS; t += dt) {
    const h = Math.min(dt, motor.burnTimeS - t); // clamp final interval to the burn window
    sum += thrustAt(motor, t + h / 2) * h;
  }
  return sum;
}
