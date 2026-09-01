import type { FlightPhase } from '../sim/types';

export function formatAltitude(m: number): string {
  return `${Math.round(m)} m`;
}

/** Human length for rocket sizes: cm under a metre, then 2-dp then whole metres. */
export function formatLength(m: number): string {
  if (m < 1) return `${Math.round(m * 100)} cm`;
  if (m < 10) return `${m.toFixed(2)} m`;
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
