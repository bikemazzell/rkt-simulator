# RKT Simulator — Specification

## 1. Overview

RKT Simulator is a browser game, built with Three.js, that simulates launching
model rockets (Estes-style) into a variety of procedurally generated
environments. The player picks a rocket, a motor, and an environment, then
launches and watches the flight play out with live telemetry. Flights can go
nominally or fail in physically-motivated (and occasionally funny) ways.

**Design pillars**

- **Grounded-but-approachable physics.** Real-ish thrust curves, mass, drag,
  gravity, wind, and parachute recovery — tuned for readable, fun flights, not
  certification-grade accuracy.
- **Pure simulation core.** The physics/sim layer imports no Three.js and is
  fully unit-testable. Rendering and UI sit on top and only read sim state.
- **Clean, minimal, not over-engineered.** Small focused modules with clear
  interfaces. YAGNI applied ruthlessly.

## 2. Goals and non-goals

### Goals

- Simulate a curated set of ~12 recognizable Estes-style rockets.
- Simulate a variety of seeded, procedurally generated environments (realistic
  and a few funny ones).
- Provide live telemetry (altitude, velocity, apogee, flight status).
- Provide a light per-launch challenge/scoring layer on top of a sandbox.
- Run smoothly in a desktop browser with a cohesive low-poly art style.
- Be built test-first, with a pure sim core covered by unit tests.

### Non-goals (explicitly out of scope)

- Live scraping of estesrockets.com (specs are hand-authored, offline).
- High-fidelity aerospace simulation (RASP `.eng` files, staging, clusters,
  barometric atmosphere, RK4).
- Career/progression, persistence, unlockables, or a save system.
- Multiplayer or networking.
- PBR/realistic art or an external asset pipeline.
- Mobile-first / touch-optimized controls (mobile may work but is not targeted).

## 3. Target platform

- Desktop browsers (current Chromium/Firefox). Mouse + keyboard.
- Delivered as a Vite app: `npm run dev` for local play, `npm run build` for a
  static bundle.

## 4. Gameplay

### 4.1 Core loop (sandbox)

1. Player selects a **rocket**, a compatible **motor**, and an **environment**.
2. Player presses **Launch**.
3. The simulation runs; the camera follows the rocket; the HUD shows live
   telemetry.
4. The flight reaches an outcome (landed or failed). A summary is shown
   (apogee, flight time, outcome, drift distance).
5. Player resets and launches again (same or new selection).

### 4.2 Challenges (light objectives)

- Optional per-launch challenge overlay. Two challenge types at launch:
  - **Target altitude:** get apogee within a tolerance band of a target.
  - **Landing zone:** land the recovered rocket inside a marked ground zone.
- A score is computed for the launch (0–100), shown in the summary. Challenges
  are opt-in and stateless — no cross-session progression.

### 4.3 Controls

- Mouse drag / scroll: orbit + zoom the camera (OrbitControls).
- Toggle **follow camera** vs **free orbit**. Follow is *rigid*: the orbit target
  tracks the rocket and the camera translates with it, so the rocket stays framed
  at any altitude while the user's own zoom and orbit angle are preserved.
- In **orbit** mode, held **WASD** keys pan the camera continuously across the
  environment (speed scales with zoom distance).
- **Speed** control cycles the simulation rate 1x / 4x / 16x so descents under
  parachute do not take real minutes.
- A **launch pad** marks the origin and the rocket rests on it; procedural props
  keep a clear radius around the pad so nothing ever spawns on the rocket.
- Launch, Reset, Camera, Speed, and Mute buttons in the UI.
- Keyboard: `Space` = launch/reset, `C` = toggle camera, `F` = cycle speed,
  `M` = mute, `WASD` = pan (orbit mode).
- The selected environment is shown immediately (pre-launch preview) and updates
  when the rocket or environment selection changes.

## 5. Rockets

