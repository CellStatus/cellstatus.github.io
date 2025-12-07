import type { DowntimeLog, Machine } from "@shared/schema";

export function calculateMachineOEE({ machine, downtimeLogs }: { machine: Machine, downtimeLogs: DowntimeLog[] }) {
  // Planned runtime is always 420 minutes
  const plannedRuntime = 420;
  // Sum downtime for this machine
  const machineDowntime = downtimeLogs
    .filter((log) => log.machineId === machine.id)
    .reduce((sum, log) => sum + (log.duration || 0), 0);
  const actualRuntime = plannedRuntime - machineDowntime;

  const goodPartsRan = machine.goodPartsRan || 0;
  const scrapParts = machine.scrapParts || 0;
  const idealCycleTime = machine.idealCycleTime || 0;
  const totalParts = goodPartsRan + scrapParts;

  // Availability
  const availability = plannedRuntime > 0 ? actualRuntime / plannedRuntime : 0;
  // Performance
  const actualRuntimeSeconds = actualRuntime * 60;
  const performance = totalParts > 0 && actualRuntimeSeconds > 0
    ? ((totalParts * idealCycleTime) / actualRuntimeSeconds)
    : 0;
  // Quality
  const quality = totalParts > 0 ? goodPartsRan / totalParts : 0;
  // OEE
  const oee = availability * performance * quality * 100;

  return {
    availability,
    performance,
    quality,
    oee,
  };
}
