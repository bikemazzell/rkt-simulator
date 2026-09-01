# Plan: Real-Size Rockets — Scale Clarity Feature

Goal: when a player picks a rocket, they **immediately grasp its real size** via
3–5 everyday comparison objects at the launch site, a true-scale rocket mesh, and
a world whose props are sized to match (1 unit = 1 meter everywhere).

## Findings (verified in code)

- Sim + data are already in real meters. Rockets: `look.bodyLengthM` 0.274–2.05 m,
  `diameterM` 0.0137–0.15 m (src/data/rockets.ts). ~13 rockets have
  `chuteDiameterM: 0` (tumble recovery — chute never deploys for them).
- **The core lie:** `buildRocketMesh` (src/world/rocketMesh.ts) renders
  `bodyLen = max(3, L*8)`, `radius = max(0.4, d*12)` → rockets appear 3.2–16.4 m
  tall — a 30 cm rocket looks bigger than a person.
- World is ~1 m units and mostly plausible; offenders found:
  - villagers ≈ 2.7 m tall (creatures.ts); cow shoulder ≈ 1.8 m; birds ≈ 2.6 m wingspan
  - backyard dog: 6×3×3 m giant; fence posts 6 m tall, 30 m apart
  - grass tufts 0.9 m; flowers 1.3 m (vegetation.ts)
  - rooftop house 60×60 m; roof fixtures 3–6 m (AC unit, vent, chimney)
  - launch pad 10 m diameter
  - buildings 15–90 m, trees ~8–10 m, boats: fine (keep)
- `effects.ts`: flame fixed 0.5×3 m **and `update()` hardcodes
  `flame.position.y = -1`** (line ~37), chute fixed radius 4 m at `topY+3`,
  explosion debris ~1–2 m — all oversized/mispositioned next to a true-scale rocket.
- Camera defaults frame the world, not the rocket: pos (40,30,60), target y+10,
  pan-speed floor 40 m/s.
- **Bathtub bug:** water surface at groundHeight+2.5, rocket/pad at groundHeight →
  every true-scale rocket (< 2.5 m) would be fully submerged. Naive fix
  (`groundHeight: 2.5`) drains the tub (rim would float at 5.5 m above the
  floor-anchored water; duck geometry breaks) — use `launchY` instead (below).
- Rocket rests sunk 0.25 m into the pad (pad top is 0.25 above ground; rocket y = groundHeight).
- Deploy = push to main (GitHub Pages workflow builds and deploys dist).

## Reference object ladder (real sizes)

| id            | height m | note                                  |
|---------------|----------|---------------------------------------|
| soda can      | 0.122    | ⌀ 0.066 — matches BT-80 bodies exactly |
| wine bottle   | 0.30     | ⌀ 0.075                               |
| dog (lab)     | 0.60     | shoulder height, quadruped            |
| child (6 y)   | 1.15     |                                       |
| cow           | 1.45     | shoulder                              |
| car           | 1.50     | 4.5 m long                            |
| person        | 1.75     | always included (anchor)              |
| pickup truck  | 1.90     | 5.8 m long                            |
| tall person   | 2.00     |                                       |

(coin dropped: log-distance selection would never pick it — smallest rocket
0.274 m dwarfs a 2.4 cm coin.)

Selection algorithm (pure, unit-tested), keyed on **total visible height**
`bodyLengthM + diameterM*1.5` (body + nose + fins silhouette), not raw bodyLengthM:

- sort by height; always include `person`
- include nearest-below and nearest-above the rocket's total height
- **missing side** (rocket taller than 2.00 m ladder max): skip that side,
  fill by log-distance instead
- fill toward 5 (min 3) with next-nearest by log-distance
- **redundancy suppression:** skip a candidate within ~12% height ratio of an
  already-picked rung (e.g. cow 1.45 vs car 1.50)
- Result: 3–5 objects that bracket the rocket. Same table powers a UI text hint
  ("0.41 m — about as tall as a wine bottle").

## Changes

1. **`src/world/scaleRefs.ts`** (new, pure data + selection, no THREE):
   reference table, `pickReferences(totalHeightM)`, `describeSize(totalHeightM)`.
2. **`src/world/scaleLineup.ts`** (new): blocky meshes for each reference +
   `buildScaleLineup(rocket, groundY, maxX?)` → group placed in a row beside the
   pad (+x from x≈1.4 m, spacing by footprint), each object standing on groundY.
   `maxX` = env row budget; refs whose row end would exceed it are dropped
   (sea raft maxX≈6.5, rooftop roof maxX≈11). Also builds a **1 m launch rod +
   blast plate** next to the rocket (a real model-rocket pad fixture and an
   excellent size cue; rod x = bodyRadius + 0.04). No rng → deterministic.