A curated subset of ~12 Estes-style models, hand-authored in a local data file.
Names and specs approximate real models; they are not scraped and are treated as
plausible game data, not authoritative product data.

Each rocket record:

| Field            | Type      | Meaning                                              |
|------------------|-----------|------------------------------------------------------|
| `id`             | string    | Stable identifier                                    |
| `name`          | string    | Display name                                         |
| `massEmptyKg`     | number    | Dry mass (no motor)                                  |
| `diameterM`      | number    | Body tube diameter → reference area for drag         |
| `dragCoefficient`| number    | Cd (dimensionless)                                   |
| `chuteDiameterM` | number    | Parachute canopy diameter (0 = streamer/tumble)      |
| `chuteCd`        | number    | Parachute drag coefficient                           |
| `recommendedMotors` | string[] | Motor ids that fit this rocket                     |
| `maxMotorImpulse` | number   | Total impulse (N·s) above which CATO risk rises      |
| `look`           | object    | Low-poly mesh params (body length, fin shape, colors)|

Initial roster (approximate, subject to tuning): Alpha, Wizard, Big Bertha,
Der Red Max, V2, Baby Bertha, Hi-Flier, Crossfire ISX, Mean Machine,
Photon Probe, Nike Smoke, Star Orbiter. Final list authored in `data/rockets.ts`.

## 6. Motors

Estes motor classes A–E, hand-authored. Each motor record:

| Field           | Type    | Meaning                                        |
|-----------------|---------|------------------------------------------------|
| `id`            | string  | e.g. `A8-3`, `C6-5`, `E12-4`                    |
| `class`        | string  | `A`..`E`                                        |
| `totalImpulseNs`| number  | Total impulse (N·s)                             |
| `avgThrustN`    | number  | Average thrust (N)                             |
| `burnTimeS`     | number  | Propellant burn duration (s)                   |
| `massTotalKg`   | number  | Loaded motor mass                              |
| `massPropKg`    | number  | Propellant mass (burned off during boost)      |
| `delayS`        | number  | Ejection delay after burnout                    |

### 6.1 Thrust curve

A parametric piecewise curve over `[0, burnTimeS]`: a fast rise to a peak, a
sustain, and a taper to zero. The peak is derived so that the curve's time
integral equals `totalImpulseNs` (impulse conservation is a hard invariant,
enforced by a unit test). `avgThrustN` is the catalog/display average and, by the
Estes naming convention, equals `totalImpulseNs / burnTimeS` (a catalog test
enforces this consistency); it also feeds the tip-off probability. This avoids
shipping `.eng` files while keeping the boost phase physically sensible.

## 7. Physics model

Single rigid point-mass with vertical-plus-lateral motion (2D in the vertical
plane of flight is sufficient; represented as 3D vectors for rendering). Fixed
timestep integration, decoupled from render frame rate via an accumulator.

Forces each step:

- **Thrust:** from the thrust curve during boost, applied vertically (`+y`) — a
  guide-rail simplification. Instability is modeled as a lateral velocity kick at
  liftoff (tip-off), not as thrust vectoring.
- **Gravity:** `m·g`, `g = 9.81 m/s²`.
- **Drag:** `½·ρ·v²·Cd·A`, opposing air-relative velocity. `A` from body diameter
  during ascent/coast; from parachute (`chuteDiameterM`, `chuteCd`) once the chute
  has deployed.
- **Wind:** a horizontal wind vector (constant + gust component) applied through
  drag, producing lateral drift.

Mass decreases linearly with burned propellant during boost. Air density `ρ`
from a simple altitude model in `atmosphere.ts` (does not need to be barometric).
Before liftoff the launch pad supports the rocket (no downward motion) during the
brief thrust ramp; the rocket can only "land" once it has actually left the pad.

Integration: **semi-implicit (symplectic) Euler** at a fixed `dt` (e.g. 1/120 s).
Chosen over RK4 for simplicity and stability at this fidelity.

