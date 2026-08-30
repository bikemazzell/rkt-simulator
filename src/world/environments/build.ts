import * as THREE from 'three';
import type { BuildContext, EnvironmentDef } from './types';
import type { EnvParams } from '../../sim/types';
import { randRange, randInt, type Rng } from '../../sim/rng';
import * as P from './params';
import { AmbientSystem } from '../ambient';
import { SkySystem } from '../sky';
import { DEFAULT_START_PHASE } from '../daynight';
import { biomeFor } from '../biome';
import { buildTiledGround } from '../ground';
import { buildVegetation } from '../vegetation';
import { CloudSystem } from '../clouds';
import { CreatureSystem } from '../creatures';

function groundDisc(radius: number, color: number): THREE.Mesh {
  const geo = new THREE.CircleGeometry(radius, 48);
  geo.rotateX(-Math.PI / 2);
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
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

// Keep a clear launch area around the origin so nothing (trees, buildings,
// mountains) ever spawns on top of the rocket.
const LAUNCH_CLEARANCE = 30;

function launchPad(groundHeight: number): THREE.Mesh {
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(5, 5, 0.5, 20),
    new THREE.MeshLambertMaterial({ color: 0x30343a }),
  );
  // Centred on the surface so its top face sits clearly ABOVE the ground disc
  // (no coplanar faces -> no z-fighting); the bottom half is hidden below ground.
  pad.position.set(0, groundHeight, 0);
  return pad;
}

interface BaseOpts { pad?: boolean; groundY?: number; flat?: boolean; }

function base(ctx: BuildContext, params: EnvParams, rng: Rng, palette: number[], opts: BaseOpts = {}): void {
  const { pad = true, groundY = params.groundHeight, flat = false } = opts;
  // Ambient presentation (day/night lights, background, fog) is owned by the
  // AmbientSystem, registered here for every environment. The SkySystem adds
  // the dome/sun/moon/stars on the same clock.
  const startPhase = ctx.startPhase ?? DEFAULT_START_PHASE;
  ctx.registerSystem(new AmbientSystem(ctx.scene, ctx.root, startPhase));
  ctx.registerSystem(new SkySystem(ctx.root, startPhase, randInt(rng, 1, 2 ** 31 - 1)));
  ctx.registerSystem(new CloudSystem(ctx.root, rng, { x: params.wind.base.x, z: params.wind.base.z }));
  if (flat) {
    // e.g. sea: open water covers the ground later; keep the simple disc
    const ground = groundDisc(params.bounds.radius, palette[0]);
    ground.position.y = groundY - 0.1;
    ctx.root.add(ground);
  } else {
    const tileSeed = randInt(rng, 1, 2 ** 31 - 1);
    buildTiledGround(ctx.root, palette, tileSeed, {
      groundY,
      tiledRadius: Math.min(250, params.bounds.radius),
    });
  }
  if (pad) ctx.root.add(launchPad(params.groundHeight));
  if (ctx.showTargetZone) markTargetZone(ctx.root, params);
}

/** Scatter the biome's flora and register its wind-sway system. */
function flora(ctx: BuildContext, params: EnvParams, rng: Rng, biome: ReturnType<typeof biomeFor>, opts: { groundY?: number; minR?: number; maxR?: number } = {}): void {
  const sway = buildVegetation(ctx.root, biome, rng, {
    groundY: opts.groundY ?? params.groundHeight,
    minR: opts.minR ?? LAUNCH_CLEARANCE,
    maxR: opts.maxR ?? params.bounds.radius * 0.9,
  });
  if (sway) ctx.registerSystem(sway);
}

// Scatter props between `minR` (kept clear of the launch pad) and the bounds.
function scatter(ctx: BuildContext, params: EnvParams, count: number, make: (x: number, z: number) => THREE.Object3D, rng: Rng, minR = LAUNCH_CLEARANCE): void {
  const inner = Math.max(minR, LAUNCH_CLEARANCE);
  for (let i = 0; i < count; i++) {
    const r = randRange(rng, inner, params.bounds.radius * 0.9);
    const a = randRange(rng, 0, Math.PI * 2);
    ctx.root.add(make(Math.cos(a) * r, Math.sin(a) * r));
  }
}

/** Scatter the biome's creatures and register their animation system. */
function critters(ctx: BuildContext, params: EnvParams, rng: Rng, biome: ReturnType<typeof biomeFor>, opts: { groundY?: number; minR?: number; maxR?: number } = {}): CreatureSystem | null {
  const sys = new CreatureSystem(ctx.root, biome, rng, {
    groundY: opts.groundY ?? biome.creatures.groundY ?? params.groundHeight,
    minR: opts.minR ?? LAUNCH_CLEARANCE,
    maxR: opts.maxR ?? params.bounds.radius * 0.9,
  });
  ctx.registerSystem(sys);
  return sys;
}

function park(ctx: BuildContext, params: EnvParams, rng: Rng): void {
  const biome = biomeFor('park');
  base(ctx, params, rng, biome.groundPalette);
  flora(ctx, params, rng, biome); // oaks + birches, shrubs, flowers, grass
  critters(ctx, params, rng, biome);
}

