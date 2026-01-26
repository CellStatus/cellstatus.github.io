// Lightweight simulation utilities for VSM (stubbed, replace with full logic later)
export type VsmStation = {
  id: string;
  name: string;
  processStep: number;
  machineId?: string;
  machineIdDisplay?: string;
};

export type VsmMetrics = {
  totalCycleTime: number;
  taktTime?: number;
  stepMetrics: Array<{ step: number; cycleTime: number }>; 
};

/**
 * Simple placeholder to calculate metrics from stations.
 * Replace with your project's real simulation and statistical logic.
 */
export function calculateMetrics(stations: VsmStation[]): VsmMetrics {
  const stepGroups = new Map<number, VsmStation[]>();
  stations.forEach(s => {
    const step = s.processStep || 1;
    if (!stepGroups.has(step)) stepGroups.set(step, []);
    stepGroups.get(step)!.push(s);
  });

  const stepMetrics: VsmMetrics['stepMetrics'] = [];
  stepGroups.forEach((group, step) => {
    // placeholder: cycleTime = 1 min per station
    stepMetrics.push({ step, cycleTime: group.length * 1 });
  });

  const totalCycleTime = stepMetrics.reduce((s, m) => s + m.cycleTime, 0);
  return { totalCycleTime, stepMetrics };
}

export function simulateVsm(stations: VsmStation[], runs = 1) {
  // Very small stubbed simulation that returns aggregated results.
  const metrics = calculateMetrics(stations);
  return {
    runs,
    metrics,
    produced: Math.max(0, Math.floor((runs * 60) / Math.max(1, metrics.totalCycleTime))),
  };
}
