import * as THREE from 'three';
import type { BuildContext, EnvironmentDef } from './types';
import type { EnvParams } from '../../sim/types';
import { randRange, randInt, type Rng } from '../../sim/rng';
import * as P from './params';

function groundDisc(radius: number, color: number): THREE.Mesh {
  const geo = new THREE.CircleGeometry(radius, 48);
  geo.rotateX(-Math.PI / 2);
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
}

function addLights(root: THREE.Group): void {
  root.add(new THREE.HemisphereLight(0xffffff, 0x444455, 1.0));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(50, 120, 40);
  root.add(sun);
}

function box(w: number, h: number, d: number, color: number, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  m.position.set(x, y, z);
  return m;
}

function cone(radius: number, height: number, color: number, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 8), new THREE.MeshLambertMaterial({ color }));
  m.position.set(x, y, z);
  return m;
}

function markTargetZone(root: THREE.Group, params: EnvParams): void {
  if (!params.targetZone) return;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(params.targetZone.radius * 0.9, params.targetZone.radius, 32),
    new THREE.MeshBasicMaterial({ color: 0xffcc00, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(params.targetZone.center.x, params.groundHeight + 0.05, params.targetZone.center.z);
  root.add(ring);
}

function base(ctx: BuildContext, params: EnvParams, groundColor: number, sky: number): void {
  ctx.scene.background = new THREE.Color(sky);
  addLights(ctx.root);
  const ground = groundDisc(params.bounds.radius, groundColor);
  ground.position.y = params.groundHeight;
  ctx.root.add(ground);
  markTargetZone(ctx.root, params);
}

function scatter(ctx: BuildContext, params: EnvParams, count: number, make: (x: number, z: number) => THREE.Object3D, rng: Rng): void {
  for (let i = 0; i < count; i++) {
    const r = randRange(rng, 20, params.bounds.radius * 0.9);
    const a = randRange(rng, 0, Math.PI * 2);
    ctx.root.add(make(Math.cos(a) * r, Math.sin(a) * r));
  }
}

function park(ctx: BuildContext, params: EnvParams, rng: Rng): void {
  const g = params.groundHeight;
  base(ctx, params, 0x4a8f3c, 0x87ceeb);
  scatter(ctx, params, 40, (x, z) => {
    const tree = new THREE.Group();
    tree.add(box(1, 4, 1, 0x6b4423, x, g + 2, z));
    tree.add(cone(3, 6, 0x2e7d32, x, g + 7, z));
    return tree;
  }, rng);
}

function urban(ctx: BuildContext, params: EnvParams, rng: Rng): void {
  const g = params.groundHeight;
  base(ctx, params, 0x555a60, 0x9fb4c7);
  scatter(ctx, params, 60, (x, z) => {
    const h = randRange(rng, 15, 90);
    const w = randRange(rng, 8, 20);
    const shade = 0x445566 + randInt(rng, 0, 0x334455);
    return box(w, h, w, shade, x, g + h / 2, z);
  }, rng);
}

function mountain(ctx: BuildContext, params: EnvParams, rng: Rng): void {
  const g = params.groundHeight;
  base(ctx, params, 0x6b7a55, 0x8fb0d0);
  scatter(ctx, params, 30, (x, z) => {
    const h = randRange(rng, 60, 220);
    return cone(h * 0.7, h, 0x7a6f5a, x, g + h / 2, z);
  }, rng);
}

function desert(ctx: BuildContext, params: EnvParams, rng: Rng): void {
  const g = params.groundHeight;
  base(ctx, params, 0xd9b877, 0xf2e2b6);
  scatter(ctx, params, 18, (x, z) => {
    const cactus = new THREE.Group();
    cactus.add(box(1.2, 8, 1.2, 0x2f6b3a, x, g + 4, z));
    cactus.add(box(4, 1.2, 1.2, 0x2f6b3a, x, g + 6, z));
    return cactus;
  }, rng);
}

function sea(ctx: BuildContext, params: EnvParams, rng: Rng): void {
  const g = params.groundHeight;
  base(ctx, params, 0x2a6f9e, 0xbfe0f5);
  // A launch raft at the origin so the rocket does not start in open water.
  ctx.root.add(box(14, 1, 14, 0x8a6d3b, 0, g + 0.5, 0));
  scatter(ctx, params, 8, (x, z) => box(3, 2, 8, 0xdddddd, x, g + 1, z), rng); // distant boats
}

function rooftop(ctx: BuildContext, params: EnvParams, rng: Rng): void {
  const g = params.groundHeight;
  base(ctx, params, 0x8a8a8a, 0xa9c0d6);
  // The house below the rooftop.
  ctx.root.add(box(60, g, 60, 0xb5651d, 0, g / 2, 0));
  scatter(ctx, params, 10, (x, z) => box(4, 3, 4, 0x666666, x * 0.3, g + 1.5, z * 0.3), rng); // vents/AC units
}

function bathtub(ctx: BuildContext, params: EnvParams, _rng: Rng): void {
  const g = params.groundHeight;
  base(ctx, params, 0x3aa0d0, 0xbfe9ff);
  // Tub rim.
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(45, 5, 12, 32),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
  );
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = g + 3;
  ctx.root.add(rim);
  // Giant rubber duck launch platform.
  const duck = new THREE.Group();
  duck.add(new THREE.Mesh(new THREE.SphereGeometry(8, 16, 16), new THREE.MeshLambertMaterial({ color: 0xffe14d })));
  const head = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 16), new THREE.MeshLambertMaterial({ color: 0xffe14d }));
  head.position.set(0, 7, 5);
  duck.add(head);
  duck.add(cone(1.2, 3, 0xff8c00, 0, 7, 9));
  duck.position.set(0, g + 4, -12);
  ctx.root.add(duck);
}

