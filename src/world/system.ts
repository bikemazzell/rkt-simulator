// Minimal contract for per-frame world animation (day/night, weather,
// creatures, clouds, water shimmer, sway). `elapsed` is the SceneManager-owned
// clock that persists across scene rebuilds so ambient state (e.g. day/night
// phase) does not snap back when the environment is rebuilt.
export interface WorldSystem {
  // `cameraPos` lets sky/backdrop systems recenter on the viewer so the world
  // never falls away on extreme flights. Systems that don't need it ignore it.
  update(dt: number, elapsed: number, cameraPos?: { x: number; y: number; z: number }): void;
  dispose(): void;
}
