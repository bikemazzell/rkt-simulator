# World Enrichment Plan — Blocky Scenic Overhaul

**Goal:** Transform the flat, static environments into lively, Minecraft-style
scenes: multi-colored blocky tile ground, day/night cycle with sun/moon/stars,
drifting blocky clouds, weather (rain/snow/storm), blocky vegetation with wind
sway, animated villagers/animals/birds, and shimmering blocky water — while
keeping the pure-sim core untouched and the quality gate green.

**Spec baseline:** `docs/spec.md` (§8 environments, §9 rendering). This plan
extends the world layer only; `src/sim/**` and `src/data/**` remain frozen.

**Constraints carried over from `docs/plan.md`:**

- `src/sim/**` and `src/data/**` MUST NOT import `three`, `world`, or `ui`.
- No `Math.random` in `sim`/`data`; world cosmetics may use the passed `Rng`
  (seeded → stable preview via `PREVIEW_SEED`) or `Math.random` for pure jitter.
- Quality gate: `npm run quality` (typecheck + vitest + build) must pass.
- Rendering is smoke-tested via Brave CDP (port 9222), screenshots into
  `scratchpad/`.

---

## Architecture

### Dynamic world systems

Environments currently build static meshes once. Day/night, weather, creatures
and clouds need per-frame updates, so we introduce a minimal system interface:

```ts
// src/world/system.ts
export interface WorldSystem {
  update(dt: number, elapsed: number): void;
  dispose(): void;
}
```

- `BuildContext` (environments/types.ts) gains `registerSystem(sys: WorldSystem)`.
- `SceneManager` owns the system list: `registerWorldSystem()`, `updateWorld(dt)`,
  and `clearWorld()` also disposes systems (in insertion order), clears fog, and
  resets `scene.background`.
- **Parenting rule:** systems parent renderables to `ctx.root` (worldGroup) so
  the existing traversal disposes them; anything a system touches outside
  `worldGroup` (background, fog, lights added to `scene`) is reverted in its own
  `dispose()`.
- **Persistent clock:** SceneManager accumulates `elapsed` across rebuilds and
  passes `(dt, elapsed)` — day/night does not snap back on env/rocket change.
  Ambient time advances on real dt only (the sim speed multiplier does NOT
  fast-forward the sky, clouds, or creatures).
- `clearWorld()` traversal additionally calls `obj.dispose()` on
  `THREE.InstancedMesh` (frees instance buffers; grass/rain/snow are instanced).
- `main.ts` calls `scene.updateWorld(dt)` every frame before render.

### AmbientSystem (composer)

`src/world/ambient.ts` — one `AmbientSystem` per scene build, registered by the
shared environment base. It owns:

- **Day/night clock** — phase in `[0,1)` derived from the SceneManager-persisted
  `elapsed` (`startPhase + elapsed / DAY_LENGTH_SEC`; full cycle 240 s; 0.0
  sunrise, 0.25 noon, 0.5 sunset, 0.75 midnight). Query param `?tod=0.0..1`
  overrides the start phase (deterministic CDP tests).
- **Lights** — hemisphere + directional sun + directional moon; colors and
  intensities driven by `daynight.ts` (replaces the per-env `addLights`).
- **Background & fog** — AmbientSystem owns `scene.background` (color driven
  from `skyColors()`, matched to the dome horizon) and a linear `THREE.Fog`
  (near/far tightened by weather); both reverted on dispose. Sky dome, sun/moon
  discs, and star materials set `fog: false` so weather fog never washes them out.
- **Subsystems** — sky dome, clouds, creatures, weather FX, water shimmer,
  vegetation sway (each also a `WorldSystem`, updated by the ambient system).

### Pure modules (unit-tested, no `three` imports)

| Module | Exports (essence) | Tested invariants |
|---|---|---|
| `src/world/biome.ts` | `biomeFor(envId)` → palettes, flora mix, creature mix (incl. `creatureGroundY`), weather weights, water spec | every env id covered; palettes non-empty; weights normalized |
| `src/world/daynight.ts` | `DayNight` class + `sunElevation(phase)`, `skyColors(phase)`, `lightLevels(phase)`, `starAlpha(phase)` | keyframe continuity; noon bright / midnight dark; determinism |
| `src/world/tiles.ts` | `tileColor(biome, tx, tz, seed)`, `tileVariant(biome, tx, tz, seed)` | deterministic per (x,z,seed); colors ∈ biome palette; a 20×20 patch shows ≥ ceil(palette/2) distinct colors |
| `src/world/weather.ts` | `pickWeather(biome, rng)` → `'clear'|'rain'|'storm'|'snow'` | deterministic per seed; respects biome weights (snow never in desert, storm rare) |
| `src/world/placement.ts` | `scatterPositions(rng, {radius, count, clearance})`, `wanderTarget(...)` | inside bounds; outside pad clearance; deterministic |

