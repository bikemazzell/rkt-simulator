import type * as THREE from 'three';
import type { EnvParams } from '../../sim/types';
import type { Rng } from '../../sim/rng';

export interface BuildContext { scene: THREE.Scene; root: THREE.Group; }

export interface EnvironmentDef {
  id: string;
  name: string;
  funny: boolean;
  makeParams(rng: Rng): EnvParams;
  build(ctx: BuildContext, params: EnvParams, rng: Rng): void;
}
