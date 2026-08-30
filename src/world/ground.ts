import * as THREE from 'three';
import { tileColor } from './tiles';

export interface TiledGroundOptions {
  tileSize?: number;
  tiledRadius?: number;
  baseRadius?: number;
  groundY?: number;
}

/**
 * Blocky Minecraft-style ground: a vertex-colored tile mesh (one draw call,
 * per-tile palette color + shade jitter from pure `tileColor`) plus a huge base
 * disc below it so the fog-swallowed horizon reads as infinite ground.
 */
export function buildTiledGround(
  root: THREE.Group,
  palette: number[],
  seed: number,
  opts: TiledGroundOptions = {},
): void {
  const { tileSize = 5, tiledRadius = 250, baseRadius = 3000, groundY = 0 } = opts;

  const baseGeo = new THREE.CircleGeometry(baseRadius, 64);
  baseGeo.rotateX(-Math.PI / 2);
  const base = new THREE.Mesh(baseGeo, new THREE.MeshLambertMaterial({ color: palette[0] }));
  // 0.05 below the tile plane: overlapping region never z-fights.
  base.position.y = groundY - 0.05;
  root.add(base);

  const n = Math.floor(tiledRadius / tileSize);
  const r2 = tiledRadius * tiledRadius;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const tmp = new THREE.Color();
  let v = 0;
  for (let i = -n; i < n; i++) {
    for (let j = -n; j < n; j++) {
      const x0 = i * tileSize;
      const z0 = j * tileSize;
      if (x0 * x0 + z0 * z0 > r2) continue;
      const x1 = x0 + tileSize;
      const z1 = z0 + tileSize;
      pos.push(x0, groundY, z0, x1, groundY, z0, x1, groundY, z1, x0, groundY, z1);
      tmp.setHex(tileColor(palette, x0, z0, seed));
      for (let k = 0; k < 4; k++) col.push(tmp.r, tmp.g, tmp.b);
      idx.push(v, v + 2, v + 1, v, v + 3, v + 2);
      v += 4;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  root.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })));
}