function backyardDog(ctx: BuildContext, params: EnvParams, _rng: Rng): void {
  const g = params.groundHeight;
  base(ctx, params, 0x5a9e42, 0x9fd0f0);
  // Fence ring.
  const posts = 24;
  for (let i = 0; i < posts; i++) {
    const a = (i / posts) * Math.PI * 2;
    ctx.root.add(box(1, 6, 1, 0x8b5a2b, Math.cos(a) * (params.bounds.radius - 5), g + 3, Math.sin(a) * (params.bounds.radius - 5)));
  }
  // An angry dog near the landing zone.
  const dog = new THREE.Group();
  dog.add(box(6, 3, 3, 0x7a4a1e, 0, g + 2.5, 0));   // body
  dog.add(box(3, 3, 3, 0x7a4a1e, 4, g + 3.5, 0));   // head
  dog.add(box(1, 3, 1, 0x7a4a1e, -3, g + 1.5, 0));  // tail
  const target = params.targetZone;
  dog.position.set(target ? target.center.x : 20, 0, target ? target.center.z : 0);
  ctx.root.add(dog);
}

export const environmentDefs: EnvironmentDef[] = [
  { id: 'park', name: 'Park', funny: false, makeParams: P.parkParams, build: park },
  { id: 'urban', name: 'Urban', funny: false, makeParams: P.urbanParams, build: urban },
  { id: 'mountain', name: 'Mountain', funny: false, makeParams: P.mountainParams, build: mountain },
  { id: 'desert', name: 'Desert', funny: false, makeParams: P.desertParams, build: desert },
  { id: 'sea', name: 'Open Sea', funny: false, makeParams: P.seaParams, build: sea },
  { id: 'rooftop', name: 'Rooftop', funny: false, makeParams: P.rooftopParams, build: rooftop },
  { id: 'bathtub', name: 'Giant Bathtub', funny: true, makeParams: P.bathtubParams, build: bathtub },
  { id: 'backyard-dog', name: 'Backyard (Angry Dog)', funny: true, makeParams: P.backyardDogParams, build: backyardDog },
];
