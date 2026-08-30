// Pure tile-color math for the blocky ground. Deterministic per (x, z, seed):
// a positional hash picks the palette entry and a small shade jitter, so the
// same world coordinate always yields the same tile color without carrying
// RNG state. No three.js imports.

const SHADES = [0.94, 1.0, 1.06];

function hash2(ix: number, iz: number, seed: number): number {
  let h = (ix * 374761393 + iz * 668265263 + seed * 2654435761) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function applyShade(hex: number, shade: number): number {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * shade));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * shade));
  const b = Math.min(255, Math.round((hex & 255) * shade));
  return (r << 16) | (g << 8) | b;
}

/** Color (hex) of the tile covering world position (x, z). */
export function tileColor(palette: number[], x: number, z: number, seed: number): number {
  const h = hash2(Math.floor(x), Math.floor(z), seed);
  const base = palette[h % palette.length];
  const shade = SHADES[(h >>> 8) % SHADES.length];
  return applyShade(base, shade);
}

/** Upper bound on tile quads for a square grid clipped to a disc. */
export function tileCountFor(radius: number, tileSize: number): number {
  const n = Math.floor(radius / tileSize);
  const r2 = radius * radius;
  let count = 0;
  for (let i = -n; i < n; i++) {
    for (let j = -n; j < n; j++) {
      const x0 = i * tileSize, z0 = j * tileSize;
      if (x0 * x0 + z0 * z0 <= r2) count++;
    }
  }
  return count;
}
