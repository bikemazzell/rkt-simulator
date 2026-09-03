import './style.css';
import './ui/ui.css';
import { SceneManager } from './world/scene';
import { environmentById, type EnvironmentDef } from './world/environments';
import type { BuildContext } from './world/environments/types';
import { makeParamsFor } from './world/environments/params';
import { buildRocketMesh } from './world/rocketMesh';
import { buildScaleLineup } from './world/scaleLineup';
import { buildHeightLadder } from './world/heightLadder';
import { buildGimbal, GimbalController, attachGimbalControls, computeLabelScreen } from './world/gizmo';
import { RocketVisual } from './world/effects';
import { Simulation, DT } from './sim/simulation';
import { aimDirection, normalizeAim, AIM_DEFAULT, type AimAngles } from './sim/aim';
import { Sfx } from './audio/sfx';
import { Ui } from './ui/ui';
import { AltitudePopupLayer, crossedThresholds } from './ui/altitudePopup';
import { rocketById, compatibleMotors, rockets } from './data/rockets';
import { motorById } from './data/motors';
import { scoreChallenge } from './sim/challenge';
import { mulberry32 } from './sim/rng';
import { RECOVERY_DEVICES } from './sim/recovery';
import { isWeatherKind } from './world/weather';
import type { EnvParams, ChallengeConfig, Rocket, RecoveryDevice } from './sim/types';
import { MathUtils, Object3D, Euler, Vector3 } from 'three';

const host = document.getElementById('app')!;
const scene = new SceneManager(host);
const sfx = new Sfx();

const PREVIEW_SEED = 1; // stable, so the pre-launch scene does not jitter

// Debug overrides for deterministic CDP verification: ?tod=<0..1> sets the
// day/night start phase; ?cam=az,el,dist[,targetY] pins the orbit camera;
// ?env=<id> preselects the environment; ?weather=<kind> forces the weather.
const qs = new URLSearchParams(location.search);
const envParam = qs.get('env');
const weatherParam = qs.get('weather');
const weatherOverride = weatherParam !== null && isWeatherKind(weatherParam) ? weatherParam : undefined;
const todParam = qs.get('tod');
const startPhase = todParam !== null && todParam !== '' && !Number.isNaN(Number(todParam))
  ? Number(todParam)
  : undefined;
const camParam = qs.get('cam');
const camParts = camParam !== null && camParam !== ''
  ? camParam.split(',').map(Number)
  : null;
// ?seed=<uint> pins the launch seed for deterministic CDP verification.
const seedParam = qs.get('seed');
const launchSeedOverride = seedParam !== null && seedParam !== '' && !Number.isNaN(Number(seedParam))
  ? Number(seedParam) >>> 0
  : undefined;
// ?recovery=<device[,device...]> forces every rocket's recovery devices (debug
// override for CDP verification); unknown tokens are dropped, and a list with
// no valid tokens is ignored entirely.
const recoveryParam = qs.get('recovery');
const recoveryOverride = recoveryParam !== null && recoveryParam !== ''
  ? [...new Set(recoveryParam.split(',').map((t) => t.trim()).filter((d): d is RecoveryDevice =>
    (RECOVERY_DEVICES as readonly string[]).includes(d)))]
  : undefined;
const forcedRecovery = recoveryOverride && recoveryOverride.length > 0 ? recoveryOverride : undefined;
if (forcedRecovery) {
  for (const r of rockets) {
    r.recovery = [...forcedRecovery];
    // A forced parachute needs a real canopy: chuteless rockets (streamer/tumble
    // designs) would otherwise get an Infinity sink and a degenerate micro-canopy.
    if (forcedRecovery.includes('parachute') && r.chuteDiameterM <= 0) r.chuteDiameterM = 0.35;
  }
}
function applyDebugCam(): void {
  if (camParts && camParts.length >= 3 && camParts.slice(0, 3).every(Number.isFinite)) {
    // Orbit mode, or the follow-cam would drag this view back to the rocket.
    scene.setCameraMode('orbit');
    cameraMode = 'orbit';
    scene.setOrbitView(camParts[0], camParts[1], camParts[2], Number.isFinite(camParts[3]) ? camParts[3] : 10);
  }
}

