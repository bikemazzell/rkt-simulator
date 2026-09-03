# Height-Goal Overhaul + Speed-Adaptive Camera — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single target-altitude ring + post-flight scoring with a visual-only "height ladder" (rainbow rings every 50 m to 1000 m + crossing popups), and add speed-proportional camera auto-zoom in follow mode.

**Architecture:** The challenge type `target-altitude` becomes `height-ladder` (visual-only, no scoring, no target-number input). A new pure world module draws the rainbow ladder; a new pure UI module detects 50 m threshold crossings and renders fading DOM popups anchored at each ring; a new pure world module maps speed → camera distance with a user scroll multiplier, wired into `SceneManager`'s follow branch. All logic lands in pure, unit-tested modules; `main.ts` only wires them together.

**Tech Stack:** TypeScript (strict), Three.js 0.185 (object-graph tests run headless in node), Vitest 4 (`npm test`), Vite 8. Quality gate: `npm run quality` (typecheck + tests + build). Deploy: push to `main` → GitHub Pages action.

**Design decisions (settled with user):**
- Challenge is visual-only: no target-altitude input, no apogee-vs-target score; `landing-zone` scoring untouched.
- Ladder: rings every 50 m from 50 m to 1000 m (20 rings), 7-color ROYGBIV cycle, no beacons/discs.
- Popups: DOM labels anchored at the crossed ring's 3D position (gizmo-label projection pattern), float up + fade ~1.2 s, **ascending crossings only** (chute descent must not spam).
- Auto-zoom: follow mode only; `autoZoomDistance = clamp(6 + 1.2·|v|, 6, 600)` m, exponential smoothing (τ = 0.8 s), multiplied by a user scroll factor so manual framing still works. Orbit mode untouched. Factor resets on launch/reset.

---

### Task 1: sim — replace `target-altitude` with visual-only `height-ladder`

Keep every commit compiling: this task touches the type, scoring, and all `ChallengeConfig` consumers (`ui.ts`, `main.ts`). The ladder itself lands in Task 2.

**Files:**
- Modify: `src/sim/types.ts:76-82`
- Modify: `src/sim/challenge.ts:7-13`
- Modify: `src/ui/ui.ts` (dropdown option, remove target-altitude input, `getSelection`)
- Modify: `src/main.ts:9,183-189,221-223` (remove `addTargetRing` + import)
- Test: `tests/sim/challenge.test.ts`

- [ ] **Step 1: Update the failing test**

Replace the three target-altitude cases in `tests/sim/challenge.test.ts` with height-ladder cases (file header/env helpers stay):

```ts
  it('returns no score for height-ladder (visual-only challenge)', () => {
    const r = scoreChallenge({ type: 'height-ladder' }, env, summary(100), vec(0, 0, 0));
    expect(r.score).toBe(0);
    expect(r.detail).toBe('no challenge');
  });
```

Delete the `scores 100 for hitting the target altitude exactly`, `scores 0 at the tolerance edge`, and `scores partial within tolerance` cases (they reference removed config fields). Keep the landing-zone and `none` cases unchanged.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run typecheck && npx vitest run tests/sim/challenge.test.ts`
Expected: **typecheck FAILS** — `'height-ladder'` is not assignable to `ChallengeType` (vitest itself doesn't typecheck, so `tsc` is the red gate for this type-driven refactor; the runtime assertion also passes against the old scorer's fallthrough, which is exactly the behavior we keep for `height-ladder`).

- [ ] **Step 3: Update sim types and scorer**

`src/sim/types.ts` — replace lines 76-82:

```ts
export type ChallengeType = 'none' | 'height-ladder' | 'landing-zone';