### 7.1 Flight state machine (`flight.ts`)

```
idle → boost → coast → apogee → descent → landed
                                   ↘ (failure) → failed
```

- **idle:** on pad, awaiting launch. The pad supports the rocket during the
  initial thrust ramp; the rocket does not "land" before it has lifted off.
- **boost:** motor burning, thrust > 0.
- **coast:** burnout to apogee (vertical velocity > 0).
- **apogee:** vertical velocity crosses zero.
- **descent:** falling under parachute (or ballistic if the chute failed).
- **landed:** rocket returns to ground height with a survivable impact speed.
- **failed:** a failure outcome (CATO, hard landing/crash, or never leaving the
  pad) ended the flight.

Recovery is driven by the **ejection charge**, which fires once at
`burnout + delayS` — this may be slightly before or after apogee. A well-matched
delay deploys the chute near apogee; too short a delay deploys it while still
ascending (a realistic drag penalty and lower apogee).

### 7.2 Outcomes (`outcomes.ts`)

Condition- and probability-driven, using the seeded RNG:

- **nominal:** normal flight and recovery, soft landing.
- **CATO** (catastrophe at takeoff / motor explosion): raised probability when
  the chosen motor's impulse exceeds the rocket's `maxMotorImpulseNs`. Ends flight
  early with an explosion effect near the pad/low altitude.
- **chute-fail:** parachute fails to deploy at ejection → ballistic descent and a
  hard landing (phase `failed`, explosion effect). Probability small but non-zero,
  higher for tumble-recovery rockets. A soft-recovery flight that nonetheless
  strikes the ground above the hard-landing speed threshold is also classified as
  a crash.
- **tip-off:** low thrust-to-weight at launch or high wind causes an unstable,
  angled, drifting trajectory (seeded lateral kick at liftoff). Wind speed and
  TWR both feed the tip-off probability.

Outcome selection happens at defined decision points (**ignition** and
**ejection**) and is fully deterministic given the seed, so it is unit-testable.

## 8. Environments

Each environment is a **seeded generator** implementing a common interface. Given
a seed, it produces:

- A **scene contribution:** terrain mesh + props (Three.js), built in `world/`.
- A **params bundle** (pure data, no Three.js): ground height at origin, wind
  profile (base speed/direction + gust), world bounds, and an optional target
  landing zone for challenges.

Because the params bundle is pure data derived deterministically from the seed,
the environment generator's *logic* is unit-testable without rendering.

Environment interface (conceptual):

```ts
interface Environment {
  readonly id: string;
  readonly name: string;
  generate(seed: number): EnvironmentInstance;
}

interface EnvironmentInstance {
  params: EnvParams;              // pure data (testable)
  build(scene: THREE.Scene): void; // adds meshes/props (rendering only)
}
```

### 8.1 Environment set

Realistic: **park, urban, mountain, desert, sea, rooftop of a house.**
Funny (at least two): e.g. **giant bathtub** (launch from a rubber duck) and
**backyard with an angry dog** (chases the landing). Final funny set decided
during implementation; the architecture supports adding more cheaply.

Each environment supplies its own wind character (e.g. sea = stronger steady
wind; urban = gusty turbulence between buildings; desert = light and hot). Wind
is owned by the environment's `params` (there is no separate wind field on
`SimConfig`); the config's `seed` deterministically drives the gust component.

## 9. Rendering (`world/`)

- **Style:** low-poly, flat/gradient shading, cohesive palette. No textures/PBR.
- **Rocket mesh:** generated procedurally from the rocket's `look` params
  (body cylinder, nose cone, fins, colors) in `rocketMesh.ts`.
- **Effects:** particle-ish flame/smoke during boost, parachute canopy on
  recovery, explosion burst on CATO/hard landing. Kept simple (sprites or small
  meshes), not a full particle engine.