// ?debug=1 exposes the scene manager (and, once launched, the sim + its
// ground sampler) for CDP-based verification scripts.
if (qs.get('debug') === '1') {
  (window as unknown as Record<string, unknown>).__rkt = {
    scene,
    get sim() { return sim; },
    get groundAt() { return launchGroundAt; },
    get aim() { return { ...aim }; },
    get recoveryOverride() { return forcedRecovery ? [...forcedRecovery] : undefined; },
    setAim(next: AimAngles) {
      // Capture before touching the controller: each set() fires the change
      // callback, which reassigns `aim` from the half-updated controller.
      const restored = normalizeAim(next);
      aim = restored;
      if (gimbalCtl) {
        gimbalCtl.set('x', restored.x);
        gimbalCtl.set('y', restored.y);
        gimbalCtl.set('z', restored.z);
      }
    },
  };
}

let sim: Simulation | null = null;
let launchGroundAt: ((x: number, z: number) => number) | undefined;
let visual: RocketVisual | null = null;
let previewMesh: ReturnType<typeof buildRocketMesh> | null = null;
let current: { params: EnvParams; challenge: ChallengeConfig } | null = null;
let cameraMode: 'orbit' | 'follow' = 'follow';
let groundHeight = 0;
let finished = false;
let summaryTimer: ReturnType<typeof setTimeout> | null = null;
let accumulator = 0;
let last = performance.now();

// Launch attitude (degrees). Persists across rocket/env/challenge changes;
// zeroed only by Reset, consumed at launch.
let aim: AimAngles = { ...AIM_DEFAULT };
let gimbalCtl: GimbalController | null = null;
let gimbalGroup: ReturnType<typeof buildGimbal> | null = null;
let gimbalDom: { updateLabels(): void; dispose(): void } | null = null;

// Height-goal ladder: popup layer + the ladder's base altitude (set whenever
// the rainbow rings are in the world; popups measure crossings against it).
const altPopups = new AltitudePopupLayer(host);
let ladderBaseY: number | null = null;
let prevAltitudeM: number | null = null;

const SPEEDS = [1, 4, 16];
let speed = 1;
function cycleSpeed(): number {
  speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
  return speed;
}

const ui = new Ui(host, {
  onLaunch: launch,
  onReset: () => {
    aim = { ...AIM_DEFAULT };
    showPreview();
  },
  onToggleMute: () => sfx.toggleMute(),
  onToggleCamera: () => {
    cameraMode = cameraMode === 'orbit' ? 'follow' : 'orbit';
    scene.setCameraMode(cameraMode);
  },
  onRocketChange: showPreview,
  onEnvChange: showPreview,
  onChallengeChange: showPreview,
  onCycleSpeed: cycleSpeed,
});
if (envParam !== null && envParam !== '') ui.setEnv(envParam);

function clearRocket(): void {
  if (visual) { visual.dispose(); visual = null; }
  if (previewMesh) { scene.scene.remove(previewMesh); previewMesh = null; }
}

function clearGimbal(): void {
  if (gimbalDom) { gimbalDom.dispose(); gimbalDom = null; }
  if (gimbalGroup) {
    scene.scene.remove(gimbalGroup);
    gimbalGroup.traverse((o) => {
      const mesh = o as { geometry?: { dispose(): void }; material?: { dispose(): void } };
      mesh.geometry?.dispose?.();
      mesh.material?.dispose?.();
    });
    gimbalGroup = null;
  }
  gimbalCtl = null;
}

// The launch rod tilts with the aimed rocket, so the gizmo needs the rod
// group built by the scale lineup (absent in the bathtub, which has no lineup).
function findRodGroup(): Object3D | null {
  let rod: Object3D | null = null;
  scene.worldGroup.traverse((o) => {
    if (!rod && o.userData?.isRodGroup) rod = o;
  });
  return rod;
}

