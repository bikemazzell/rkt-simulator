/** Closest the auto-zoom pulls in (m from the rocket). */
export const ZOOM_MIN_M = 6;
/** Farthest the auto-zoom pulls out (m). */
export const ZOOM_MAX_M = 600;
/** Meters of camera distance per m/s of rocket speed. */
export const ZOOM_M_PER_MPS = 1.2;
/** Exponential smoothing time constant (s). */
const SMOOTHING_TAU = 0.8;
/** User scroll factor bounds (so one scroll cannot run away). */
const FACTOR_MAX = 64;
const FACTOR_MIN = 1 / 64;

/** Desired follow distance for a rocket speed (m/s): faster → wider context. */
export function autoZoomDistance(speedMps: number): number {
  const s = Number.isFinite(speedMps) ? Math.max(0, speedMps) : 0;
  return Math.min(ZOOM_MAX_M, ZOOM_MIN_M + ZOOM_M_PER_MPS * s);
}

/**
 * Speed-adaptive follow-cam zoom. Each frame `step()` eases the camera
 * distance toward `autoZoomDistance(speed) * userFactor`. Distance changes
 * the user made by scrolling since the previous frame (anything other than
 * what we set last) are absorbed into `userFactor`, so manual framing keeps
 * working on top of the automatic zoom.
 */
export class FollowZoom {
  userFactor = 1;
  private lastAuto = 0;

  /** Ease the distance one frame closer to the target for `speedMps`. */
  step(dt: number, speedMps: number, currentDist: number): number {
    if (this.lastAuto > 0 && currentDist > 0 && currentDist !== this.lastAuto) {
      this.userFactor = Math.min(FACTOR_MAX, Math.max(FACTOR_MIN,
        this.userFactor * (currentDist / this.lastAuto)));
    }
    // The auto distance floors at ZOOM_MIN_M, but the user-scaled result may
    // go lower — down to 1 m, matching controls.minDistance — so scrolling in
    // past the auto floor keeps working (top end still caps at ZOOM_MAX_M).
    const desired = Math.min(ZOOM_MAX_M, Math.max(1, autoZoomDistance(speedMps) * this.userFactor));
    const a = 1 - Math.exp(-Math.max(dt, 0) / SMOOTHING_TAU);
    const next = currentDist + (desired - currentDist) * a;
    this.lastAuto = next;
    return next;
  }

  /** Forget the user's scroll factor (new flight / reset). */
  reset(): void {
    this.userFactor = 1;
    this.lastAuto = 0;
  }

  /**
   * Report the distance actually in effect after this frame (e.g. after the
   * ground-floor clamp moved the camera), so the difference is not mistaken
   * for a user scroll next frame.
   */
  noteActual(dist: number): void {
    if (dist > 0) this.lastAuto = dist;
  }
}
