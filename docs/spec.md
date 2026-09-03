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
  - **Height goal:** a purely visual rainbow ladder — a colored ring every
    50 m of altitude up to 1000 m (7-color ROYGBIV cycle repeating every
    350 m). As the rocket climbs through each ring, its altitude ("150 m")
    pops up at the ring, colored to match, floating up and fading over
    ~1.2 s. No score, no target-number input.
  - **Landing zone:** land the recovered rocket inside a marked ground zone.
- Only the landing zone is scored (0–100, shown in the summary). The old
  target-altitude input and apogee-vs-target scoring were removed. Challenges
  are opt-in and stateless — no cross-session progression.

### 4.3 Controls

- Mouse drag / scroll: orbit + zoom the camera (OrbitControls). The polar angle
  is capped just past horizontal and a hard ground-floor clamp keeps the camera
  from ever sinking below the environment's ground plane.
- **Adaptive framing:** the initial/reset orbit distance scales with the
  rocket's height (clamped ~2.2–7.6 m), so a 49 cm BT-5 rocket fills the view
  while a 2 m one still gets breathing room — true scale is preserved and the
  reference lineup communicates size.
- Toggle **follow camera** vs **free orbit**. Follow is *rigid*: the orbit target
  tracks the rocket and the camera translates with it, so the rocket stays framed
  at any altitude while the user's own zoom and orbit angle are preserved.
  While flying in follow mode the camera also **auto-zooms with speed**: the
  orbit distance eases toward `clamp(6 + 1.2·|v|, 6, 600)` m (τ ≈ 0.8 s), so
  faster flight pulls out for context and slowdowns (chute, landing) close in.
  Scrolling multiplies that auto distance (a persistent per-flight factor,
  reset on launch/reset), so manual framing still works on top.
- In **orbit** mode, held **WASD** keys pan the camera continuously across the
  environment and **Q/E** move it vertically up/down (speed scales with zoom
  distance).
- **Speed** control cycles the simulation rate 1x / 4x / 16x so descents under
  parachute do not take real minutes.
