import { RAINBOW, LADDER_STEP_M as WORLD_STEP_M, LADDER_MAX_M as WORLD_MAX_M } from '../world/heightLadder';

export const LADDER_STEP_M = WORLD_STEP_M;
export const LADDER_MAX_M = WORLD_MAX_M;
/** Seconds a crossing popup lives before it fully fades. */
export const POPUP_LIFE_S = 1.2;
/** Pixels the popup floats upward over its life. */
const FLOAT_PX = 30;

export interface AltitudePopup {
  altitudeM: number;
  ageS: number;
}

/** Rung altitudes crossed upward: prev < k·step <= curr, capped at max. */
export function crossedThresholds(
  prevM: number, currM: number,
  stepM: number = LADDER_STEP_M, maxM: number = LADDER_MAX_M,
): number[] {
  if (!(currM > prevM)) return [];
  const kMin = Math.max(1, Math.floor(prevM / stepM) + 1);
  const kMax = Math.min(Math.floor(currM / stepM), Math.floor(maxM / stepM));
  const out: number[] = [];
  for (let k = kMin; k <= kMax; k++) out.push(k * stepM);
  return out;
}

/** Advance popup ages by dt, dropping expired ones. Pure. */
export function stepPopups(popups: AltitudePopup[], dt: number): AltitudePopup[] {
  return popups
    .map((p) => ({ ...p, ageS: p.ageS + dt }))
    .filter((p) => p.ageS < POPUP_LIFE_S);
}

/** Rung color for an altitude (matches the rainbow ladder rings). */
function rainbowFor(altitudeM: number): string {
  const k = Math.round(altitudeM / LADDER_STEP_M) - 1;
  return `#${RAINBOW[((k % RAINBOW.length) + RAINBOW.length) % RAINBOW.length].toString(16).padStart(6, '0')}`;
}

export interface ScreenPos { x: number; y: number; visible: boolean; }

/**
 * DOM overlay that pops the crossed altitude ("150 m") at the ring it
 * crossed, floating up and fading over ~1.2 s. Call `update()` every frame.
 */
export class AltitudePopupLayer {
  private readonly root: HTMLElement;
  private popups: AltitudePopup[] = [];

  constructor(host: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'rkt-alt-popups';
    host.append(this.root);
  }

  /** Queue a popup for a crossed rung altitude. */
  spawn(altitudeM: number): void {
    this.popups.push({ altitudeM, ageS: 0 });
  }

  /** Age, prune and re-render the labels. `project` maps altitude → screen. */
  update(dt: number, project: (altitudeM: number) => ScreenPos): void {
    this.popups = stepPopups(this.popups, dt);
    this.root.replaceChildren();
    for (const p of this.popups) {
      const pos = project(p.altitudeM);
      if (!pos.visible) continue;
      const t = p.ageS / POPUP_LIFE_S;
      const div = document.createElement('div');
      div.className = 'rkt-alt-popup';
      div.textContent = `${p.altitudeM} m`;
      div.style.left = `${pos.x}px`;
      div.style.top = `${pos.y}px`;
      div.style.opacity = `${1 - t}`;
      div.style.transform = `translate(-50%, calc(-50% - ${(t * FLOAT_PX).toFixed(1)}px))`;
      div.style.color = rainbowFor(p.altitudeM);
      this.root.append(div);
    }
  }

  /** Drop all popups (new flight / preview). */
  clear(): void {
    this.popups = [];
    this.root.replaceChildren();
  }
}
