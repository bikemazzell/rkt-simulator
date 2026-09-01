/**
 * Everyday-object reference ladder for conveying rocket scale.
 * Pure data + selection logic — no THREE, fully unit-testable.
 */
import type { Rocket } from '../sim/types';

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
 * Sorted by height. Heights are real-world everyday values:
 * soda can 12.2 cm, wine bottle 30 cm, labrador shoulder 60 cm,
 * 6-year-old 115 cm, cow shoulder 145 cm, sedan 150 cm tall / 4.5 m long,
 * average person 175 cm, pickup truck 190 cm tall / 5.8 m long, tall person 2 m.
 */
export const SCALE_REFERENCES: ScaleRef[] = [
  { id: 'soda-can', label: 'soda can', heightM: 0.122, lengthM: 0.066 },
  { id: 'wine-bottle', label: 'wine bottle', heightM: 0.3, lengthM: 0.075 },
  { id: 'dog', label: 'dog', heightM: 0.6, lengthM: 0.8 },
  { id: 'child', label: 'child', heightM: 1.15, lengthM: 0.5 },
  { id: 'cow', label: 'cow', heightM: 1.45, lengthM: 2.0 },
  { id: 'car', label: 'car', heightM: 1.5, lengthM: 4.5 },
  { id: 'person', label: 'person', heightM: 1.75, lengthM: 0.5 },
  { id: 'pickup-truck', label: 'pickup truck', heightM: 1.9, lengthM: 5.8 },
  { id: 'tall-person', label: 'tall person', heightM: 2.0, lengthM: 0.5 },
];

const PERSON = 'person';
const TARGET_COUNT = 5;
/** Two rungs closer than this ratio are redundant (cow 1.45 vs car 1.50). */
const REDUNDANCY_RATIO = 1.12;

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
 * Always includes person; nearest rung below and above when they exist
 * (a missing side is simply skipped); remaining slots filled by log-distance,
 * suppressing rungs within REDUNDANCY_RATIO of an already-picked one.
 */
export function pickReferences(totalHeightM: number): ScaleRef[] {
  const picked = new Map<string, ScaleRef>();
  const add = (ref: ScaleRef | undefined) => {
    if (ref) picked.set(ref.id, ref);
  };

  add(SCALE_REFERENCES.find((r) => r.id === PERSON));

  let lo = -1;
  for (let i = 0; i < SCALE_REFERENCES.length; i++) {
    if (SCALE_REFERENCES[i].heightM <= totalHeightM) lo = i;
  }
  const hi = SCALE_REFERENCES.findIndex((r) => r.heightM >= totalHeightM);

  if (lo >= 0) add(SCALE_REFERENCES[lo]);
  if (hi >= 0 && SCALE_REFERENCES[hi].heightM !== totalHeightM) {
    // The above-rung is skippable when it is too close to the below-rung
    // (cow 1.45 vs car 1.50 reads as the same height; a distinct rung
    // communicates scale better and log-distance fill provides it).
    if (!isRedundant(SCALE_REFERENCES[hi], [...picked.values()])) {
      add(SCALE_REFERENCES[hi]);
    }
  }

  const rest = SCALE_REFERENCES.filter((r) => !picked.has(r.id)).sort(
    (a, b) => logDistance(totalHeightM, a.heightM) - logDistance(totalHeightM, b.heightM),
  );
  for (const ref of rest) {
    if (picked.size >= TARGET_COUNT) break;
    if (!isRedundant(ref, [...picked.values()])) add(ref);
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
