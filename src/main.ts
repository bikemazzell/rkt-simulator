import './style.css';
import './ui/ui.css';
import { SceneManager } from './world/scene';
import { environmentById } from './world/environments';
import { makeParamsFor } from './world/environments/params';
import { buildRocketMesh } from './world/rocketMesh';
import { buildScaleLineup } from './world/scaleLineup';
import { buildTargetAltitudeRing } from './world/targetRing';
import { RocketVisual } from './world/effects';
import { Simulation, DT } from './sim/simulation';
import { Sfx } from './audio/sfx';
import { Ui } from './ui/ui';
import { rocketById, compatibleMotors } from './data/rockets';
import { motorById } from './data/motors';
import { scoreChallenge } from './sim/challenge';
import { mulberry32 } from './sim/rng';
import { isWeatherKind } from './world/weather';
import type { EnvParams, ChallengeConfig, Rocket } from './sim/types';

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
function applyDebugCam(): void {
  if (camParts && camParts.length >= 3 && camParts.slice(0, 3).every(Number.isFinite)) {
    // Orbit mode, or the follow-cam would drag this view back to the rocket.
    scene.setCameraMode('orbit');
    cameraMode = 'orbit';
    scene.setOrbitView(camParts[0], camParts[1], camParts[2], Number.isFinite(camParts[3]) ? camParts[3] : 10);
  }
}

// ?debug=1 exposes the scene manager for CDP-based verification scripts.
if (qs.get('debug') === '1') {
  (window as unknown as Record<string, unknown>).__rkt = { scene };
}

let sim: Simulation | null = null;
let visual: RocketVisual | null = null;
let previewMesh: ReturnType<typeof buildRocketMesh> | null = null;
let current: { params: EnvParams; challenge: ChallengeConfig } | null = null;
let cameraMode: 'orbit' | 'follow' = 'follow';
let groundHeight = 0;
let finished = false;
let summaryTimer: ReturnType<typeof setTimeout> | null = null;
let accumulator = 0;
let last = performance.now();

const SPEEDS = [1, 4, 16];
let speed = 1;
function cycleSpeed(): number {
  speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
  return speed;
}

const ui = new Ui(host, {
  onLaunch: launch,
  onReset: showPreview,
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

// Real-size reference lineup scattered around the rocket so its scale reads
// at a glance. Constrained per environment: the sea raft is only 16m wide,
// the rooftop slab ~26m; the bathtub's whole joke is giant scale, so skip it
// there. A fresh seed per call rolls a different set every visit.
function addScaleLineup(envId: string, params: EnvParams, rocket: Rocket): void {
  if (envId === 'bathtub') return;
  const maxExtent = envId === 'sea' ? 6.5 : envId === 'rooftop' ? 11 : undefined;
  scene.worldGroup.add(buildScaleLineup(rocket, params.launchY ?? params.groundHeight, maxExtent, mulberry32(Date.now() >>> 0)));
}

// Amber ring at the challenge target altitude so the player can see the
// rocket pass through (and above) it.
function addTargetRing(challenge: ChallengeConfig, params: EnvParams): void {
  if (challenge.type !== 'target-altitude') return;
  const alt = challenge.targetAltitudeM ?? 150;
  scene.worldGroup.add(buildTargetAltitudeRing(alt, params.launchY ?? params.groundHeight));
}

// Render the selected environment with the rocket resting on the pad, before any
// launch and after reset/selection changes, so the scene is never empty/black.
function showPreview(): void {
  clearRocket();
  sim = null;
  const sel = ui.getSelection();
  const rocket = rocketById(sel.rocketId)!;
  const env = environmentById(sel.envId)!;
  const params = makeParamsFor(env.id, PREVIEW_SEED);

  scene.clearWorld();
  scene.reset();
  applyDebugCam();
  env.build(
    { scene: scene.scene, root: scene.worldGroup, showTargetZone: sel.challenge.type === 'landing-zone', registerSystem: (sys) => scene.registerWorldSystem(sys), startPhase, weather: weatherOverride },
    params, mulberry32(PREVIEW_SEED),
  );
  addScaleLineup(env.id, params, rocket);
  addTargetRing(sel.challenge, params);
  scene.setGroundFloor(params.groundHeight);

  previewMesh = buildRocketMesh(rocket);
  previewMesh.position.set(0, params.launchY ?? params.groundHeight, 0);
  scene.scene.add(previewMesh);

  groundHeight = params.launchY ?? params.groundHeight;
  finished = false;
  ui.setLaunchEnabled(true);
  ui.hideSummary();
}

function launch(): void {
  clearRocket();
  const sel = ui.getSelection();
  const rocket = rocketById(sel.rocketId)!;
  const motor = motorById(sel.motorId) ?? compatibleMotors(rocket)[0];
  const env = environmentById(sel.envId)!;
  const seed = Date.now() >>> 0; // per-launch seed; drives all sim randomness deterministically
  const params = makeParamsFor(env.id, seed);
  current = { params, challenge: sel.challenge };

  scene.clearWorld();
  scene.reset();
  applyDebugCam();
  env.build(
    { scene: scene.scene, root: scene.worldGroup, showTargetZone: sel.challenge.type === 'landing-zone', registerSystem: (sys) => scene.registerWorldSystem(sys), startPhase, weather: weatherOverride },
    params, mulberry32(seed),
  );
  addScaleLineup(env.id, params, rocket);
  addTargetRing(sel.challenge, params);
  scene.setGroundFloor(params.groundHeight);

  sim = new Simulation({ rocket, motor, environment: params, seed, challenge: sel.challenge });
  const mesh = buildRocketMesh(rocket);
  mesh.position.set(0, params.launchY ?? params.groundHeight, 0);
  visual = new RocketVisual(scene.scene, mesh, rocket);
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
    if (sim.done && !finished) { finished = true; finish(); }
  }
  const focus = sim
    ? sim.state.position
    : previewMesh
      ? { x: previewMesh.position.x, y: previewMesh.position.y + (previewMesh.userData.topY ?? 20) / 2, z: previewMesh.position.z }
      : { x: 0, y: 10, z: 0 };
  scene.render(focus);
  requestAnimationFrame(frame);
}

function finish(): void {
  if (!sim || !current) return;
  const summary = sim.summary();
  summary.challenge = scoreChallenge(current.challenge, current.params, summary, sim.state.position);
  const crashed = summary.outcome === 'cato' || summary.outcome === 'chute-fail';
  sfx.play(crashed ? 'boom' : 'chute');
  ui.setLaunchEnabled(true);
  // Let the explosion play before the summary covers the scene.
  if (summaryTimer) clearTimeout(summaryTimer);
  summaryTimer = setTimeout(() => ui.showSummary(summary), crashed ? 1300 : 400);
}

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  switch (e.key.toLowerCase()) {
    case ' ': e.preventDefault(); sim && !sim.done ? showPreview() : launch(); break;
    case 'c': cameraMode = cameraMode === 'orbit' ? 'follow' : 'orbit'; scene.setCameraMode(cameraMode); break;
    case 'f': ui.setSpeedLabel(cycleSpeed()); break;
    case 'm': sfx.toggleMute(); break;
  }
});

scene.setCameraMode(cameraMode);
showPreview();
requestAnimationFrame(frame);
