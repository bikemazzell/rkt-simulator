# Review: plan-qwen-20260830-1042-retry.md

| field | value |
|---|---|
| reviewer | `qwen` |
| backend | `opencode` |
| model | `openrouter/qwen/qwen3.8-max` |
| workdir | `/home/v/Documents/Dev/rkt-simulator` |
| write access | none (read-only, enforced) |
| started | 2026-08-30T10:42:29+02:00 |
| finished | 2026-08-30T10:50:07+02:00 |
| exit code | 0 |

---

VERDICT: APPROVE WITH CHANGES

- IMPORTANT — docs/plan.md:1035, 1197-1205 (Task 6 Step 8 / Task 7 Step 3, chute deployment timing) — Chute deploys instantly on the apogee tick; spec.md:155-156 requires deployment *after the ejection delay*, and `Motor.delayS` (types.ts:307) is dead data never consumed by any sim logic. Gameplay-relevant deviation an implementer will ship literally. Fix: schedule deployment at burnout + `delayS` (or apogee + delay) by storing a pending deploy time in `Simulation`, roll the chute outcome at that time, and add a test asserting deployment occurs `delayS` after burnout, not at apogee.

- IMPORTANT — docs/plan.md: Task 16 (2106-2191) and Task 17 `main.ts` (2205-2300) — Spec §4.3 (spec.md:74) keyboard controls (`Space` launch/reset, `C` camera toggle, `M` mute) are not implemented by any task; no `keydown` wiring exists in `Ui`'s interface or `main.ts`. The Self-Review's claim that "all spec sections map to at least one task" is false for §4.3. Fix: add a keydown handler step to Task 16 or 17 dispatching to the existing `UiHandlers`.

- MINOR — docs/plan.md:1119-1126 and fixture seed at 850 (Task 7 apogee test, Task 6 sim tests) — Two tests hinge on unverified RNG draws: the "deploys the chute" test fails if the first `mulberry32(1)` draw is < 0.04 (~4% chance as authored), and all five Simulation tests fail if the first `mulberry32(123)` draw is < 0.01 CATO baseline. I could not execute the RNG to verify these draws. Fix: make the tests seed-sweeping (assert majority behavior over N seeds) or pin seeds known-good after one verification run.

- MINOR — docs/plan.md:348-349 vs 998-1043 (`FlightState` vs `Simulation.step`) — `liftedOff` and `impactSpeed` are declared with behavioral comments but never assigned anywhere in `step()`; dead fields. Related: a TWR < 1 config would integrate into the ground on tick 1 and be reported `landed`/`nominal` with apogee 0 (no catalog combo triggers this, but nothing guards it). Fix: set `liftedOff` once `position.y > groundHeight`, capture `impactSpeed = Math.abs(velocity.y)` in the ground clamp before zeroing, or delete the fields.

- MINOR — docs/plan.md:918-928 (Task 6 test) — "passes through boost, coast, apogee, descent, landed **in order**" uses a `Set` of seen phases and only asserts membership; it cannot detect out-of-order transitions, which spec §14 explicitly requires testing. Fix: record the sequence of first phase changes and assert the ordered subsequence.

- MINOR — docs/plan.md:1964 (Task 14 `RocketVisual.update`) — Spec §9 (spec.md:223-224) calls for an explosion burst on "CATO/**hard landing**"; the effect only fires on `phase === 'failed' || outcome === 'cato'`. A chute-fail ballistic landing produces no effect. Fix: trigger `explode()` (or a smaller burst) when landing with high `impactSpeed` / outcome `chute-fail` (requires the `impactSpeed` fix above).

- MINOR — docs/plan.md:1395 (Task 9 motor data) — A8-3 `avgThrustN: 8` is internally inconsistent with `totalImpulseNs/burnTimeS` = 2.5/0.5 = 5 N; every other motor agrees within ~4%. `avgThrustN` feeds only the tip-off TWR check, so impact is small but the value overstates TWR. Fix: set ≈5 N or reconcile against the Estes spec sheet.

- MINOR — docs/plan.md:1982-1986 (Task 14 `RocketVisual.dispose`) — Removes rocket/explosion from the scene but never disposes geometries/materials (unlike `SceneManager.clearWorld`, which does); small GPU leak on every launch/reset. Fix: traverse-and-dispose before removal.

- MINOR — docs/plan.md:1560-1563 vs 1704-1708 (Task 10/11 registries) — The 8 environment ids are enumerated independently in `MAKERS` (params.ts) and `environmentDefs` (build.ts); no test asserts they agree, so a drift makes `makeParamsFor` and `environmentById` silently inconsistent. Fix: add a pure registry-consistency test in Task 11 (ids match 1:1; no rendering needed). Also note `c as any` in the Task 9 test (line 1353) violates the plan's own no-`any` constraint; use `as MotorClass`.

Verified correct (no action): SHAPE_MEAN = 0.8 is the exact analytic mean of the rise/sustain/taper shape, so impulse conservation is exact, and the midpoint-integration test has O(dt²) error at breakpoints (~1e-6), well inside 1%. The semi-implicit Euler step (velocity then position) is correct; the closed-form apogee test is not tautological — discrete-vs-continuous error ≈ ½·a·dt·T ≈ 0.4 m on ~460 m (~0.09%), safely within 2%. Drag correctly uses air-relative velocity (wind test passes for the right reason), mass burn is linear per spec, and the ground clamp terminates flight. Determinism holds: all sim RNG draws occur at fixed cadence inside `step()` (`windAt` = 2 draws/tick, outcome rolls at defined points); the accumulator only paces steps and cannot change the step count to completion; `Math.random` appears only in the cosmetic flame flicker and the `Date.now()` seed source, both explicitly permitted. The Task 6 Step 9 → Task 7 forward dependency is real but explicitly documented, as noted. No hang path found: gravity guarantees descent, CATO sets `failed` before integration, and the frame loop clamps `dtMs` to 100 ms (~12 steps/frame), so no death spiral.

## Assumptions and gaps

- No execution environment available in this review: I could not run `mulberry32` to verify the seed draws flagged in finding 3, nor run the test suite or typechecker.
- Could not verify currently published `three`/`@types/three` versions against `^0.169.0`; the plan already instructs the implementer to check with `npm view` and keep the pair on the same minor.
- Estes motor/rocket data plausibility was checked only for internal consistency (impulse vs avg thrust vs burn time, TWR of recommended pairings), not against real spec sheets.
- Rendering, UI, and CDP steps (Tasks 11-18) were reviewed for interface consistency only, per the stated policy that they are verified by the CDP smoke test plus typecheck+build.
