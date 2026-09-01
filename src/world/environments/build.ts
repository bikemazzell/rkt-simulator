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
import { BATHTUB_PALETTE, buildWater, type WaterSpec } from '../water';
import { scatterPositions } from '../placement';
import { pickWeather, type WeatherKind } from '../weather';
import { WeatherSystem } from '../weatherFx';
import type { Biome } from '../biome';
import { makeHeightAt, withEdgeFade, type FlattenDisc, type HeightAt } from '../heightmap';

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

function launchPad(groundHeight: number): THREE.Group {
  const pad = new THREE.Group();
  // True-scale pad plate: 3.2 m across, barely proud of the ground (top at
  // +5 mm) so the rocket's fins never sink into it, while the offset keeps
  // the top face off the terrain disc (no coplanar z-fighting).
  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 0.02, 24),
    new THREE.MeshLambertMaterial({ color: 0x30343a }),
  );
  plate.position.set(0, groundHeight - 0.005, 0);
  pad.add(plate);

  // Bullseye markings so the pad reads as a launch marker: red center dot,
  // two white rings, and a crosshair through the middle. Unlit materials
  // keep them crisp at any time of day; 1 mm above the plate avoids
  // z-fighting with its top face.
  const markY = groundHeight + 0.006;
  const flat = (geo: THREE.BufferGeometry, color: number): THREE.Mesh => {
    geo.rotateX(-Math.PI / 2);
    return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
  };
  const center = flat(new THREE.CircleGeometry(0.18, 24), 0xd94040);
  center.position.set(0, markY, 0);
  const ring1 = flat(new THREE.RingGeometry(0.55, 0.62, 32), 0xe8e8e8);
  ring1.position.set(0, markY, 0);
  const ring2 = flat(new THREE.RingGeometry(1.15, 1.24, 40), 0xe8e8e8);
  ring2.position.set(0, markY, 0);
  const barMat = new THREE.MeshBasicMaterial({ color: 0xe8e8e8 });
  const barH = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.002, 0.07), barMat);
  barH.position.set(0, markY + 0.001, 0);
  const barV = barH.clone();
  barV.rotation.y = Math.PI / 2;
  pad.add(center, ring1, ring2, barH, barV);
  return pad;
}

interface BaseOpts { pad?: boolean; groundY?: number; flat?: boolean; flatten?: FlattenDisc[]; padClearR?: number; }

// Build the terrain sampler for this environment: seeded blocky terraces
// with forced-flat clearance discs (pad, target zone, water basins) and an
// edge fade so the field blends into the flat base disc without a cliff.
// Queries snap to tile centres so every object sits exactly on the rendered
// surface — never floating over or sunk into a neighbouring step.
const TILE_SIZE = 5;

