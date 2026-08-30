import type { ChallengeConfig, FlightState, FlightSummary } from '../sim/types';
import { rockets, compatibleMotors } from '../data/rockets';
import { motors } from '../data/motors';
import { environments } from '../world/environments';
import { formatAltitude, formatSpeed, phaseLabel } from './format';

export interface UiHandlers {
  onLaunch(): void;
  onReset(): void;
  onToggleMute(): boolean;
  onToggleCamera(): void;
  onRocketChange(id: string): void;
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
  private readonly rocketSel = el('select', 'rkt-select');
  private readonly motorSel = el('select', 'rkt-select');
  private readonly envSel = el('select', 'rkt-select');
  private readonly challengeSel = el('select', 'rkt-select');
  private readonly targetAltInput = el('input', 'rkt-input');
  private readonly anyMotorChk = el('input');
  private readonly launchBtn = el('button', 'rkt-btn rkt-btn-primary', 'Launch');
  private readonly hud = el('div', 'rkt-hud');
  private readonly summary = el('div', 'rkt-summary');

  constructor(host: HTMLElement, private readonly handlers: UiHandlers) {
    const panel = el('div', 'rkt-panel');

    for (const r of rockets) this.rocketSel.add(option(r.id, r.name));
    for (const e of environments) this.envSel.add(option(e.id, e.name));
    this.repopulateMotors();

    this.rocketSel.addEventListener('change', () => {
      this.repopulateMotors();
      this.handlers.onRocketChange(this.rocketSel.value);
    });

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

    panel.append(
      el('h1', 'rkt-title', 'RKT Simulator'),
      this.field('Rocket', this.rocketSel),
      this.field('Motor', this.motorSel),
      anyLabel,
      this.field('Environment', this.envSel),
      this.field('Challenge', this.challengeSel),
      this.field('Target altitude (m)', this.targetAltInput),
      this.buttonRow(this.launchBtn, resetBtn),
      this.buttonRow(muteBtn, camBtn),
      el('p', 'rkt-hint', 'Space: launch/reset · C: camera · M: mute'),
    );

    this.summary.hidden = true;
    host.append(panel, this.hud, this.summary);
    this.updateHudText('On Pad', 0, 0, 0);
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

  private repopulateMotors(): void {
    const rocket = rockets.find((r) => r.id === this.rocketSel.value) ?? rockets[0];
    const list = this.anyMotorChk.checked ? motors : compatibleMotors(rocket);
    const prev = this.motorSel.value;
    this.motorSel.replaceChildren();
    for (const m of list) this.motorSel.add(option(m.id, `${m.id} (${m.class})`));
    if (list.some((m) => m.id === prev)) this.motorSel.value = prev;
  }

  getSelection(): { rocketId: string; motorId: string; envId: string; challenge: ChallengeConfig } {
    const type = this.challengeSel.value as ChallengeConfig['type'];
    const challenge: ChallengeConfig = type === 'target-altitude'
      ? { type, targetAltitudeM: Number(this.targetAltInput.value) || 150, toleranceM: 50 }
      : { type };
    return { rocketId: this.rocketSel.value, motorId: this.motorSel.value, envId: this.envSel.value, challenge };
  }

  updateHud(state: FlightState): void {
    this.updateHudText(phaseLabel(state.phase), state.position.y, state.velocity.y, state.apogee);
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

  setLaunchEnabled(enabled: boolean): void {
    (this.launchBtn as HTMLButtonElement).disabled = !enabled;
  }
}