- **Camera:** OrbitControls for free look; a follow-cam mode that tracks the
  rocket smoothly. Toggle between them.
- **Loop:** `requestAnimationFrame` drives rendering; a fixed-step accumulator
  advances the simulation independently so physics is frame-rate independent.

## 10. UI (`ui/`)

DOM overlay (not in-canvas) for simplicity:

- Rocket selector (with a small spec readout), motor selector (filtered to the
  rocket's compatible motors), environment selector.
- Launch / Reset / Mute buttons; camera-mode toggle.
- Live HUD: altitude, vertical velocity, current apogee, flight status/phase.
- Post-flight summary: apogee, max velocity, flight time, outcome, drift
  distance, and (if a challenge was active) the score.
- Optional challenge panel (choose challenge type + parameters before launch).

## 11. Audio (`audio/`)

Lightweight SFX, **muted by default**, with a mute toggle: launch roar, whoosh,
chute pop, explosion. Small/synthesized sounds; kept off the critical path
(failure to load audio never blocks a launch). No music.

## 12. Determinism and RNG

A single seeded RNG (`mulberry32`) underpins procedural generation and outcome
selection. Given the same `SimConfig` (including seed), a full flight is
reproducible. This is the backbone of the test strategy.

## 13. Data flow

```
UI  ──builds──▶  SimConfig { rocket, motor, environment, seed, challenge? }
                     │
                     ▼
             Simulation (pure sim/) ──fixed-step──▶ FlightState + Telemetry
                     │                                     │
       reads (no write-back)                       reads (no write-back)
                     ▼                                     ▼
             Renderer (world/)                        HUD (ui/)
```

`world/` and `ui/` never mutate `sim/` state; they only read it. This one-way
dependency is a hard architectural rule.

## 14. Testing strategy

Test-first (TDD) for the entire pure `sim/` layer, using **Vitest**:

- **thrustCurve:** integral equals `totalImpulseNs` within tolerance; shape
  (rise/sustain/taper) and non-negativity.
- **integrator:** apogee for a known rocket+motor lands within a tolerance band
  of a hand-computed expected value; energy/behavior sanity (goes up then down).
- **atmosphere:** density decreases with altitude; wind vector composition.
- **flight:** state-machine transitions occur in the correct order and on the
  right triggers.
- **outcomes:** deterministic given seed; CATO probability rises with motor
  overload; chute-fail path yields ballistic descent.
- **rng:** deterministic sequence for a fixed seed.
- **environments:** params bundle is deterministic per seed; wind/bounds/target
  zone within expected ranges.
- **challenge scoring:** correct score for known apogee/landing inputs and
  boundary cases.

**Rendering/UI** are not unit-tested. They are smoke-tested via **Brave CDP**
(remote debugging on port 9222): canvas mounts, a launch runs end-to-end, no
console errors, telemetry values update during flight, screenshot for visual
sanity.

**Quality gate (must pass before "done"):**
`vitest run` (all pass) + `tsc --noEmit` (no type errors) + `vite build`
(builds clean). A `make`-style unified target or npm script runs all three.

## 15. Tech stack

- **Three.js** (npm) for rendering.
- **TypeScript** for the whole codebase.
- **Vite** for dev server and build.
- **Vitest** for unit tests.
- No backend; fully static output.

## 16. Success criteria

- Player can select from ~12 rockets, compatible motors, and multiple
  procedurally generated environments, and launch.
- Flights show plausible boost/coast/apogee/recovery behavior with live
  telemetry and at least the four outcome types.
- The pure `sim/` layer is covered by passing unit tests, including impulse
  conservation, apogee tolerance, state-machine order, and determinism.
- CDP smoke test confirms the app runs end-to-end with no console errors.
- `vitest` + `tsc --noEmit` + `vite build` all pass.
- Code is organized per the module layout with the one-way `sim/ → world/,ui/`
  dependency respected.
