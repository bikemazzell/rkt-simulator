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
  accumulator = 0;                  // discard any leftover fractional tick
  last = performance.now();         // reset timing baseline for this flight
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

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  switch (e.key.toLowerCase()) {
    case ' ': e.preventDefault(); sim && !sim.done ? reset() : launch(); break;
    case 'c': cameraMode = cameraMode === 'orbit' ? 'follow' : 'orbit'; scene.setCameraMode(cameraMode); break;
    case 'm': sfx.toggleMute(); break;
  }
});

scene.setCameraMode(cameraMode);
requestAnimationFrame(frame);
