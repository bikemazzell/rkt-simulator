# rkt-simulator

A browser model-rocket flight simulator with a lively blocky, Minecraft-style
world. Pick a rocket and motor from the real Estes catalogue, choose an
environment, and fly — under a day/night cycle, through weather, over stepped
procedural terrain.

## Features

- **Physics-first simulation** — deterministic, seeded flights: thrust curves,
  atmospheric drag, wind and gusts, tipping, parachute recovery, CATO and
  crash outcomes. Fixed-timestep integration (frame-rate independent).
- **True real-world scale** — 1 world unit = 1 meter. Rockets render at their
  catalogue size (0.27 m to 2.05 m) on a bullseye pad with a 1 m launch rod
  (orange tip), surrounded by everyday **scale-reference objects**
  (baseball, wine bottle, dog, sheep, cow, car, person, house, elephant…,
  22 rungs) picked per rocket and **scattered in a ring around the pad** with
  a fresh random draw each time. The rocket selector shows a human-scale hint
  ("Height 41 cm — about as tall as a wine bottle"). Props, creatures, and
  vegetation are real-sized to match (1.8 m villagers, 0.4 m grass, brown
  cows, dark-faced sheep — and the backyard dog guards the pad).
- **Real Estes catalogue** — rockets and motors scraped from the manufacturer
  specs, with type-ahead search and compatibility filtering (or overload a
  rocket and see what happens).
- **Launch-attitude gimbal** — three colored rings (X red, Y green, Z blue)
  around the preview rocket set its launch direction. Drag a ring to tilt or
  spin (angle labels update live), double-click (or double-tap) to type an
  exact angle. The launch rod tilts with the rocket; a horizontal aim ends in
  a rail tip-off. In flight the rocket weathercocks — the model points along
  its direction of travel, nose-up again once the chute is out. After a soft
  landing the gimbal reappears at the resting spot: press Launch to fly again
  from exactly where it lies. Reset zeroes the aim, changing
  rocket/env/challenge keeps it.
- **Eight environments** — park, urban, mountain, desert, open sea, rooftop,
  plus two funny ones: a giant bathtub (launch off a rubber duck) and a
  backyard guarded by an angry dog.
- **Blocky living world** —
  - multi-colored tiled ground with per-environment palettes
  - procedural stepped terrain (seeded value noise quantized into terraces),
    with a forced-flat launch pad and water basins
  - day/night cycle: sun, square moon with craters, stars, animated sky dome
  - drifting clouds, wind-swayed trees/shrubs/grass, flowers
  - wandering villagers, cows/sheep/pigs, circling birds, bobbing dog
  (all creature-sized: people 1.8 m, cows 1.45 m at the shoulder, gulls)
  - shimmering blocky water: ponds, alpine lake, open sea, bathtub suds
  (in the bathtub the pad floats at the water surface, suds and all)
  - weather: rain, snow, thunderstorms with lightning and tightened fog
  - fading launch trail behind every flight, chute and burst effects
    scaled to the rocket
- **Challenges** — target-altitude (with an amber altitude ring marking the
  target in the sky), target-landing-zone (scored) flights.
- **Audio** — lightweight synthesized SFX, muted by default.

## Controls

| Input | Action |
| --- | --- |
| Mouse drag | Orbit camera |
| Scroll | Zoom |
| W A S D | Pan camera |
| Q / E | Move camera down / up |
| `Space` | Launch / reset |
| `C` | Toggle follow / orbit camera |
| `F` | Cycle simulation speed (1x / 4x / 16x) |
| `M` | Mute / unmute |

## Quickstart

```sh
npm install
npm run dev        # http://localhost:5173
```

Production build and preview:

```sh
npm run build
npm run preview    # http://localhost:4173
```

## Project layout

```
src/
  sim/       pure physics: rng, thrust curves, atmosphere, integration,
             flight phases, outcomes, challenges (no Three.js imports)
  data/      rocket + motor catalogue (pure data)
  world/     Three.js scene: environments, terrain, sky, weather, water,
             vegetation, creatures, clouds, effects, true-scale rocket mesh
             + scale-reference lineup (reads sim one-way)
  ui/        DOM overlay: selectors, HUD, flight summary
  audio/     synthesized sound effects
tests/       vitest suites (sim, data, ui, world)
scripts/     smoke-cdp.mjs — headless Brave CDP launch smoke test
docs/        spec.md, plan.md, plan-world-enrichment.md
```

Architecture rule: `src/sim/**` and `src/data/**` never import `three`,
`world`, or `ui` — the world layer reads simulation state one-way. All
randomness in sim/data flows through the seeded `Rng`, so flights are
reproducible from a seed.

## Testing

```sh
npm run quality    # typecheck + vitest + production build
npm test           # vitest only
```

Rendering is smoke-tested headlessly:

```sh
/usr/bin/brave-browser-stable --remote-debugging-port=9222 &
npm run build && npm run preview
node scripts/smoke-cdp.mjs
```

The script opens the app over the CDP port, launches a flight, and fails on
console errors or a dead launch.

Debug query params (for testing/screenshots): `?env=<id>`, `?tod=<0..1>`
(day phase), `?weather=rain|storm|snow`, `?cam=az,el,dist[,targetY]`.

## Deployment

Pushing to `main` triggers the GitHub Pages workflow
(`.github/workflows/deploy.yml`): build `dist/` and publish.