/** Challenges are launch-time scene overlays; only 'landing-zone' is scored. */
export interface ChallengeConfig {
  type: ChallengeType;
}
```

`src/sim/challenge.ts` — delete the `target-altitude` branch (lines 7-13). `height-ladder` falls through to the existing `return { score: 0, detail: 'no challenge' }`, which `ui.showSummary` already hides (`ui.ts:212`).

- [ ] **Step 4: Update Ui**

In `src/ui/ui.ts`:
- Delete `targetAltInput` declaration (line 54), its `change` listener (line 81), its type/min/value setup (lines 91-93), and the `this.field('Target altitude (m)', this.targetAltInput)` row (line 122). Update the comment above the `challengeSel` listener (lines 78-79) to drop the "altitude" mention.
- Replace the challenge options list (line 88):

```ts
    for (const [v, label] of [['none', 'No challenge'], ['height-ladder', 'Height goal (50 m rings)'], ['landing-zone', 'Land in zone']] as const) {
```

- Simplify `getSelection` (lines 174-180):

```ts
  getSelection(): { rocketId: string; motorId: string; envId: string; challenge: ChallengeConfig } {
    return {
      rocketId: this.rocketCombo.getValue(),
      motorId: this.motorCombo.getValue(),
      envId: this.envSel.value,
      challenge: { type: this.challengeSel.value as ChallengeConfig['type'] },
    };
  }
```

- [ ] **Step 5: Remove the old ring call in main.ts**

In `src/main.ts`: delete `import { buildTargetAltitudeRing } from './world/targetRing';` (line 9), the `addTargetRing` function (lines 183-189), and its two call sites in `showPreview` (line 223) and `launch` (line 323). (`src/world/targetRing.ts` + its test still exist, unreferenced — removed in Task 2.)

- [ ] **Step 6: Verify + commit**

Run: `npm run quality` — typecheck, all tests (targetRing tests still pass), build.
Expected: PASS.

```bash
git add -A && git commit -m "refactor(sim,ui): replace target-altitude challenge with visual-only height-ladder"
```

---

### Task 2: world — rainbow height ladder

**Files:**
- Create: `src/world/heightLadder.ts`
- Test: `tests/world/heightLadder.test.ts` (replaces `tests/world/targetRing.test.ts`)
- Delete: `src/world/targetRing.ts`, `tests/world/targetRing.test.ts`
- Modify: `src/main.ts` (add ladder to preview + launch)

- [ ] **Step 1: Write failing tests**

Create `tests/world/heightLadder.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { RAINBOW, buildHeightLadder, LADDER_STEP_M, LADDER_MAX_M } from '../../src/world/heightLadder';

function rungs(group: THREE.Group): THREE.Mesh[] {
  return group.children.filter((c) => c.userData.isHeightRung) as THREE.Mesh[];
}

describe('buildHeightLadder', () => {
  it('builds a rung every 50 m up to 1000 m, positioned above baseY', () => {
    const ladder = buildHeightLadder(12);
    const list = rungs(ladder);
    expect(list.length).toBe(LADDER_MAX_M / LADDER_STEP_M);
    for (let i = 0; i < list.length; i++) {
      expect(list[i].position.y).toBeCloseTo(12 + (i + 1) * LADDER_STEP_M, 6);
      expect(list[i].userData.altitudeM).toBe((i + 1) * LADDER_STEP_M);
    }
    expect(ladder.userData.isHeightLadder).toBe(true);
  });

  it('cycles the 7-color rainbow per rung', () => {
    const ladder = buildHeightLadder(0);
    const list = rungs(ladder);
    for (let i = 0; i < list.length; i++) {
      const mat = list[i].material as THREE.MeshBasicMaterial;
      expect(mat.color.getHex()).toBe(RAINBOW[i % RAINBOW.length]);
    }
    expect(list[0].material).not.toBe(list[RAINBOW.length].material);
  });

  it('lays each rung flat (XZ plane), transparent, double-sided', () => {
    const ladder = buildHeightLadder(0);
    for (const rung of rungs(ladder)) {
      expect(Math.abs(Math.abs(rung.rotation.x) - Math.PI / 2)).toBeLessThan(1e-6);
      const mat = rung.material as THREE.MeshBasicMaterial;
      expect(mat.transparent).toBe(true);
      expect(mat.side).toBe(THREE.DoubleSide);
    }
  });

  it('builds independent objects (no shared mutable state)', () => {
    const a = buildHeightLadder(0);
    const b = buildHeightLadder(0);
    expect(a).not.toBe(b);
    expect(rungs(a)[0].geometry).not.toBe(rungs(b)[0].geometry);
  });

  it('floors a non-multiple max to whole steps', () => {
    const ladder = buildHeightLadder(0, { maxM: 970 });
    expect(rungs(ladder).length).toBe(19); // 970 floors down to 950
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/heightLadder.test.ts`
Expected: FAIL — module `../../src/world/heightLadder` not found.

- [ ] **Step 3: Implement `src/world/heightLadder.ts`**

```ts
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
  const maxWholeSteps = Math.max(1, Math.floor((opts.maxM ?? LADDER_MAX_M) / LADDER_STEP_M));
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
```

- [ ] **Step 4: Verify task tests pass**

Run: `npx vitest run tests/world/heightLadder.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Delete the old ring + wire the ladder into main.ts**

```bash
git rm src/world/targetRing.ts tests/world/targetRing.test.ts
```

In `src/main.ts`: add `import { buildHeightLadder } from './world/heightLadder';` and replace the removed `addTargetRing` with:

```ts
// Rainbow ladder of rings every 50 m when the height-goal challenge is on.
function addHeightLadder(challenge: ChallengeConfig, params: EnvParams): void {
  if (challenge.type !== 'height-ladder') return;
  scene.worldGroup.add(buildHeightLadder(params.launchY ?? params.groundHeight));
}
```

Call `addHeightLadder(sel.challenge, params);` in `showPreview()` (where `addTargetRing` was, after `buildEnvironment`) and `addHeightLadder(sel.challenge, params);` in `launch()` (after `buildEnvironment`, before `scene.setGroundFloor`).

- [ ] **Step 6: Verify + commit**

Run: `npm run quality`
Expected: PASS.

```bash
git add -A && git commit -m "feat(world): rainbow height ladder every 50m replaces the single target ring"
```

---

### Task 3: world — speed-adaptive follow zoom

**Files:**
- Create: `src/world/followZoom.ts`
- Test: `tests/world/followZoom.test.ts`
- Modify: `src/world/scene.ts` (follow branch of `render`)
- Modify: `src/main.ts` (pass speed to `scene.render`)

- [ ] **Step 1: Write failing tests**

Create `tests/world/followZoom.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { autoZoomDistance, FollowZoom, ZOOM_MIN_M, ZOOM_MAX_M } from '../../src/world/followZoom';

describe('autoZoomDistance', () => {
  it('sits at the minimum distance when stationary', () => {
    expect(autoZoomDistance(0)).toBeCloseTo(ZOOM_MIN_M, 6);
  });
  it('grows proportionally with speed', () => {
    expect(autoZoomDistance(100)).toBeCloseTo(ZOOM_MIN_M + 120, 6);
  });
  it('clamps at the maximum distance', () => {
    expect(autoZoomDistance(1000)).toBe(ZOOM_MAX_M);
  });
  it('treats negative or non-finite speed as stationary', () => {
    expect(autoZoomDistance(-5)).toBeCloseTo(ZOOM_MIN_M, 6);
    expect(autoZoomDistance(Number.NaN)).toBeCloseTo(ZOOM_MIN_M, 6);
  });
});

describe('FollowZoom.step', () => {
  it('converges toward auto distance × user factor over time', () => {
    const z = new FollowZoom();
    let d = 6;
    for (let i = 0; i < 240; i++) d = z.step(1 / 60, 50, d); // 4 s of frames
    expect(d).toBeCloseTo(autoZoomDistance(50), 0);
  });
  it('folds a user scroll-out into the multiplier', () => {
    const z = new FollowZoom();
    let d = 6;
    for (let i = 0; i < 240; i++) d = z.step(1 / 60, 50, d);
    const settled = d;
    d *= 2; // user scrolls out 2×
    for (let i = 0; i < 240; i++) d = z.step(1 / 60, 50, d);
    expect(d).toBeCloseTo(settled * 2, 0);
  });
  it('clamps the desired distance to the maximum even with a huge user factor', () => {
    const z = new FollowZoom();
    z.userFactor = 100;
    let d = ZOOM_MIN_M;
    for (let i = 0; i < 240; i++) d = z.step(1 / 60, 0, d);
    expect(d).toBeCloseTo(ZOOM_MAX_M, 0); // 6 × 100 clamps to 600, never above
  });
  it('reset() clears the user factor', () => {
    const z = new FollowZoom();
    let d = 6;
    for (let i = 0; i < 120; i++) d = z.step(1 / 60, 50, d);
    d *= 3;
    z.step(1 / 60, 50, d);
    z.reset();
    for (let i = 0; i < 240; i++) d = z.step(1 / 60, 50, d);
    expect(d).toBeCloseTo(autoZoomDistance(50), 0);
  });
  it('zero dt does not move the distance', () => {
    const z = new FollowZoom();
    expect(z.step(0, 100, 6)).toBeCloseTo(6, 6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/followZoom.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/world/followZoom.ts`**

```ts
/** Closest the auto-zoom pulls in (m from the rocket). */
export const ZOOM_MIN_M = 6;
/** Farthest the auto-zoom pulls out (m). */
export const ZOOM_MAX_M = 600;
/** Meters of camera distance per m/s of rocket speed. */
export const ZOOM_M_PER_MPS = 1.2;
/** Exponential smoothing time constant (s). */
const SMOOTHING_TAU = 0.8;
/** User scroll factor bounds (so one scroll cannot run away). */
const FACTOR_MAX = 64;
const FACTOR_MIN = 1 / 64;

/** Desired follow distance for a rocket speed (m/s): faster → wider context. */
export function autoZoomDistance(speedMps: number): number {
  const s = Number.isFinite(speedMps) ? Math.max(0, speedMps) : 0;
  return Math.min(ZOOM_MAX_M, ZOOM_MIN_M + ZOOM_M_PER_MPS * s);
}

/**
 * Speed-adaptive follow-cam zoom. Each frame `step()` eases the camera
 * distance toward `autoZoomDistance(speed) * userFactor`. Distance changes
 * the user made by scrolling since the previous frame (anything other than
 * what we set last) are absorbed into `userFactor`, so manual framing keeps
 * working on top of the automatic zoom.
 */
export class FollowZoom {
  userFactor = 1;
  private lastAuto = 0;

  /** Ease the distance one frame closer to the target for `speedMps`. */
  step(dt: number, speedMps: number, currentDist: number): number {
    if (this.lastAuto > 0 && currentDist > 0 && currentDist !== this.lastAuto) {
      this.userFactor = Math.min(FACTOR_MAX, Math.max(FACTOR_MIN,
        this.userFactor * (currentDist / this.lastAuto)));
    }
    const desired = Math.min(ZOOM_MAX_M, Math.max(1, autoZoomDistance(speedMps) * this.userFactor));
    const a = 1 - Math.exp(-Math.max(dt, 0) / SMOOTHING_TAU);
    const next = currentDist + (desired - currentDist) * a;
    this.lastAuto = next;
    return next;
  }

  /** Forget the user's scroll factor (new flight / reset). */
  reset(): void {
    this.userFactor = 1;
    this.lastAuto = 0;
  }
}
```

- [ ] **Step 4: Verify task tests pass**

Run: `npx vitest run tests/world/followZoom.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Wire into SceneManager follow mode**

In `src/world/scene.ts`: add `import { FollowZoom } from './followZoom';`, a `private readonly followZoom = new FollowZoom();` field, change the signature to `render(rocketPos: Vec3, speedMps?: number): void`, call `this.followZoom.reset();` inside `reset()` (after framing), and inside the `if (this.mode === 'follow')` block after the rigid translate:

```ts
      // Speed-adaptive zoom: ease the orbit distance toward a speed-based
      // target (× the user's own scroll factor). Only while flying.
      if (speedMps !== undefined) {
        const dist = this.camera.position.distanceTo(this.controls.target);
        const next = this.followZoom.step(dt, speedMps, dist);
        const dir = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
        if (dir.lengthSq() > 1e-9) {
          dir.setLength(next);
          this.camera.position.copy(this.controls.target).add(dir);
        }
      }
```

In `src/main.ts` `frame()`, replace `scene.render(focus);` with:

```ts
  const speedMps = sim && !finished
    ? Math.hypot(sim.state.velocity.x, sim.state.velocity.y, sim.state.velocity.z)
    : undefined;
  scene.render(focus, speedMps);
```

(Preview frames pass `undefined` → no auto-zoom; `scene.reset()` on preview/launch already re-frames and clears the factor.)

- [ ] **Step 6: Verify + commit**

Run: `npm run quality` (includes `tests/world/rocketFrame.test.ts` + scene-adjacent suites)
Expected: PASS.

```bash
git add -A && git commit -m "feat(world): speed-adaptive follow-cam zoom with user scroll factor"
```

---

### Task 4: ui — altitude crossing popups

**Files:**
- Create: `src/ui/altitudePopup.ts`
- Test: `tests/ui/altitudePopup.test.ts`
- Modify: `src/ui/ui.css` (popup style)

DOM layer is kept thin (node-env tests cover the pure parts; visual verified via CDP smoke).

- [ ] **Step 1: Write failing tests**

Create `tests/ui/altitudePopup.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  crossedThresholds, stepPopups, POPUP_LIFE_S, LADDER_STEP_M,
} from '../../src/ui/altitudePopup';

describe('crossedThresholds', () => {
  it('returns nothing below the first rung', () => {
    expect(crossedThresholds(0, 49)).toEqual([]);
    expect(crossedThresholds(10, 49.9)).toEqual([]);
  });
  it('returns a single crossed rung', () => {
    expect(crossedThresholds(49, 51)).toEqual([50]);
    expect(crossedThresholds(0, 50)).toEqual([50]); // landing exactly on it counts
  });
  it('returns every rung crossed in one jump', () => {
    expect(crossedThresholds(40, 160)).toEqual([50, 100, 150]);
  });
  it('ignores descending motion', () => {
    expect(crossedThresholds(160, 40)).toEqual([]);
  });
  it('never reports above the ladder cap', () => {
    expect(crossedThresholds(990, 1050)).toEqual([1000]);
  });
  it('handles negative starting altitudes', () => {
    expect(crossedThresholds(-30, 60)).toEqual([50]);
  });
});

describe('stepPopups', () => {
  it('ages popups and drops expired ones', () => {
    const live = stepPopups([{ altitudeM: 50, ageS: 0 }], POPUP_LIFE_S / 2);
    expect(live.length).toBe(1);
    expect(live[0].ageS).toBeCloseTo(POPUP_LIFE_S / 2, 6);
    const dead = stepPopups([{ altitudeM: 50, ageS: POPUP_LIFE_S - 0.01 }], 0.02);
    expect(dead).toEqual([]);
  });
  it('does not mutate the input list', () => {
    const input = [{ altitudeM: 50, ageS: 0 }];
    stepPopups(input, 0.1);
    expect(input[0].ageS).toBe(0);
  });
  it('exposes the ladder step so popups match the rings', () => {
    expect(LADDER_STEP_M).toBe(50);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ui/altitudePopup.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/ui/altitudePopup.ts`**

```ts
import { RAINBOW, LADDER_STEP_M as WORLD_STEP_M, LADDER_MAX_M as WORLD_MAX_M } from '../world/heightLadder';

export const LADDER_STEP_M = WORLD_STEP_M;
export const LADDER_MAX_M = WORLD_MAX_M;
/** Seconds a crossing popup lives before it fully fades. */
export const POPUP_LIFE_S = 1.2;
/** Pixels the popup floats upward over its life. */
const FLOAT_PX = 30;

export interface AltitudePopup {
  altitudeM: number;
  ageS: number;
}

/** Rung altitudes crossed upward: prev < k·step <= curr, capped at max. */
export function crossedThresholds(
  prevM: number, currM: number,
  stepM: number = LADDER_STEP_M, maxM: number = LADDER_MAX_M,
): number[] {
  if (!(currM > prevM)) return [];
  const kMin = Math.max(1, Math.floor(prevM / stepM) + 1);
  const kMax = Math.min(Math.floor(currM / stepM), Math.floor(maxM / stepM));
  const out: number[] = [];
  for (let k = kMin; k <= kMax; k++) out.push(k * stepM);
  return out;
}

/** Advance popup ages by dt, dropping expired ones. Pure. */
export function stepPopups(popups: AltitudePopup[], dt: number): AltitudePopup[] {
  return popups
    .map((p) => ({ ...p, ageS: p.ageS + dt }))
    .filter((p) => p.ageS < POPUP_LIFE_S);
}

/** Rung color for an altitude (matches the rainbow ladder rings). */
function rainbowFor(altitudeM: number): string {
  const k = Math.round(altitudeM / LADDER_STEP_M) - 1;
  return `#${RAINBOW[((k % RAINBOW.length) + RAINBOW.length) % RAINBOW.length].toString(16).padStart(6, '0')}`;
}

export interface ScreenPos { x: number; y: number; visible: boolean; }

/**
 * DOM overlay that pops the crossed altitude ("150 m") at the ring it
 * crossed, floating up and fading over ~1.2 s. Call `update()` every frame.
 */
export class AltitudePopupLayer {
  private readonly root: HTMLElement;
  private popups: AltitudePopup[] = [];

  constructor(host: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'rkt-alt-popups';
    host.append(this.root);
  }

  /** Queue a popup for a crossed rung altitude. */
  spawn(altitudeM: number): void {
    this.popups.push({ altitudeM, ageS: 0 });
  }

  /** Age, prune and re-render the labels. `project` maps altitude → screen. */
  update(dt: number, project: (altitudeM: number) => ScreenPos): void {
    this.popups = stepPopups(this.popups, dt);
    this.root.replaceChildren();
    for (const p of this.popups) {
      const pos = project(p.altitudeM);
      if (!pos.visible) continue;
      const t = p.ageS / POPUP_LIFE_S;
      const div = document.createElement('div');
      div.className = 'rkt-alt-popup';
      div.textContent = `${p.altitudeM} m`;
      div.style.left = `${pos.x}px`;
      div.style.top = `${pos.y}px`;
      div.style.opacity = `${1 - t}`;
      div.style.transform = `translate(-50%, calc(-50% - ${(t * FLOAT_PX).toFixed(1)}px))`;
      div.style.color = rainbowFor(p.altitudeM);
      this.root.append(div);
    }
  }

  /** Drop all popups (new flight / preview). */
  clear(): void {
    this.popups = [];
    this.root.replaceChildren();
  }
}
```

- [ ] **Step 4: Verify task tests pass**

Run: `npx vitest run tests/ui/altitudePopup.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Add the popup CSS to `src/ui/ui.css`**

Append:

```css
.rkt-alt-popups { position: fixed; inset: 0; pointer-events: none; z-index: 8; }
.rkt-alt-popup {
  position: fixed;
  font: 700 15px/1.2 system-ui, monospace;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85);
  pointer-events: none;
  white-space: nowrap;
}
```

- [ ] **Step 6: Verify + commit**

Run: `npm run quality`
Expected: PASS.

```bash
git add -A && git commit -m "feat(ui): rainbow altitude popups on 50m threshold crossings"
```

---

### Task 5: main.ts wiring + docs

**Files:**
- Modify: `src/main.ts` (popup layer lifecycle, altitude tracking)
- Modify: `docs/spec.md` (§4.2 challenge, §9 rendering, §10 UI mentions)
- Modify: `README.md` (Challenges bullet)
- Modify: `tasks/todo.md` (round log entry)

- [ ] **Step 1: Wire the popup layer into the frame loop**

In `src/main.ts`:

Imports: `import { AltitudePopupLayer } from './ui/altitudePopup';`, `import { crossedThresholds } from './ui/altitudePopup';` (combine), `import * as THREE from 'three';` (only if needed for the projector vector; reuse existing `computeLabelScreen` from `'./world/gizmo'` — extend that import).

Module state (near the other `let` declarations):

```ts
const altPopups = new AltitudePopupLayer(host);
let ladderBaseY: number | null = null; // set when the rainbow ladder is in the world
let prevAltitudeM: number | null = null;
```

In `showPreview()`: after `scene.setGroundFloor(params.groundHeight);` add

```ts
  ladderBaseY = sel.challenge.type === 'height-ladder' ? params.launchY ?? params.groundHeight : null;
  prevAltitudeM = null;
  altPopups.clear();
```

In `launch()` fresh-pad branch: after `scene.setGroundFloor(params.groundHeight);` add the same three lines using `params.launchY ?? params.groundHeight`. In the relaunch branch (before its `return`): `ladderBaseY = null; prevAltitudeM = null; altPopups.clear();` (the relaunch world keeps no ladder).

In `frame()`, inside `if (sim) { ... }` after `ui.updateHud(...)`:

```ts
    if (ladderBaseY !== null) {
      const alt = sim.state.position.y - ladderBaseY;
      const prev = prevAltitudeM ?? alt;
      for (const t of crossedThresholds(prev, alt)) altPopups.spawn(t);
      prevAltitudeM = alt;
    }
```

And in `frame()` before `scene.render(...)`, always (real dt, even after finish, so fades finish):

```ts
  const dtS = dtMs / 1000;
  if (ladderBaseY !== null && sim) {
    altPopups.update(dtS, (alt) => computeLabelScreen(
      new THREE.Vector3(0, ladderBaseY! + alt, 0), scene.camera,
      scene.domElement.clientWidth, scene.domElement.clientHeight,
    ));
  } else {
    altPopups.clear();
  }
```

Add `computeLabelScreen` to the existing `./world/gizmo` import in `main.ts` and `Vector3` to the `three` import. (dtMs is already computed at the top of `frame()`.)

- [ ] **Step 2: Update docs**

`docs/spec.md`:
- Line ~63 ("Two challenge types at launch") and the §4.2 block: describe `height-ladder` (rainbow ring every 50 m to 1000 m, ROYGBIV cycle, crossing popups anchored at each ring, visual-only, no score) and `landing-zone`; note the target-altitude input and apogee scoring were removed.
- §4.3/controls: document follow-mode speed-adaptive zoom (distance `6 + 1.2·|v|` clamped to 6–600 m, τ 0.8 s ease, scroll acts as a multiplier; orbit mode unaffected).
- §9 rendering + §10 UI: swap the amber-ring paragraph (line ~101) for the ladder + popup description.

`README.md` Challenges bullet (line ~58): "Height goal — a rainbow ring every 50 m to 1000 m with altitude popups as you cross them (visual), land-in-zone (scored)."

`tasks/todo.md`: append a "Feature round 10 — height-goal overhaul + speed-adaptive camera" entry summarizing the change.

- [ ] **Step 3: Verify + commit**

Run: `npm run quality`
Expected: PASS (full suite + typecheck + build).

```bash
git add -A && git commit -m "feat(main,docs): wire height ladder popups + adaptive zoom, update docs"
```

---

## Verification (after Task 5)

1. `npm run quality` — typecheck + full suite + production build.
2. CDP smoke (`scripts/smoke-cdp.mjs` against `npm run preview`): launch with the height goal selected; confirm no console errors, popups appear during boost (scratchpad screenshot), camera pulls out with speed and re-approaches under the chute.
3. Manual `npm run dev` spot-check if Brave/CDP is unavailable.

## Review gates

- **Plan review:** deepseek + qwen on this document (parallel, `review-with`), fold changes before implementing.
- **Code review:** codex + deepseek on the branch diff after Task 5, fold changes, re-run `npm run quality`.

## Merge / deploy / cleanup

1. Resolve the dirty `main` checkout (5 uncommitted streamer-round files overlap `docs/spec.md` + `tasks/todo.md`) — user commits or stashes first.
2. Merge `feature/height-goal-overhaul` → `main`, push (`git push origin main`).
3. Deploy = GitHub Pages action on push; verify the Actions run goes green and the site updated.
4. `git worktree remove .worktrees/height-goal-overhaul` + delete the branch.
