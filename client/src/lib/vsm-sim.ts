/**
 * VSM (Value Stream Mapping) Simulation Utilities
 * 
 * CALCULATION METHODOLOGY:
 * 
 * 1. CYCLE TIME (CT): Time to process ONE unit at a station
 *    - Input as seconds per unit
 *    - Example: CT=30s means it takes 30 seconds to process one part
 * 
 * 2. SETUP TIME: Time to changeover/setup the machine (seconds)
 *    - Applied once per batch, then amortized across all units in the batch
 *    - Example: Setup=600s, batch=100 → 6s of setup per unit
 * 
 * 3. BATCH SIZE: Number of pieces between setups (pcs/setup)
 *    - NOT pieces processed together - each unit still takes CT seconds
 *    - Setup time is divided by batch size to get per-unit setup contribution
 *    - Example: CT=30s, setup=600s, batch=100 → effective CT = 30 + (600/100) = 36s/unit
 * 
 * 4. UPTIME %: Percentage of time machine is available
 *    - Reduces effective throughput: effectiveUPH = theoreticalUPH × (uptime/100)
 *    - Example: 100 UPH at 80% uptime → 80 UPH effective
 * 
 * 5. UPH (Units Per Hour): Throughput rate
 *    - Single machine: UPH = 3600 / effectiveCT × (uptime/100)
 *    - Parallel machines at same step: UPH = sum of individual machine UPHs
 * 
 * 6. SYSTEM THROUGHPUT: Minimum UPH across all steps (bottleneck determines flow)
 *    - Also constrained by raw material input rate if specified
 * 
 * 7. LEAD TIME: Total time for a unit to flow through the system
 *    - Sum of cycle times at each step
 *    - Note: For parallel machines, we use the step's effective CT (3600/combinedUPH)
 * 
 * 8. PROCESS EFFICIENCY: Value-adding time / Total lead time × 100%
 */

export type VsmStation = {
  id: string;
  name: string;
  processStep: number;
  machineId?: string;
  machineIdDisplay?: string;
  /** Cycle time in seconds - time to process ONE unit */
  cycleTime?: number;
  /** Setup time in seconds - time to changeover, amortized across batch */
  setupTime?: number;
  /** Batch size - pieces per setup (NOT pieces processed together) */
  batchSize?: number;
  /** Uptime percentage (0-100) - reduces effective throughput */
  uptimePercent?: number;
  /** WIP buffer quantity before this station (inventory waiting to be processed) */
  wipBefore?: number;
};

export type VsmConfig = {
  /** Raw material input rate limit (UPH) - constrains system if lower than process capacity */
  rawMaterialUPH?: number;
};

export type StepMetric = {
  step: number;
  stations: VsmStation[];
  machines: number;
  /** Average per-unit cycle time across machines at this step (seconds) */
  avgStationCT: number;
  /** Combined throughput of all machines at this step (UPH) */
  combinedRateUPH: number;
  /** Effective cycle time for the step = 3600 / combinedRateUPH (seconds) */
  effectiveCTsec: number;
  /** Average UPH per machine at this step */
  perMachineAvgUPH: number;
  /** Utilization: actual throughput / theoretical capacity × 100 */
  avgUtilPercent: number;
  /** WIP buffer before this step (inventory waiting to be processed) */
  wipBefore: number;
  /** Waiting time: time spent idle due to slower upstream (seconds) */
  waitingTimeSec: number;
};

export type VsmDetailedMetrics = {
  steps: StepMetric[];
  /** System throughput = min(step throughputs, rawMaterialUPH) */
  systemThroughputUPH: number;
  /** Total lead time = sum of effective CTs across all steps */
  totalLeadTimeSec: number;
  /** Total WIP in buffers */
  totalWip: number;
  /** Process efficiency = sum(cycle times) / lead time × 100 (also called Cell Balance) */
  processEfficiencyPercent: number;
  /** Cell Balance = Process Efficiency (alias) */
  cellBalancePercent: number;
  /** Total value-adding time across all steps (seconds) */
  valueAddTimeSec: number;
  /** Total waiting/idle time across all steps (seconds) */
  totalWaitingTimeSec: number;
  /** Average utilization across all steps */
  avgUtilizationPercent: number;
  /** Step with lowest throughput (the constraint) */
  bottleneckStep?: StepMetric;
  /** True if raw material is the system constraint (lower than all operations) */
  isRawMaterialBottleneck?: boolean;
  rawMaterialUPH?: number;
  isRawMaterialConstrained?: boolean;
};

