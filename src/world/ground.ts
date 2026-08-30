import * as THREE from 'three';
import { tileColor } from './tiles';

export interface TiledGroundOptions {
  tileSize?: number;
  tiledRadius?: number;
  baseRadius?: number;
  groundY?: number;
  /** terrain sampler; when omitted the ground stays flat at groundY */
  heightAt?: (x: number, z: number) => number;
}

/**
 * Blocky Minecraft-style ground: a vertex-colored tile mesh (one draw call,
 * per-tile palette color + shade jitter from pure `tileColor`) plus a huge base
 * disc below it so the fog-swallowed horizon reads as infinite ground. With a
 * `heightAt` sampler, tiles sit at stepped terrain heights and height steps
 * are skinned with vertical cliff walls (the higher tile owns the face).
 */
export function buildTiledGround(
  root: THREE.Group,
  palette: number[],
  seed: number,
  opts: TiledGroundOptions = {},
): void {
  const { tileSize = 5, tiledRadius = 250, baseRadius = 3000, groundY = 0, heightAt } = opts;

  const baseGeo = new THREE.CircleGeometry(baseRadius, 64);
  baseGeo.rotateX(-Math.PI / 2);
  const base = new THREE.Mesh(baseGeo, new THREE.MeshLambertMaterial({ color: palette[0] }));
  // 0.05 below the tile plane: overlapping region never z-fights.
  base.position.y = groundY - 0.05;
  root.add(base);

  const n = Math.floor(tiledRadius / tileSize);
  const r2 = tiledRadius * tiledRadius;
  const key = (i: number, j: number) => `${i},${j}`;

  // First pass: tile membership + per-tile height (sampled at the center).
  const heights = new Map<string, number>();
  for (let i = -n; i < n; i++) {
    for (let j = -n; j < n; j++) {
      const x0 = i * tileSize;
      const z0 = j * tileSize;
      if (x0 * x0 + z0 * z0 > r2) continue;
      heights.set(key(i, j), heightAt ? heightAt(x0 + tileSize / 2, z0 + tileSize / 2) : groundY);
    }
  }

  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const tmp = new THREE.Color();
  let v = 0;

  // A vertical wall quad between a tile top (h) and its lower neighbor (nh).
  // Vertices are ordered so the face normal points out of the higher tile;
  // triangles (w0,w1,w2) and (w0,w2,w3) keep a consistent winding.
  const wall = (
    w0: number[], w1: number[], w2: number[], w3: number[],
    r: number, g: number, b: number,
  ): void => {
    pos.push(...w0, ...w1, ...w2, ...w3);
    for (let k = 0; k < 4; k++) col.push(r, g, b);
    idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    v += 4;
  };

  for (const [k, h] of heights) {
    const [i, j] = k.split(',').map(Number);
    const x0 = i * tileSize;
    const z0 = j * tileSize;
    const x1 = x0 + tileSize;
    const z1 = z0 + tileSize;

    tmp.setHex(tileColor(palette, x0, z0, seed));
    pos.push(x0, h, z0, x1, h, z0, x1, h, z1, x0, h, z1);
    for (let c = 0; c < 4; c++) col.push(tmp.r, tmp.g, tmp.b);
    idx.push(v, v + 2, v + 1, v, v + 3, v + 2);
    v += 4;

    // Cliff skinning: darken the tile color a touch so steps read as depth.
    const wr = tmp.r * 0.78;
    const wg = tmp.g * 0.78;
    const wb = tmp.b * 0.78;
    const sides: Array<[string, number[], number[], number[], number[]]> = [
      // neighbor +x, face at x1, normal +x
      [key(i + 1, j), [x1, h, z0], [x1, h, z1], [x1, heights.get(key(i + 1, j)) ?? groundY, z1], [x1, heights.get(key(i + 1, j)) ?? groundY, z0]],
      // neighbor -x, face at x0, normal -x
      [key(i - 1, j), [x0, h, z1], [x0, h, z0], [x0, heights.get(key(i - 1, j)) ?? groundY, z0], [x0, heights.get(key(i - 1, j)) ?? groundY, z1]],
      // neighbor +z, face at z1, normal +z
      [key(i, j + 1), [x1, h, z1], [x0, h, z1], [x0, heights.get(key(i, j + 1)) ?? groundY, z1], [x1, heights.get(key(i, j + 1)) ?? groundY, z1]],
      // neighbor -z, face at z0, normal -z
      [key(i, j - 1), [x0, h, z0], [x1, h, z0], [x1, heights.get(key(i, j - 1)) ?? groundY, z0], [x0, heights.get(key(i, j - 1)) ?? groundY, z0]],
    ];
    for (const [nk, w0, w1, w2, w3] of sides) {
      const nh = heights.get(nk) ?? groundY; // missing neighbor = base plane
      if (nh >= h - 1e-9) continue;
      wall(w0, w1, w2, w3, wr, wg, wb);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  root.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })));
}
