// Pure per-environment biome configuration: ground tile palettes, flora and
// creature mixes, weather weights, water body kind. No three.js imports so the
// data is unit-testable. Consumed by the world render modules.

export interface FloraMix {
  /** blocky trees (oaks/birches/pines/palms/cacti depending on palette) */
  trees: number;
  shrubs: number;
  /** instanced grass tufts */
  grass: number;
  flowers: number;
}

export interface CreatureMix {
  villagers: number;
  animals: number;
  birds: number;
  /** walkable Y for creatures; defaults to the environment's groundHeight */
  groundY?: number;
}

export interface WeatherWeights {
  clear: number;
  rain: number;
  storm: number;
  snow: number;
}

export type WaterKind = 'none' | 'pond' | 'sea' | 'tub';

/** Terrain shaping: amplitude 0 keeps the environment perfectly flat. */
export interface TerrainStyle {
  /** total climb in meters above the ground plane */
  amplitude: number;
  /** quantization in meters (terrace height) */
  step: number;
  /** dominant hill wavelength in meters */
  feature: number;
}

export interface Biome {
  envId: string;
  groundPalette: number[];
  flora: FloraMix;
  creatures: CreatureMix;
  weather: WeatherWeights;
  water: WaterKind;
  terrain: TerrainStyle;
}

export const BIOME_ENV_IDS = [
  'park', 'urban', 'mountain', 'desert', 'sea', 'rooftop', 'bathtub', 'backyard-dog',
];

const BIOMES: Record<string, Biome> = {
  park: {
    envId: 'park',
    groundPalette: [0x4c8f3a, 0x55a044, 0x61b04d, 0x477f38, 0x6fbf5a],
    flora: { trees: 60, shrubs: 30, grass: 1200, flowers: 80 },
    creatures: { villagers: 8, animals: 8, birds: 12 },
    weather: { clear: 0.7, rain: 0.2, storm: 0.1, snow: 0 },
    water: 'pond',
    terrain: { amplitude: 10, step: 3, feature: 90 }, // rolling meadow terraces
  },
  urban: {
    envId: 'urban',
    groundPalette: [0x55585c, 0x5d6065, 0x4e5155, 0x66696e, 0x59626b],
    flora: { trees: 15, shrubs: 5, grass: 150, flowers: 0 },
    creatures: { villagers: 6, animals: 0, birds: 8 },
    weather: { clear: 0.65, rain: 0.2, storm: 0.15, snow: 0 },
    water: 'none',
    terrain: { amplitude: 6, step: 3, feature: 70 }, // gentle street rolls
  },
  mountain: {
    envId: 'mountain',
    groundPalette: [0x6b7a55, 0x75705a, 0x7a6f5a, 0x5f7a4f, 0x808870],
    flora: { trees: 50, shrubs: 20, grass: 400, flowers: 10 },
    creatures: { villagers: 2, animals: 6, birds: 10 },
    weather: { clear: 0.5, rain: 0.1, storm: 0.05, snow: 0.35 },
    water: 'pond',
    terrain: { amplitude: 36, step: 6, feature: 130 }, // rugged highlands
  },
  desert: {
    envId: 'desert',
    groundPalette: [0xd9b877, 0xe0c084, 0xd2b070, 0xe6c890, 0xcfa765],
    flora: { trees: 18, shrubs: 25, grass: 60, flowers: 0 },
    creatures: { villagers: 1, animals: 2, birds: 4 },
    weather: { clear: 0.92, rain: 0.08, storm: 0, snow: 0 },
    water: 'none',
    terrain: { amplitude: 10, step: 3, feature: 110 }, // slow dunes
  },
  sea: {
    envId: 'sea',
    groundPalette: [0x1d5f8e, 0x20678f, 0x1a587f],
    flora: { trees: 0, shrubs: 0, grass: 0, flowers: 0 },
    creatures: { villagers: 0, animals: 0, birds: 10 },
    weather: { clear: 0.6, rain: 0.15, storm: 0.25, snow: 0 },
    water: 'sea',
    terrain: { amplitude: 0, step: 1, feature: 1 }, // open ocean stays flat
  },
  rooftop: {
    envId: 'rooftop',
    groundPalette: [0x4a4a4f, 0x525256, 0x454549, 0x5a5a60, 0x6a6a70],
    flora: { trees: 6, shrubs: 2, grass: 80, flowers: 4 },
    creatures: { villagers: 4, animals: 0, birds: 4, groundY: 0 },
    weather: { clear: 0.7, rain: 0.15, storm: 0.15, snow: 0 },
    water: 'none',
    terrain: { amplitude: 10, step: 4, feature: 80 }, // street-level bumps
  },
  bathtub: {
    envId: 'bathtub',
    groundPalette: [0xe8e8f0, 0xdfe0ea, 0xf0f0f8, 0xd8d9e4],
    flora: { trees: 0, shrubs: 0, grass: 0, flowers: 0 },
    creatures: { villagers: 0, animals: 0, birds: 3 },
    weather: { clear: 0.95, rain: 0.05, storm: 0, snow: 0 },
    water: 'tub',
    terrain: { amplitude: 0, step: 1, feature: 1 }, // porcelain stays flat
  },
  'backyard-dog': {
    envId: 'backyard-dog',
    groundPalette: [0x4f9a3c, 0x58a844, 0x61b34b, 0x489038],
    flora: { trees: 8, shrubs: 10, grass: 400, flowers: 40 },
    creatures: { villagers: 4, animals: 6, birds: 6 },
    weather: { clear: 0.75, rain: 0.15, storm: 0.1, snow: 0 },
    water: 'pond',
    terrain: { amplitude: 4, step: 2, feature: 60 }, // lawn undulations
  },
};

export function biomeFor(envId: string): Biome {
  const b = BIOMES[envId];
  if (!b) throw new Error(`unknown biome: ${envId}`);
  return b;
}