/**
 * Calculate per-unit cycle time for a station (before uptime adjustment)
 * 
 * Formula: perUnitCT = cycleTime + (setupTime / batchSize)
 * 
 * - Cycle Time: Time to process ONE unit
 * - Setup Time: Changeover time, amortized across the batch
 * - Batch Size: Pieces per setup (how many units between setups)
 * 
 * Example 1: CT=30s, setup=0, batch=1 → 30 + 0/1 = 30s/unit
 * Example 2: CT=480s, setup=3600s, batch=200 → 480 + 3600/200 = 498s/unit
 */
export function computePerUnitCycleTimeSec(s: VsmStation): number {
  const ct = s.cycleTime && s.cycleTime > 0 ? s.cycleTime : 60; // default 60s
  const setup = s.setupTime && s.setupTime > 0 ? s.setupTime : 0;
  const batch = s.batchSize && s.batchSize > 0 ? s.batchSize : 1;
  
  // CT is time for ONE unit
  // Setup is amortized: setup / batch gives per-unit setup contribution
  return ct + (setup / batch);
}

/**
 * Calculate effective cycle time including uptime adjustment
 * 
 * Formula: effectiveCT = perUnitCT / (uptime / 100)
 * 
 * This gives the "real world" time per unit accounting for downtime.
 * UPH can then be calculated simply as: UPH = 3600 / effectiveCT
 * 
 * Example: CT=480s, setup=3600s, batch=200, uptime=50%
 *   → perUnitCT = 480 + 3600/200 = 498s
 *   → effectiveCT = 498 / 0.5 = 996s/unit
 *   → UPH = 3600 / 996 = 3.6 UPH
 */
export function computeEffectiveCycleTimeSec(s: VsmStation): number {
  const perUnitCT = computePerUnitCycleTimeSec(s);
  const uptime = s.uptimePercent != null ? Math.max(0.01, Math.min(100, s.uptimePercent)) / 100 : 1;
  
  return perUnitCT / uptime;
}

/**
 * Calculate UPH for a single machine/station
 * 
 * Formula: UPH = 3600 / effectiveCT
 * 
 * Where effectiveCT = perUnitCT / uptime
 */
export function computeStationUPH(s: VsmStation): number {
  const effectiveCT = computeEffectiveCycleTimeSec(s);
  
  if (effectiveCT <= 0) return 0;
  return 3600 / effectiveCT;
}