function snapToTiles(inner: HeightAt): HeightAt {
  return (x: number, z: number) =>
    inner(Math.floor(x / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2, Math.floor(z / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2);
}

function buildTerrain(params: EnvParams, rng: Rng, biome: Biome, groundY: number, extraFlat: FlattenDisc[], padClearR: number): HeightAt {
  if (biome.terrain.amplitude <= 0) return () => groundY;
  const flatten: FlattenDisc[] = [
    { x: 0, z: 0, r: padClearR, y: groundY }, // launch pad clearance
  ];
  const tz = params.targetZone;
  if (tz) flatten.push({ x: tz.center.x, z: tz.center.z, r: tz.radius + 12, y: groundY });
  flatten.push(...extraFlat);
  const tiledRadius = Math.min(250, params.bounds.radius);
  return snapToTiles(
    withEdgeFade(
      makeHeightAt({
        seed: randInt(rng, 1, 2 ** 31 - 1),
        baseY: groundY,
        amplitude: biome.terrain.amplitude,
        step: biome.terrain.step,
        feature: biome.terrain.feature,
        flatten,
      }),
      groundY,
      tiledRadius * 0.7,
      tiledRadius,
    ),
  );
}

function base(ctx: BuildContext, params: EnvParams, rng: Rng, biome: Biome, opts: BaseOpts = {}): HeightAt {
  const { pad = true, groundY = params.groundHeight, flat = false } = opts;
  const palette = biome.groundPalette;
  // Ambient presentation (day/night lights, background, fog) is owned by the
  // AmbientSystem, registered here for every environment. The SkySystem adds
  // the dome/sun/moon/stars on the same clock.
  const startPhase = ctx.startPhase ?? DEFAULT_START_PHASE;
  ctx.registerSystem(new AmbientSystem(ctx.scene, ctx.root, startPhase));
  ctx.registerSystem(new SkySystem(ctx.root, startPhase, randInt(rng, 1, 2 ** 31 - 1)));
  ctx.registerSystem(new CloudSystem(ctx.root, rng, { x: params.wind.base.x, z: params.wind.base.z }, groundY));
  // Weather: forced via ?weather= for CDP shots, otherwise rolled from the
  // biome weights with the scene seed. Registered after AmbientSystem so the
  // fog it tightens already exists. The particle band starts above the
  // terrain's mid-slope so rain reaches the terraces.
  const weatherKind: WeatherKind = ctx.weather ?? pickWeather(biome.weather, rng);
  if (weatherKind !== 'clear') {
    ctx.registerSystem(new WeatherSystem(ctx.root, ctx.scene, weatherKind, rng, {
      groundY: (opts.groundY ?? params.groundHeight) + biome.terrain.amplitude / 2,
      wind: { x: params.wind.base.x, z: params.wind.base.z },
    }));
  }
  const heightAt = flat ? () => groundY : buildTerrain(params, rng, biome, groundY, opts.flatten ?? [], opts.padClearR ?? 34);
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
      heightAt,
    });
  }
  if (pad) ctx.root.add(launchPad(params.groundHeight));
  if (ctx.showTargetZone) markTargetZone(ctx.root, params);
  ctx.groundAt = heightAt; // sim lands on the terrain the world renders
  return heightAt;
}

