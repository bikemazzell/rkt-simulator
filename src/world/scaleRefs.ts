/**
 * Everyday-object reference ladder for conveying rocket scale.
 * Pure data + selection logic — no THREE, fully unit-testable.
 */
import type { Rocket } from '../sim/types';
import type { Rng } from '../sim/rng';

/**
 * Total visible height of a rocket: body plus the nose cone, whose length
 * (3× radius = 1.5× diameter) is the same convention the mesh builder uses.
 */
export function totalHeightM(rocket: Rocket): number {
  return rocket.look.bodyLengthM + rocket.diameterM * 1.5;
}

export interface ScaleRef {
  id: string;
  /** Human-readable label used in phrases like "about as tall as a wine bottle". */
  label: string;
  /** Primary vertical dimension in meters (shoulder height for animals/people). */
  heightM: number;
  /** Longest horizontal footprint in meters (lineup spacing). */
  lengthM: number;
}

/**
 * Sorted by height. Heights are real-world everyday values, from pocket
 * objects (eraser 3 cm, baseball 7.4 cm) through people-scale (dog, sheep,
 * child, person, door) to unmissable ones (house, elephant).
 */
export const SCALE_REFERENCES: ScaleRef[] = [
  { id: 'eraser', label: 'eraser', heightM: 0.03, lengthM: 0.05 },
  { id: 'golf-ball', label: 'golf ball', heightM: 0.043, lengthM: 0.043 },
  { id: 'baseball', label: 'baseball', heightM: 0.074, lengthM: 0.074 },
  { id: 'coffee-mug', label: 'coffee mug', heightM: 0.1, lengthM: 0.1 },
  { id: 'soda-can', label: 'soda can', heightM: 0.122, lengthM: 0.066 },
  { id: 'soccer-ball', label: 'soccer ball', heightM: 0.22, lengthM: 0.22 },
  { id: 'book', label: 'stack of books', heightM: 0.24, lengthM: 0.22 },
  { id: 'wine-bottle', label: 'wine bottle', heightM: 0.3, lengthM: 0.075 },
  { id: 'dog', label: 'dog', heightM: 0.6, lengthM: 0.8 },
  { id: 'fire-hydrant', label: 'fire hydrant', heightM: 0.75, lengthM: 0.26 },
  { id: 'trash-can', label: 'trash can', heightM: 0.92, lengthM: 0.6 },
  { id: 'sheep', label: 'sheep', heightM: 0.95, lengthM: 1.1 },
  { id: 'child', label: 'child', heightM: 1.15, lengthM: 0.5 },
  { id: 'cow', label: 'cow', heightM: 1.45, lengthM: 2.0 },
  { id: 'car', label: 'car', heightM: 1.5, lengthM: 4.5 },
  { id: 'person', label: 'person', heightM: 1.75, lengthM: 0.5 },
  { id: 'pickup-truck', label: 'pickup truck', heightM: 1.9, lengthM: 5.8 },
  { id: 'tall-person', label: 'tall person', heightM: 2.0, lengthM: 0.5 },
  { id: 'horse', label: 'horse', heightM: 2.02, lengthM: 2.2 },
  { id: 'door', label: 'door', heightM: 2.1, lengthM: 0.9 },
  { id: 'house', label: 'house', heightM: 3.0, lengthM: 4.5 },
  { id: 'elephant', label: 'elephant', heightM: 3.2, lengthM: 2.8 },
];

const TARGET_COUNT = 5;
const MIN_COUNT = 3;
/** Two rungs closer than this ratio are redundant (cow 1.45 vs car 1.50). */
const REDUNDANCY_RATIO = 1.12;
/** Fill candidates may sit at most this far in log-height (~4x) from the rocket. */
const FILL_WINDOW = 1.4;

const logDistance = (h: number, ref: number) => Math.abs(Math.log(h / ref));

function isRedundant(candidate: ScaleRef, picked: ScaleRef[]): boolean {
  return picked.some((p) => {
    const lo = Math.min(p.heightM, candidate.heightM);
    const hi = Math.max(p.heightM, candidate.heightM);
    return hi / lo < REDUNDANCY_RATIO;
  });
}

/**
 * Pick 3–5 references that bracket `totalHeightM` (rocket body + nose).
 * The nearest rungs below and above always anchor the lineup (a missing side
 * is simply skipped). Remaining slots are filled by weighted-random sampling
 * over a log-distance window — nearer heights are likelier, and every visit
 * rolls a different row. Rungs within REDUNDANCY_RATIO of a picked one are
 * suppressed so lookalikes (sheep vs trash can) alternate instead of stacking.
 */
export function pickReferences(totalHeightM: number, rng: Rng = Math.random): ScaleRef[] {
  const picked = new Map<string, ScaleRef>();
  const add = (ref: ScaleRef | undefined) => {
    if (ref) picked.set(ref.id, ref);
  };

  let lo = -1;
  for (let i = 0; i < SCALE_REFERENCES.length; i++) {
    if (SCALE_REFERENCES[i].heightM <= totalHeightM) lo = i;
  }
  const hi = SCALE_REFERENCES.findIndex((r) => r.heightM >= totalHeightM);

  if (lo >= 0) add(SCALE_REFERENCES[lo]);
  if (hi >= 0 && hi !== lo && !isRedundant(SCALE_REFERENCES[hi], [...picked.values()])) {
    add(SCALE_REFERENCES[hi]);
  }

  const inWindow = (r: ScaleRef) => logDistance(totalHeightM, r.heightM) <= FILL_WINDOW;
  const pool = SCALE_REFERENCES.filter((r) => !picked.has(r.id) && inWindow(r));
  while (picked.size < TARGET_COUNT && pool.length > 0) {
    const weights = pool.map((r) => 1 / (1 + logDistance(totalHeightM, r.heightM)));
    let roll = rng() * weights.reduce((a, b) => a + b, 0);
    let idx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        idx = i;
        break;
      }
    }
    add(pool[idx]);
    pool.splice(idx, 1);
    for (let i = pool.length - 1; i >= 0; i--) {
      if (isRedundant(pool[i], [...picked.values()])) pool.splice(i, 1);
    }
  }

  // Sparse-window safety net: always return at least MIN_COUNT refs.
  if (picked.size < MIN_COUNT) {
    const rest = SCALE_REFERENCES.filter((r) => !picked.has(r.id)).sort(
      (a, b) => logDistance(totalHeightM, a.heightM) - logDistance(totalHeightM, b.heightM),
    );
    for (const ref of rest) {
      if (picked.size >= MIN_COUNT) break;
      if (!isRedundant(ref, [...picked.values()])) add(ref);
    }
  }

  return [...picked.values()].sort((a, b) => a.heightM - b.heightM);
}

/** Short comparison phrase, e.g. "about as tall as a wine bottle". */
export function describeSize(totalHeightM: number): string {
  let nearest = SCALE_REFERENCES[0];
  let best = Infinity;
  for (const ref of SCALE_REFERENCES) {
    const d = logDistance(totalHeightM, ref.heightM);
    if (d < best) {
      best = d;
      nearest = ref;
    }
  }
  return `about as tall as a ${nearest.label}`;
}
