import * as THREE from 'three';

/** One rung every 50 m, up to this altitude. */
export const LADDER_STEP_M = 50;
export const LADDER_MAX_M = 1000;

/** ROYGBIV cycle for the ladder rungs (repeats every 350 m). */
export const RAINBOW: readonly number[] = [
  0xff3b30, // red
  0xff9500, // orange
  0xffd60a, // yellow
  0x32d74b, // green
  0x0a84ff, // blue
  0x5e5ce6, // indigo
  0xbf5af2, // violet
];

/**
 * Rainbow "height goal" ladder: a flat, colored ring at every 50 m of
 * altitude above the launch base, cycling ROYGBIV, so the player can read
 * progress through (and above) the flight. Purely visual — no scoring.
 */
export function buildHeightLadder(
  baseY: number,
  opts: { maxM?: number } = {},
): THREE.Group {
  // The option is for tests/preview slicing only — it can never exceed the
  // settled 1000 m cap and a sub-step value yields no rungs.
  const maxM = Math.min(LADDER_MAX_M, Math.max(0, opts.maxM ?? LADDER_MAX_M));
  const maxWholeSteps = Math.floor(maxM / LADDER_STEP_M);
  const g = new THREE.Group();
  g.userData.isHeightLadder = true;
  for (let i = 0; i < maxWholeSteps; i++) {
    const altitudeM = (i + 1) * LADDER_STEP_M;
    const rung = new THREE.Mesh(
      new THREE.TorusGeometry(9, 0.25, 8, 48),
      new THREE.MeshBasicMaterial({
        color: RAINBOW[i % RAINBOW.length],
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
      }),
    );
    rung.rotation.x = Math.PI / 2; // lay flat (XZ plane)
    rung.position.y = baseY + altitudeM;
    rung.userData.isHeightRung = true;
    rung.userData.altitudeM = altitudeM;
    g.add(rung);
  }
  return g;
}
