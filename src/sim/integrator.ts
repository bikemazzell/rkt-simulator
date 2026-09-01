import type { Vec3 } from './types';
import { vec, add, sub, scale, length } from './vec';
import { airDensity } from './atmosphere';

export const G = 9.81;

export interface StepInput {
  position: Vec3;
  velocity: Vec3;
  mass: number;
  thrustN: number;
  refArea: number;
  dragCoefficient: number;
  wind: Vec3;
  dt: number;
  /** Thrust axis (unit up when absent, zero, or non-finite). */
  thrustDirection?: Vec3;
}

function thrustAxis(dir: Vec3 | undefined): Vec3 {
  if (!dir) return vec(0, 1, 0);
  const { x, y, z } = dir;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return vec(0, 1, 0);
  const len = Math.hypot(x, y, z);
  if (len <= 0) return vec(0, 1, 0);
  return vec(x / len, y / len, z / len);
}

export { thrustAxis };

export function stepMotion(input: StepInput): { position: Vec3; velocity: Vec3 } {
  const { position, velocity, mass, thrustN, refArea, dragCoefficient, wind, dt } = input;

  // Air-relative velocity for drag.
  const airVel = sub(velocity, wind);
  const speed = length(airVel);
  const rho = airDensity(position.y);
  const dragMag = 0.5 * rho * speed * speed * dragCoefficient * refArea;
  const dragForce = speed > 0 ? scale(airVel, -dragMag / speed) : vec(0, 0, 0);

  const thrustForce = scale(thrustAxis(input.thrustDirection), thrustN);
  const gravityForce = vec(0, -G * mass, 0);
  const netForce = add(add(thrustForce, gravityForce), dragForce);

  const accel = scale(netForce, 1 / mass);

  // Semi-implicit Euler: update velocity, then position with new velocity.
  const newVelocity = add(velocity, scale(accel, dt));
  const newPosition = add(position, scale(newVelocity, dt));
  return { position: newPosition, velocity: newVelocity };
}
