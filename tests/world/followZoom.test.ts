import { describe, expect, it } from 'vitest';
import { autoZoomDistance, FollowZoom, ZOOM_MIN_M, ZOOM_MAX_M } from '../../src/world/followZoom';

describe('autoZoomDistance', () => {
  it('sits at the minimum distance when stationary', () => {
    expect(autoZoomDistance(0)).toBeCloseTo(ZOOM_MIN_M, 6);
  });
  it('grows proportionally with speed', () => {
    expect(autoZoomDistance(100)).toBeCloseTo(ZOOM_MIN_M + 120, 6);
  });
  it('clamps at the maximum distance (exactly 495 m/s hits 600)', () => {
    expect(autoZoomDistance(494.9)).toBeLessThan(ZOOM_MAX_M);
    expect(autoZoomDistance(495)).toBeCloseTo(ZOOM_MAX_M, 6);
    expect(autoZoomDistance(1000)).toBe(ZOOM_MAX_M);
  });
  it('treats negative or non-finite speed as stationary', () => {
    expect(autoZoomDistance(-5)).toBeCloseTo(ZOOM_MIN_M, 6);
    expect(autoZoomDistance(Number.NaN)).toBeCloseTo(ZOOM_MIN_M, 6);
  });
});

// Settling loops run 600 frames = 10 s = 12.5 τ, leaving a residual of
// e^-12.5 ≈ 4e-6 m, comfortably inside toBeCloseTo(x, 0) (±0.5 m). Shorter
// loops leave exponentially larger residuals and fail.
describe('FollowZoom.step', () => {
  it('converges toward auto distance × user factor over time', () => {
    const z = new FollowZoom();
    let d = 6;
    for (let i = 0; i < 600; i++) d = z.step(1 / 60, 50, d);
    expect(d).toBeCloseTo(autoZoomDistance(50), 0);
  });
  it('folds a user scroll-out into the multiplier', () => {
    const z = new FollowZoom();
    let d = 6;
    for (let i = 0; i < 600; i++) d = z.step(1 / 60, 50, d);
    d *= 2; // user scrolls out 2×
    z.step(1 / 60, 50, d); // let the scroll register
    for (let i = 0; i < 600; i++) d = z.step(1 / 60, 50, d);
    expect(z.userFactor).toBeCloseTo(2, 1);
    expect(d).toBeCloseTo(autoZoomDistance(50) * 2, 0);
  });
  it('clamps the desired distance to the maximum even with a huge user factor', () => {
    const z = new FollowZoom();
    z.userFactor = 100;
    let d = ZOOM_MIN_M;
    for (let i = 0; i < 600; i++) d = z.step(1 / 60, 0, d);
    expect(d).toBeCloseTo(ZOOM_MAX_M, 0); // 6 × 100 clamps to 600, never above
  });
  it('reset() clears the user factor', () => {
    const z = new FollowZoom();
    let d = 6;
    for (let i = 0; i < 120; i++) d = z.step(1 / 60, 50, d);
    d *= 3;
    z.step(1 / 60, 50, d);
    z.reset();
    expect(z.userFactor).toBe(1);
    for (let i = 0; i < 600; i++) d = z.step(1 / 60, 50, d);
    expect(d).toBeCloseTo(autoZoomDistance(50), 0);
  });
  it('noteActual() absorbs an external camera move (ground clamp) as non-user', () => {
    const z = new FollowZoom();
    let d = 6;
    for (let i = 0; i < 600; i++) d = z.step(1 / 60, 50, d);
    d *= 1.5; // e.g. the ground-floor clamp lifted the camera
    z.noteActual(d);
    for (let i = 0; i < 600; i++) d = z.step(1 / 60, 50, d);
    expect(z.userFactor).toBeCloseTo(1, 3); // not folded in as a scroll
    expect(d).toBeCloseTo(autoZoomDistance(50), 0);
  });
  it('lets the user scroll in past the 6 m auto floor (down to 1 m)', () => {
    const z = new FollowZoom();
    z.userFactor = 1 / 64;
    let d = ZOOM_MIN_M;
    for (let i = 0; i < 600; i++) d = z.step(1 / 60, 0, d);
    expect(d).toBeCloseTo(1, 1); // auto floor 6 m × factor 1/64 clamps at 1 m
  });
  it('zero dt does not move the distance', () => {
    const z = new FollowZoom();
    expect(z.step(0, 100, 6)).toBeCloseTo(6, 6);
  });
});
