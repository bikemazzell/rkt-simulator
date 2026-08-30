# Review: plan-qwen-20260830-1047-retry.md

| field | value |
|---|---|
| reviewer | `qwen` |
| backend | `opencode` |
| model | `openrouter/qwen/qwen3.8-max` |
| workdir | `/home/v/Documents/Dev/rkt-simulator` |
| write access | none (read-only, enforced) |
| started | 2026-08-30T10:47:38+02:00 |
| finished | 2026-08-30T10:56:20+02:00 |
| exit code | 0 |

---

VERDICT: APPROVE WITH CHANGES

- BLOCKER - plan.md:979-985 (Task 6, "bigger total impulse yields higher apogee") - `bigMotor` has `totalImpulseNs: 20` against `testRocket.maxMotorImpulseNs: 12` (fixtures.ts, plan.md:841), so `catoProbability` = 0.01 + (20/12 − 1)·0.8 ≈ 0.543 (plan.md:1273-1278). Both sims use seed 123, so a single shared first RNG draw decides it: with ~54% probability the big flight CATOs (apogee 0) and the assertion fails. The test cannot reliably pass as written. Fix: also override `rocket: { ...testRocket, maxMotorImpulseNs: 25 }` in the big config AND guard the assertion the way the delay test does (plan.md:992): skip seeds where either flight's outcome is `'cato'` (or iterate seeds until one pair is CATO-free, then assert).

- IMPORTANT - plan.md:932-937, 939-954, 964-969 (Task 6 tests using default `makeTestConfig`, seed 123) - These tests implicitly require the first `mulberry32(123)` draw to be ≥ 0.01 (the baseline CATO roll at ignition, plan.md:1298). If it is not, `applyOutcome` CATOs the flight on the pad and all three tests fail (phase sequence collapses to `['boost']`, `liftedOff` stays false, apogee is 0). This is a 1%-probability latent failure I could not rule out statically (see gaps). Fix: choose the fixture seed defensively — either reuse a `firstNominalSeed()`-style helper to pick a seed whose ignition rolls are known safe, or run once, verify a safe seed, and hardcode it with a comment.

- IMPORTANT - plan.md:1067-1071 vs 1114-1116 (simulation.ts ejection vs never-lifted-off net) - The ejection charge fires whenever `s.time >= burnTimeS + delayS`, including for a pad-stuck rocket (TWR < 1). At burn+delay the deploy roll runs and, on success, sets `outcome = 'nominal'` (plan.md:1318); one second later the safety net sets `phase = 'failed'` but only assigns `'tip-off'` `if (s.outcome === null)` — leaving a flight that never left the pad with phase `'failed'` and outcome `'nominal'`, violating the outcome semantics in spec §7.2. The Task 6 heavy-rocket test masks this (it only checks phase). Fix: gate ejection on liftoff — `if (!this.ejected && s.liftedOff && s.time >= motor.burnTimeS + motor.delayS)`.

- IMPORTANT - plan.md:1312-1319 + 1107-1109 (outcomes ejection success for zero-chute rockets) - For `chuteDiameterM === 0` (spec: streamer/tumble; the shipped `wizard` rocket, plan.md:1539), a successful ejection roll sets `outcome = 'nominal'` but `chuteDeployed` stays false. The rocket then descends ballistically (body-drag terminal velocity ≈ 50 m/s for the wizard), so landing classification `!chuteDeployed` forces `phase = 'failed'` while outcome remains `'nominal'`. Net effect: the wizard crashes 100% of flights with a contradictory nominal outcome; no plan test catches this (the Task 7 zero-chute tests only exercise the fail-roll path). Fix: pick a model and state it — either (a) give streamer rockets a defined recovery drag area on a successful roll (e.g. deploy with refArea `bodyLengthM * diameterM` and `chuteCd`, so terminal speed can be < HARD_LANDING_MPS), or (b) treat `chuteDiameterM === 0` as guaranteed `'chute-fail'` at ejection and drop the misleading 0.15 "higher" probability framing.

- MINOR - spec.md:74 (Controls) vs Tasks 16/17 - Keyboard shortcuts (`Space` launch/reset, `C` camera toggle, `M` mute) appear nowhere in the plan; an implementer following it literally ships without them. Fix: add a `keydown` listener step to Task 16 or 17 wiring those three keys to the existing handlers.

- MINOR - plan.md:1468 (Task 9 catalog test) - `classes.has(c as any)` violates the "no `any`" global constraint (plan.md:22). Fix: `classes.has(c as MotorClass)` with the type import.

- MINOR - plan.md:2190-2195, 2446 (Sfx / main.ts) - The `'whoosh'` effect is defined but never played anywhere; only `'launch'`, `'boom'`, `'chute'` are triggered. Fix: play `'whoosh'` at burnout or chute deploy in `main.ts`/`visual.update` bookkeeping, or delete it.

- MINOR - plan.md:2089 (effects.ts) - `chute.visible = chuteDeployed && phase === 'descent'` hides a chute deployed early (short-delay ejection during coast) until descent, and during the one-tick `apogee` phase. Cosmetic only; show it whenever `chuteDeployed && phase in ('coast','apogee','descent')` if desired.

## Assumptions and gaps

- I could not execute code: the actual first draws of `mulberry32(123)` (and seeds 4/5/9) are unverified, so the 1% seed-123 CATO risk and any other seed-specific behavior are flagged probabilistically, not confirmed.
- I could not run the test suite, so test wall-clock (e.g. `firstNominalSeed()` iterating up to 100 full flights) is assessed analytically only.
- Task 11 (6 of 8 environment builders), Task 16 Step 5 (full `Ui` body), and Task 18 Step 2 (CDP script) are intentionally shape-only deferrals; only their interfaces and verification hooks were reviewed.
- Physics checks (SHAPE_MEAN = 0.8 trapezoid area, closed-form apogee ≈ 459.7 m with ~0.04% symplectic-Euler error at dt = 1/240, chute terminal ≈ 3.5 m/s < 15 m/s threshold, impulse-conservation midpoint tests) verify by hand-computation; numerical execution was not possible.
- The noted Task 6 → Task 7 `applyOutcome` forward dependency is explicitly called out in the plan (plan.md:1139) and is acceptable; no other dangling imports found.