### Render modules (three.js, CDP-verified)

| Module | Responsibility |
|---|---|
| `src/world/ground.ts` | `buildTiledGround(...)` — one `BufferGeometry` of per-tile quads with vertex colors from `tiles.ts` (crisp blocky tiles, 1 draw call). Budget: tile size 5 m, tiled radius 250 m (≤ ~10k tiles / 40k verts). A flat base disc at 3000 m radius (camera far = 5000) under fog sells "infinite" ground. Optional `groundY` override (rooftop street level) |
| `src/world/sky.ts` | `SkySystem` — back-side vertex-colored sky dome (top/horizon lerp), sun disc + moon disc orbiting per `daynight`, star `THREE.Points` fading in at night |
| `src/world/vegetation.ts` | blocky flora builders (oak/birch/pine/palm/cactus/shrub/grass tuft/flower via `InstancedMesh` where dense); registers sway animation |
| `src/world/clouds.ts` | `CloudSystem` — clusters of flat white boxes at y≈120–220 drifting along the wind vector, wrapping in bounds |
| `src/world/creatures.ts` | `CreatureSystem` — blocky villagers (walk cycle + wander), quadruped animals (pig/sheep/chicken), birds circling with flapping wings; backyard dog gets an idle head bob. Spawns respect pad clearance and biome `creatureGroundY` |
| `src/world/water.ts` | `buildWater(...)` + shimmer — blocky water quads whose vertex colors cycle through a blue palette; shimmer grids capped at 64×64 quads, color attribute refreshed at ~10 Hz (not per frame) |
| `src/world/weatherFx.ts` | `WeatherSystem` — rain (instanced thin boxes, fast fall), snow (slow, swaying), storm = rain + lightning flash (ambient/sky pulse), clear = no-op |

### Biome integration (build.ts refactor)

`base()` stops adding lights (AmbientSystem owns them) and instead:
`ground = buildTiledGround(biome, params, seed)` and registers `AmbientSystem`.
Per-environment builders pass biome-driven options; special cases:

- **sea** — opts out of tiled ground from the start (flat water disc until
  Task 7 upgrades it); boats stay; birds only, no ground creatures.
- **bathtub** — small tiled tub water + ceramic-tile rim; no ground creatures.
- **rooftop** — street-level tiles (`groundY: 0`); roof fixtures stay; a few
  street-level creatures.
- **mountain** — rock/snow-touched palettes at distance, pines, lake.
- **backyard-dog** — garden tiles, fence, dog stays (dog gains idle head bob in
  Task 6).

**Debug query params (main.ts):** `?tod=<0..1>` start phase, `?weather=<clear|rain|storm|snow>`
force weather. Used only by CDP verification; defaults keep normal behavior.

---

## Tasks

Order chosen so every task ends green (`npm run quality`) and is visually
verifiable; each task is one commit.

### Task 1: System infrastructure + day/night core

- `src/world/system.ts` (interface), `src/world/biome.ts`, `src/world/daynight.ts`.
- `BuildContext.registerSystem`; SceneManager system list + persistent clock +
  disposal (incl. InstancedMesh buffers, fog, background reset); main.ts
  `updateWorld(dt)`.
- `AmbientSystem` v1: clock, lights (hemi/sun/moon), background, fog — no
  meshes yet.
- Tests: `tests/world/daynight.test.ts`, `tests/world/biome.test.ts`
  (continuity, extremes, determinism, biome coverage).
- CDP: scene unchanged except lighting now animates; screenshot sanity.

### Task 2: Blocky tiled ground

- `src/world/tiles.ts` (pure) + tests; `src/world/ground.ts` builder (budget:
  5 m tiles, 250 m tiled radius, 3000 m base disc).
- Replace `groundDisc` in `base()`; biome palettes (park greens, desert sands,
  urban grays, mountain rock/grass, backyard lawn, tub ceramic). Sea keeps its
  flat water disc until Task 7.
