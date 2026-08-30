import * as THREE from 'three';
import type { Rng } from '../sim/rng';
import type { WorldSystem } from './system';

/**
 * Blocky shimmering water: each body is one mesh of flat quads whose vertex
 * colors cycle through a blue palette. The grid is capped at 64x64 quads and
 * colors are refreshed on a fixed tick (~10 Hz), never per frame, so even the
 * open sea stays cheap.
 */

export const WATER_PALETTE = [0x3f76e4, 0x4b84ea, 0x3568c9, 0x5a92f0];
const SOAPY_PALETTE = [0x7ec8e3, 0x8fd4ea, 0x6db8d8, 0x9fdcee];

const GRID_CAP = 64;
const TICK_INTERVAL = 0.1; // seconds between color refreshes

export interface WaterSpec {
  /** Radius of the (disc-clipped) water patch in meters. */
  radius: number;
  /** Center offset in meters (defaults to the origin). */
  x?: number;
  z?: number;
  /** Surface height in world units; keep >= 0.02 above ground to avoid z-fighting. */
  y: number;
  /** Optional palette override (e.g. soapy bathtub water). */
  palette?: number[];
}

/** Pure quantized wave: maps a grid cell + time tick to a palette index. */
export function shimmerIndex(gx: number, gz: number, tick: number, paletteLength = WATER_PALETTE.length): number {
  const wave = Math.sin(gx * 1.7 + tick * 0.9) + Math.cos(gz * 1.3 - tick * 0.7);
  const t = Math.min(0.999, Math.max(0, (wave + 2) / 4));
  return Math.floor(t * paletteLength);
}

interface WaterBody {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  quadsX: number;
  quadsZ: number;
  palette: number[];
}

export class WaterSystem implements WorldSystem {
  readonly bodies: WaterBody[] = [];  private material: THREE.MeshLambertMaterial | null = null;
  private lastTick = -1;
  private readonly tmpColor = new THREE.Color();

  constructor(root: THREE.Group, rng: Rng, specs: WaterSpec[]) {
    void rng; // placement of bodies is chosen by callers; system itself is deterministic
    if (specs.length === 0) return;
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    for (const spec of specs) {
      const palette = spec.palette ?? WATER_PALETTE;
      const body = this.buildBody(spec, palette);
      if (body) {
        root.add(body.mesh);
        this.bodies.push(body);
      }
    }
    if (this.bodies.length === 0) this.material.dispose();
    this.paint(0);
  }

  private buildBody(spec: WaterSpec, palette: number[]): WaterBody | null {
    const n = GRID_CAP;
    const tile = (spec.radius * 2) / n;
    const cx = spec.x ?? 0;
    const cz = spec.z ?? 0;
    const x0 = cx - spec.radius;
    const z0 = cz - spec.radius;

    const positions: number[] = [];
    const indices: number[] = [];
    const colors = new Float32Array(n * n * 4 * 3);
    let quad = 0;
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        const wx = x0 + ix * tile;
        const wz = z0 + iz * tile;
        // Disc clip: keep quads whose centre lies inside the radius.
        const dx = wx + tile / 2 - cx;
        const dz = wz + tile / 2 - cz;
        if (dx * dx + dz * dz > spec.radius * spec.radius) continue;
        const v = quad * 4;
        positions.push(wx, spec.y, wz, wx + tile, spec.y, wz, wx, spec.y, wz + tile, wx + tile, spec.y, wz + tile);
        indices.push(v, v + 2, v + 1, v + 1, v + 2, v + 3); // up-facing winding for this vertex layout
        this.writeQuad(colors, v, palette, shimmerIndex(ix, iz, 0));
        quad++;
      }
    }
    if (quad === 0) return null;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, this.material!);
    mesh.frustumCulled = false; // spans the whole scene; avoid per-frame sphere updates
    return { mesh, geometry, quadsX: n, quadsZ: n, palette };
  }

  private writeQuad(colors: Float32Array, firstVertex: number, palette: number[], index: number): void {
    this.tmpColor.setHex(palette[index]);
    for (let k = 0; k < 4; k++) {
      const o = (firstVertex + k) * 3;
      colors[o] = this.tmpColor.r;
      colors[o + 1] = this.tmpColor.g;
      colors[o + 2] = this.tmpColor.b;
    }
  }

  /** Repaint every quad for the given tick (initial paint uses tick 0). */
  private paint(tick: number): void {
    for (const body of this.bodies) {
      const colors = body.geometry.getAttribute('color') as THREE.BufferAttribute;
      const arr = colors.array as Float32Array;
      let quad = 0;
      for (let iz = 0; iz < body.quadsZ; iz++) {
        for (let ix = 0; ix < body.quadsX; ix++) {
          const dx = (ix + 0.5) / body.quadsX;
          const dz = (iz + 0.5) / body.quadsZ;
          // Recheck the same disc clipping used at build time.
          if ((dx - 0.5) * (dx - 0.5) + (dz - 0.5) * (dz - 0.5) > 0.25) {
            // Cell was clipped: its quad slot is absent; skip via radius test only.
            continue;
          }
          this.writeQuad(arr, quad * 4, body.palette, shimmerIndex(ix, iz, tick));
          quad++;
        }
      }
      colors.needsUpdate = true;
    }
  }

  update(_dt: number, elapsed: number): void {
    const tick = Math.floor(elapsed / TICK_INTERVAL);
    if (tick === this.lastTick) return;
    this.lastTick = tick;
    this.paint(tick);
  }

  dispose(): void {
    for (const body of this.bodies) {
      body.mesh.parent?.remove(body.mesh);
      body.geometry.dispose();
    }
    this.bodies.length = 0;
    this.material?.dispose();
    this.material = null;
  }
}

/** Build shimmering water bodies parented to `root`; null when specs produce nothing. */
export function buildWater(root: THREE.Group, rng: Rng, specs: WaterSpec[]): WaterSystem | null {
  const system = new WaterSystem(root, rng, specs);
  return system.bodies.length > 0 ? system : null;
}

/** Soapy palette used by the bathtub environment. */
export const BATHTUB_PALETTE = SOAPY_PALETTE;