export function calculateDetailedMetrics(stations: VsmStation[], config?: VsmConfig): VsmDetailedMetrics {
  // Group stations by process step
  const stepGroups = new Map<number, VsmStation[]>();
  stations.forEach(s => {
    const step = s.processStep || 1;
    if (!stepGroups.has(step)) stepGroups.set(step, []);
    stepGroups.get(step)!.push(s);
  });

  const steps: StepMetric[] = [];

  stepGroups.forEach((group, step) => {
    // Calculate per-unit cycle times for each station
    const perUnitCTs = group.map(s => computePerUnitCycleTimeSec(s));
    const avgStationCT = perUnitCTs.reduce((a, b) => a + b, 0) / perUnitCTs.length;
    
    // Calculate UPH for each station, then sum for parallel capacity
    const stationUPHs = group.map(s => computeStationUPH(s));
    const combinedRateUPH = stationUPHs.reduce((a, b) => a + b, 0);
    
    // Effective CT for the step (time between units leaving this step)
    // With parallel machines, throughput adds up, so effective CT decreases
    const effectiveCTsec = combinedRateUPH > 0 ? 3600 / combinedRateUPH : Infinity;
    
    const perMachineAvgUPH = group.length > 0 ? combinedRateUPH / group.length : 0;
    
    // Sum WIP from all stations in this step (WIP waiting before this step)
    const wipBefore = group.reduce((sum, s) => sum + (s.wipBefore || 0), 0);

    steps.push({
      step,
      stations: group,
      machines: group.length,
      avgStationCT,
      combinedRateUPH,
      effectiveCTsec,
      perMachineAvgUPH,
      avgUtilPercent: 0, // calculated after we know system throughput
      wipBefore,
      waitingTimeSec: 0, // calculated after we know bottleneck
    });
  });

  // System throughput = minimum rate across all steps (bottleneck)
  let processCapacityUPH = steps.length > 0 ? Math.min(...steps.map(s => s.combinedRateUPH)) : 0;
  
  // Apply raw material constraint if specified
  const rawMaterialUPH = config?.rawMaterialUPH;
  const isRawMaterialConstrained = rawMaterialUPH !== undefined && rawMaterialUPH > 0 && rawMaterialUPH < processCapacityUPH;
  const systemThroughputUPH = isRawMaterialConstrained ? rawMaterialUPH : processCapacityUPH;

  // Calculate utilization and waiting time for each step
  // Utilization = (actual throughput / theoretical capacity) × 100
  // Waiting time = time a station is idle waiting for parts from slower upstream
  const systemCTsec = systemThroughputUPH > 0 ? 3600 / systemThroughputUPH : 0;
  
  steps.forEach(s => {
    if (s.combinedRateUPH > 0) {
      s.avgUtilPercent = (systemThroughputUPH / s.combinedRateUPH) * 100;
      // Waiting time per unit = (system CT - step's effective CT)
      // This is how much longer between arrivals than the step needs
      const waitPerUnit = Math.max(0, systemCTsec - s.effectiveCTsec);
      s.waitingTimeSec = waitPerUnit;
    }
  });

  // Lead time = sum of actual cycle times (avgStationCT) across all steps + waiting time
  // This represents the time for a unit to flow through the system
  // Note: When there are parallel machines, a unit still takes the full CT at its assigned machine
  const totalLeadTimeSec = steps.reduce((sum, s) => sum + s.avgStationCT, 0) + 
                           steps.reduce((sum, s) => sum + s.waitingTimeSec, 0);
  
  // Total WIP in buffers
  const totalWip = steps.reduce((sum, s) => sum + s.wipBefore, 0);
  
  // Process efficiency / Cell Balance = value-adding time / total lead time
  // Value-adding time = sum of actual cycle times (the time actually processing)
  const valueAddTimeSec = steps.reduce((sum, s) => sum + s.avgStationCT, 0);
  const processEfficiencyPercent = totalLeadTimeSec > 0 ? (valueAddTimeSec / totalLeadTimeSec) * 100 : 0;
  const cellBalancePercent = processEfficiencyPercent; // Same calculation, different name
  
  // Total waiting time across all steps
  const totalWaitingTimeSec = steps.reduce((sum, s) => sum + s.waitingTimeSec, 0);
  
  // Average utilization across all steps
  const avgUtilizationPercent = steps.length > 0 
    ? steps.reduce((sum, s) => sum + s.avgUtilPercent, 0) / steps.length 
    : 0;

  // Bottleneck = step with lowest throughput (only if not raw material constrained)
  const bottleneckStep = steps.length > 0 && !isRawMaterialConstrained
    ? steps.reduce((min, s) => (!min || s.combinedRateUPH < min.combinedRateUPH ? s : min), steps[0]) 
    : undefined;
  
  // If raw material is constrained, it's the bottleneck
  const isRawMaterialBottleneck = isRawMaterialConstrained;

  return {
    steps: steps.sort((a, b) => a.step - b.step),
    systemThroughputUPH,
    totalLeadTimeSec,
    totalWip,
    processEfficiencyPercent,
    cellBalancePercent,
    valueAddTimeSec,
    totalWaitingTimeSec,
    avgUtilizationPercent,
    bottleneckStep,
    isRawMaterialBottleneck,
    rawMaterialUPH,
    isRawMaterialConstrained,
  };
}

export function simulateVsm(stations: VsmStation[], config?: VsmConfig) {
  return calculateDetailedMetrics(stations, config);
}
