import type { EnvParams, Vec3 } from '../../sim/types';
import { vec } from '../../sim/vec';
import { mulberry32, randRange, type Rng } from '../../sim/rng';

function windVec(rng: Rng, minSpeed: number, maxSpeed: number): Vec3 {
  const speed = randRange(rng, minSpeed, maxSpeed);
  const angle = randRange(rng, 0, Math.PI * 2);
  return vec(Math.cos(angle) * speed, 0, Math.sin(angle) * speed);
}

function zone(rng: Rng, radius: number, zoneRadius: number) {
  const r = randRange(rng, radius * 0.2, radius * 0.6);
  const a = randRange(rng, 0, Math.PI * 2);
  return { center: vec(Math.cos(a) * r, 0, Math.sin(a) * r), radius: zoneRadius };
}

export function parkParams(rng: Rng): EnvParams {
  return { groundHeight: 0, wind: { base: windVec(rng, 1, 4), gust: 1.5 }, bounds: { radius: 400 }, targetZone: zone(rng, 400, 25) };
}
export function urbanParams(rng: Rng): EnvParams {
  return { groundHeight: 0, wind: { base: windVec(rng, 2, 5), gust: 4 }, bounds: { radius: 350 }, targetZone: zone(rng, 350, 20) };
}
export function mountainParams(rng: Rng): EnvParams {
  return { groundHeight: 1200, wind: { base: windVec(rng, 3, 7), gust: 3 }, bounds: { radius: 600 }, targetZone: zone(rng, 600, 30) };
}
export function desertParams(rng: Rng): EnvParams {
  return { groundHeight: 300, wind: { base: windVec(rng, 0.5, 2), gust: 1 }, bounds: { radius: 700 }, targetZone: zone(rng, 700, 30) };
}
export function seaParams(rng: Rng): EnvParams {
  return { groundHeight: 0, wind: { base: windVec(rng, 5, 10), gust: 4 }, bounds: { radius: 800 }, targetZone: zone(rng, 800, 35) };
}
export function rooftopParams(rng: Rng): EnvParams {
  return { groundHeight: 12, wind: { base: windVec(rng, 2, 6), gust: 3 }, bounds: { radius: 250 }, targetZone: zone(rng, 250, 15) };
}
export function bathtubParams(rng: Rng): EnvParams {
  return { groundHeight: 0, wind: { base: windVec(rng, 0, 1), gust: 0.5 }, bounds: { radius: 60 }, targetZone: zone(rng, 60, 8) };
}
export function backyardDogParams(rng: Rng): EnvParams {
  return { groundHeight: 0, wind: { base: windVec(rng, 1, 3), gust: 2 }, bounds: { radius: 120 }, targetZone: zone(rng, 120, 12) };
}

const MAKERS: Record<string, (rng: Rng) => EnvParams> = {
  park: parkParams, urban: urbanParams, mountain: mountainParams, desert: desertParams,
  sea: seaParams, rooftop: rooftopParams, bathtub: bathtubParams, 'backyard-dog': backyardDogParams,
};

export function makeParamsFor(id: string, seed: number): EnvParams {
  const maker = MAKERS[id];
  if (!maker) throw new Error(`unknown environment: ${id}`);
  return maker(mulberry32(seed));
}