// Real-size reference lineup scattered around the rocket so its scale reads
// at a glance. Constrained per environment: the sea raft is only 16m wide,
// the rooftop slab ~26m; the bathtub's whole joke is giant scale, so skip it
// there. A fresh seed per call rolls a different set every visit.
function addScaleLineup(envId: string, params: EnvParams, rocket: Rocket): void {
  if (envId === 'bathtub') return;
  const maxExtent = envId === 'sea' ? 6.5 : envId === 'rooftop' ? 11 : undefined;
  scene.worldGroup.add(buildScaleLineup(rocket, params.launchY ?? params.groundHeight, maxExtent, mulberry32(Date.now() >>> 0)));
}

// Rainbow ladder of rings every 50 m when the height-goal challenge is on.
function addHeightLadder(challenge: ChallengeConfig, params: EnvParams): void {
  if (challenge.type !== 'height-ladder') return;
  scene.worldGroup.add(buildHeightLadder(params.launchY ?? params.groundHeight));
}

// Shared by preview and launch: rebuild the world from a seed and hand back
// the build context so callers can use its groundAt sampler.
function buildEnvironment(env: EnvironmentDef, params: EnvParams, seed: number, showTargetZone: boolean): BuildContext {
  const ctx: BuildContext = {
    scene: scene.scene,
    root: scene.worldGroup,
    showTargetZone,
    registerSystem: (sys) => scene.registerWorldSystem(sys),
    startPhase,
    weather: weatherOverride,
  };
  env.build(ctx, params, mulberry32(seed));
  return ctx;
}

// Render the selected environment with the rocket resting on the pad, before any
// launch and after reset/selection changes, so the scene is never empty/black.
function showPreview(): void {
  clearRocket();
  clearGimbal();
  sim = null;
  const sel = ui.getSelection();
  const rocket = rocketById(sel.rocketId)!;
  const env = environmentById(sel.envId)!;
  const params = makeParamsFor(env.id, PREVIEW_SEED);

  scene.clearWorld();
  previewMesh = buildRocketMesh(rocket);
  scene.reset(previewMesh.userData.topY ?? 1.6); // frame for this rocket's true size
  applyDebugCam();
  buildEnvironment(env, params, PREVIEW_SEED, sel.challenge.type === 'landing-zone');
  addScaleLineup(env.id, params, rocket);
  addHeightLadder(sel.challenge, params);
  scene.setGroundFloor(params.groundHeight);
  ladderBaseY = sel.challenge.type === 'height-ladder' ? params.launchY ?? params.groundHeight : null;
  prevAltitudeM = null;
  altPopups.clear();

  previewMesh.position.set(0, params.launchY ?? params.groundHeight, 0);
  scene.scene.add(previewMesh);

  attachGimbalAt(previewMesh, true);

  groundHeight = params.launchY ?? params.groundHeight;
  finished = false;
  ui.setLaunchEnabled(true);
  ui.hideSummary();
}

// Build the attitude gimbal around `target` (pad preview rocket or a landed
// rocket being re-aimed). Shared by the pad preview and the post-landing
// re-aim; `withRod` ties the pad's launch rail to the rings.
function attachGimbalAt(target: Object3D, withRod: boolean): void {
  // Attitude gimbal: rings around the rocket base, labels + drag + exact
  // angle input. `aim` is seeded beforehand (persisted attitude for the pad
  // preview, or the resting orientation derived on landing).
  gimbalGroup = buildGimbal(target.userData.topY ?? 1);
  gimbalGroup.position.copy(target.position);
  scene.scene.add(gimbalGroup);
  gimbalCtl = new GimbalController(gimbalGroup);
  gimbalCtl.applyTo(target);
  if (withRod) {
    const rod = findRodGroup();
    if (rod) gimbalCtl.attachRod(rod);
  }
  gimbalCtl.set('x', aim.x);
  gimbalCtl.set('y', aim.y);
  gimbalCtl.set('z', aim.z);
  aim = { ...gimbalCtl.angles };
  gimbalCtl.onChange(() => { aim = { ...gimbalCtl!.angles }; });
  gimbalDom = attachGimbalControls(gimbalCtl, gimbalGroup, {
    camera: scene.camera,
    dom: scene.domElement,
    labelContainer: host,
    lockControls: () => scene.setControlsEnabled(false),
    unlockControls: () => scene.setControlsEnabled(true),
  });
}