3. **`src/world/rocketMesh.ts`**: true scale — `radius = diameterM/2`,
   `bodyLen = bodyLengthM`; nose = radius*3; `userData.topY`, `userData.radius`
   for effects; `buildParachute(color, radiusM = max(0.05, chuteDiameterM/2))`
   (guard vs 0-chute rockets); `buildFlame(rocket)` sized from the rocket
   (~0.9× body length, ~1.2× radius) **and positioned at `-flameLen/2` at build
   time** so effects.ts stops overriding position.
4. **`src/world/effects.ts`**: remove hardcoded `flame.position.y = -1` (jitter
   via scale only); chute sits at `topY + chuteR`; explosion debris
   ~0.06–0.2 m; **short fading trail** (~1–2 s of positions, `THREE.Line`),
   owned and disposed by `RocketVisual` (serves orbit mode; follow mode keeps
   rocket centred).
5. **`src/world/environments/build.ts`**:
   - launch pad: cylinder ⌀ 3.2 m → thin plate ⌀ 3.2 m × 0.06 tall (top +0.03,
     no z-fight, rocket no longer buried)
   - rooftop: house 26×26 m (roof fixtures AC 2.2×1.4×2.2, vent 1.5³,
     chimney 1×2.2×1; flatten disc 48; flora roof range 4–11)
   - backyard dog: real dog ≈ 0.6 m shoulder (keep head-bob growl); fence posts
     0.3×1.8×0.3, 64 posts
   - bathtub: build code UNCHANGED (launchY handles the water level; giant duck
     stays — it's the joke)
6. **`launchY` (bathtub fix)**: `EnvParams.launchY?: number` in
   `src/sim/types.ts`; `params.ts` bathtub gets `launchY: 2.5`, `groundHeight: 0`
   (tub floor 0, water 2.5, rim 3, duck 4 all preserved; pad/rocket/lineup at
   water surface); sim ground = `launchY ?? groundHeight`
   (`src/sim/simulation.ts:46`, `src/sim/flight.ts:7`); main.ts HUD passes
   `launchY ?? groundHeight` so altitude reads AGL above the water.
7. **`src/world/creatures.ts`**: villager 1.8 m; per-kind animal scale
   (cow 1.45 / sheep ~0.95 / pig ~0.9 shoulder) with small per-kind jitter;
   birds ×0.55 (gull-sized).
8. **`src/world/vegetation.ts`**: grass 0.9 → 0.4 m **and instance offset
   +0.45 → +0.2**; flower 1.3 → 0.55 m; trees/shrubs keep (plausible young trees).
9. **`src/world/scene.ts`**: reset view frames the pad closely
   (cam ≈ (-3.5, 1.7, 6.5), target ≈ preview focus ≈ (1.2, 0.8, 0));
   pan speed `max(1.5, dist*0.9)` (drop the 40 m/s floor);
   `controls.minDistance = 1`.
10. **`src/main.ts`**: add scale lineup to worldGroup after env.build in **both**
    preview and launch paths, env-aware: **skip lineup for bathtub** (funny env,
    giant-scale is the joke, lineup on water is broken); sea `maxX 6.5`;
    rooftop `maxX 11`. Preview focus = rocket mid-height, not +10. HUD passes
    `launchY ?? groundHeight`.
11. **UI**: rocket panel shows "Height 0.41 m — about as tall as a wine bottle"
    (`describeSize`); `formatLength` helper (cm < 1 m).
12. **Docs**: README feature bullet + docs/spec.md world-layer sync.

Cloud widening was cut in review (scope creep; clouds are stylized-low on purpose).

## Out of scope / kept intentional

- Bathtub + rubber duck stay giant (explicitly comedic env).
- Trees, buildings, boats, terrain, clouds: already plausible.
- Sim physics untouched (already real meters; only launchY plumbing).

## TDD order

1. `tests/world/scaleRefs.test.ts` → impl (ladder sanity bounds, 3–5 count,
   person always, bracketing, missing-side fallback, redundancy suppression,
   determinism, describeSize nearest).
2. `tests/world/rocketMesh.test.ts` → real-scale impl (height ≈ bodyLengthM+nose,
   radius ≈ diameterM/2, topY, chute radius guard, flame size+position).
3. `tests/world/scaleLineup.test.ts` → lineup + rod (count matches selection,
   bbox heights ≈ ref heights ±15%, feet on groundY, ordered row, maxX drops
   overflowing refs).
4. `launchY`: types + params + simulation/flight/HD plumbing
   (environmentParams test: bathtub launchY 2.5, groundHeight 0).
5. Wire lineup into main.ts (preview + launch, env-aware).
6. Creature/vegetation/env-prop rescale + update affected tests
   (creatures, vegetation grass offset).
7. Camera + UI hint (+ format test).
8. Effects scaling + trail.
9. `npm run quality` (typecheck + tests + build), CDP smoke screenshots to
   eyeball framing; fix visuals.
10. README/spec sync, commit, push → Pages deploy.

## Review

Plan reviewed with `review-with` per mandated workflow.

- DeepSeek: reviews/plan-scale-deepseek-20260901.md — **APPROVE WITH CHANGES**
  (4 IMPORTANT + 6 MINOR).
- Qwen run 1: reviews/plan-scale-qwen-20260901.md — content complete, 8 findings
  (substantively APPROVE WITH CHANGES) but **format invalid** (no single
  `VERDICT:` line) → re-run: reviews/plan-scale-qwen-20260901-rerun.md.

### Review findings folded in

1. **[BOTH, IMPORTANT] flame position hardcoded** in effects.ts
   (`flame.position.y = -1`): resized flame would hang ~1 m below the nozzle of
   small rockets. Fix: bake position `-flameLen/2` into `buildFlame`; effects
   only jitters scale. (Change 3/4.)
2. **[DEEPSEEK, IMPORTANT] bathtub via groundHeight=2.5 drains the tub** (rim,
   duck and water-relative geometry all key off groundHeight). Fix: new
   `EnvParams.launchY`; bathtub keeps `groundHeight 0` + `launchY 2.5`; sim and
   HUD use `launchY ?? groundHeight`. (Change 6.)
3. **[BOTH, IMPORTANT] lineup placement must be env-aware**: sea raft is 16×16
   (±8 m) → clamp row (maxX 6.5); rooftop after house resize 26×26 (±13) →
   maxX 11; **skip lineup entirely on bathtub** (giant-scale is the joke; lineup
   on water broken). `buildScaleLineup` drops refs exceeding maxX. (Changes 2/10.)
4. **[BOTH] coin is never selectable** (log-distance always loses; smallest
   rocket 0.274 m vs coin 0.0243 m) → dropped from ladder; soda can ⌀0.066
   already matches BT-80 bodies. (Ladder table.)
5. **[QWEN, IMPORTANT] missing-side fallback**: falcon-9 total height 2.05 >
   ladder max 2.00 has no "nearest above". Spec: skip the missing side, fill
   that slot by log-distance. (Selection algorithm.)
6. **[QWEN, MINOR] redundancy suppression**: skip candidates within ~12% height
   ratio of a picked rung (cow 1.45 vs car 1.50). Target 5, min 3, person
   always. (Selection algorithm.)
7. **[QWEN, MINOR] 0-chute rockets** (~13 of them, tumble recovery): guard
   parachute radius to `max(0.05, chute/2)` so geometry stays valid; chute is
   never visible for them anyway (`chuteDeployed` stays false).
8. **[BOTH] trail line kept** with constraints: ~1–2 s fading positions,
   `THREE.Line` (1 px regardless of linewidth arg), owned + disposed by
   `RocketVisual`; mostly benefits orbit mode. Reviewers confirmed framing
   math: 0.5 m rocket at 6–8 m camera ≈ 6% of vertical FOV = legible.
9. **[DEEPSEEK, MINOR] selection keyed on total visible height**
   (`bodyLengthM + diameterM*1.5`), not raw bodyLengthM — nose/fins add
   perceived height. (Selection algorithm + describeSize input.)
10. **[DEEPSEEK, MINOR] grass offset**: with 0.4 m tufts the +0.45 y-offset
    floats them; offset must drop to +0.2. (Change 8.)
11. **[DEEPSEEK, MINOR] per-kind animal scale with small jitter** — keeps scene
    variety instead of uniform scale-out. (Change 7.)
12. **[QWEN, MINOR] reset() target**: cosmetic under follow mode; set reset
    target to the preview focus for clarity. (Change 9.)
13. **[DEEPSEEK, MINOR — CUT]** cloud widening = scope creep → removed from plan.
14. **Verified non-issues**: worldGroup lineup auto-disposed by `clearWorld()`;
    `minDistance 1` vs camera near 0.5 safe; pan-speed change safe at both ends.

## Review — completed 2026-09-01

**Verification evidence:**

- `npm run quality` green: typecheck clean, **199/199 tests** (31 files),
  vite build OK (pre-existing >500 kB chunk warning only).
- CDP smoke passed (`scripts/smoke-cdp.mjs`): canvas mounts, launch flies,
  apogee > 0, zero console errors. (Required a software-WebGL headless Brave:
  `--headless=new --enable-unsafe-swiftshader --ozone-platform=headless
  --use-angle=swiftshader-webgl` on port 9222 — desktop Wayland/Vulkan
  throttled rAF to zero in earlier attempts.)
- Numeric scene probes (projection via the page's live camera matrices +
  PNG pixel cross-check) verified per environment:
  - park + default rocket (0.492 m): rod 1 m and rocket 0.528 m render at
    exactly the projected pixel spans (78 px vs 41 px, ratio 1.90 ≈ 1/0.528);
    refs bottle/dog/child/cow/person all present, correct height ordering.
  - park + Falcon 9 (2.05 m): refs {dog, child, car, person, tall-person} —
    confirms the missing-above fallback (2.086 m > ladder max 2.00).
  - bathtub: lineup skipped, rocket floats at launchY 2.5 m, tub intact.
  - sea: person (last ref) ends at x 6.475 ≤ maxX 6.5 on the raft.
  - rooftop: rocket + lineup ride at groundHeight 12 m.
  - launch: exactly one trail Line in the scene, head y = 37.1 m matching
    HUD altitude 37 m mid-coast; no console errors.

**Deviations from plan:** none of substance. Cloud widening stayed cut;
coin stayed dropped. Two test-premise bugs (not product bugs) were caught and
fixed along the way: degenerate trail (all slots written with current pos →
history queue) and a wrong "trail drains when moving" assumption
(time-windowed trail legitimately holds ~90 pts while flying).

**Known minor gaps:** reference meshes are deliberately blocky silhouettes
(no per-ref materials beyond flat Lambert); trail is a 1 px unlit line
(THREE.Line ignores linewidth) — acceptable per review.

## Fix round 2 — user feedback on deployed build (2026-09-01)

User tested the deploy; three complaints, all diagnosed in code:

1. **Rod unreadable** — 4 mm gray stick + invisible 18 cm plate.
   Fix: thicken rod to 8 mm steel, orange safety tip cap on top, bigger
   hexagonal blast plate (r 0.16). Still a real launch-rod look.
2. **Same lineup every time + too narrow a range** — deterministic
   log-distance fill over only 9 rungs; no small/large objects exist.
   Fix: expand ladder to 22 rungs (eraser, golf ball, baseball, mug,
   soccer ball, book, fire hydrant, trash can, sheep, horse, door, house,
   elephant added); `pickReferences(h, rng?)` keeps nearest-below/above
   brackets but fills remaining slots by weighted-random over a ±4×
   log-window (person no longer forced). Seeded rng → per-preview variety;
   redundancy suppression (12%) kept so sheep/trash-can, cow/car,
   tall-person/horse/door alternate instead of stacking.
3. **Backyard dog missing + "sheep" larger than people** — dog was placed
   at `targetZone.center` (random point up to 120 m away, never in view,
   build.ts:326). Fix: dog guards the pad ~3 m from the rocket, facing it.
   The "sheep" were white cows (white body at near-person head height):
   recolor cow brown, sheep gets a dark head/legs, lower animal heads to a
   grazing pose, tighten size jitter (0.95–1.05).

Order: scaleRefs tests→impl → scaleLineup tests→impl (12 new meshes +
rod) → creatures/build/main wiring → quality gate → CDP probes (dog
present near pad, lineup differs across reloads, rod tip visible) →
docs touch-up → commit + push (Pages).

### Fix round 2 — verification (2026-09-01)

- Quality gate green after all fixes: typecheck clean, 201/201 tests, build OK.
- CDP probe (healthy headless instance, rAF ~18fps): 4/4 distinct park lineups
  with new rungs (sheep, book, trash-can, car, horse, soccer-ball,
  fire-hydrant); rod + orange tip + blast plate on every load; refs project
  on-screen; zero console errors across all loads.
- Backyard dog: meshes at world (2.6, 0.45, 2.0), head toward pad; pixel
  cross-check found dog-brown pixels at the projected screen spot (75 px in
  40x40 window around 897,346). Cow recolors live (1 brown cow, 2 white
  sheep with dark faces/legs).
- Smoke: `node scripts/smoke-cdp.mjs http://localhost:4173 9222` → OK, no
  console errors.
- Gotcha for future probes: a stray bare `brave --remote-debugging-port=9222`
  (Wayland/Vulkan, rAF throttled to 0) gave identity matrixWorld on the whole
  worldGroup while camera matrices stayed fresh (controls.update composes
  them) — verify rAF ticks before trusting matrix reads; kill by exact pid,
  relaunch with the swiftshader headless flags.

## Fix round 3 — user feedback (2026-09-01)

1. **Rocket clips pad (fins hidden)**: plate top = g+0.03 vs rocket base g. Fix: plate h 0.02 centered g-0.005 → top g+0.005 (5mm proud, z-fight-free at these depths); fins sink 5mm not 3cm; no sim/HUD changes.
2. **Bullseye pad**: launchPad → Group: plate + unlit markings (red center dot r0.18, white rings r0.55-0.62 + r1.15-1.24, crosshair bars 2.6×0.07 through center) at plate top +1mm. MeshBasicMaterial.
3. **Scatter refs around rocket** (not a row): ring placement r ∈ [2.0+R, 3.4+R], R = lengthM/2, facing rocket (yaw atan2(-x,-z)), pairwise dist ≥ Ra+Rb+0.2, extent |x|+R,|z|+R ≤ maxExtent (rename maxX), 60 rejection tries then drop (relevance order keeps brackets). Remove hex blastPlate (bullseye pad replaces).
4. **Camera floor**: SceneManager.setGroundFloor(y) (default 0); controls.maxPolarAngle = π/2+0.12; applyPan clamps target.y ≥ floor+0.15; render() clamps camera.y ≥ floor+0.12 after controls.update(). main.ts: setGroundFloor(params.groundHeight) after both env.build.
5. **Target-altitude ring**: new world/targetRing.ts buildTargetAltitudeRing(alt, baseY): amber torus r9 flat at baseY+alt, faint disc, beacon line pad→ring. Added to worldGroup in showPreview+launch when challenge=target-altitude; UI challengeSel/targetAltInput change → onChallengeChange → showPreview.

Order: scatter tests+impl → pad bullseye+plate → targetRing tests+impl+UI wiring → camera floor → quality → CDP verify → docs → commit/push/deploy.

### Fix round 3 — verification (2026-09-01)

- Quality gate: typecheck clean, 205/205 tests (4 new targetRing), build OK.
- Live CDP probes (healthy swiftshader instance, rAF running):
  - Plate top at +0.005 m → fins sink 5 mm max (was 30 mm); no sim changes.
  - Bullseye markings present (red 0.18 dot, rings 0.62/1.24, crossbars);
    pixel-verified in screenshot (red + 583 white marking px).
  - Refs scattered in a ring (min dist 2.77 m ≥ 2.0), facing the pad; sea
    refs all within 2.83 m of center (raft ±8).
  - Camera forced to y=-5 clamps to floor+0.12 within one frame.
  - Challenge select 'target-altitude' → amber ring appears at y=150 with
    torus+disc+beacon, updates via onChallengeChange → showPreview.
- Smoke: OK, no console errors (new probes also capture warnings: only the
  pre-existing THREE.Clock deprecation notice).

## Fix round 4 — terrain-aware landing (2026-09-01)

Bug: sim lands against flat scalar ground (simulation.ts:97 `y <= ground` = pad
level), but the world renders seeded heightmap terrain. Rockets drifting over
hills bury themselves below the visible surface; the snap-back to pad level
teleports them into terrain.

Plan:
1. SimConfig.groundAt?: (x, z) => number — landing sampler; pad support and
   apogee baseline stay on scalar pad ground (launchY ?? groundHeight).
   Landing check snaps to groundAt(x, z) at the post-integration position,
   falling back to pad ground when absent/NaN.
2. BuildContext.groundAt?: HeightAt out-param set by base() (flat envs =>
   () => groundY). Bathtub overrides: within r45 => water surface 2.5, else
   base terrain — rocket lands ON the water, not the tub floor.
3. main.ts: extract buildEnvironment() helper (both paths), launch() passes
   ctx.groundAt into Simulation. Extend debug __rkt with sim + groundAt for
   CDP verification.
4. TDD: sim tests (plateau landing, drifting hill landing w/ wind, NaN
   fallback); world test (all 8 envs set ctx.groundAt; bathtub water/beyond;
   pad center flattened; mountain terrain varies).
5. Quality gate + CDP mountain-launch probe: landed y == groundAt(x, z).

### Fix round 4 — verification (2026-09-01)

- Quality: typecheck clean, 212/212 tests (34 files), build OK.
- New tests: tests/sim/terrainLanding.test.ts (hill landing, valley landing
  below pad level, NaN fallback, distant-terrain apogee invariance) and
  tests/world/groundAt.test.ts (all envs set ctx.groundAt, pad flattened,
  mountain relief, bathtub water/floor split).
- Live CDP (probe-terrain.mjs, __rkt.sim + __rkt.groundAt): mountain landed
  y=1212 == groundAt(x,z) at (-36, 8.7) — rests ON the mountainside; park
  landed y=3 on a bump; bathtub splashed down at y=2.5 (water, not floor).
  Smoke OK, no console errors.
- Contract note: groundAt is trusted to equal pad level near the pad (world
  flattens a r34 clearing); apogee/liftoff stay pad-relative by design.

## Feature round 5 — launch-attitude gimbal ("gumball") — plan (2026-09-01)

USER REQUEST (verbatim intent): add a 3-circle (X,Y,Z) gimbal to set the rocket's
initial launch direction (currently always straight up). Drag a circle to rotate
the rocket (angle updates live while dragging). Double-click a circle to type an
exact angle (e.g. -180, 270) + Enter to set it. Each circle displays its angle.
Reset returns to default rocket-up.

### Findings (codebase, verified)
- integrator.ts:28 hardcodes thrust `vec(0, thrustN, 0)`; sim has NO attitude
  model (no tipping dynamics — `tip-off` is an outcome roll, not physics).
- flight.ts: initial velocity (0,0,0); simulation.ts: pad support clamps y at
  pad ground until liftoff; apogee baseline = pad-relative.
- main.ts: `onReset: showPreview` (Reset button); preview mesh added to
  scene.scene; rod+tip are children of buildScaleLineup group (userData.isRod /
  isRodTip) positioned relative to pad origin → rotating a rod subgroup about
  the lineup origin pivots correctly at the rocket base.
- OrbitControls owns renderer.domElement pointer events; gizmo drag must
  raycast first and toggle controls.enabled.
- Y-only rotation of an up vector is a no-op on direction (yaw sets the tilt
  compass once X!=0); Z-only (roll) is cosmetic for a symmetric rocket.

### Design decisions (post deepseek review — blocker + importants folded)
1. Convention: aim = Euler(x°, y°, z°) order 'XYZ' (three's default; matches
   Object3D.rotation for applyTo). VERIFIED axis semantics for an up-pointing
   rocket under v' = Rx·Ry·Rz·v:
   - X ring: tilt in Y–Z plane (positive → nose toward +Z).
   - Z ring: tilt in X–Y plane (positive → nose toward −X).
   - Y ring: SPIN (cosmetic for a symmetric rocket — never affects direction;
     still fully draggable/typable per spec).
   - Tilt "compass" = combination of X and Z; direction =
     (−sin z, cos z·cos x, cos z·sin x) — always unit.
   Angles normalized to (-180, 180]. Default {0,0,0} = straight up.
   aim.ts stays pure (sim has no three dep) with a parity test pinning it to
   THREE applyEuler — conscious decision, single source for sim + gizmo.
2. Sim: thrust along the FIXED initial direction for the whole burn (rail-
   guided stable rocket). PAD CLAMP EXTENDED: while !liftedOff the pad/rail
   holds the rocket in ALL axes (x/z frozen at launch point, lateral velocity
   zeroed) — a horizontal/down aim sits on the pad until the tip-off net
   (driftDistance 0), never slides off the flattened clearing. Zero/NaN
   direction input falls back to straight up (guard in simulation).
3. Gimbal visible ONLY in preview; launch() consumes angles
   (SimConfig.initialDirection) and disposes the gizmo. Angles persist across
   rocket/env/challenge changes; Reset zeroes them — via a WRAPPED handler
   `onReset: () => { aim = AIM_DEFAULT; showPreview(); }` AND the space-key
   reset path (both zero; selection-change paths keep plain showPreview).
   showPreview() calls clearGimbal() (alongside clearRocket) so repeated
   rebuilds never leak gizmo meshes or label DOM.
4. Rocket mesh AND launch rod tilt together around the rocket base (rod is the
   aim rail). Refs/pad stay put. Bullseye pad unchanged.
5. Labels: 3 HTML divs projected per frame from ring anchors; hidden when the
   anchor is behind the camera (w<0) or off-screen. Drag starts only after a
   ~3px move threshold (click/drag disambiguation); dblclick opens the input;
   double-TAP (two touches <350ms) opens it on touch. Enter commits, Esc/blur
   cancels. SceneManager gains public setControlsEnabled(bool) for drag lock.
6. New debug QS `?seed=<n>` (launch seed override) + `__rkt.aim` getter and
   `__rkt.setAim({x,y,z})` so CDP can set/read exact angles deterministically.
7. Docs note: flights hold a fixed world attitude (no windcocking at this sim
   fidelity) — aimed rockets fly "nose-true" while velocity curves.

### Steps (TDD)
1. src/sim/aim.ts (pure): AimAngles, normalizeAngle→(-180,180], AIM_DEFAULT,
   aimDirection(angles)→unit Vec3 (hand-rolled 'XYZ': dir =
   (−sin z, cos z·cos x, cos z·sin x); y drops out — spin only).
   tests/sim/aim.test.ts: default up; X+90 → (0,0,+1), X−90 → (0,0,−1);
   Z+90 → (−1,0,0), Z−90 → (+1,0,0); Y-only no-op ANY y; Z-only is a TILT
   (not roll); X+Z combined matches formula; normalize (270→−90, 35, −180→180);
   parity vs THREE applyEuler over sampled grid incl. all-three-nonzero;
   unit length always.
2. integrator.ts: StepInput.thrustDir?: Vec3 (default up);
   thrustForce = scale(thrustDir, thrustN). tests: tilted thrust → lateral
   velocity; horizontal thrust → zero vertical; absent → unchanged.
3. SimConfig.initialDirection?: Vec3 (unit; doc: thrust direction for entire
   burn; zero/NaN falls back to up). simulation.ts: normalize+guard once, pass
   to stepMotion each step; PAD CLAMP: while !liftedOff freeze x/z at launch
   point + zero lateral velocity (all-axis rail hold).
   New tests/sim/aimedLaunch.test.ts: 35° tilt same seed → apogee < vertical,
   drift > 10 m with horizontal direction matching aimDirection() horizontal
   component (single source of truth, no hand-assumed azimuth); no
   initialDirection → state trace EXACTLY equals legacy run (determinism);
   90° → never lifts, x/z stay at 0 (frozen), tip-off fail, drift 0;
   downward aim → held on pad → tip-off; terrain landing still ends flight.
4. src/world/gizmo.ts (DOM-light): buildGimbal(radiusM) → Group: 3 ring
   LineLoops (X 0xff5252 / Y 0x66ff8c / Z 0x5aa2ff, depthTest false,
   renderOrder high) each with fat transparent hit torus (tube 0.06) +
   userData axis + label anchor; radius = clamp(0.35, topY*0.45, 0.8).
   GimbalController(scene-side class): angles state + reset(), set(axis,deg)
   normalized, nudge, direction() (reuses sim aimDirection — single source),
   applyTo(object3D) (rotation order 'XYZ'), attachRod(group), hitTest(ray),
   drag math: ray ∩ plane(normal=ring axis, through center; fallback plane
   normal=camera-forward when |dot|>0.99) → (u,v) basis atan2 delta, signed
   right-hand; label layer: attachLabels(container) 3 divs + input popup,
   updateLabels(camera,rect) projection, openInput(axis,x,y) Enter/Esc/blur.
   attachControls(dom,{lockControls,unlockControls}): pointerdown raycast →
   drag w/ pointer capture after 3px move threshold, live apply + labels
   (click/dblclick never rotate); dblclick (mouse) + double-tap <350ms
   (touch) → input; updateLabels hides anchors behind camera (w<0) or
   off-screen.
   tests/world/gizmo.test.ts: rings/proxies/anchors built per axis; set/
   normalize/nudge/reset; applyTo direction parity (mesh.localToWorld of
   (0,topY,0) tilts per aimDirection); dragDelta synthetic ±90; hitTest;
   label text contents 'X 35°' style; input commit via fake events.
5. main.ts wiring: module `let aim: AimAngles` (persists across selection
   changes); clearGimbal() beside clearRocket (dispose gizmo + labels) called
   at top of showPreview; showPreview(): create gimbal after previewMesh
   (apply aim to mesh + rod subgroup; buildScaleLineup gains userData
   .isRodGroup subgroup for rod+tip), gizmo into scene.scene at rocket base,
   labels into host; launch(): initialDirection: aimDirection(aim), rotate
   launch mesh + RocketVisual group, gimbal.dispose(); onReset wraps
   zero-aim + showPreview; space-key reset path zeroes too; ?seed= override;
   __rkt gains get aim() + setAim(). CSS: .rkt-gizmo-label, .rkt-gizmo-input.
6. scaleLineup.ts: rod+tip moved into a userData.isRodGroup subgroup (pure
   refactor, layout identical); update its tests if they assert direct child.
7. npm run quality (typecheck + all tests + build).
8. CDP probe-gimbal.mjs: labels read 'X 0°'; drag X-ring via Input mouse arc →
   aim.x changes AND camera unmoved (orbit untouched); dblclick → input →
   '35' + Enter → aim 35, mesh rotated, label live; also setAim for exact
   angles; ?seed=123 park launch 0° vs 35° → apogee drop + horizontal drift
   matching aimDirection() horizontal; horizontal 90° aim → tip-off, x/z
   frozen at 0; Reset → zeros; bathtub gizmo at y 2.5; console-error sweep;
   screenshots; scripts/smoke-cdp.mjs.
9. Docs: README bullet (aim gimbal: drag rings, dblclick to type, Reset);
   spec.md §4 controls + §9 module + sim initial-direction semantics.
10. tasks/todo.md verification section; commit; push (Pages auto-deploy).

### Review checkpoint
Plan reviewed by deepseek + qwen (review-with); findings folded below before
implementation starts.

## Feature round 5 — gimbal: verification + review outcomes (2026-09-01)

Reviews: deepseek APPROVE WITH CHANGES (1 blocker axis semantics + 3 important
+ 8 minor — all folded); qwen rerun APPROVE WITH CHANGES (1 blocker + 5
important + 6 minor; 11/12 already covered by the revised plan/impl, 1 genuine
new finding adopted: rod pivot at pad centre lifted its base when tilting —
fixed by pivoting rodGroup at the rod's own base).

Quality: typecheck clean, 241/241 tests, build OK (pre-existing >500kB chunk
warning only).

CDP probe (8/8 green, zero console errors incl warnings):
- preview: rings + rod + labels X/Y/Z 0°; setAim({z:35}) → rocket + rod
  rotation.z exactly 35°, order XYZ
- drag X-ring: hover-lock cursor 'grab', aim.x live-updates, camera unmoved
- dblclick Y-ring: popup input '-120' + Enter → aim.y −120
- flight ?seed=123: straight apogee 59.31 m vs aimed(z:−35) 34.60 m, drift
  110.75 m along aim horizontal, both nominal
- 90° aim: rail tip-off, frozen at pad until fail (by design)
- Reset zeroes aim; rocket/env/challenge changes persist it
- bathtub: gizmo at y 2.5, no rod (lineup skipped there)

Bug found by own probe and fixed: __rkt.setAim clobbered y/z (change-cb
re-assigned `aim` from the half-updated controller between the three set()
calls) — fixed by capturing the normalized target first.

Smoke: OK, no console errors. Docs synced (README feature bullet; spec §4.3
gimbal + ?seed= overrides, §7.1 initialDirection, §9 gizmo/aim modules).

## Fix round 6 — flight attitude, relaunch, post-landing gimbal — verification (2026-09-01)

User reports: model never pointed along the trajectory (always launch-up);
chute should hang nose-up; successful-landing Launch forgot the resting
spot/orientation and the gizmo never came back after landing.

- Quality gate: typecheck clean, 250/250 tests (38 files; +5 RocketVisual
  attitude, +4 launchOrigin), build OK.
- CDP probe /tmp/opencode/probe-round6.mjs (preview :4173, swiftshader
  headless): boost nose·velDir dot = 1.000 exact; chute descent noseY = 1.0;
  gizmo rebuilt at exact landing spot (110.05, 3, 12.48) with 3 labels;
  relaunch climbs from the resting spot (apogee 2 above it), gizmo cleared
  during flight; zero console errors; smoke OK.
- Reviews: not re-reviewed (delta-only fixes on an already reviewed plan;
  probe coverage was the gate).
- Bonus bug fixed: pending summary toast could pop over a relaunch (timer
  now cleared in launch()).