- A **launch pad** marks the origin: a thin ⌀3.2 m plate (top barely proud of
  the ground so the rocket's fins never sink into it) painted with a bullseye —
  red centre dot, white rings, and a crosshair — plus a 1 m launch rod with an
  orange safety tip beside the rocket. Procedural props keep a clear radius
  around the pad so nothing ever spawns on the rocket.
- **True scale.** One world unit = one meter. The rocket mesh is generated at
  its real catalogue size, surrounded by 3–5 everyday scale-reference objects
  (from eraser, golf ball, and baseball through soda can, dog, sheep, child,
  cow, car, and person up to horse, door, house, and elephant) chosen per
  rocket from a 22-rung ladder: the nearest rungs below/above its height always
  appear, and the remaining slots are drawn at random (seeded per build) and
  **scattered in a ring around the pad**, each object turned to face the
  rocket. The scatter is environment-aware — kept within the sea raft and the
  rooftop slab, skipped in the giant bathtub, where the joke scale would break
  it.
- The **height-goal challenge** paints a rainbow ladder: a flat, colored ring
  every 50 m of altitude (50 m…1000 m) above the launch base, cycling
  ROYGBIV, so the player can read progress through (and above) the flight.
  It appears in the preview and updates immediately when the challenge is
  edited. When the rocket crosses a rung climbing, a matching-color altitude
  label pops at the ring and fades (~1.2 s, ascending crossings only).
- **Launch-attitude gimbal.** In the preview, three colored gimbal rings
  (X red, Y green, Z blue) surround the rocket. Dragging a ring rotates the
  rocket about that axis — the ring's label shows the live angle — and
  double-click (or double-tap) opens a small input to type an exact angle
  (degrees, normalized to (−180, 180]). The launch rod tilts with the rocket.
  Axis semantics: X tilts the nose toward +Z, Z toward −X, Y spins the tilt
  plane (alone it is a no-op). The aimed direction feeds the sim as a fixed
  world-space thrust axis for the whole burn (no windcocking); while the
  rocket is on the rail it is held at the pad (no lateral slide), and a ~90°
  aim with no vertical thrust component ends as a rail tip-off. **Reset**
  zeroes the aim; changing rocket, environment, or challenge preserves it.
- **Flight attitude + relaunch.** The rocket model points along its velocity
  vector while flying freely (weathercocking via a smoothed nose alignment in
  `RocketVisual`), then hangs nose-up under the canopy the moment a
  nose-up device (parachute/streamer/rotor) deploys — even while still
  ascending — swaying gently and leaning downwind in strong wind; the
  attitude freezes on landing. After a soft (`landed`) flight the gimbal
  is rebuilt around the resting rocket — seeded from its resting orientation,
  without the pad rod — so the player can re-aim. Launching again starts the
  next flight from that exact spot: `SimConfig.launchOrigin` overrides the pad
  origin, and the apogee baseline/HUD altitude are measured above it. Crashes
  now leave a **crash site**: the debris burst settles into a charred,
  toppled wreck plus a scorch decal scaled by impact speed, the gizmo is
  rebuilt at the wreck (re-aim and relaunch from there — a fresh mesh flies
  from the wreck via `launchOrigin`), and Reset still produces a fresh pad
  launch.
- Launch, Reset, Camera, Speed, and Mute buttons in the UI.
- Keyboard: `Space` = launch/reset, `C` = toggle camera, `F` = cycle speed,
  `M` = mute, `WASD` = pan and `Q`/`E` = up/down (orbit mode).
- The selected environment is shown immediately (pre-launch preview) and updates
  when the rocket or environment selection changes.
- URL overrides for verification: `?seed=<uint>` pins the launch seed for
  reproducible flights; `?recovery=<device[,device...]>` forces the recovery
  devices (see §7.3) (see also `?env`, `?weather`, `?tod`, `?cam`, `?debug`).

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
| `chuteDiameterM` | number    | Parachute canopy diameter (0 = no parachute)          |
| `chuteCd`        | number    | Parachute drag coefficient                           |
| `recovery`       | device[]  | Recovery devices from the product description ([] = random at ejection) |
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
  during ascent/coast; once recovery has deployed, from the dominant recovery
  device (see §7.3): parachute canopy (`chuteDiameterM`, `chuteCd`), a
  mass-scaled streamer, a rotor disc sized for a ~3.5 m/s helicopter sink, or an
  inflated body area for tumble.
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
- **boost:** motor burning, thrust > 0. Thrust acts along the configured launch
  attitude (`SimConfig.initialDirection`, default straight up), fixed in world
  space for the whole burn.
- **coast:** burnout to apogee (vertical velocity > 0).
- **apogee:** vertical velocity crosses zero.
- **descent:** falling under the deployed recovery device — or ballistic if the
  deployment failed.
- **landed:** rocket returns to ground height with a survivable impact speed.
- **failed:** a failure outcome (CATO, hard landing/crash, or never leaving the
  pad) ended the flight.

Recovery is driven by the **ejection charge**, which fires once at
`burnout + delayS` — this may be slightly before or after apogee. A well-matched
delay deploys the chute near apogee; too short a delay deploys it while still
ascending (a realistic drag penalty and lower apogee). One exception: a rocket
whose *only* declared device is `tumble` (a designed no-assist rocket such as the
Destination Mars Leaper, which "lands upright on its tripod legs") destabilises
passively at `burnout + min(delayS, 0.5s)` — no ejection charge is needed and
nothing can fail to deploy. If a product's only scraped motor recommendations are
delay-0 boosters, the generator substitutes the same-family delayed sibling
(e.g. A10-0 → A10-3) so single-stage flights still deploy on time.

### 7.3 Recovery devices (`recovery.ts`)

Each rocket carries `recovery: RecoveryDevice[]` parsed from the Estes product
prose (e.g. `['parachute', 'glider']` for the Space Shuttle). Rockets whose
description names no device get `[]` — **Random**: a single device is rolled at
ejection (seeded, weighted parachute .55 / streamer .20 / tumble .10 /
helicopter .08 / glider .07), so unspecified rockets still vary flight to flight.
The UI hint shows "Recovery: Parachute + Glider" or "Recovery: Random".

Device models (combos render every device; physics uses the **dominant** device —
the smallest computed sink rate at ejection mass):

- **parachute:** canopy drag from catalogue `chuteDiameterM`/`chuteCd` (~4-6 m/s).
- **streamer:** ribbon drag area `2mg/(ρ·Cd·v²)` tuned to ~9 m/s.
- **tumble:** inflated body area (×14, floored at 0.02 m² so skinny BT-5
  tubes still brake) — a stabilized fast fall that may still land hard on
  heavy rockets; a pure-tumble rocket cannot fail deployment (probability 0).
- **helicopter:** rotor drag area sized for ~3.5 m/s plus a lateral spiral
  (radius ~1.5 m, period ~2.5 s), carried by the wind.
- **glider:** kinematic override once descending — a banked circle (radius
  ~15 m) at 8 m/s for a ~2.7 m/s sink; velocity is written into the flight
  state (blended in over ~1 s), gravity/drag are bypassed for game feel.

Deployment fails as one roll for the whole combo (0.04 when a parachute is
present, 0.15 otherwise) → ballistic descent. A surviving descent that still
hits above the hard-landing threshold is classified **hard-landing** (crash
presentation), distinct from chute-fail. `?recovery=<device,...>` forces the
device list for verification/debug; unknown tokens are dropped.

### 7.2 Outcomes (`outcomes.ts`)

Condition- and probability-driven, using the seeded RNG:

- **nominal:** normal flight and recovery, soft landing.
- **CATO** (catastrophe at takeoff / motor explosion): raised probability when
  the chosen motor's impulse exceeds the rocket's `maxMotorImpulseNs`. Ends flight
  early with an explosion effect near the pad/low altitude.
- **chute-fail:** recovery fails to deploy at ejection → ballistic descent and a
  hard landing (phase `failed`, explosion effect). Probability small but non-zero,
  higher when no parachute is in the recovery list. A soft-recovery flight that
  nonetheless strikes the ground above the hard-landing speed threshold is
  classified as **hard-landing** (same crash presentation, distinct label).
- **tip-off:** low thrust-to-weight at launch or high wind causes an unstable,
  angled, drifting trajectory (seeded lateral kick at liftoff). Wind speed and
  TWR both feed the tip-off probability.

Outcome selection happens at defined decision points (**ignition** and
**ejection**) and is fully deterministic given the seed, so it is unit-testable.

## 8. Environments

Each environment is a **seeded generator** implementing a common interface. Given
a seed, it produces:

- A **scene contribution:** blocky tiled terrain + props (Three.js), built in
  `world/` (see the world systems in section 9).
- A **params bundle** (pure data, no Three.js): ground height at origin, an
  optional **launch height** (`launchY`, e.g. the bathtub's pad floats at the
  water surface above the tub floor), wind profile (base speed/direction +
  gust), world bounds, and an optional target landing zone for challenges.
- A **ground sampler** (`ctx.groundAt(x, z)`), published by the build: the
  height the rendered ground occupies anywhere. The simulation uses it for
  touchdown (`SimConfig.groundAt`), so a rocket drifting over a hill rests on
  the hill — and bathtub flights splash down on the water surface. The pad
  area is flattened to the pad level, so liftoff and the apogee baseline
  (altitude above the launch site) remain the flat-pad values.

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

- **Style:** blocky/Minecraft-like, flat/gradient shading, cohesive palette.
  No textures/PBR.
- **Terrain:** per-environment palettes paint a tiled ground (vertex-colored
  quads, one draw call) over a large base disc so the horizon reads endless.
  Heights come from a pure seeded heightmap (`heightmap.ts`): two-octave value
  noise quantized into terraces, forced-flat clearance discs around the pad,
  target zone and water basins, and an edge fade into the base disc. Props,
  flora, and creatures sample the same tile-snapped height so everything sits
  exactly on the rendered surface.
- **World systems:** animated scenery implements `WorldSystem`
  (`update(dt, elapsed)` / `dispose()`) and is registered by each environment:
  ambient day/night lighting + fog (`ambient.ts`, driven by pure `daynight.ts`
  math), a sky dome with square sun/moon and stars (`sky.ts`), drifting cloud
  slabs (`clouds.ts`), swaying trees/shrubs/grass/flowers (`vegetation.ts`),
  wandering villagers/animals and circling birds (`creatures.ts`), shimmering
  blocky water (`water.ts`), and rain/snow/thunderstorm particles
  (`weatherFx.ts`, rolled from biome weights). The day/night clock persists
  across world rebuilds and is not scaled by simulation speed.
- **Rocket mesh:** generated procedurally from the rocket's `look` params
  (body cylinder, nose cone, fins, colors) in `rocketMesh.ts` — at true scale
  (body length and diameter in meters, no inflation).
- **Scale lineup:** `scaleRefs.ts` holds the pure reference ladder and
  `pickReferences` (nearest below/above the rocket's total height + random
  seeded fills, with redundancy suppression); `scaleLineup.ts` builds
  the blocky reference meshes and the launch rod (grouped so it can tilt).
- **Gimbal:** `gizmo.ts` renders the three drag rings (fat invisible tori as
  hit proxies, anchors for labels) and hosts the DOM layer — angle labels,
  drag with camera-lock, and the double-click/double-tap exact-angle input.
  `sim/aim.ts` is the pure math (angle normalization, Euler 'XYZ' direction
  closed form pinned by a parity test against three).
- **Effects:** rocket-proportioned flame during boost, parachute canopy on
  recovery (radius from `chuteDiameterM`), a segmented cloth-strip streamer
  whose hinged blocks ride a traveling flutter wave, spinning
  rotor blades, deployed glider wings, explosion burst on CATO/hard
  landing, and a short fading trail line behind the rocket. Kept simple
  (sprites or small meshes), not a full particle engine.
- **Camera:** OrbitControls for free look; a follow-cam mode that tracks the
  rocket smoothly. Framing defaults are tuned for meter-scale rockets
  (near plane 0.5 m, min zoom 1 m, slow pan at close zoom).
- **Loop:** `requestAnimationFrame` drives rendering; a fixed-step accumulator
  advances the simulation independently so physics is frame-rate independent.

## 10. UI (`ui/`)

DOM overlay (not in-canvas) for simplicity:

- Rocket selector (with a small spec readout and a **real-size hint**: exact
  height plus a plain-language comparison, e.g. "about as tall as a wine
  bottle"), motor selector (filtered to the
  rocket's compatible motors, or the full list when **allow any motor** is
  ticked — which lets the player overload a rocket and trigger a CATO),
  environment selector.
- Launch / Reset / Mute buttons; camera-mode toggle; simulation-speed toggle.
- Live HUD: altitude (above ground), vertical velocity, current apogee, flight
  status/phase.
- Post-flight summary: apogee, max velocity, flight time, outcome, drift
  distance, and (if a challenge was active) the score. On a crash/CATO the
  summary is delayed briefly so the explosion plays first.
- Optional challenge panel (choose challenge type + parameters before launch).
- The control panel is **collapsible** (header toggle) and **scrolls within the
  viewport** (`max-height` + `overflow-y`), so it stays usable on small and
  landscape-mobile screens without covering the view.

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
- **challenge scoring:** correct score for known landing inputs and boundary
  cases (landing-zone only; the height ladder is visual-only and unscored).

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