function launch(): void {
  // Relaunch from a finished flight: keep the world as-is and take off from
  // where the rocket ended up (resting spot after a landing, crash site for a
  // wreck), pointing where the (rebuilt) gimbal aims. Reset falls through to
  // a fresh pad launch.
  const relaunchFrom = sim && sim.done && (sim.state.phase === 'landed' || sim.state.phase === 'failed') && visual
    ? { ...sim.state.position }
    : null;
  const prevMesh = relaunchFrom && sim?.state.phase === 'landed' && visual ? visual.flightMesh : null;
  clearRocket();
  clearGimbal();
  if (summaryTimer) { clearTimeout(summaryTimer); summaryTimer = null; } // a pending summary must not pop over the new flight
  const sel = ui.getSelection();
  const rocket = rocketById(sel.rocketId)!;
  const motor = motorById(sel.motorId) ?? compatibleMotors(rocket)[0];
  const env = environmentById(sel.envId)!;
  const seed = launchSeedOverride ?? (Date.now() >>> 0); // per-launch seed; drives all sim randomness deterministically

  if (relaunchFrom && current) {
    const wind = { x: current.params.wind.base.x, z: current.params.wind.base.z };
    sim = new Simulation({
      rocket, motor, environment: current.params, seed, challenge: current.challenge,
      groundAt: launchGroundAt,
      initialDirection: aimDirection(aim), // seeded from the resting attitude at finish()
      launchOrigin: relaunchFrom,
    });
    if (prevMesh) {
      visual = new RocketVisual(scene.scene, prevMesh, rocket, { wind }); // fresh trail/flame around the same mesh
    } else {
      // Relaunch from a crash site: the old mesh is the charred wreck, so fly
      // a factory-fresh rocket from where it lies.
      const mesh = buildRocketMesh(rocket);
      mesh.position.set(relaunchFrom.x, relaunchFrom.y, relaunchFrom.z);
      mesh.rotation.order = 'XYZ';
      mesh.rotation.set(MathUtils.degToRad(aim.x), MathUtils.degToRad(aim.y), MathUtils.degToRad(aim.z));
      visual = new RocketVisual(scene.scene, mesh, rocket, { wind });
    }
    groundHeight = relaunchFrom.y; // HUD altitude above the resting spot
    scene.resetFollowZoom(); // fresh zoom factor; world/camera are kept as-is
    // The kept world still holds the pad ladder (if the challenge was on), so
    // popups keep measuring against the same ladderBaseY — just reset tracking.
    prevAltitudeM = null;
    altPopups.clear();
    finished = false;
    accumulator = 0;
    last = performance.now();
    sfx.play('launch');
    ui.setLaunchEnabled(false);
    ui.hideSummary();
    return;
  }

  const params = makeParamsFor(env.id, seed);
  current = { params, challenge: sel.challenge };

  scene.clearWorld();
  const freshMesh = buildRocketMesh(rocket);
  scene.reset(freshMesh.userData.topY ?? 1.6); // frame for this rocket's true size
  applyDebugCam();
  const ctx = buildEnvironment(env, params, seed, sel.challenge.type === 'landing-zone');
  addScaleLineup(env.id, params, rocket);
  addHeightLadder(sel.challenge, params);
  scene.setGroundFloor(params.groundHeight);
  ladderBaseY = sel.challenge.type === 'height-ladder' ? params.launchY ?? params.groundHeight : null;
  prevAltitudeM = null;
  altPopups.clear();

  sim = new Simulation({
    rocket, motor, environment: params, seed, challenge: sel.challenge,
    groundAt: ctx.groundAt,
    initialDirection: aimDirection(aim),
  });
  launchGroundAt = ctx.groundAt;
  const mesh = freshMesh;
  mesh.position.set(0, params.launchY ?? params.groundHeight, 0);
  mesh.rotation.order = 'XYZ';
  mesh.rotation.set(MathUtils.degToRad(aim.x), MathUtils.degToRad(aim.y), MathUtils.degToRad(aim.z));
  visual = new RocketVisual(scene.scene, mesh, rocket, {
    wind: { x: params.wind.base.x, z: params.wind.base.z },
  });
  groundHeight = params.launchY ?? params.groundHeight;
  finished = false;
  accumulator = 0;                  // discard any leftover fractional tick
  last = performance.now();         // reset timing baseline for this flight
  sfx.play('launch');
  ui.setLaunchEnabled(false);
  ui.hideSummary();
}

