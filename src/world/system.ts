// Minimal contract for per-frame world animation (day/night, weather,
// creatures, clouds, water shimmer, sway). `elapsed` is the SceneManager-owned
// clock that persists across scene rebuilds so ambient state (e.g. day/night
// phase) does not snap back when the environment is rebuilt.
export interface WorldSystem {
  update(dt: number, elapsed: number): void;
  dispose(): void;
}