- Tests: determinism, palette membership, quantified variation, biome coverage.
- CDP: screenshot — visibly multi-colored tiles in ≥3 environments.

### Task 3: Sky dome, sun, moon, stars

- `src/world/sky.ts` — dome (top/horizon vertex colors), sun/moon discs on
  circular paths, star points; driven by ambient day/night clock. All sky
  materials `fog: false`.
- CDP: `?tod=0.25` vs `?tod=0.75` screenshots — blue sky + sun vs dark sky +
  stars + moon (pixel-asserted, see protocol).

### Task 4: Vegetation (trees, shrubs, grass, flowers)

- `src/world/placement.ts` (pure) + tests — scatter positions with pad
  clearance (reused by Task 6 creatures).
- `src/world/vegetation.ts` — blocky oak/birch/pine/palm/cactus/shrub/grass/
  flower builders; `InstancedMesh` for grass tufts (≤ 2000 instances);
  trunk/canopy sway in wind.
- Per-biome flora mixes replace today's single tree shape (park: oaks/birches;
  mountain: pines; desert: cacti + dead shrubs; backyard: hedges + flowers).
- CDP: park/mountain/desert screenshots show distinct flora.

### Task 5: Clouds + wind drift

- `src/world/clouds.ts` — flat box clusters (≤ 20) drifting with `wind.base`,
  wrapping in bounds.
- CDP: two screenshots seconds apart show cloud displacement; no console errors.

### Task 6: Creatures — villagers, animals, birds

- `src/world/creatures.ts` — walking villagers (limb swing), wandering animals
  (pig/sheep/chicken), circling flapping birds; backyard dog idle head bob;
  spawn via Task 4's `placement.ts` and biome `creatureGroundY` (sea = birds
  only). Budget: ≤ 30 creatures, ≤ 14 birds per environment.
- CDP: park screenshot shows characters/animals/birds; launch still flies.

### Task 7: Water bodies

- `src/world/water.ts` — blocky shimmering water (64×64 quad cap, ~10 Hz
  recolor); park/mountain ponds, sea upgrade (raft stays), bathtub interior,
  backyard birdbath pond.
- CDP: sea + park screenshots show animated water; no z-fighting with pad/raft.

### Task 8: Weather — rain, snow, storm

- `src/world/weather.ts` (pure pick + weights) + tests; `src/world/weatherFx.ts`
  (rain/snow instanced particles ≤ 1500 each, storm lightning + fog tightening).
- `?weather=` override for deterministic CDP shots of each type.

### Task 9: Integration sweep + docs sync + README

- All 8 environments via CDP: launch flies, no console errors, screenshots.
- Perf sanity: frame loop stays smooth within the budgets above.
- Sync `docs/spec.md` §8/§9 with the new ambient layer (short update).
- Generate `README.md`: what the game is, screenshot, features (rockets,
  environments, ambient world), controls, dev quickstart (`npm install`,
  `npm run dev`, `npm run quality`, CDP smoke test), project layout.
- Full `npm run quality`.

---

## Verification protocol (every render task)

1. `npm run quality` — must pass.
2. Build + `vite preview` (port 4173); Brave with
   `/usr/bin/brave-browser-stable --remote-debugging-port=9222`.
3. `node scripts/smoke-cdp.mjs` (full launch flight) must pass.
4. Targeted screenshots via CDP (`?tod=`/`?weather=` overrides where relevant)
   written to `scratchpad/`; pixel assertions decode the PNG with `pngjs`
   (devDependency, script-side only) — e.g. sky mostly blue at noon, dark with
   bright star pixels at midnight.
5. Commit with a scoped `feat(world): ...` message.

## Risks / mitigations

- **Perf (tiles/particles/creatures):** single-draw-call tile geometry
  (≤ ~10k tiles); `InstancedMesh` for grass (≤ 2000) and rain/snow (≤ 1500
  each); ≤ 30 creatures + ≤ 14 birds + ≤ 20 cloud clusters per environment;
  fog hides the tiled-radius and base-disc edges.
- **Z-fighting:** tiles sit 0.05 below `groundHeight`; pad/raft/water keep the
  existing offsets; water 0.02 above ground where coexisting (ponds).
- **Disposal leaks:** every system implements `dispose()`; `clearWorld()`
  disposes systems before meshes, frees InstancedMesh buffers, and resets
  fog/background.
- **Determinism for tests:** placement/tiles/weather flow the seeded `Rng` only;
  CDP uses query-param overrides instead of wall-clock dependence.
