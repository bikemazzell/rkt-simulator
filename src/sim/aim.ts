import type { Vec3 } from './types';
import { vec } from './vec';

/**
 * Launch-attitude angles in degrees, one per gimbal ring, applied to the
 * up-pointing rocket as a three.js 'XYZ' Euler rotation
 * (v' = Rx·Ry·Rz·v, i.e. Rz first, then Ry, then Rx):
 * - X tilts the nose in the Y–Z plane (positive → toward +Z),
 * - Z tilts the nose in the X–Y plane (positive → toward −X),
 * - Y alone spins the rocket about its long axis (no direction change);
 *   combined with a Z tilt it rotates the tilt plane around the vertical.
 * Pinned to THREE.Euler('XYZ') by a parity test, so the sim and the
 * on-screen gimbal cannot drift apart.
 */
export interface AimAngles {
  x: number;
  y: number;
  z: number;
}

/** The three gimbal rings / Euler components. */
export type Axis = 'x' | 'y' | 'z';

export const AIM_DEFAULT: AimAngles = { x: 0, y: 0, z: 0 };

/** Normalize a degree value into (-180, 180]; non-finite input becomes 0. */
export function normalizeAngle(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  let a = (((deg + 180) % 360) + 360) % 360 - 180;
  if (a === -180) a = 180;
  return a;
}

/** Normalize every component of an aim. */
export function normalizeAim(aim: AimAngles): AimAngles {
  return { x: normalizeAngle(aim.x), y: normalizeAngle(aim.y), z: normalizeAngle(aim.z) };
}

const RAD = Math.PI / 180;

/**
 * Unit launch-direction vector for an aim: closed form of
 * Rx(x)·Ry(y)·Rz(z)·(0,1,0) (always unit — a composition of rotations).
 */
export function aimDirection(aim: AimAngles): Vec3 {
  const x = normalizeAngle(aim.x) * RAD;
  const y = normalizeAngle(aim.y) * RAD;
  const z = normalizeAngle(aim.z) * RAD;
  const sinZ = Math.sin(z);
  const cosZ = Math.cos(z);
  const sinY = Math.sin(y);
  const cosY = Math.cos(y);
  const sinX = Math.sin(x);
  const cosX = Math.cos(x);
  return vec(
    -sinZ * cosY,
    cosZ * cosX - sinZ * sinY * sinX,
    cosZ * sinX + sinZ * sinY * cosX,
  );
}
