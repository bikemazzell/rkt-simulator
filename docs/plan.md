# RKT Simulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Three.js browser game that simulates launching Estes-style model rockets into seeded, procedurally generated environments, with grounded-but-approachable physics, live telemetry, and light challenges.

**Architecture:** A pure, framework-free simulation core (`src/sim/`) — RNG, motors, thrust curves, atmosphere, integrator, flight state machine, outcomes — is driven test-first with Vitest and imports no Three.js. A thin rendering/UI layer (`src/world/`, `src/ui/`, `src/audio/`) reads sim state one-way and never writes back. `main.ts` wires a `SimConfig` into a `Simulation`, advances it on a fixed timestep via an accumulator, and renders each frame.

**Tech Stack:** TypeScript, Vite, Three.js (npm), Vitest. No backend; static output. Brave CDP (port 9222) for render/UI smoke tests.

**Spec:** `docs/spec.md`

## Global Constraints

- Language: TypeScript, `strict: true`. `tsc --noEmit` must pass with zero errors.
- `src/sim/**` and `src/data/**` MUST NOT import from `three`, `src/world/**`, or `src/ui/**`. The dependency is one-way: `sim → (nothing UI/render)`; `world`/`ui` read `sim`.
- Physics constant: `g = 9.81 m/s²`. Fixed sim timestep: `DT = 1/120 s`.
- Determinism: all *simulation* randomness flows through the seeded `mulberry32` RNG in `src/sim/rng.ts`. `Math.random()` is banned in `src/sim/**` and `src/data/**` (these must be reproducible). Cosmetic-only jitter in `src/world/**` (e.g. flame flicker) and the per-launch seed source in `src/main.ts` (`Date.now()`) may use non-seeded randomness — but the seed, once chosen, drives all sim randomness deterministically.
- Rocket roster target: ~12 models in `src/data/rockets.ts`. Motor set: Estes classes A–E in `src/data/motors.ts`.
- Coordinate convention: `y` is up (meters); ground plane is `y = groundHeight`.
- Quality gate (all must pass before "done"): `npm run test` (vitest), `npm run typecheck` (`tsc --noEmit`), `npm run build` (vite build). `npm run quality` runs all three.
- No `Math.random`, no `any` (except narrowly-justified Three.js interop), no emojis in code.

---

### Task 0: Project scaffolding and quality gate

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `.gitignore`, `src/main.ts` (stub), `src/style.css`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: working `npm run dev|build|test|typecheck|quality`; a Vite app whose `#app` canvas host exists.

- [ ] **Step 1: Write `.gitignore`**