function urban(ctx: BuildContext, params: EnvParams, rng: Rng): void {
  const biome = biomeFor('urban');
  base(ctx, params, rng, biome.groundPalette);
  const g = params.groundHeight;
  scatter(ctx, params, 60, (x, z) => {
    const h = randRange(rng, 15, 90);
    const w = randRange(rng, 8, 20);
    const shade = 0x445566 + randInt(rng, 0, 0x334455);
    return box(w, h, w, shade, x, g + h / 2, z);
  }, rng);
  flora(ctx, params, rng, biome); // street trees in the gaps
  critters(ctx, params, rng, biome); // pedestrians + pigeons
}

function mountain(ctx: BuildContext, params: EnvParams, rng: Rng): void {
  const biome = biomeFor('mountain');
  base(ctx, params, rng, biome.groundPalette);
  const g = params.groundHeight;
  // Big footprints: push peaks well out so their bases never cover the pad.
  scatter(ctx, params, 30, (x, z) => {
    const h = randRange(rng, 60, 200);
    return cone(h * 0.45, h, 0x7a6f5a, x, g + h / 2, z);
  }, rng, 200);
  flora(ctx, params, rng, biome); // pines on the lower slopes
  critters(ctx, params, rng, biome); // mountain goats + hawks
}

function desert(ctx: BuildContext, params: EnvParams, rng: Rng): void {
  const biome = biomeFor('desert');
  base(ctx, params, rng, biome.groundPalette);
  flora(ctx, params, rng, biome); // cacti + dry shrubs
  critters(ctx, params, rng, biome); // villager + critters + vultures
}

function sea(ctx: BuildContext, params: EnvParams, rng: Rng): void {
  const biome = biomeFor('sea');
  const g = params.groundHeight;
  base(ctx, params, rng, biome.groundPalette, { pad: false, flat: true }); // the raft is the launch platform
  // Launch raft at the origin (top flush with water) so the rocket rests on it.
  ctx.root.add(box(16, 1, 16, 0x8a6d3b, 0, g - 0.5, 0));
  scatter(ctx, params, 8, (x, z) => box(3, 2, 8, 0xdddddd, x, g + 1, z), rng, 60); // distant boats
  critters(ctx, params, rng, biome); // seagulls only (no land walkers)
}

function rooftop(ctx: BuildContext, params: EnvParams, rng: Rng): void {
  const biome = biomeFor('rooftop');
  const g = params.groundHeight;
  // Street level is far below; the house roof (top at g) is the launch surface.
  base(ctx, params, rng, biome.groundPalette, { groundY: 0 });
  ctx.root.add(box(60, g, 60, 0xb5651d, 0, g / 2, 0)); // the house; roof top sits at g
  // A few rooftop fixtures, kept on the roof (well inside its ±30 footprint).
  ctx.root.add(box(6, 3, 6, 0x555555, -18, g + 1.5, 14));  // AC unit
  ctx.root.add(box(4, 4, 4, 0x555555, 15, g + 2, -12));    // vent block
  ctx.root.add(box(3, 6, 3, 0x777777, 20, g + 3, 18));     // chimney
  flora(ctx, params, rng, biome, { groundY: g, minR: 8, maxR: 24 }); // planter hedges + tufts
  critters(ctx, params, rng, biome, { minR: 45 }); // street level, clear of the house
}

function bathtub(ctx: BuildContext, params: EnvParams, rng: Rng): void {
  const biome = biomeFor('bathtub');
  const g = params.groundHeight;
  base(ctx, params, rng, biome.groundPalette);
  critters(ctx, params, rng, biome); // yellow rubber-duck patrols
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

function backyardDog(ctx: BuildContext, params: EnvParams, rng: Rng): void {
  const biome = biomeFor('backyard-dog');
  const g = params.groundHeight;
  base(ctx, params, rng, biome.groundPalette);
  // Fence ring.
  const posts = 24;
  for (let i = 0; i < posts; i++) {
    const a = (i / posts) * Math.PI * 2;
    ctx.root.add(box(1, 6, 1, 0x8b5a2b, Math.cos(a) * (params.bounds.radius - 5), g + 3, Math.sin(a) * (params.bounds.radius - 5)));
  }
  flora(ctx, params, rng, biome, { maxR: params.bounds.radius - 15 }); // hedges, flowers, grass
  const creatureSys = critters(ctx, params, rng, biome);
  // An angry dog near the landing zone, head bobbing as it growls.
  const dog = new THREE.Group();
  dog.add(box(6, 3, 3, 0x7a4a1e, 0, g + 2.5, 0));   // body
  const dogHead = box(3, 3, 3, 0x7a4a1e, 4, g + 3.5, 0); // head
  dog.add(dogHead);
  dog.add(box(1, 3, 1, 0x7a4a1e, -3, g + 1.5, 0));  // tail
  const target = params.targetZone;
  dog.position.set(target ? target.center.x : 20, 0, target ? target.center.z : 0);
  dog.rotation.y = Math.PI; // head (at +x local) faces the pad at the origin
  ctx.root.add(dog);
  creatureSys?.addHeadBob(dogHead, 0.18, 2.6);
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
