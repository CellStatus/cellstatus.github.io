export type CellOperation = {
  id: string;
  name: string;
  cycleTimeSec: number;
  parallelMachines?: number;
  wipBefore?: number;
};

export type CellSimulation = {
  throughputUph: number;
  bottleneckOperationId: string | null;
  totalWip: number;
  leadTimeSec: number;
  operations: Array<{
    id: string;
    name: string;
    cycleTimeSec: number;
    parallelMachines: number;
    throughputUph: number;
    wipBefore: number;
  }>;
};

export function simulateCellFlow(operations: CellOperation[]): CellSimulation {
  const normalized = operations
    .filter((operation) => operation.name && operation.cycleTimeSec > 0)
    .map((operation) => {
      const wipBefore = Number(operation.wipBefore || 0);
      const parallelMachines = Math.max(1, Number(operation.parallelMachines || 1));
      const throughputUph = (3600 / operation.cycleTimeSec) * parallelMachines;
      return {
        id: operation.id,
        name: operation.name,
        cycleTimeSec: operation.cycleTimeSec,
        parallelMachines,
        throughputUph,
        wipBefore,
      };
    });

  if (normalized.length === 0) {
    return {
      throughputUph: 0,
      bottleneckOperationId: null,
      totalWip: 0,
      leadTimeSec: 0,
      operations: [],
    };
  }

  const bottleneck = normalized.reduce((min, operation) =>
    operation.throughputUph < min.throughputUph ? operation : min
  );

  const throughputUph = bottleneck.throughputUph;
  const totalWip = normalized.reduce((sum, operation) => sum + operation.wipBefore, 0);
  const processTimeSec = normalized.reduce((sum, operation) => sum + operation.cycleTimeSec, 0);
  const queueTimeSec = throughputUph > 0 ? (totalWip / throughputUph) * 3600 : 0;
  const leadTimeSec = processTimeSec + queueTimeSec;

  return {
    throughputUph,
    bottleneckOperationId: bottleneck.id,
    totalWip,
    leadTimeSec,
    operations: normalized,
  };
}