/** Scatter the biome's flora and register its wind-sway system. */
function flora(ctx: BuildContext, params: EnvParams, rng: Rng, biome: ReturnType<typeof biomeFor>, opts: { groundY?: number; minR?: number; maxR?: number; heightAt?: HeightAt } = {}): void {
  const sway = buildVegetation(ctx.root, biome, rng, {
    groundY: opts.groundY ?? params.groundHeight,
    minR: opts.minR ?? LAUNCH_CLEARANCE,
    maxR: opts.maxR ?? params.bounds.radius * 0.9,
    heightAt: opts.heightAt,
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
function critters(ctx: BuildContext, params: EnvParams, rng: Rng, biome: ReturnType<typeof biomeFor>, opts: { groundY?: number; minR?: number; maxR?: number; heightAt?: HeightAt } = {}): CreatureSystem | null {
  const sys = new CreatureSystem(ctx.root, biome, rng, {
    groundY: opts.groundY ?? biome.creatures.groundY ?? params.groundHeight,
    minR: opts.minR ?? LAUNCH_CLEARANCE,
    maxR: opts.maxR ?? params.bounds.radius * 0.9,
    heightAt: opts.heightAt,
  });
  ctx.registerSystem(sys);
  return sys;
}

/** Build shimmering water bodies and register the repaint system. */
function water(ctx: BuildContext, rng: Rng, specs: WaterSpec[]): void {
  const sys = buildWater(ctx.root, rng, specs);
  if (sys) ctx.registerSystem(sys);
}

/** Seeded off-centre spot for a pond/lake, clear of the pad. */
function pondSpot(rng: Rng, minR: number, maxR: number): { x: number; z: number } {
  return scatterPositions(rng, 1, { minR, maxR })[0];
}

function park(ctx: BuildContext, params: EnvParams, rng: Rng): void {
  const biome = biomeFor('park');
  const g = params.groundHeight;
  const spot = pondSpot(rng, 90, params.bounds.radius * 0.55); // pond away from the pad
  const heightAt = base(ctx, params, rng, biome, {
    flatten: [{ x: spot.x, z: spot.z, r: 42, y: g }], // flat pond basin
  });
  flora(ctx, params, rng, biome, { heightAt }); // oaks + birches, shrubs, flowers, grass
  critters(ctx, params, rng, biome, { heightAt });
  water(ctx, rng, [{ radius: 32, x: spot.x, z: spot.z, y: g + 0.02 }]);
}

function urban(ctx: BuildContext, params: EnvParams, rng: Rng): void {
  const biome = biomeFor('urban');
  const heightAt = base(ctx, params, rng, biome);
  scatter(ctx, params, 60, (x, z) => {
    const h = randRange(rng, 15, 90);
    const w = randRange(rng, 8, 20);
    const shade = 0x445566 + randInt(rng, 0, 0x334455);
    return box(w, h, w, shade, x, heightAt(x, z) + h / 2, z);
  }, rng);
  flora(ctx, params, rng, biome, { heightAt }); // street trees in the gaps
  critters(ctx, params, rng, biome, { heightAt }); // pedestrians + pigeons
}

function mountain(ctx: BuildContext, params: EnvParams, rng: Rng): void {
  const biome = biomeFor('mountain');
  const g = params.groundHeight;
  const lake = pondSpot(rng, 160, params.bounds.radius * 0.5); // alpine lake
  const heightAt = base(ctx, params, rng, biome, {
    flatten: [{ x: lake.x, z: lake.z, r: 75, y: g }], // flat lake basin
  });
  // Big footprints: push peaks well out so their bases never cover the pad.
  scatter(ctx, params, 30, (x, z) => {
    const h = randRange(rng, 60, 200);
    return cone(h * 0.45, h, 0x7a6f5a, x, heightAt(x, z) + h / 2, z);
  }, rng, 200);
  flora(ctx, params, rng, biome, { heightAt }); // pines on the slopes
  critters(ctx, params, rng, biome, { heightAt }); // mountain goats + hawks
  water(ctx, rng, [{ radius: 65, x: lake.x, z: lake.z, y: g + 0.02 }]);
}

function desert(ctx: BuildContext, params: EnvParams, rng: Rng): void {
  const biome = biomeFor('desert');
  const heightAt = base(ctx, params, rng, biome);
  flora(ctx, params, rng, biome, { heightAt }); // cacti + dry shrubs
  critters(ctx, params, rng, biome, { heightAt }); // villager + critters + vultures
}

function sea(ctx: BuildContext, params: EnvParams, rng: Rng): void {
  const biome = biomeFor('sea');
  const g = params.groundHeight;
  base(ctx, params, rng, biome, { pad: false, flat: true }); // the raft is the launch platform
  // Far ocean sheet out to the fog so the horizon reads endless.
  const far = groundDisc(3000, biome.groundPalette[0]);
  far.position.y = g - 0.12;
  ctx.root.add(far);
  // Shimmering blocky sea just under the raft deck.
  water(ctx, rng, [{ radius: params.bounds.radius, y: g - 0.02 }]);
  // Launch raft at the origin (top flush with water) so the rocket rests on it.
  ctx.root.add(box(16, 1, 16, 0x8a6d3b, 0, g - 0.5, 0));
  scatter(ctx, params, 8, (x, z) => box(3, 2, 8, 0xdddddd, x, g + 1, z), rng, 60); // distant boats
  critters(ctx, params, rng, biome); // seagulls only (no land walkers)
}

function rooftop(ctx: BuildContext, params: EnvParams, rng: Rng): void {
  const biome = biomeFor('rooftop');
  const g = params.groundHeight;
  // Street level is far below; the house roof (top at g) is the launch surface.
  // Keep the whole house footprint (corners at ~18 m) inside the flat core.
  const heightAt = base(ctx, params, rng, biome, { groundY: 0, flatten: [{ x: 0, z: 0, r: 48, y: 0 }] });
  ctx.root.add(box(26, g, 26, 0xb5651d, 0, g / 2, 0)); // the house; roof top sits at g
  // A few rooftop fixtures, real-size and kept on the roof (inside its ±13 footprint).
  ctx.root.add(box(2.2, 1.4, 2.2, 0x555555, -6, g + 0.7, 5));   // AC unit
  ctx.root.add(box(1.5, 1.5, 1.5, 0x555555, 5.5, g + 0.75, -4)); // vent block
  ctx.root.add(box(1, 2.2, 1, 0x777777, 6.5, g + 1.1, 6.5));   // chimney
  flora(ctx, params, rng, biome, { groundY: g, minR: 4, maxR: 11 }); // planter hedges + tufts
  critters(ctx, params, rng, biome, { minR: 45, heightAt }); // street level, clear of the house
}

function bathtub(ctx: BuildContext, params: EnvParams, rng: Rng): void {
  const biome = biomeFor('bathtub');
  const g = params.groundHeight;
  base(ctx, params, rng, biome);
  critters(ctx, params, rng, biome); // yellow rubber-duck patrols
  // Bath water fills the tub up to the rim's lower half.
  water(ctx, rng, [{ radius: 40, y: g + 2.5, palette: BATHTUB_PALETTE }]);
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
  // Land on the bath-water surface inside the rim, not the porcelain floor:
  // the rocket launches from the water (launchY) and must splash down on it.
  const floor = ctx.groundAt!;
  ctx.groundAt = (x, z) => (x * x + z * z <= 45 * 45 ? g + 2.5 : floor(x, z));
}

function backyardDog(ctx: BuildContext, params: EnvParams, rng: Rng): void {
  const biome = biomeFor('backyard-dog');
  const g = params.groundHeight;
  const birdbath = pondSpot(rng, 35, params.bounds.radius - 25); // small pond away from the pad
  const heightAt = base(ctx, params, rng, biome, {
    flatten: [{ x: birdbath.x, z: birdbath.z, r: 19, y: g }],
  });
  // Fence ring, real-size pickets following the terrain.
  const posts = 64;
  for (let i = 0; i < posts; i++) {
    const a = (i / posts) * Math.PI * 2;
    const px = Math.cos(a) * (params.bounds.radius - 5);
    const pz = Math.sin(a) * (params.bounds.radius - 5);
    ctx.root.add(box(0.3, 1.8, 0.3, 0x8b5a2b, px, heightAt(px, pz) + 0.9, pz));
  }
  flora(ctx, params, rng, biome, { maxR: params.bounds.radius - 15, heightAt }); // hedges, flowers, grass
  water(ctx, rng, [{ radius: 9, x: birdbath.x, z: birdbath.z, y: g + 0.02 }]);
  const creatureSys = critters(ctx, params, rng, biome, { heightAt });
  // The angry dog guards the pad itself (the landing-zone ring can sit up to
  // 120 m away in a random direction — a dog out there is invisible). Real
  // size (~0.6 m at the shoulder), head bobbing as it growls at the rocket.
  const dog = new THREE.Group();
  dog.add(box(0.8, 0.3, 0.35, 0x7a4a1e, 0, g + 0.45, 0));     // body
  const dogHead = box(0.3, 0.3, 0.3, 0x7a4a1e, 0.5, g + 0.55, 0); // head
  dog.add(dogHead);
  dog.add(box(0.35, 0.1, 0.1, 0x7a4a1e, -0.55, g + 0.5, 0));  // tail
  for (const lx of [-0.28, 0.28]) for (const lz of [-0.12, 0.12]) {
    dog.add(box(0.1, 0.3, 0.1, 0x7a4a1e, lx, g + 0.15, lz));  // legs
  }
  dog.position.set(2.6, heightAt(2.6, 2.0), 2.0);
  // Head sits at local +x; aim that axis at the pad at the origin.
  dog.rotation.y = Math.atan2(dog.position.z, -dog.position.x);
  ctx.root.add(dog);
  creatureSys?.addHeadBob(dogHead, 0.06, 2.6);
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
