import type { EnvironmentDef } from './types';
import { environmentDefs } from './build';

export type { EnvironmentDef };
export const environments: EnvironmentDef[] = environmentDefs;

export function environmentById(id: string): EnvironmentDef | undefined {
  return environments.find((e) => e.id === id);
}
