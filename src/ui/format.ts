import type { FlightPhase } from '../sim/types';

export function formatAltitude(m: number): string {
  return `${Math.round(m)} m`;
}

export function formatSpeed(mps: number): string {
  return `${mps.toFixed(1)} m/s`;
}

const LABELS: Record<FlightPhase, string> = {
  idle: 'On Pad', boost: 'Boost', coast: 'Coast', apogee: 'Apogee',
  descent: 'Descent', landed: 'Landed', failed: 'Failed',
};

export function phaseLabel(phase: FlightPhase): string {
  return LABELS[phase];
}
