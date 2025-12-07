// OEE calculation utility
export function calculateOEEStats({ plannedProductionTime, downtime, goodPartsRan, scrapParts, idealCycleTime }) {
  plannedProductionTime = Number(plannedProductionTime || 0);
  downtime = Number(downtime || 0);
  goodPartsRan = Number(goodPartsRan || 0);
  scrapParts = Number(scrapParts || 0);
  idealCycleTime = Number(idealCycleTime || 0);
  const actualRuntime = plannedProductionTime - downtime;
  const totalParts = goodPartsRan + scrapParts;

  // Availability
  const availability = plannedProductionTime > 0 ? actualRuntime / plannedProductionTime : 0;
  // Performance (match card): (Total Parts * Ideal Cycle Time) / Actual Runtime (seconds)
  const actualRuntimeSeconds = actualRuntime * 60;
  const performance = totalParts > 0 && actualRuntimeSeconds > 0
    ? ((totalParts * idealCycleTime) / actualRuntimeSeconds)
    : 0;
  // Quality
  const quality = totalParts > 0 ? goodPartsRan / totalParts : 0;
  // OEE
  const oee = availability * performance * quality;

  return {
    availability,
    performance,
    quality,
    oee,
  };
}
