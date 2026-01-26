import { VsmStation } from './vsm-sim';

/**
 * Create a plain-text export for a VSM. Keep minimal and human-readable.
 */
export function exportVsmText(name: string, description: string, stations: VsmStation[]) {
  const lines: string[] = [];
  lines.push(`VSM: ${name}`);
  if (description) lines.push(`Description: ${description}`);
  lines.push('');
  lines.push('Stations:');
  stations.forEach(s => {
    lines.push(`- Op ${s.processStep}: ${s.name}${s.machineId ? ` (machine: ${s.machineId})` : ''}`);
  });
  return lines.join('\n');
}
