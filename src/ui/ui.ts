import type { ChallengeConfig, FlightState, FlightSummary } from '../sim/types';
import { rockets, compatibleMotors } from '../data/rockets';
import { motors } from '../data/motors';
import { environments } from '../world/environments';
import { describeSize, totalHeightM } from '../world/scaleRefs';
import { formatAltitude, formatSpeed, formatLength, phaseLabel } from './format';
import { Combo } from './combo';

export interface UiHandlers {
  onLaunch(): void;
  onReset(): void;
  onToggleMute(): boolean;
  onToggleCamera(): void;
  onRocketChange(id: string): void;
  onEnvChange(id: string): void;
  onCycleSpeed(): number;
}

const OUTCOME_LABEL: Record<string, string> = {
  nominal: 'Nominal recovery',
  cato: 'CATO! Motor exploded',
  'chute-fail': 'Recovery failed — crash',
  'tip-off': 'Tip-off / unstable',
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function option(value: string, label: string): HTMLOptionElement {
  const o = el('option');
  o.value = value;
  o.textContent = label;
  return o;
}

export class Ui {
  private readonly rocketCombo: Combo;
  private readonly motorCombo: Combo;
  private readonly envSel = el('select', 'rkt-select');
  private readonly challengeSel = el('select', 'rkt-select');
  private readonly targetAltInput = el('input', 'rkt-input');
  private readonly anyMotorChk = el('input');
  private readonly launchBtn = el('button', 'rkt-btn rkt-btn-primary', 'Launch');
  private readonly speedBtn = el('button', 'rkt-btn', 'Speed: 1x');
  private readonly hud = el('div', 'rkt-hud');
  private readonly summary = el('div', 'rkt-summary');
  private readonly sizeHint = el('p', 'rkt-hint');

  constructor(host: HTMLElement, private readonly handlers: UiHandlers) {
    const panel = el('div', 'rkt-panel');

    this.rocketCombo = new Combo('Search rockets…', (id) => {
      this.repopulateMotors();
      this.updateSizeHint();
      this.handlers.onRocketChange(id);
    });
    this.motorCombo = new Combo('Search motors…', () => {});
    this.rocketCombo.setOptions(rockets.map((r) => ({ value: r.id, label: r.name })));

    for (const e of environments) this.envSel.add(option(e.id, e.name));
    this.repopulateMotors();

    this.envSel.addEventListener('change', () => this.handlers.onEnvChange(this.envSel.value));

    this.anyMotorChk.type = 'checkbox';
    this.anyMotorChk.addEventListener('change', () => this.repopulateMotors());
    const anyLabel = el('label', 'rkt-check');
    anyLabel.append(this.anyMotorChk, document.createTextNode(' Allow any motor (may explode!)'));

    for (const [v, label] of [['none', 'No challenge'], ['target-altitude', 'Hit target altitude'], ['landing-zone', 'Land in zone']] as const) {
      this.challengeSel.add(option(v, label));
    }
    this.targetAltInput.type = 'number';
    this.targetAltInput.value = '150';
    this.targetAltInput.min = '10';

    const resetBtn = el('button', 'rkt-btn', 'Reset');
    const muteBtn = el('button', 'rkt-btn', 'Unmute');
    const camBtn = el('button', 'rkt-btn', 'Camera: Follow');

    this.launchBtn.addEventListener('click', () => this.handlers.onLaunch());
    resetBtn.addEventListener('click', () => this.handlers.onReset());
    muteBtn.addEventListener('click', () => { muteBtn.textContent = this.handlers.onToggleMute() ? 'Unmute' : 'Mute'; });
    camBtn.addEventListener('click', () => {
      this.handlers.onToggleCamera();
      camBtn.textContent = camBtn.textContent === 'Camera: Follow' ? 'Camera: Orbit' : 'Camera: Follow';
    });
    this.speedBtn.addEventListener('click', () => this.setSpeedLabel(this.handlers.onCycleSpeed()));

    const collapseBtn = el('button', 'rkt-collapse', '▾'); // ▾
    collapseBtn.setAttribute('aria-label', 'Collapse controls');
    const header = el('div', 'rkt-header');
    header.append(el('h1', 'rkt-title', 'RKT Simulator'), collapseBtn);

    const body = el('div', 'rkt-body');
    body.append(
      this.field('Rocket', this.rocketCombo.el),
      this.sizeHint,
      this.field('Motor', this.motorCombo.el),
      anyLabel,
      this.field('Environment', this.envSel),
      this.field('Challenge', this.challengeSel),
      this.field('Target altitude (m)', this.targetAltInput),
      this.buttonRow(this.launchBtn, resetBtn),
      this.buttonRow(camBtn, this.speedBtn),
      this.buttonRow(muteBtn),
      el('p', 'rkt-hint', 'Space: launch/reset · C: camera · F: speed · M: mute · WASD move · QE up/down'),
    );
    collapseBtn.addEventListener('click', () => {
      body.hidden = !body.hidden;
      collapseBtn.textContent = body.hidden ? '▸' : '▾'; // ▸ / ▾
    });

    panel.append(header, body);

    this.summary.hidden = true;
    host.append(panel, this.hud, this.summary);
    this.updateHudText('On Pad', 0, 0, 0);
    this.updateSizeHint();
  }

  /** "Height 41 cm — about as tall as a wine bottle" under the rocket picker. */
  private updateSizeHint(): void {
    const rocket = rockets.find((r) => r.id === this.rocketCombo.getValue()) ?? rockets[0];
    const total = totalHeightM(rocket);
    this.sizeHint.textContent = `Height ${formatLength(total)} — ${describeSize(total)}`;
  }

  private field(label: string, control: HTMLElement): HTMLElement {
    const wrap = el('label', 'rkt-field');
    wrap.append(el('span', 'rkt-field-label', label), control);
    return wrap;
  }

  private buttonRow(...btns: HTMLElement[]): HTMLElement {
    const row = el('div', 'rkt-row');
    row.append(...btns);
    return row;
  }

  /** Preselect an environment (used by the ?env= debug override). */
  setEnv(id: string): boolean {
    const exists = Array.from(this.envSel.options).some((o) => o.value === id);
    if (exists) this.envSel.value = id;
    return exists;
  }

  private repopulateMotors(): void {
    const rocket = rockets.find((r) => r.id === this.rocketCombo.getValue()) ?? rockets[0];
    const list = this.anyMotorChk.checked ? motors : compatibleMotors(rocket);
    this.motorCombo.setOptions(list.map((m) => ({ value: m.id, label: `${m.id} (${m.class})` })));
  }

  getSelection(): { rocketId: string; motorId: string; envId: string; challenge: ChallengeConfig } {
    const type = this.challengeSel.value as ChallengeConfig['type'];
    const challenge: ChallengeConfig = type === 'target-altitude'
      ? { type, targetAltitudeM: Number(this.targetAltInput.value) || 150, toleranceM: 50 }
      : { type };
    return { rocketId: this.rocketCombo.getValue(), motorId: this.motorCombo.getValue(), envId: this.envSel.value, challenge };
  }

  updateHud(state: FlightState, groundHeight = 0): void {
    this.updateHudText(phaseLabel(state.phase), state.position.y - groundHeight, state.velocity.y, state.apogee);
  }

  private updateHudText(phase: string, altitude: number, vspeed: number, apogee: number): void {
    this.hud.replaceChildren();
    const rows: Array<[string, string]> = [
      ['Status', phase],
      ['Altitude', formatAltitude(Math.max(0, altitude))],
      ['Vertical speed', formatSpeed(vspeed)],
      ['Apogee', formatAltitude(apogee)],
    ];
    for (const [k, v] of rows) {
      const row = el('div', 'rkt-hud-row');
      row.append(el('span', 'rkt-hud-key', k), el('span', 'rkt-hud-val', v));
      this.hud.append(row);
    }
  }

  showSummary(summary: FlightSummary): void {
    this.summary.hidden = false;
    this.summary.replaceChildren();
    const card = el('div', 'rkt-summary-card');
    card.append(el('h2', undefined, OUTCOME_LABEL[summary.outcome] ?? summary.outcome));
    const stats: Array<[string, string]> = [
      ['Apogee', formatAltitude(summary.apogee)],
      ['Max speed', formatSpeed(summary.maxSpeed)],
      ['Flight time', `${summary.flightTime.toFixed(1)} s`],
      ['Drift', formatAltitude(summary.driftDistanceM)],
    ];
    if (summary.challenge && summary.challenge.detail !== 'no challenge') {
      stats.push(['Challenge score', `${summary.challenge.score} / 100`]);
      stats.push(['', summary.challenge.detail]);
    }
    for (const [k, v] of stats) {
      const row = el('div', 'rkt-hud-row');
      row.append(el('span', 'rkt-hud-key', k), el('span', 'rkt-hud-val', v));
      card.append(row);
    }
    const close = el('button', 'rkt-btn rkt-btn-primary', 'Close');
    close.addEventListener('click', () => this.hideSummary());
    card.append(close);
    this.summary.append(card);
  }

  hideSummary(): void { this.summary.hidden = true; }

  setSpeedLabel(multiplier: number): void { this.speedBtn.textContent = `Speed: ${multiplier}x`; }

  setLaunchEnabled(enabled: boolean): void {
    (this.launchBtn as HTMLButtonElement).disabled = !enabled;
  }
}
