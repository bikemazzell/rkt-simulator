// Pure scatter/wander math shared by vegetation (Task 4) and creatures
// (Task 6). No three.js, no world imports — sim/data style purity.
import type { Rng } from '../sim/rng';

export interface Vec2 {
  x: number;
  z: number;
}

/** Uniform-area scatter over the annulus [minR, maxR] around the origin. */
export function scatterPositions(rng: Rng, count: number, opts: { minR: number; maxR: number }): Vec2[] {
  const out: Vec2[] = [];
  const span = Math.max(0, opts.maxR - opts.minR);
  for (let i = 0; i < count; i++) {
    const r = opts.minR + Math.sqrt(rng()) * span;
    const a = rng() * Math.PI * 2;
    out.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
  }
  return out;
}

/** A creature's next stroll target: a bounded random step from `from`. */
export function wanderTarget(rng: Rng, from: Vec2, radius: number): Vec2 {
  const a = rng() * Math.PI * 2;
  const r = radius * (0.5 + 0.5 * rng());
  return { x: from.x + Math.cos(a) * r, z: from.z + Math.sin(a) * r };
}
