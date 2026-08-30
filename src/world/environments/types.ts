import type * as THREE from 'three';
import type { EnvParams } from '../../sim/types';
import type { Rng } from '../../sim/rng';
import type { WorldSystem } from '../system';
import type { WeatherKind } from '../weather';

export interface BuildContext {
  scene: THREE.Scene;
  root: THREE.Group;
  showTargetZone: boolean;
  /** register a per-frame animated world system; cleared together with the world */
  registerSystem(sys: WorldSystem): void;
  /** day/night start phase override (?tod=...) for deterministic CDP shots */
  startPhase?: number;
  /** forced weather (?weather=...) for deterministic CDP shots; otherwise rolled from biome weights */
  weather?: WeatherKind;
}

export interface EnvironmentDef {
  id: string;
  name: string;
  funny: boolean;
  makeParams(rng: Rng): EnvParams;
  build(ctx: BuildContext, params: EnvParams, rng: Rng): void;
}