```
node_modules/
dist/
*.local
.DS_Store
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "rkt-simulator",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "quality": "npm run typecheck && npm run test && npm run build"
  },
  "dependencies": {
    "three": "^0.169.0"
  },
  "devDependencies": {
    "@types/three": "^0.169.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

Note for implementer: before installing, verify current published versions with `npm view three version` etc. and bump the ranges if needed; keep `three` and `@types/three` on the same minor.

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["vitest/globals"],
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 4: Write `vite.config.ts` and `vitest.config.ts`**

`vite.config.ts`:
```ts
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
});
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 5: Write `index.html`, `src/style.css`, `src/main.ts` stub**

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>RKT Simulator</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/style.css`:
```css
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #app { width: 100%; height: 100%; overflow: hidden; }
body { font-family: system-ui, sans-serif; background: #0b0d12; }
canvas { display: block; }
```

`src/main.ts`:
```ts
import './style.css';

const app = document.getElementById('app');
if (app) {
  app.textContent = 'RKT Simulator — bootstrapping…';
}
```

- [ ] **Step 6: Write `tests/smoke.test.ts`**

```ts
import { describe, it, expect } from 'vitest';

describe('toolchain', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 7: Install and run the quality gate**

Run: `npm install && npm run quality`
Expected: typecheck clean, 1 test passes, `dist/` builds.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + TypeScript + Three.js + Vitest project"
```

---

### Task 1: Seeded RNG

**Files:**
- Create: `src/sim/rng.ts`
- Test: `tests/sim/rng.test.ts`

**Interfaces:**
- Produces:
  - `type Rng = () => number` — returns float in `[0, 1)`.
  - `mulberry32(seed: number): Rng`
  - `randRange(rng: Rng, min: number, max: number): number`
  - `randInt(rng: Rng, minInclusive: number, maxInclusive: number): number`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { mulberry32, randRange, randInt } from '../../src/sim/rng';

describe('mulberry32', () => {
  it('is deterministic for a fixed seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('produces values in [0, 1)', () => {
    const r = mulberry32(1);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('different seeds diverge', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it('randRange and randInt stay in bounds', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 500; i++) {
      const f = randRange(r, 5, 10);
      expect(f).toBeGreaterThanOrEqual(5);
      expect(f).toBeLessThan(10);
      const n = randInt(r, 2, 4);
      expect([2, 3, 4]).toContain(n);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/rng.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```ts
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randRange(rng: Rng, min: number, max: number): number {
  return min + (max - min) * rng();
}

export function randInt(rng: Rng, minInclusive: number, maxInclusive: number): number {
  return minInclusive + Math.floor(rng() * (maxInclusive - minInclusive + 1));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/rng.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/rng.ts tests/sim/rng.test.ts
git commit -m "feat(sim): seeded mulberry32 RNG with range helpers"
```

---

### Task 2: Core types and vector helpers

**Files:**
- Create: `src/sim/types.ts`, `src/sim/vec.ts`
- Test: `tests/sim/vec.test.ts`

**Interfaces:**
- Produces (`types.ts`): `Vec3`, `Motor`, `RocketLook`, `Rocket`, `FlightPhase`, `Outcome`, `FlightState`, `EnvParams`, `Wind`, `ChallengeConfig`, `ChallengeResult`, `SimConfig`, `FlightSummary`.
- Produces (`vec.ts`): `vec(x,y,z)`, `add`, `sub`, `scale`, `length`, `normalize`, `horizontalDistance`. All operate on `Vec3` immutably.

- [ ] **Step 1: Write `src/sim/types.ts`** (no test; consumed by later tasks)

```ts
export interface Vec3 { x: number; y: number; z: number; }

export type MotorClass = 'A' | 'B' | 'C' | 'D' | 'E';

export interface Motor {
  id: string;
  class: MotorClass;
  totalImpulseNs: number;
  avgThrustN: number;
  burnTimeS: number;
  massTotalKg: number;
  massPropKg: number;
  delayS: number;
}

export interface RocketLook {
  bodyLengthM: number;
  finCount: number;
  bodyColor: number;
  finColor: number;
  noseColor: number;
}

export interface Rocket {
  id: string;
  name: string;
  massEmptyKg: number;
  diameterM: number;
  dragCoefficient: number;
  chuteDiameterM: number;
  chuteCd: number;
  recommendedMotors: string[];
  maxMotorImpulseNs: number;
  look: RocketLook;
}

export type FlightPhase =
  | 'idle' | 'boost' | 'coast' | 'apogee' | 'descent' | 'landed' | 'failed';

export type Outcome = 'nominal' | 'cato' | 'chute-fail' | 'tip-off';

export interface Wind { base: Vec3; gust: number; }

export interface FlightState {
  time: number;
  position: Vec3;
  velocity: Vec3;
  mass: number;
  phase: FlightPhase;
  outcome: Outcome | null;
  apogee: number;
  maxSpeed: number;
  chuteDeployed: boolean;
}

export interface EnvParams {
  groundHeight: number;
  wind: Wind;
  bounds: { radius: number };
  targetZone?: { center: Vec3; radius: number };
}

export type ChallengeType = 'none' | 'target-altitude' | 'landing-zone';

export interface ChallengeConfig {
  type: ChallengeType;
  targetAltitudeM?: number;
  toleranceM?: number;
}

export interface ChallengeResult { score: number; detail: string; }

export interface SimConfig {
  rocket: Rocket;
  motor: Motor;
  environment: EnvParams;
  seed: number;
  challenge: ChallengeConfig;
}

export interface FlightSummary {
  apogee: number;
  maxSpeed: number;
  flightTime: number;
  outcome: Outcome;
  driftDistanceM: number;
  challenge?: ChallengeResult;
}
```

- [ ] **Step 2: Write the failing test for `vec.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { vec, add, sub, scale, length, normalize, horizontalDistance } from '../../src/sim/vec';

describe('vec', () => {
  it('adds and subtracts', () => {
    expect(add(vec(1, 2, 3), vec(4, 5, 6))).toEqual(vec(5, 7, 9));
    expect(sub(vec(4, 5, 6), vec(1, 2, 3))).toEqual(vec(3, 3, 3));
  });
  it('scales and measures length', () => {
    expect(scale(vec(1, 2, 3), 2)).toEqual(vec(2, 4, 6));
    expect(length(vec(3, 4, 0))).toBe(5);
  });
  it('normalizes and handles zero', () => {
    expect(length(normalize(vec(0, 5, 0)))).toBeCloseTo(1);
    expect(normalize(vec(0, 0, 0))).toEqual(vec(0, 0, 0));
  });
  it('computes horizontal distance ignoring y', () => {
    expect(horizontalDistance(vec(0, 100, 0), vec(3, 0, 4))).toBe(5);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/sim/vec.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Write `src/sim/vec.ts`**

```ts
import type { Vec3 } from './types';

export const vec = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 => vec(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: Vec3, b: Vec3): Vec3 => vec(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a: Vec3, s: number): Vec3 => vec(a.x * s, a.y * s, a.z * s);
export const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);

export function normalize(a: Vec3): Vec3 {
  const len = length(a);
  return len === 0 ? vec(0, 0, 0) : scale(a, 1 / len);
}

export function horizontalDistance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/sim/vec.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/sim/types.ts src/sim/vec.ts tests/sim/vec.test.ts
git commit -m "feat(sim): core types and immutable Vec3 helpers"
```

---

### Task 3: Thrust curve (impulse conservation)

**Files:**
- Create: `src/sim/thrustCurve.ts`
- Test: `tests/sim/thrustCurve.test.ts`

**Interfaces:**
- Consumes: `Motor` from `types.ts`.
- Produces:
  - `thrustAt(motor: Motor, t: number): number` — instantaneous thrust (N) at time `t` seconds since ignition; `0` for `t < 0` or `t > burnTimeS`.
  - `integrateImpulse(motor: Motor, dt?: number): number` — numerically integrates `thrustAt` over the burn; used by tests and sanity checks.

The curve shape: rise over the first 15% of burn to a peak, sustain, taper over
the last 25% to zero. A single scale factor `k` multiplies the shape so that the
integral equals `motor.totalImpulseNs`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { thrustAt, integrateImpulse } from '../../src/sim/thrustCurve';
import type { Motor } from '../../src/sim/types';

const c6: Motor = {
  id: 'C6-5', class: 'C', totalImpulseNs: 10, avgThrustN: 6, burnTimeS: 1.6,
  massTotalKg: 0.0258, massPropKg: 0.0108, delayS: 5,
};

describe('thrustCurve', () => {
  it('is zero outside the burn window', () => {
    expect(thrustAt(c6, -0.1)).toBe(0);
    expect(thrustAt(c6, c6.burnTimeS + 0.1)).toBe(0);
  });
  it('is non-negative throughout the burn', () => {
    for (let t = 0; t <= c6.burnTimeS; t += 0.01) {
      expect(thrustAt(c6, t)).toBeGreaterThanOrEqual(0);
    }
  });
  it('conserves total impulse within 1%', () => {
    const impulse = integrateImpulse(c6);
    expect(impulse).toBeCloseTo(c6.totalImpulseNs, 1);
    expect(Math.abs(impulse - c6.totalImpulseNs) / c6.totalImpulseNs).toBeLessThan(0.01);
  });
  it('has a peak thrust above the average', () => {
    let peak = 0;
    for (let t = 0; t <= c6.burnTimeS; t += 0.005) peak = Math.max(peak, thrustAt(c6, t));
    expect(peak).toBeGreaterThan(c6.avgThrustN);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/thrustCurve.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/sim/thrustCurve.ts`**

```ts
import type { Motor } from './types';

const RISE_FRAC = 0.15;
const TAPER_FRAC = 0.25;

// Unscaled shape in [0, 1]: linear rise, flat sustain, linear taper.
function shape(tNorm: number): number {
  if (tNorm <= 0 || tNorm >= 1) return 0;
  if (tNorm < RISE_FRAC) return tNorm / RISE_FRAC;
  if (tNorm > 1 - TAPER_FRAC) return (1 - tNorm) / TAPER_FRAC;
  return 1;
}

// Analytic mean of `shape` over [0,1] (area of the trapezoid / 1).
const SHAPE_MEAN = 1 - RISE_FRAC / 2 - TAPER_FRAC / 2;

function peakThrust(motor: Motor): number {
  // avgThrust = peak * SHAPE_MEAN, but scale to totalImpulse for exactness.
  return motor.totalImpulseNs / (motor.burnTimeS * SHAPE_MEAN);
}

export function thrustAt(motor: Motor, t: number): number {
  if (t < 0 || t > motor.burnTimeS) return 0;
  return peakThrust(motor) * shape(t / motor.burnTimeS);
}

export function integrateImpulse(motor: Motor, dt = 0.001): number {
  let sum = 0;
  for (let t = 0; t < motor.burnTimeS; t += dt) {
    sum += thrustAt(motor, t + dt / 2) * dt;
  }
  return sum;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/thrustCurve.test.ts`
Expected: PASS. (`SHAPE_MEAN` scaling makes the integral analytically equal to `totalImpulseNs`; midpoint integration confirms within <1%.)

- [ ] **Step 5: Commit**

```bash
git add src/sim/thrustCurve.ts tests/sim/thrustCurve.test.ts
git commit -m "feat(sim): parametric thrust curve with impulse conservation"
```

---

### Task 4: Atmosphere and wind

**Files:**
- Create: `src/sim/atmosphere.ts`
- Test: `tests/sim/atmosphere.test.ts`

**Interfaces:**
- Consumes: `Vec3`, `Wind` from `types.ts`; `vec` from `vec.ts`; `Rng`, `randRange` from `rng.ts`.
- Produces:
  - `airDensity(altitudeM: number): number` — kg/m³, decreasing with altitude.
  - `windAt(wind: Wind, rng: Rng): Vec3` — base wind plus a gust perturbation drawn from `rng` (horizontal only, y = 0).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { airDensity, windAt } from '../../src/sim/atmosphere';
import { mulberry32 } from '../../src/sim/rng';
import { vec } from '../../src/sim/vec';

describe('atmosphere', () => {
  it('has sea-level density near 1.225 kg/m^3', () => {
    expect(airDensity(0)).toBeCloseTo(1.225, 2);
  });
  it('density decreases with altitude', () => {
    expect(airDensity(1000)).toBeLessThan(airDensity(0));
    expect(airDensity(3000)).toBeLessThan(airDensity(1000));
    expect(airDensity(3000)).toBeGreaterThan(0);
  });
  it('windAt returns horizontal vectors near the base', () => {
    const rng = mulberry32(3);
    const wind = { base: vec(2, 0, 0), gust: 1 };
    for (let i = 0; i < 100; i++) {
      const w = windAt(wind, rng);
      expect(w.y).toBe(0);
      expect(Math.abs(w.x - 2)).toBeLessThanOrEqual(1);
      expect(Math.abs(w.z)).toBeLessThanOrEqual(1);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/atmosphere.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/sim/atmosphere.ts`**

```ts
import type { Vec3, Wind } from './types';
import { vec } from './vec';
import { randRange, type Rng } from './rng';

const SEA_LEVEL_DENSITY = 1.225; // kg/m^3
const SCALE_HEIGHT = 8500;       // m, exponential atmosphere approximation

export function airDensity(altitudeM: number): number {
  const h = Math.max(0, altitudeM);
  return SEA_LEVEL_DENSITY * Math.exp(-h / SCALE_HEIGHT);
}

export function windAt(wind: Wind, rng: Rng): Vec3 {
  const gx = randRange(rng, -wind.gust, wind.gust);
  const gz = randRange(rng, -wind.gust, wind.gust);
  return vec(wind.base.x + gx, 0, wind.base.z + gz);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/atmosphere.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/atmosphere.ts tests/sim/atmosphere.test.ts
git commit -m "feat(sim): exponential atmosphere and gusty wind model"
```

---

### Task 5: Integrator (forces + step)

**Files:**
- Create: `src/sim/integrator.ts`
- Test: `tests/sim/integrator.test.ts`

**Interfaces:**
- Consumes: `Vec3` from `types.ts`; vector helpers; `airDensity` from `atmosphere.ts`.
- Produces:
  - `G = 9.81`
  - `interface StepInput { position: Vec3; velocity: Vec3; mass: number; thrustN: number; refArea: number; dragCoefficient: number; wind: Vec3; dt: number; }`
  - `stepMotion(input: StepInput): { position: Vec3; velocity: Vec3 }` — one semi-implicit Euler step. Thrust acts along `+y` while `thrustN > 0` (guide-rail assumption for boost); drag opposes air-relative velocity; gravity is `-G·mass`.

The apogee validation isolates the integrator: constant thrust, no drag
(`refArea = 0`), no mass loss — comparable to closed-form kinematics.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { stepMotion, G, type StepInput } from '../../src/sim/integrator';
import { vec } from '../../src/sim/vec';

function simulateNoDragConstantThrust(mass: number, thrustN: number, burnTimeS: number) {
  const dt = 1 / 240;
  let position = vec(0, 0, 0);
  let velocity = vec(0, 0, 0);
  let apogee = 0;
  for (let t = 0; t < 60; t += dt) {
    const thrust = t < burnTimeS ? thrustN : 0;
    const base: StepInput = {
      position, velocity, mass, thrustN: thrust, refArea: 0,
      dragCoefficient: 0, wind: vec(0, 0, 0), dt,
    };
    const next = stepMotion(base);
    position = next.position;
    velocity = next.velocity;
    apogee = Math.max(apogee, position.y);
    if (t > burnTimeS && velocity.y < 0 && position.y <= 0) break;
  }
  return apogee;
}

describe('integrator', () => {
  it('matches closed-form no-drag apogee within 2%', () => {
    const mass = 0.1, thrustN = 10, burnTimeS = 1;
    const a = thrustN / mass - G;            // 90.19 m/s^2
    const vBurnout = a * burnTimeS;          // 90.19 m/s
    const hBurnout = 0.5 * a * burnTimeS * burnTimeS;
    const expected = hBurnout + (vBurnout * vBurnout) / (2 * G);
    const apogee = simulateNoDragConstantThrust(mass, thrustN, burnTimeS);
    expect(Math.abs(apogee - expected) / expected).toBeLessThan(0.02);
  });

  it('drag reduces apogee versus no drag', () => {
    const dt = 1 / 240;
    const run = (refArea: number) => {
      let position = vec(0, 0, 0), velocity = vec(0, 200, 0), apogee = 0;
      for (let t = 0; t < 60; t += dt) {
        const next = stepMotion({
          position, velocity, mass: 0.1, thrustN: 0, refArea,
          dragCoefficient: 0.75, wind: vec(0, 0, 0), dt,
        });
        position = next.position; velocity = next.velocity;
        apogee = Math.max(apogee, position.y);
        if (velocity.y < 0) break;
      }
      return apogee;
    };
    expect(run(0.002)).toBeLessThan(run(0));
  });

  it('wind induces horizontal drift', () => {
    const next = stepMotion({
      position: vec(0, 100, 0), velocity: vec(0, 0, 0), mass: 0.1,
      thrustN: 0, refArea: 0.002, dragCoefficient: 0.75,
      wind: vec(5, 0, 0), dt: 1 / 120,
    });
    expect(next.velocity.x).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/integrator.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/sim/integrator.ts`**

```ts
import type { Vec3 } from './types';
import { vec, add, sub, scale, length } from './vec';
import { airDensity } from './atmosphere';

export const G = 9.81;

export interface StepInput {
  position: Vec3;
  velocity: Vec3;
  mass: number;
  thrustN: number;
  refArea: number;
  dragCoefficient: number;
  wind: Vec3;
  dt: number;
}

export function stepMotion(input: StepInput): { position: Vec3; velocity: Vec3 } {
  const { position, velocity, mass, thrustN, refArea, dragCoefficient, wind, dt } = input;

  // Air-relative velocity for drag.
  const airVel = sub(velocity, wind);
  const speed = length(airVel);
  const rho = airDensity(position.y);
  const dragMag = 0.5 * rho * speed * speed * dragCoefficient * refArea;
  const dragForce = speed > 0 ? scale(airVel, -dragMag / speed) : vec(0, 0, 0);

  const thrustForce = vec(0, thrustN, 0);
  const gravityForce = vec(0, -G * mass, 0);
  const netForce = add(add(thrustForce, gravityForce), dragForce);

  const accel = scale(netForce, 1 / mass);

  // Semi-implicit Euler: update velocity, then position with new velocity.
  const newVelocity = add(velocity, scale(accel, dt));
  const newPosition = add(position, scale(newVelocity, dt));
  return { position: newPosition, velocity: newVelocity };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/integrator.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/integrator.ts tests/sim/integrator.test.ts
git commit -m "feat(sim): semi-implicit Euler integrator with thrust, drag, gravity, wind"
```

---

### Task 6: Flight state machine and Simulation

**Files:**
- Create: `src/sim/flight.ts`, `src/sim/simulation.ts`
- Test: `tests/sim/flight.test.ts`, `tests/sim/simulation.test.ts`

**Interfaces:**
- Consumes: types; `thrustAt`; `stepMotion`, `G`; `windAt`; `vec`, helpers; `Rng`, `mulberry32`.
- Produces:
  - `src/sim/flight.ts`:
    - `initialFlightState(config: SimConfig): FlightState` — pad state, `phase: 'idle'`.
    - `advancePhase(state: FlightState, motor: Motor): FlightPhase` — pure phase decision given current state (does not move the rocket).
  - `src/sim/simulation.ts`:
    - `class Simulation { constructor(config: SimConfig); readonly state: FlightState; step(): void; get done(): boolean; summary(): FlightSummary; }`
    - `step()` advances one `DT` tick: computes thrust from elapsed time, current mass (empty + motor − burned propellant), reference area (body or chute), calls `stepMotion`, updates phase/apogee/maxSpeed, clamps to ground, sets `landed`. Outcome effects (Task 7) are layered in via `applyOutcome`.
    - `export const DT = 1 / 120;`

`refArea` for body = `π·(diameterM/2)²`. Chute area = `π·(chuteDiameterM/2)²`
using `chuteCd` once deployed.

- [ ] **Step 1: Write the failing test for `flight.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { initialFlightState } from '../../src/sim/flight';
import { makeTestConfig } from './fixtures';

describe('flight', () => {
  it('starts idle on the pad at ground height', () => {
    const config = makeTestConfig();
    const s = initialFlightState(config);
    expect(s.phase).toBe('idle');
    expect(s.position.y).toBe(config.environment.groundHeight);
    expect(s.mass).toBeCloseTo(config.rocket.massEmptyKg + config.motor.massTotalKg);
  });
});
```

- [ ] **Step 2: Write the shared test fixture**

Create `tests/sim/fixtures.ts`:
```ts
import type { SimConfig, Rocket, Motor } from '../../src/sim/types';
import { vec } from '../../src/sim/vec';

export const testRocket: Rocket = {
  id: 'test', name: 'Test', massEmptyKg: 0.05, diameterM: 0.024,
  dragCoefficient: 0.75, chuteDiameterM: 0.3, chuteCd: 1.2,
  recommendedMotors: ['C6-5'], maxMotorImpulseNs: 12,
  look: { bodyLengthM: 0.3, finCount: 3, bodyColor: 0xffffff, finColor: 0xff0000, noseColor: 0x222222 },
};

export const testMotor: Motor = {
  id: 'C6-5', class: 'C', totalImpulseNs: 10, avgThrustN: 6, burnTimeS: 1.6,
  massTotalKg: 0.0258, massPropKg: 0.0108, delayS: 5,
};

export function makeTestConfig(overrides: Partial<SimConfig> = {}): SimConfig {
  return {
    rocket: testRocket,
    motor: testMotor,
    environment: { groundHeight: 0, wind: { base: vec(0, 0, 0), gust: 0 }, bounds: { radius: 500 } },
    seed: 123,
    challenge: { type: 'none' },
    ...overrides,
  };
}
```

- [ ] **Step 3: Run flight test to verify it fails**

Run: `npx vitest run tests/sim/flight.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Write `src/sim/flight.ts`**

```ts
import type { FlightState, FlightPhase, Motor, SimConfig } from './types';
import { vec } from './vec';

export function initialFlightState(config: SimConfig): FlightState {
  return {
    time: 0,
    position: vec(0, config.environment.groundHeight, 0),
    velocity: vec(0, 0, 0),
    mass: config.rocket.massEmptyKg + config.motor.massTotalKg,
    phase: 'idle',
    outcome: null,
    apogee: 0,
    maxSpeed: 0,
    chuteDeployed: false,
  };
}

export function advancePhase(state: FlightState, motor: Motor): FlightPhase {
  const burning = state.time <= motor.burnTimeS;
  switch (state.phase) {
    case 'boost':
      return burning ? 'boost' : 'coast';
    case 'coast':
      return state.velocity.y <= 0 ? 'apogee' : 'coast';
    case 'apogee':
      return 'descent';
    default:
      return state.phase;
  }
}
```

- [ ] **Step 5: Run flight test to verify it passes**

Run: `npx vitest run tests/sim/flight.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing test for `simulation.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { Simulation } from '../../src/sim/simulation';
import { makeTestConfig } from './fixtures';

function runToCompletion(sim: Simulation, maxSteps = 200000): void {
  let n = 0;
  sim.step(); // leaves 'idle' -> 'boost' on first tick
  while (!sim.done && n < maxSteps) { sim.step(); n++; }
}

describe('Simulation', () => {
  it('passes through boost, coast, apogee, descent, landed in order', () => {
    const sim = new Simulation(makeTestConfig());
    const seen = new Set<string>();
    sim.step();
    seen.add(sim.state.phase);
    let n = 0;
    while (!sim.done && n < 200000) { sim.step(); seen.add(sim.state.phase); n++; }
    for (const phase of ['boost', 'coast', 'apogee', 'descent', 'landed']) {
      expect(seen.has(phase)).toBe(true);
    }
  });

  it('reaches a plausible apogee for a C6 on a light rocket', () => {
    const sim = new Simulation(makeTestConfig());
    runToCompletion(sim);
    expect(sim.state.apogee).toBeGreaterThan(30);
    expect(sim.state.apogee).toBeLessThan(600);
  });

  it('lands back near ground height', () => {
    const sim = new Simulation(makeTestConfig());
    runToCompletion(sim);
    expect(sim.state.phase).toBe('landed');
    expect(sim.state.position.y).toBeCloseTo(0, 1);
  });

  it('is deterministic for a fixed seed', () => {
    const a = new Simulation(makeTestConfig({ seed: 9 }));
    const b = new Simulation(makeTestConfig({ seed: 9 }));
    runToCompletion(a); runToCompletion(b);
    expect(a.state.apogee).toBe(b.state.apogee);
    expect(a.summary().driftDistanceM).toBe(b.summary().driftDistanceM);
  });

  it('bigger total impulse yields higher apogee', () => {
    const small = new Simulation(makeTestConfig());
    const bigMotor = { ...makeTestConfig().motor, totalImpulseNs: 20, avgThrustN: 12 };
    const big = new Simulation(makeTestConfig({ motor: bigMotor }));
    runToCompletion(small); runToCompletion(big);
    expect(big.state.apogee).toBeGreaterThan(small.state.apogee);
  });
});
```

- [ ] **Step 7: Run simulation test to verify it fails**

Run: `npx vitest run tests/sim/simulation.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 8: Write `src/sim/simulation.ts`**

```ts
import type { SimConfig, FlightState, FlightSummary, Vec3 } from './types';
import { initialFlightState, advancePhase } from './flight';
import { thrustAt } from './thrustCurve';
import { stepMotion } from './integrator';
import { windAt } from './atmosphere';
import { vec, horizontalDistance, length } from './vec';
import { mulberry32, type Rng } from './rng';
import { applyOutcome } from './outcomes';

export const DT = 1 / 120;

export class Simulation {
  readonly state: FlightState;
  private readonly config: SimConfig;
  private readonly rng: Rng;
  private readonly launchPos: Vec3;

  constructor(config: SimConfig) {
    this.config = config;
    this.rng = mulberry32(config.seed);
    this.state = initialFlightState(config);
    this.launchPos = { ...this.state.position };
  }

  get done(): boolean {
    return this.state.phase === 'landed' || this.state.phase === 'failed';
  }

  step(): void {
    if (this.done) return;
    const s = this.state;
    const { rocket, motor, environment } = this.config;

    if (s.phase === 'idle') {
      s.phase = 'boost';
      applyOutcome(s, this.config, this.rng, 'ignition');
      if (s.phase === 'failed') return;
    }

    s.time += DT;

    const thrustN = s.phase === 'boost' ? thrustAt(motor, s.time) : 0;
    const burnedProp = motor.massPropKg * Math.min(1, s.time / motor.burnTimeS);
    s.mass = rocket.massEmptyKg + motor.massTotalKg - burnedProp;

    const useChute = s.chuteDeployed;
    const refArea = useChute
      ? Math.PI * (rocket.chuteDiameterM / 2) ** 2
      : Math.PI * (rocket.diameterM / 2) ** 2;
    const cd = useChute ? rocket.chuteCd : rocket.dragCoefficient;

    const next = stepMotion({
      position: s.position, velocity: s.velocity, mass: s.mass,
      thrustN, refArea, dragCoefficient: cd,
      wind: windAt(environment.wind, this.rng), dt: DT,
    });
    s.position = next.position;
    s.velocity = next.velocity;

    s.apogee = Math.max(s.apogee, s.position.y - environment.groundHeight);
    s.maxSpeed = Math.max(s.maxSpeed, length(s.velocity));

    const nextPhase = advancePhase(s, motor);
    if (nextPhase !== s.phase) {
      s.phase = nextPhase;
      if (s.phase === 'apogee') applyOutcome(s, this.config, this.rng, 'apogee');
    }

    if (s.position.y <= environment.groundHeight) {
      s.position = vec(s.position.x, environment.groundHeight, s.position.z);
      s.velocity = vec(0, 0, 0);
      if (s.phase !== 'failed') s.phase = 'landed';
      if (s.outcome === null) s.outcome = 'nominal';
    }
  }

  summary(): FlightSummary {
    const s = this.state;
    return {
      apogee: s.apogee,
      maxSpeed: s.maxSpeed,
      flightTime: s.time,
      outcome: s.outcome ?? 'nominal',
      driftDistanceM: horizontalDistance(this.launchPos, s.position),
    };
  }
}
```

- [ ] **Step 9: Run simulation test to verify it passes**

Run: `npx vitest run tests/sim/simulation.test.ts`
Expected: PASS. (Depends on `applyOutcome` from Task 7 — implement Task 7 in the same working session; the import must resolve. If executing strictly task-by-task, create a temporary no-op `applyOutcome` in Task 6 and replace it in Task 7. Recommended: implement Task 7 immediately after Step 8 here, then run Step 9.)

- [ ] **Step 10: Commit**

```bash
git add src/sim/flight.ts src/sim/simulation.ts tests/sim/flight.test.ts tests/sim/simulation.test.ts tests/sim/fixtures.ts
git commit -m "feat(sim): flight state machine and fixed-step Simulation"
```

---

### Task 7: Outcomes (nominal / CATO / chute-fail / tip-off)

**Files:**
- Create: `src/sim/outcomes.ts`
- Test: `tests/sim/outcomes.test.ts`

**Interfaces:**
- Consumes: `FlightState`, `SimConfig`, `Outcome`; `Rng`; `vec`, `scale`.
- Produces:
  - `type DecisionPoint = 'ignition' | 'apogee'`
  - `applyOutcome(state: FlightState, config: SimConfig, rng: Rng, point: DecisionPoint): void`
    - At `ignition`: compute thrust-to-weight from `motor.avgThrustN / (mass·G)`. If `< 1.2`, chance of `tip-off` (angled velocity kick, continues flight). If `motor.totalImpulseNs > rocket.maxMotorImpulseNs`, high chance of `cato` → sets `phase='failed'`, `outcome='cato'`.
    - At `apogee`: roll chute deployment. If it deploys, set `chuteDeployed=true`. Else `outcome='chute-fail'` (ballistic; chute stays false). Base chute-fail probability small; higher when `chuteDiameterM === 0`.
  - `catoProbability(config): number`, `chuteFailProbability(config): number`, `tipOffProbability(config): number` — exported pure helpers for testing.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { applyOutcome, catoProbability, chuteFailProbability } from '../../src/sim/outcomes';
import { initialFlightState } from '../../src/sim/flight';
import { mulberry32 } from '../../src/sim/rng';
import { makeTestConfig } from './fixtures';

describe('outcomes', () => {
  it('CATO probability rises when motor impulse exceeds the rocket limit', () => {
    const safe = makeTestConfig();
    const overloaded = makeTestConfig({
      motor: { ...makeTestConfig().motor, totalImpulseNs: 30 },
    });
    expect(catoProbability(overloaded)).toBeGreaterThan(catoProbability(safe));
  });

  it('an overloaded motor eventually CATOs across seeds', () => {
    let catos = 0;
    for (let seed = 0; seed < 50; seed++) {
      const config = makeTestConfig({
        seed, motor: { ...makeTestConfig().motor, totalImpulseNs: 40 },
      });
      const s = initialFlightState(config);
      applyOutcome(s, config, mulberry32(seed), 'ignition');
      if (s.outcome === 'cato') catos++;
    }
    expect(catos).toBeGreaterThan(0);
  });

  it('deploys the chute at apogee in the nominal case', () => {
    const config = makeTestConfig({ seed: 1 });
    const s = initialFlightState(config);
    s.phase = 'apogee';
    applyOutcome(s, config, mulberry32(1), 'apogee');
    // With a healthy chute, most seeds deploy; assert no chute-fail set falsely.
    expect(['nominal', null]).toContain(s.outcome);
  });

  it('tumble-recovery rockets have higher chute-fail probability', () => {
    const withChute = makeTestConfig();
    const tumble = makeTestConfig({
      rocket: { ...makeTestConfig().rocket, chuteDiameterM: 0 },
    });
    expect(chuteFailProbability(tumble)).toBeGreaterThan(chuteFailProbability(withChute));
  });

  it('is deterministic for a fixed seed', () => {
    const config = makeTestConfig({ seed: 5, motor: { ...makeTestConfig().motor, totalImpulseNs: 40 } });
    const a = initialFlightState(config); applyOutcome(a, config, mulberry32(5), 'ignition');
    const b = initialFlightState(config); applyOutcome(b, config, mulberry32(5), 'ignition');
    expect(a.outcome).toBe(b.outcome);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/outcomes.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/sim/outcomes.ts`**

```ts
import type { FlightState, SimConfig } from './types';
import { G } from './integrator';
import type { Rng } from './rng';

export type DecisionPoint = 'ignition' | 'apogee';

const BASE_CHUTE_FAIL = 0.04;
const TUMBLE_CHUTE_FAIL = 0.15;
const BASE_TIPOFF = 0.05;

export function catoProbability(config: SimConfig): number {
  const { motor, rocket } = config;
  const overload = motor.totalImpulseNs / rocket.maxMotorImpulseNs;
  if (overload <= 1) return 0.01; // small baseline
  return Math.min(0.9, 0.01 + (overload - 1) * 0.8);
}

export function chuteFailProbability(config: SimConfig): number {
  return config.rocket.chuteDiameterM === 0 ? TUMBLE_CHUTE_FAIL : BASE_CHUTE_FAIL;
}

export function tipOffProbability(config: SimConfig): number {
  const { motor, rocket } = config;
  const liftoffMass = rocket.massEmptyKg + motor.massTotalKg;
  const twr = motor.avgThrustN / (liftoffMass * G);
  return twr < 1.2 ? BASE_TIPOFF + (1.2 - twr) * 0.3 : 0;
}

export function applyOutcome(
  state: FlightState, config: SimConfig, rng: Rng, point: DecisionPoint,
): void {
  if (point === 'ignition') {
    if (rng() < catoProbability(config)) {
      state.phase = 'failed';
      state.outcome = 'cato';
      return;
    }
    if (rng() < tipOffProbability(config)) {
      state.outcome = 'tip-off';
      // Angled kick: bleed some vertical energy into horizontal.
      state.velocity = { x: 2, y: state.velocity.y, z: 1 };
    }
    return;
  }
  // apogee
  if (rng() < chuteFailProbability(config)) {
    if (state.outcome === null) state.outcome = 'chute-fail';
    state.chuteDeployed = false;
  } else {
    state.chuteDeployed = config.rocket.chuteDiameterM > 0;
    if (state.outcome === null) state.outcome = 'nominal';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/outcomes.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full sim suite (verifies Task 6 Step 9 import)**

Run: `npx vitest run tests/sim`
Expected: PASS (all sim tests green now that `applyOutcome` exists).

- [ ] **Step 6: Commit**

```bash
git add src/sim/outcomes.ts tests/sim/outcomes.test.ts
git commit -m "feat(sim): failure outcomes (CATO, chute-fail, tip-off) with seeded probabilities"
```

---

### Task 8: Challenge scoring

**Files:**
- Create: `src/sim/challenge.ts`
- Test: `tests/sim/challenge.test.ts`

**Interfaces:**
- Consumes: `ChallengeConfig`, `ChallengeResult`, `FlightSummary`, `EnvParams`, `FlightState`.
- Produces:
  - `scoreChallenge(config: ChallengeConfig, env: EnvParams, summary: FlightSummary, landing: Vec3): ChallengeResult`
    - `target-altitude`: score `100` at exact target, decaying linearly to `0` at `toleranceM` away.
    - `landing-zone`: score by how deep inside `env.targetZone` the landing is (100 at center, 0 at the edge, 0 outside).
    - `none`: score `0`, detail `'no challenge'`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { scoreChallenge } from '../../src/sim/challenge';
import { vec } from '../../src/sim/vec';
import type { FlightSummary, EnvParams } from '../../src/sim/types';

const env: EnvParams = {
  groundHeight: 0, wind: { base: vec(0, 0, 0), gust: 0 },
  bounds: { radius: 500 }, targetZone: { center: vec(50, 0, 0), radius: 20 },
};
const summary = (apogee: number): FlightSummary => ({
  apogee, maxSpeed: 100, flightTime: 20, outcome: 'nominal', driftDistanceM: 0,
});

describe('scoreChallenge', () => {
  it('scores 100 for hitting the target altitude exactly', () => {
    const r = scoreChallenge({ type: 'target-altitude', targetAltitudeM: 100, toleranceM: 50 }, env, summary(100), vec(0, 0, 0));
    expect(r.score).toBe(100);
  });
  it('scores 0 at the tolerance edge', () => {
    const r = scoreChallenge({ type: 'target-altitude', targetAltitudeM: 100, toleranceM: 50 }, env, summary(150), vec(0, 0, 0));
    expect(r.score).toBe(0);
  });
  it('scores partial within tolerance', () => {
    const r = scoreChallenge({ type: 'target-altitude', targetAltitudeM: 100, toleranceM: 50 }, env, summary(125), vec(0, 0, 0));
    expect(r.score).toBeCloseTo(50, 0);
  });
  it('scores landing at zone center as 100', () => {
    const r = scoreChallenge({ type: 'landing-zone' }, env, summary(100), vec(50, 0, 0));
    expect(r.score).toBe(100);
  });
  it('scores landing outside the zone as 0', () => {
    const r = scoreChallenge({ type: 'landing-zone' }, env, summary(100), vec(200, 0, 0));
    expect(r.score).toBe(0);
  });
  it('returns 0 for no challenge', () => {
    expect(scoreChallenge({ type: 'none' }, env, summary(100), vec(0, 0, 0)).score).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/challenge.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/sim/challenge.ts`**

```ts
import type { ChallengeConfig, ChallengeResult, EnvParams, FlightSummary, Vec3 } from './types';
import { horizontalDistance } from './vec';

export function scoreChallenge(
  config: ChallengeConfig, env: EnvParams, summary: FlightSummary, landing: Vec3,
): ChallengeResult {
  if (config.type === 'target-altitude') {
    const target = config.targetAltitudeM ?? 100;
    const tol = config.toleranceM ?? 50;
    const err = Math.abs(summary.apogee - target);
    const score = Math.max(0, Math.round(100 * (1 - err / tol)));
    return { score, detail: `apogee ${summary.apogee.toFixed(0)} m vs target ${target} m` };
  }
  if (config.type === 'landing-zone') {
    const zone = env.targetZone;
    if (!zone) return { score: 0, detail: 'no landing zone in this environment' };
    const dist = horizontalDistance(landing, zone.center);
    const score = dist >= zone.radius ? 0 : Math.round(100 * (1 - dist / zone.radius));
    return { score, detail: `landed ${dist.toFixed(0)} m from zone center` };
  }
  return { score: 0, detail: 'no challenge' };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/challenge.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/challenge.ts tests/sim/challenge.test.ts
git commit -m "feat(sim): challenge scoring for target-altitude and landing-zone"
```

---

### Task 9: Rocket and motor data

**Files:**
- Create: `src/data/motors.ts`, `src/data/rockets.ts`
- Test: `tests/data/catalog.test.ts`

**Interfaces:**
- Consumes: `Motor`, `Rocket` from `types.ts`; `integrateImpulse` (validation only).
- Produces:
  - `motors: Motor[]`, `motorById(id: string): Motor | undefined`
  - `rockets: Rocket[]`, `rocketById(id: string): Rocket | undefined`
  - `compatibleMotors(rocket: Rocket): Motor[]` — motors whose id is in `rocket.recommendedMotors`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { motors, motorById } from '../../src/data/motors';
import { rockets, rocketById, compatibleMotors } from '../../src/data/rockets';

describe('catalog', () => {
  it('has Estes classes A-E among motors', () => {
    const classes = new Set(motors.map((m) => m.class));
    for (const c of ['A', 'B', 'C', 'D', 'E']) expect(classes.has(c as any)).toBe(true);
  });
  it('every motor has positive impulse and burn time', () => {
    for (const m of motors) {
      expect(m.totalImpulseNs).toBeGreaterThan(0);
      expect(m.burnTimeS).toBeGreaterThan(0);
      expect(m.massPropKg).toBeLessThanOrEqual(m.massTotalKg);
    }
  });
  it('has at least 12 rockets with unique ids', () => {
    expect(rockets.length).toBeGreaterThanOrEqual(12);
    expect(new Set(rockets.map((r) => r.id)).size).toBe(rockets.length);
  });
  it('every rocket recommends only motors that exist', () => {
    for (const r of rockets) {
      for (const id of r.recommendedMotors) {
        expect(motorById(id), `${r.id} -> ${id}`).toBeDefined();
      }
      expect(r.recommendedMotors.length).toBeGreaterThan(0);
    }
  });
  it('compatibleMotors returns the rocket recommended motors', () => {
    const r = rockets[0];
    const ids = compatibleMotors(r).map((m) => m.id);
    expect(ids.sort()).toEqual([...r.recommendedMotors].sort());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/data/catalog.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/data/motors.ts`**

Author Estes-style motors A–E. Values approximate real Estes specs (verify plausibility; they are game data). Example set:

```ts
import type { Motor } from '../sim/types';

export const motors: Motor[] = [
  { id: 'A8-3',  class: 'A', totalImpulseNs: 2.5,  avgThrustN: 8,   burnTimeS: 0.5,  massTotalKg: 0.0162, massPropKg: 0.0032, delayS: 3 },
  { id: 'B6-4',  class: 'B', totalImpulseNs: 5.0,  avgThrustN: 6,   burnTimeS: 0.8,  massTotalKg: 0.0189, massPropKg: 0.0062, delayS: 4 },
  { id: 'C6-5',  class: 'C', totalImpulseNs: 10.0, avgThrustN: 6,   burnTimeS: 1.6,  massTotalKg: 0.0258, massPropKg: 0.0108, delayS: 5 },
  { id: 'C11-5', class: 'C', totalImpulseNs: 10.0, avgThrustN: 11,  burnTimeS: 0.9,  massTotalKg: 0.0252, massPropKg: 0.0108, delayS: 5 },
  { id: 'D12-5', class: 'D', totalImpulseNs: 20.0, avgThrustN: 12,  burnTimeS: 1.65, massTotalKg: 0.0428, massPropKg: 0.0211, delayS: 5 },
  { id: 'E12-6', class: 'E', totalImpulseNs: 30.0, avgThrustN: 12,  burnTimeS: 2.5,  massTotalKg: 0.0570, massPropKg: 0.0353, delayS: 6 },
];

export function motorById(id: string): Motor | undefined {
  return motors.find((m) => m.id === id);
}
```

- [ ] **Step 4: Write `src/data/rockets.ts`** (~12 models)

```ts
import type { Rocket, Motor } from '../sim/types';
import { motorById } from './motors';

export const rockets: Rocket[] = [
  { id: 'alpha', name: 'Alpha', massEmptyKg: 0.034, diameterM: 0.024, dragCoefficient: 0.75, chuteDiameterM: 0.30, chuteCd: 1.2, recommendedMotors: ['A8-3', 'B6-4', 'C6-5'], maxMotorImpulseNs: 12, look: { bodyLengthM: 0.31, finCount: 3, bodyColor: 0xffffff, finColor: 0xd22222, noseColor: 0x222222 } },
  { id: 'wizard', name: 'Wizard', massEmptyKg: 0.013, diameterM: 0.018, dragCoefficient: 0.7, chuteDiameterM: 0.0, chuteCd: 0.8, recommendedMotors: ['A8-3', 'B6-4', 'C6-5'], maxMotorImpulseNs: 12, look: { bodyLengthM: 0.23, finCount: 3, bodyColor: 0xffe14d, finColor: 0x2244cc, noseColor: 0x2244cc } },
  { id: 'big-bertha', name: 'Big Bertha', massEmptyKg: 0.061, diameterM: 0.041, dragCoefficient: 0.8, chuteDiameterM: 0.46, chuteCd: 1.2, recommendedMotors: ['B6-4', 'C6-5'], maxMotorImpulseNs: 12, look: { bodyLengthM: 0.61, finCount: 4, bodyColor: 0xffffff, finColor: 0x111111, noseColor: 0x111111 } },
  { id: 'der-red-max', name: 'Der Red Max', massEmptyKg: 0.074, diameterM: 0.041, dragCoefficient: 0.8, chuteDiameterM: 0.46, chuteCd: 1.2, recommendedMotors: ['C6-5', 'D12-5'], maxMotorImpulseNs: 25, look: { bodyLengthM: 0.55, finCount: 3, bodyColor: 0xb31217, finColor: 0x111111, noseColor: 0x111111 } },
  { id: 'v2', name: 'V2', massEmptyKg: 0.085, diameterM: 0.051, dragCoefficient: 0.85, chuteDiameterM: 0.46, chuteCd: 1.2, recommendedMotors: ['C11-5', 'D12-5', 'E12-6'], maxMotorImpulseNs: 32, look: { bodyLengthM: 0.43, finCount: 4, bodyColor: 0xdad4c2, finColor: 0x2b2b2b, noseColor: 0x2b2b2b } },
  { id: 'baby-bertha', name: 'Baby Bertha', massEmptyKg: 0.035, diameterM: 0.041, dragCoefficient: 0.8, chuteDiameterM: 0.30, chuteCd: 1.2, recommendedMotors: ['A8-3', 'B6-4', 'C6-5'], maxMotorImpulseNs: 12, look: { bodyLengthM: 0.29, finCount: 3, bodyColor: 0x2e8b57, finColor: 0xffd700, noseColor: 0xffd700 } },
  { id: 'hi-flier', name: 'Hi-Flier', massEmptyKg: 0.021, diameterM: 0.019, dragCoefficient: 0.7, chuteDiameterM: 0.30, chuteCd: 1.2, recommendedMotors: ['B6-4', 'C6-5'], maxMotorImpulseNs: 12, look: { bodyLengthM: 0.44, finCount: 3, bodyColor: 0xff7f00, finColor: 0x111111, noseColor: 0x111111 } },
  { id: 'crossfire-isx', name: 'Crossfire ISX', massEmptyKg: 0.031, diameterM: 0.024, dragCoefficient: 0.72, chuteDiameterM: 0.30, chuteCd: 1.2, recommendedMotors: ['A8-3', 'B6-4', 'C6-5'], maxMotorImpulseNs: 12, look: { bodyLengthM: 0.36, finCount: 4, bodyColor: 0x1f6fe0, finColor: 0xffd000, noseColor: 0xffd000 } },
  { id: 'mean-machine', name: 'Mean Machine', massEmptyKg: 0.113, diameterM: 0.033, dragCoefficient: 0.9, chuteDiameterM: 0.46, chuteCd: 1.2, recommendedMotors: ['D12-5', 'E12-6'], maxMotorImpulseNs: 32, look: { bodyLengthM: 1.78, finCount: 3, bodyColor: 0x00a651, finColor: 0xffffff, noseColor: 0xffffff } },
  { id: 'photon-probe', name: 'Photon Probe', massEmptyKg: 0.042, diameterM: 0.033, dragCoefficient: 0.78, chuteDiameterM: 0.30, chuteCd: 1.2, recommendedMotors: ['B6-4', 'C6-5', 'D12-5'], maxMotorImpulseNs: 25, look: { bodyLengthM: 0.40, finCount: 3, bodyColor: 0x8e44ad, finColor: 0x1abc9c, noseColor: 0x1abc9c } },
  { id: 'nike-smoke', name: 'Nike Smoke', massEmptyKg: 0.057, diameterM: 0.041, dragCoefficient: 0.82, chuteDiameterM: 0.46, chuteCd: 1.2, recommendedMotors: ['C6-5', 'D12-5'], maxMotorImpulseNs: 25, look: { bodyLengthM: 0.66, finCount: 4, bodyColor: 0xf5f5f5, finColor: 0xd22222, noseColor: 0xd22222 } },
  { id: 'star-orbiter', name: 'Star Orbiter', massEmptyKg: 0.091, diameterM: 0.041, dragCoefficient: 0.83, chuteDiameterM: 0.46, chuteCd: 1.2, recommendedMotors: ['D12-5', 'E12-6'], maxMotorImpulseNs: 32, look: { bodyLengthM: 0.74, finCount: 4, bodyColor: 0x0b3d91, finColor: 0xffffff, noseColor: 0xffffff } },
];

export function rocketById(id: string): Rocket | undefined {
  return rockets.find((r) => r.id === id);
}

export function compatibleMotors(rocket: Rocket): Motor[] {
  return rocket.recommendedMotors
    .map((id) => motorById(id))
    .filter((m): m is Motor => m !== undefined);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/data/catalog.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/data/motors.ts src/data/rockets.ts tests/data/catalog.test.ts
git commit -m "feat(data): Estes-style motor and rocket catalog"
```

---

### Task 10: Environment definitions (pure params) + registry

**Files:**
- Create: `src/world/environments/types.ts`, `src/world/environments/params.ts`, `src/world/environments/index.ts`
- Test: `tests/world/environmentParams.test.ts`

Note: only the **params** logic is tested here (pure, no Three.js). The mesh
`build()` functions come in Task 11. `params.ts` imports no Three.js.

**Interfaces:**
- Consumes: `EnvParams`, `Wind`, `Vec3`; `Rng`, `mulberry32`, `randRange`; `vec`.
- Produces:
  - `src/world/environments/types.ts`:
    - `interface EnvironmentDef { id: string; name: string; funny: boolean; makeParams(rng: Rng): EnvParams; build(ctx: BuildContext, params: EnvParams, rng: Rng): void; }`
    - `interface BuildContext { scene: THREE.Scene; root: THREE.Group; }` — builders add all meshes/lights to `root` (cleared between launches) and set `scene.background` directly. Three types imported type-only.
  - `src/world/environments/params.ts`:
    - `makeParamsFor(id: string, seed: number): EnvParams` — dispatches to each env's param maker; used by tests and by the app.
    - one exported param-maker per environment id, e.g. `parkParams(rng)`, `seaParams(rng)`, etc.
  - `src/world/environments/index.ts`: `environments: EnvironmentDef[]`, `environmentById(id)`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { makeParamsFor } from '../../src/world/environments/params';

const IDS = ['park', 'urban', 'mountain', 'desert', 'sea', 'rooftop', 'bathtub', 'backyard-dog'];

describe('environment params', () => {
  it('produces params for every environment id', () => {
    for (const id of IDS) {
      const p = makeParamsFor(id, 1);
      expect(p.bounds.radius).toBeGreaterThan(0);
      expect(Number.isFinite(p.groundHeight)).toBe(true);
      expect(p.wind.gust).toBeGreaterThanOrEqual(0);
    }
  });
  it('is deterministic for a fixed seed', () => {
    expect(makeParamsFor('sea', 7)).toEqual(makeParamsFor('sea', 7));
  });
  it('different seeds can differ', () => {
    const a = makeParamsFor('urban', 1);
    const b = makeParamsFor('urban', 2);
    expect(a).not.toEqual(b);
  });
  it('sea has stronger base wind than desert', () => {
    const seaWind = Math.hypot(makeParamsFor('sea', 3).wind.base.x, makeParamsFor('sea', 3).wind.base.z);
    const desertWind = Math.hypot(makeParamsFor('desert', 3).wind.base.x, makeParamsFor('desert', 3).wind.base.z);
    expect(seaWind).toBeGreaterThan(desertWind);
  });
  it('landing-zone environments expose a target zone', () => {
    expect(makeParamsFor('park', 1).targetZone).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/environmentParams.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/world/environments/params.ts`**

```ts
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
```

Note: `sea` base wind min (5) exceeds `desert` max (2), so the "sea windier than
desert" test holds for every seed.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/environmentParams.test.ts`
Expected: PASS.

- [ ] **Step 5: Write `src/world/environments/types.ts` and a stub `index.ts`**

`types.ts`:
```ts
import type * as THREE from 'three';
import type { EnvParams } from '../../sim/types';
import type { Rng } from '../../sim/rng';

export interface BuildContext { scene: THREE.Scene; root: THREE.Group; }

export interface EnvironmentDef {
  id: string;
  name: string;
  funny: boolean;
  makeParams(rng: Rng): EnvParams;
  build(ctx: BuildContext, params: EnvParams, rng: Rng): void;
}
```

`index.ts` (populated in Task 11; start with an empty typed array to keep the app compiling):
```ts
import type { EnvironmentDef } from './types';

export const environments: EnvironmentDef[] = [];

export function environmentById(id: string): EnvironmentDef | undefined {
  return environments.find((e) => e.id === id);
}
```

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck && npx vitest run tests/world/environmentParams.test.ts`
Expected: clean + PASS.

```bash
git add src/world/environments tests/world/environmentParams.test.ts
git commit -m "feat(world): environment param generators (pure, seeded)"
```

---

### Task 11: Environment meshes + registry population (rendering)

**Files:**
- Create: `src/world/environments/build.ts` (mesh builders), update `src/world/environments/index.ts`
- Verify: via typecheck + build + later CDP smoke (no unit test — rendering)

**Interfaces:**
- Consumes: `three`, `BuildContext`, `EnvironmentDef`, the param makers.
- Produces: one `EnvironmentDef` per id, wired into `environments[]`. Each `build()` adds a ground plane, sky/background color, lights, and a few low-poly props characteristic of the environment; funny ones add a themed prop (a giant rubber duck for `bathtub`, a dog mesh for `backyard-dog`).

- [ ] **Step 1: Write `src/world/environments/build.ts`**

Provide a shared helper and per-environment builders. Keep meshes low-poly and cheap. Example (abbreviated but complete for two environments; implement all eight following the same pattern):

```ts
import * as THREE from 'three';
import type { BuildContext, EnvironmentDef } from './types';
import type { EnvParams } from '../../sim/types';
import { randRange, type Rng } from '../../sim/rng';
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

function base(ctx: BuildContext, params: EnvParams, groundColor: number, sky: number): void {
  ctx.scene.background = new THREE.Color(sky);
  addLights(ctx.root);
  const ground = groundDisc(params.bounds.radius, groundColor);
  ground.position.y = params.groundHeight;
  ctx.root.add(ground);
  markTargetZone(ctx.root, params);
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

function park(ctx: BuildContext, params: EnvParams, rng: Rng): void {
  base(ctx, params, 0x4a8f3c, 0x87ceeb);
  for (let i = 0; i < 40; i++) {
    const r = randRange(rng, 20, params.bounds.radius * 0.9);
    const a = randRange(rng, 0, Math.PI * 2);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const trunk = box(1, 4, 1, 0x6b4423, x, params.groundHeight + 2, z);
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(3, 6, 6), new THREE.MeshLambertMaterial({ color: 0x2e7d32 }));
    leaves.position.set(x, params.groundHeight + 7, z);
    ctx.root.add(trunk, leaves);
  }
}

function bathtub(ctx: BuildContext, params: EnvParams, _rng: Rng): void {
  base(ctx, params, 0x3aa0d0, 0xbfe9ff);
  const duck = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 12), new THREE.MeshLambertMaterial({ color: 0xffe14d }));
  duck.position.set(0, params.groundHeight + 3, -15);
  ctx.root.add(duck);
}

// ... implement urban, mountain, desert, sea, rooftop, backyard-dog similarly ...

export const environmentDefs: EnvironmentDef[] = [
  { id: 'park', name: 'Park', funny: false, makeParams: P.parkParams, build: park },
  { id: 'bathtub', name: 'Giant Bathtub', funny: true, makeParams: P.bathtubParams, build: bathtub },
  // ... the remaining six ...
];
```

Implementer note: implement all eight builders (park, urban, mountain, desert,
sea, rooftop, bathtub, backyard-dog). Reuse `base`, `box`, `groundDisc`,
`markTargetZone`. Keep each under ~30 lines. Do not exceed a few hundred meshes
total per environment.

- [ ] **Step 2: Populate the registry in `index.ts`**

```ts
import type { EnvironmentDef } from './types';
import { environmentDefs } from './build';

export const environments: EnvironmentDef[] = environmentDefs;

export function environmentById(id: string): EnvironmentDef | undefined {
  return environments.find((e) => e.id === id);
}
```

- [ ] **Step 3: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/world/environments
git commit -m "feat(world): low-poly procedural environment meshes and registry"
```

---

### Task 12: Rocket mesh builder (rendering)

**Files:**
- Create: `src/world/rocketMesh.ts`
- Verify: typecheck + build (+ CDP later)

**Interfaces:**
- Consumes: `three`, `Rocket`/`RocketLook`.
- Produces: `buildRocketMesh(rocket: Rocket): THREE.Group` — a low-poly rocket (body cylinder, nose cone, `finCount` fins) scaled to look right; oriented along `+y`. Also `buildParachute(): THREE.Mesh` and `buildFlame(): THREE.Mesh` reused by effects.

- [ ] **Step 1: Write `src/world/rocketMesh.ts`**

```ts
import * as THREE from 'three';
import type { Rocket } from '../sim/types';

export function buildRocketMesh(rocket: Rocket): THREE.Group {
  const g = new THREE.Group();
  const L = rocket.look;
  // Exaggerate diameter for visibility (rockets are thin at real scale).
  const radius = Math.max(0.4, rocket.diameterM * 12);
  const bodyLen = Math.max(3, L.bodyLengthM * 8);

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, bodyLen, 12),
    new THREE.MeshLambertMaterial({ color: L.bodyColor }),
  );
  body.position.y = bodyLen / 2;
  g.add(body);

  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(radius, radius * 3, 12),
    new THREE.MeshLambertMaterial({ color: L.noseColor }),
  );
  nose.position.y = bodyLen + radius * 1.5;
  g.add(nose);

  const finMat = new THREE.MeshLambertMaterial({ color: L.finColor, side: THREE.DoubleSide });
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0); finShape.lineTo(radius * 2, 0);
  finShape.lineTo(radius * 2, radius * 1.5); finShape.lineTo(0, radius * 3); finShape.lineTo(0, 0);
  const finGeo = new THREE.ShapeGeometry(finShape);
  for (let i = 0; i < L.finCount; i++) {
    const fin = new THREE.Mesh(finGeo, finMat);
    const angle = (i / L.finCount) * Math.PI * 2;
    fin.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    fin.rotation.y = -angle;
    g.add(fin);
  }
  return g;
}

export function buildParachute(color = 0xff5533): THREE.Mesh {
  const geo = new THREE.SphereGeometry(4, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
}

export function buildFlame(): THREE.Mesh {
  const geo = new THREE.ConeGeometry(0.5, 3, 8);
  geo.rotateX(Math.PI); // point downward
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffa500 }));
  return mesh;
}
```

- [ ] **Step 2: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/world/rocketMesh.ts
git commit -m "feat(world): procedural low-poly rocket mesh, parachute, flame"
```

---

### Task 13: Scene, camera (orbit + follow), and renderer

**Files:**
- Create: `src/world/scene.ts`
- Verify: typecheck + build (+ CDP later)

**Interfaces:**
- Consumes: `three`, `OrbitControls` (from `three/examples/jsm/controls/OrbitControls.js`), `FlightState`.
- Produces:
  - `class SceneManager { constructor(host: HTMLElement); scene: THREE.Scene; worldGroup: THREE.Group; setCameraMode(mode: 'orbit'|'follow'): void; render(rocketPos: Vec3): void; reset(): void; clearWorld(): void; resize(): void; }`
  - Handles renderer creation, camera, follow-cam lerp to rocket, window resize, and a `worldGroup` that environments add into; `clearWorld()` empties it (disposing geometries/materials) between launches. Lights and props are added by environments into `worldGroup`.

- [ ] **Step 1: Write `src/world/scene.ts`**

```ts
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Vec3 } from '../sim/types';

export type CameraMode = 'orbit' | 'follow';

export class SceneManager {
  readonly scene = new THREE.Scene();
  readonly worldGroup = new THREE.Group();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private mode: CameraMode = 'orbit';

  constructor(private readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(this.renderer.domElement);
    this.scene.add(this.worldGroup);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 5000);
    this.camera.position.set(40, 30, 60);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setCameraMode(mode: CameraMode): void { this.mode = mode; }

  clearWorld(): void {
    for (const child of [...this.worldGroup.children]) {
      this.worldGroup.remove(child);
      child.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const mat = mesh.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose?.();
      });
    }
  }

  reset(): void {
    this.camera.position.set(40, 30, 60);
    this.controls.target.set(0, 10, 0);
    this.controls.update();
  }

  render(rocketPos: Vec3): void {
    if (this.mode === 'follow') {
      const target = new THREE.Vector3(rocketPos.x, rocketPos.y, rocketPos.z);
      const desired = target.clone().add(new THREE.Vector3(30, 15, 40));
      this.camera.position.lerp(desired, 0.08);
      this.controls.target.lerp(target, 0.2);
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  resize(): void {
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
```

- [ ] **Step 2: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/world/scene.ts
git commit -m "feat(world): scene manager with orbit and follow cameras"
```

---

### Task 14: Effects (flame/smoke/chute/explosion)

**Files:**
- Create: `src/world/effects.ts`
- Verify: typecheck + build

**Interfaces:**
- Consumes: `three`, `FlightState`, `buildParachute`, `buildFlame`.
- Produces: `class RocketVisual { constructor(scene, rocketMesh: THREE.Group); update(state: FlightState): void; explode(): void; dispose(): void; }` — attaches the rocket group, toggles flame during boost, shows parachute during descent (if `chuteDeployed`), shows an explosion burst on CATO/failed, and positions/orients the rocket from `state`.

- [ ] **Step 1: Write `src/world/effects.ts`**

```ts
import * as THREE from 'three';
import type { FlightState } from '../sim/types';
import { buildFlame, buildParachute } from './rocketMesh';

export class RocketVisual {
  private readonly flame: THREE.Mesh;
  private readonly chute: THREE.Mesh;
  private explosion: THREE.Points | null = null;
  private exploded = false;

  constructor(private readonly scene: THREE.Scene, private readonly rocket: THREE.Group) {
    scene.add(rocket);
    this.flame = buildFlame();
    this.flame.visible = false;
    rocket.add(this.flame);
    this.chute = buildParachute();
    this.chute.visible = false;
    rocket.add(this.chute);
    this.chute.position.y = 6;
  }

  update(state: FlightState): void {
    this.rocket.position.set(state.position.x, state.position.y, state.position.z);
    this.flame.visible = state.phase === 'boost';
    if (this.flame.visible) {
      this.flame.position.y = -1;
      this.flame.scale.y = 0.7 + Math.random() * 0.6;
    }
    this.chute.visible = state.chuteDeployed && state.phase === 'descent';
    if ((state.phase === 'failed' || state.outcome === 'cato') && !this.exploded) {
      this.explode();
    }
  }

  explode(): void {
    this.exploded = true;
    this.rocket.visible = false;
    const count = 120;
    const positions = new Float32Array(count * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xff6600, size: 1.5 });
    this.explosion = new THREE.Points(geo, mat);
    this.explosion.position.copy(this.rocket.position);
    this.scene.add(this.explosion);
  }

  dispose(): void {
    this.scene.remove(this.rocket);
    if (this.explosion) this.scene.remove(this.explosion);
  }
}
```

- [ ] **Step 2: Typecheck and build; commit**

Run: `npm run typecheck && npm run build`
```bash
git add src/world/effects.ts
git commit -m "feat(world): rocket visual with flame, chute, and explosion effects"
```

---

### Task 15: Audio (lightweight, muted by default)

**Files:**
- Create: `src/audio/sfx.ts`
- Test: `tests/audio/sfx.test.ts` (logic only: mute state; no real WebAudio in node)

**Interfaces:**
- Produces: `class Sfx { muted: boolean; constructor(); play(name: 'launch'|'whoosh'|'chute'|'boom'): void; toggleMute(): boolean; }` — synthesizes short tones via the WebAudio API; guards all audio behind a try/catch and a `muted` flag defaulting to `true`. `play` is a no-op when muted or when WebAudio is unavailable (node/tests).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { Sfx } from '../../src/audio/sfx';

describe('Sfx', () => {
  it('is muted by default', () => {
    expect(new Sfx().muted).toBe(true);
  });
  it('toggles mute', () => {
    const s = new Sfx();
    expect(s.toggleMute()).toBe(false);
    expect(s.muted).toBe(false);
    expect(s.toggleMute()).toBe(true);
  });
  it('play never throws even without WebAudio', () => {
    const s = new Sfx();
    s.toggleMute();
    expect(() => s.play('launch')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/audio/sfx.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/audio/sfx.ts`**

```ts
type SfxName = 'launch' | 'whoosh' | 'chute' | 'boom';

const TONES: Record<SfxName, { freq: number; dur: number; type: OscillatorType }> = {
  launch: { freq: 90, dur: 0.6, type: 'sawtooth' },
  whoosh: { freq: 300, dur: 0.3, type: 'sine' },
  chute: { freq: 500, dur: 0.15, type: 'triangle' },
  boom: { freq: 60, dur: 0.5, type: 'square' },
};

export class Sfx {
  muted = true;
  private ctx: AudioContext | null = null;

  private ensureCtx(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      const Ctor = (globalThis as any).AudioContext ?? (globalThis as any).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      return this.ctx;
    } catch {
      return null;
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  play(name: SfxName): void {
    if (this.muted) return;
    const ctx = this.ensureCtx();
    if (!ctx) return;
    try {
      const { freq, dur, type } = TONES[name];
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch {
      // Audio is best-effort; never block a launch.
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/audio/sfx.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/audio/sfx.ts tests/audio/sfx.test.ts
git commit -m "feat(audio): lightweight synthesized SFX, muted by default"
```

---

### Task 16: UI overlay (selectors, HUD, summary, challenge)

**Files:**
- Create: `src/ui/ui.ts`, `src/ui/ui.css`
- Test: `tests/ui/format.test.ts` (pure formatting helpers only)

**Interfaces:**
- Consumes: `rockets`, `compatibleMotors`, `environments`, `FlightState`, `FlightSummary`, `ChallengeConfig`.
- Produces:
  - Pure helpers (tested): `formatAltitude(m: number): string`, `formatSpeed(mps: number): string`, `phaseLabel(phase: FlightPhase): string`.
  - `class Ui { constructor(host, handlers: UiHandlers); getSelection(): { rocketId, motorId, envId, challenge }; updateHud(state): void; showSummary(summary): void; hideSummary(): void; setLaunchEnabled(b): void; }` where `interface UiHandlers { onLaunch(): void; onReset(): void; onToggleMute(): boolean; onToggleCamera(): void; onRocketChange(id: string): void; }`.
  - Builds DOM controls: rocket `<select>`, motor `<select>` (repopulated on rocket change via `compatibleMotors`), environment `<select>`, challenge `<select>` + target altitude input, Launch/Reset/Mute/Camera buttons, a HUD panel, and a summary modal.

- [ ] **Step 1: Write the failing test for formatters**

```ts
import { describe, it, expect } from 'vitest';
import { formatAltitude, formatSpeed, phaseLabel } from '../../src/ui/format';

describe('ui formatters', () => {
  it('formats altitude with unit', () => {
    expect(formatAltitude(123.4)).toBe('123 m');
  });
  it('formats speed with one decimal', () => {
    expect(formatSpeed(45.67)).toBe('45.7 m/s');
  });
  it('labels phases readably', () => {
    expect(phaseLabel('boost')).toBe('Boost');
    expect(phaseLabel('apogee')).toBe('Apogee');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ui/format.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/ui/format.ts`**

```ts
import type { FlightPhase } from '../sim/types';

export function formatAltitude(m: number): string {
  return `${Math.round(m)} m`;
}

export function formatSpeed(mps: number): string {
  return `${mps.toFixed(1)} m/s`;
}

const LABELS: Record<FlightPhase, string> = {
  idle: 'On Pad', boost: 'Boost', coast: 'Coast', apogee: 'Apogee',
  descent: 'Descent', landed: 'Landed', failed: 'Failed',
};

export function phaseLabel(phase: FlightPhase): string {
  return LABELS[phase];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ui/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Write `src/ui/ui.ts` and `src/ui/ui.css`**

Implement the `Ui` class building the DOM described in Interfaces, using
`src/ui/format.ts` for HUD text. Wire selects and buttons to `handlers`. Populate
selects from `rockets`, `environments`, and `compatibleMotors`. Keep it a single
focused file (~200 lines). CSS positions an overlay panel (top-left controls,
bottom HUD, centered summary modal) with `pointer-events` managed so the canvas
stays interactive. Full code authored during implementation; the shape is fixed
by the Interfaces block above.

Verification for this step is deferred to the CDP smoke test (Task 18); here just
ensure `npm run typecheck && npm run build` pass.

- [ ] **Step 6: Typecheck, build, commit**

Run: `npm run typecheck && npm run build`
```bash
git add src/ui tests/ui/format.test.ts
git commit -m "feat(ui): control panel, HUD, and summary overlay"
```

---

### Task 17: Application wiring and fixed-step loop

**Files:**
- Modify: `src/main.ts`
- Verify: typecheck + build (+ CDP in Task 18)

**Interfaces:**
- Consumes: everything — `SceneManager`, `environments`/`environmentById`, `buildRocketMesh`, `RocketVisual`, `Simulation`/`DT`, `Sfx`, `Ui`, catalog, `scoreChallenge`, `makeParamsFor`.
- Produces: a runnable app. On Launch: read UI selection → build `SimConfig` (rocket, motor, env params from `makeParamsFor(envId, seed)`, seed from `Date.now()` or a UI seed, challenge) → rebuild scene for the env → create `Simulation` + `RocketVisual` → run the fixed-step accumulator loop → on `done`, compute summary + challenge score and show it. On Reset: clear the sim, restore idle.

- [ ] **Step 1: Write `src/main.ts`**

```ts
import './style.css';
import './ui/ui.css';
import { SceneManager } from './world/scene';
import { environmentById } from './world/environments';
import { makeParamsFor } from './world/environments/params';
import { buildRocketMesh } from './world/rocketMesh';
import { RocketVisual } from './world/effects';
import { Simulation, DT } from './sim/simulation';
import { Sfx } from './audio/sfx';
import { Ui } from './ui/ui';
import { rocketById, compatibleMotors } from './data/rockets';
import { motorById } from './data/motors';
import { scoreChallenge } from './sim/challenge';
import { mulberry32 } from './sim/rng';
import type { EnvParams, ChallengeConfig } from './sim/types';

const host = document.getElementById('app')!;
const scene = new SceneManager(host);
const sfx = new Sfx();

let sim: Simulation | null = null;
let visual: RocketVisual | null = null;
let current: { params: EnvParams; challenge: ChallengeConfig } | null = null;
let cameraMode: 'orbit' | 'follow' = 'follow';
let accumulator = 0;
let last = performance.now();

const ui = new Ui(host, {
  onLaunch: launch,
  onReset: reset,
  onToggleMute: () => sfx.toggleMute(),
  onToggleCamera: () => {
    cameraMode = cameraMode === 'orbit' ? 'follow' : 'orbit';
    scene.setCameraMode(cameraMode);
  },
  onRocketChange: () => {},
});

function launch(): void {
  reset();
  const sel = ui.getSelection();
  const rocket = rocketById(sel.rocketId)!;
  const motor = motorById(sel.motorId) ?? compatibleMotors(rocket)[0];
  const env = environmentById(sel.envId)!;
  const seed = Date.now() >>> 0; // per-launch seed; drives all sim randomness deterministically
  const params = makeParamsFor(env.id, seed);
  current = { params, challenge: sel.challenge };

  scene.clearWorld();
  scene.reset();
  env.build({ scene: scene.scene, root: scene.worldGroup }, params, mulberry32(seed));

  sim = new Simulation({ rocket, motor, environment: params, seed, challenge: sel.challenge });
  const mesh = buildRocketMesh(rocket);
  mesh.position.set(0, params.groundHeight, 0);
  visual = new RocketVisual(scene.scene, mesh);
  sfx.play('launch');
  ui.setLaunchEnabled(false);
  ui.hideSummary();
}

function reset(): void {
  if (visual) { visual.dispose(); visual = null; }
  sim = null;
  ui.setLaunchEnabled(true);
}

function frame(now: number): void {
  const dtMs = Math.min(now - last, 100);
  last = now;
  if (sim && !sim.done) {
    accumulator += dtMs / 1000;
    while (accumulator >= DT) { sim.step(); accumulator -= DT; }
    visual!.update(sim.state);
    ui.updateHud(sim.state);
    if (sim.done) finish();
  }
  scene.render(sim ? sim.state.position : { x: 0, y: 10, z: 0 });
  requestAnimationFrame(frame);
}

function finish(): void {
  if (!sim || !current) return;
  const summary = sim.summary();
  summary.challenge = scoreChallenge(current.challenge, current.params, summary, sim.state.position);
  ui.showSummary(summary);
  ui.setLaunchEnabled(true);
  sfx.play(summary.outcome === 'cato' ? 'boom' : 'chute');
}

scene.setCameraMode(cameraMode);
requestAnimationFrame(frame);
```

- [ ] **Step 2: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire simulation, rendering, UI, and audio into fixed-step app"
```

---

### Task 18: Brave CDP end-to-end smoke test

**Files:**
- Create: `scripts/smoke-cdp.mjs`
- Verify: run against the built app

**Interfaces:**
- Consumes: the running dev/preview server and Brave with `--remote-debugging-port=9222`.
- Produces: a script (or documented manual procedure) that loads the app, clicks Launch, waits, asserts the HUD altitude increased and no console errors occurred, and captures a screenshot to `scratchpad/`.

- [ ] **Step 1: Launch Brave and the app**

```bash
/usr/bin/brave-browser-stable --remote-debugging-port=9222 &
npm run build && npm run preview -- --port 4173 &
```

- [ ] **Step 2: Write `scripts/smoke-cdp.mjs`**

A small Node script using the CDP HTTP/WS endpoint (or the Playwright MCP tools
available in this environment) that:
1. Navigates to `http://localhost:4173`.
2. Waits for a `<canvas>` to exist.
3. Reads console messages; fails if any `error`-level entries appear.
4. Clicks the Launch button (by id/text).
5. Polls the HUD altitude element for ~5 s; asserts it rose above 0 then returns toward 0 (a flight happened).
6. Screenshots to `scratchpad/rkt-smoke.png`.
7. Exits non-zero on any failure.

Author the concrete script during implementation using the CDP tooling available.
Prefer the Playwright MCP browser tools if simpler than raw CDP.

- [ ] **Step 3: Run the smoke test**

Run: `node scripts/smoke-cdp.mjs`
Expected: exits 0; screenshot shows a rocket/flight; no console errors.

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke-cdp.mjs
git commit -m "test: Brave CDP end-to-end smoke test for launch flow"
```

---

### Task 19: Final quality gate and README-free polish

**Files:**
- Modify: as needed to make the gate green.

- [ ] **Step 1: Run the full quality gate**

Run: `npm run quality`
Expected: `tsc --noEmit` clean, all Vitest suites pass, `vite build` succeeds.

- [ ] **Step 2: Run the CDP smoke test once more against the fresh build**

Run: `npm run build && npm run preview -- --port 4173 & node scripts/smoke-cdp.mjs`
Expected: exits 0.

- [ ] **Step 3: Manual visual pass**

Launch a few rocket/environment/motor combinations, including an overloaded motor
(observe CATO) and a tumble-recovery rocket (observe chute-fail more often).
Confirm follow-cam tracks, telemetry updates, and the summary shows.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final quality gate green (tests, types, build, CDP smoke)"
```

---

## Self-Review

**1. Spec coverage:**

- Grounded physics (thrust curve, mass, drag, gravity, wind, recovery) → Tasks 3, 4, 5, 6.
- Pure sim core, no Three.js → enforced by Global Constraints; Tasks 1–8.
- ~12 rockets + A–E motors, curated offline → Task 9.
- Environments (park, urban, mountain, desert, sea, rooftop + 2 funny), seeded, testable params → Tasks 10, 11.
- Outcomes (nominal/CATO/chute-fail/tip-off) → Task 7.
- Live telemetry HUD + summary → Task 16.
- Challenges (target-altitude, landing-zone) + scoring → Tasks 8, 16.
- Low-poly rockets + effects + camera → Tasks 12, 13, 14.
- Audio, muted by default → Task 15.
- Fixed-step loop, one-way data flow → Task 17.
- CDP smoke, quality gate → Tasks 18, 19.
- Determinism/RNG → Task 1, exercised in 6, 7, 10.

All spec sections map to at least one task.

**2. Placeholder scan:** Two intentional deferrals remain and are justified with
full surrounding code and explicit "implement the clean version" notes: Task 11
(implement all eight builders following the two shown), Task 16 Step 5 (full `Ui`
class body, shape fixed by Interfaces), Task 18 Step 2 (CDP script, procedure
fully specified). These are rendering/DOM/tooling steps not amenable to a unit
test; each has a concrete verification (typecheck+build or CDP run). No `sim/`
task contains a placeholder.

**3. Type consistency:** `Simulation.step()/done/summary()`, `applyOutcome(state,
config, rng, point)`, `stepMotion(StepInput)`, `makeParamsFor(id, seed)`,
`scoreChallenge(config, env, summary, landing)`, `buildRocketMesh(rocket)` are
used consistently across tasks. `DT = 1/120` defined once (Task 6) and imported
in Task 17. `Outcome`, `FlightPhase`, `EnvParams` defined once in Task 2.

**Review corrections applied (this pass):**
- Scoped the `Math.random` ban to `src/sim/**` and `src/data/**` (simulation
  determinism), permitting cosmetic jitter in `src/world/**` and a `Date.now()`
  per-launch seed — the earlier blanket ban contradicted Tasks 14 and 17.
- Removed dead `burnedProp` branch in `simulation.ts` (Task 6).
- Replaced Task 17's `clearDynamic` hand-waving with a real `worldGroup` +
  `clearWorld()` on `SceneManager` (Task 13) and a `root` group on
  `BuildContext` (Tasks 10, 11) so environments are disposed cleanly between
  launches.
- Fixed `finish()` to read a stored `{ params, challenge }` captured at launch
  instead of recomputing env params from a time value (Task 17).
