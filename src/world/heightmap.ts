// Pure seeded terrain: two-octave value noise quantized into blocky terraces,
// with forced-flat clearance discs (launch pad, landing zones, pond basins) so
// the frozen sim's ground assumptions hold where they matter. No three.js
// imports — unit-testable like tiles/biome/daynight.

export interface FlattenDisc {
  x: number;
  z: number;
  r: number;
  /** the exact ground height enforced inside the disc's core */
  y: number;
}

export interface TerrainProfile {
  seed: number;
  /** ground plane the noise climbs above (the environment's groundY) */
  baseY: number;
  /** total climb in meters; 0 collapses to a flat plane */
  amplitude: number;
  /** quantization in meters — smaller means more, thinner terraces */
  step: number;
  /** dominant noise wavelength in meters */
  feature: number;
  flatten: FlattenDisc[];
}

export type HeightAt = (x: number, z: number) => number;

function hash2(ix: number, iz: number, seed: number): number {
  let h = seed >>> 0;
  h = Math.imul(h ^ ix, 0x85ebca6b);
  h = Math.imul(h ^ iz, 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Single-octave value noise on a lattice of the given feature size, in [0,1]. */
function noise2(x: number, z: number, feature: number, seed: number): number {
  const fx = x / feature;
  const fz = z / feature;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = smooth(fx - ix);
  const tz = smooth(fz - iz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
}

export function terrainHeight(p: TerrainProfile, x: number, z: number): number {
  // Two octaves: broad hills plus finer detail, then quantize to terraces.
  const v =
    0.65 * noise2(x, z, p.feature, p.seed) +
    0.35 * noise2(x, z, p.feature / 2.3, (p.seed ^ 0x9e3779b9) >>> 0);
  let h = p.baseY + Math.round(v * (p.amplitude / p.step)) * p.step;

  // Force-flat discs: fully flat inside r/2, smooth blend out to r. Applied
  // last so clearance zones always win over the noise.
  for (const d of p.flatten) {
    const dist = Math.hypot(x - d.x, z - d.z);
    if (dist >= d.r) continue;
    const core = (d.r - dist) / (d.r * 0.5);
    const t = smooth(Math.min(1, Math.max(0, core)));
    h = lerp(h, d.y, t);
  }
  return h;
}

export function makeHeightAt(p: TerrainProfile): HeightAt {
  return (x: number, z: number) => terrainHeight(p, x, z);
}

/**
 * Wrap a height sampler so the climb fades back to baseY between fadeStart
 * and fadeEnd (measured from the origin), eliminating the cliff ring where
 * the tiled terrain field meets the flat base disc beyond it.
 */
export function withEdgeFade(inner: HeightAt, baseY: number, fadeStart: number, fadeEnd: number): HeightAt {
  const range = fadeEnd - fadeStart;
  return (x: number, z: number) => {
    const d = Math.hypot(x, z);
    if (d <= fadeStart) return inner(x, z);
    const t = Math.max(0, Math.min(1, (fadeEnd - d) / range));
    const s = t * t * (3 - 2 * t);
    return baseY + (inner(x, z) - baseY) * s;
  };
}