function frame(now: number): void {
  const dtMs = Math.min(now - last, 100);
  last = now;
  if (sim) {
    if (!sim.done) {
      accumulator += (dtMs / 1000) * speed;
      while (accumulator >= DT) { sim.step(); accumulator -= DT; }
    }
    // Keep updating the visual after the flight ends so the explosion animates
    // and the wreck stays put until the player launches or resets.
    visual?.update(sim.state);
    ui.updateHud(sim.state, groundHeight);
    if (ladderBaseY !== null) {
      const alt = sim.state.position.y - ladderBaseY;
      const prev = prevAltitudeM ?? alt;
      for (const t of crossedThresholds(prev, alt)) altPopups.spawn(t);
      prevAltitudeM = alt;
    }
    if (sim.done && !finished) { finished = true; finish(); }
  }
  const focus = sim
    ? sim.state.position
    : previewMesh
      ? { x: previewMesh.position.x, y: previewMesh.position.y + (previewMesh.userData.topY ?? 20) / 2, z: previewMesh.position.z }
      : { x: 0, y: 10, z: 0 };
  const speedMps = sim && !finished
    ? Math.hypot(sim.state.velocity.x, sim.state.velocity.y, sim.state.velocity.z)
    : undefined;
  scene.render(focus, speedMps);
  // Popups anchor via camera matrices, so update them post-render (like the
  // gimbal labels) to avoid a one-frame-stale position.
  if (ladderBaseY !== null && sim) {
    altPopups.update(dtMs / 1000, (alt) => computeLabelScreen(
      new Vector3(0, ladderBaseY! + alt, 0), scene.camera,
      scene.domElement.clientWidth, scene.domElement.clientHeight,
    ));
  } else {
    altPopups.clear();
  }
  gimbalDom?.updateLabels();
  requestAnimationFrame(frame);
}

function finish(): void {
  if (!sim || !current) return;
  const summary = sim.summary();
  summary.challenge = scoreChallenge(current.challenge, current.params, summary, sim.state.position);
  const crashed = summary.outcome === 'cato' || summary.outcome === 'chute-fail' || summary.outcome === 'hard-landing';
  sfx.play(crashed ? 'boom' : 'chute');
  ui.setLaunchEnabled(true);
  // Let the explosion play before the summary covers the scene.
  if (summaryTimer) clearTimeout(summaryTimer);
  summaryTimer = setTimeout(() => ui.showSummary(summary), crashed ? 1300 : 400);

  // After a soft landing — or a crash that left a wreck — the gimbal comes
  // back at that spot so the next launch can be re-aimed; it seeds from the
  // resting orientation (nose follows the descent, so usually upright under
  // the chute; a wreck lies where it toppled).
  if ((sim.state.phase === 'landed' || sim.state.phase === 'failed') && visual) {
    const e = new Euler().setFromQuaternion(visual.flightMesh.quaternion, 'XYZ');
    aim = normalizeAim({
      x: MathUtils.radToDeg(e.x),
      y: MathUtils.radToDeg(e.y),
      z: MathUtils.radToDeg(e.z),
    });
    attachGimbalAt(visual.flightMesh, false); // no rail away from the pad
  }
}

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  switch (e.key.toLowerCase()) {
    case ' ':
      e.preventDefault();
      if (sim && !sim.done) {
        aim = { ...AIM_DEFAULT }; // Reset zeroes the aim, like the UI button
        showPreview();
      } else {
        launch();
      }
      break;
    case 'c': cameraMode = cameraMode === 'orbit' ? 'follow' : 'orbit'; scene.setCameraMode(cameraMode); break;
    case 'f': ui.setSpeedLabel(cycleSpeed()); break;
    case 'm': sfx.toggleMute(); break;
  }
});

scene.setCameraMode(cameraMode);
showPreview();
requestAnimationFrame(frame);
