import { VsmStation, calculateDetailedMetrics, computeStationUPH, computeEffectiveCycleTimeSec, VsmDetailedMetrics } from './vsm-sim';

/**
 * Create a comprehensive Markdown export for a VSM with key insights and analysis.
 */
export function exportVsmMarkdown(
  name: string, 
  description: string, 
  stations: VsmStation[],
  rawMaterialUPH?: number,
  operationNames?: Record<number, string>
): string {
  const lines: string[] = [];
  const metrics = calculateDetailedMetrics(stations, { rawMaterialUPH });
  
  // Header
  lines.push(`# Value Stream Map: ${name}`);
  lines.push('');
  if (description) {
    lines.push(`> ${description}`);
    lines.push('');
  }
  lines.push(`*Generated: ${new Date().toLocaleString()}*`);
  lines.push('');
  
  // Executive Summary
  lines.push('## 📊 Executive Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| **System Throughput** | ${Math.round(metrics.systemThroughputUPH).toLocaleString()} UPH |`);
  lines.push(`| **Total Lead Time** | ${formatTime(metrics.totalLeadTimeSec)} |`);
  lines.push(`| **Value-Add Time** | ${formatTime(metrics.valueAddTimeSec)} |`);
  lines.push(`| **Total Waiting Time** | ${formatTime(metrics.totalWaitingTimeSec)} |`);
  lines.push(`| **Cell Balance** | ${metrics.cellBalancePercent.toFixed(1)}% |`);
  lines.push(`| **Avg Utilization** | ${metrics.avgUtilizationPercent.toFixed(1)}% |`);
  lines.push(`| **Total WIP** | ${metrics.totalWip} units |`);
  lines.push(`| **Operations** | ${metrics.steps.length} |`);
  lines.push(`| **Total Machines** | ${stations.length} |`);
  lines.push('');
  
  // Bottleneck Analysis
  lines.push('## 🎯 Constraint Analysis');
  lines.push('');
  if (metrics.isRawMaterialBottleneck) {
    lines.push(`**⚠️ Raw Material Supply is the System Constraint**`);
    lines.push('');
    lines.push(`The incoming raw material rate (${rawMaterialUPH?.toLocaleString()} UPH) is limiting the system.`);
    lines.push('All operations have capacity to process more, but are starved for material.');
    lines.push('');
    lines.push('**Recommendation:** Increase raw material supply to unlock additional capacity.');
  } else if (metrics.bottleneckStep) {
    const bn = metrics.bottleneckStep;
    const opName = operationNames?.[bn.step] || bn.stations[0]?.name || `Operation ${bn.step}`;
    lines.push(`**🔴 Bottleneck: Op ${bn.step} - ${opName}**`);
    lines.push('');
    lines.push(`This operation limits the entire system to **${Math.round(bn.combinedRateUPH).toLocaleString()} UPH**.`);
    lines.push('');
    lines.push('| Property | Value |');
    lines.push('|----------|-------|');
    lines.push(`| Combined Rate | ${Math.round(bn.combinedRateUPH).toLocaleString()} UPH |`);
    lines.push(`| Machines | ${bn.machines} |`);
    lines.push(`| Avg Cycle Time | ${bn.avgStationCT.toFixed(1)}s |`);
    lines.push(`| Utilization | ${bn.avgUtilPercent.toFixed(1)}% |`);
    lines.push('');
    lines.push('**Improvement Options:**');
    lines.push('1. Add parallel machines at this operation');
    lines.push('2. Reduce cycle time (process improvement, automation)');
    lines.push('3. Increase uptime (reduce changeover, improve maintenance)');
    lines.push('4. Reduce setup time or increase batch size (pcs/setup)');
  }
  lines.push('');
  
  // Process Flow
  lines.push('## 🔄 Process Flow');
  lines.push('');
  lines.push('```');
  const flowLine = metrics.steps.map(s => {
    const opName = operationNames?.[s.step] || s.stations[0]?.name || `Op${s.step}`;
    const shortName = opName.length > 12 ? opName.substring(0, 12) + '…' : opName;
    return `[${shortName}]`;
  }).join(' → ');
  lines.push(`Incoming → ${flowLine} → Output`);
  lines.push('```');
  lines.push('');
  
  // Operations Detail
  lines.push('## ⚙️ Operations Detail');
  lines.push('');
  
  metrics.steps.forEach(step => {
    const opName = operationNames?.[step.step] || step.stations[0]?.name || `Operation ${step.step}`;
    const isBottleneck = metrics.bottleneckStep?.step === step.step;
    
    lines.push(`### Op ${step.step}: ${opName}${isBottleneck ? ' 🔴 BOTTLENECK' : ''}`);
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Combined Rate | ${Math.round(step.combinedRateUPH).toLocaleString()} UPH |`);
    lines.push(`| Machines | ${step.machines} |`);
    lines.push(`| Avg Cycle Time | ${step.avgStationCT.toFixed(1)}s |`);
    lines.push(`| Effective CT | ${step.effectiveCTsec.toFixed(1)}s |`);
    lines.push(`| Utilization | ${step.avgUtilPercent.toFixed(1)}% |`);
    lines.push(`| WIP Before | ${step.wipBefore} units |`);
    if (step.waitingTimeSec > 0) {
      lines.push(`| Waiting Time | ${step.waitingTimeSec.toFixed(1)}s |`);
    }
    lines.push('');
    
    // Machine details
    lines.push('**Machines:**');
    lines.push('');
    lines.push('| Machine | ID | CT | Pcs/Setup | Uptime | Setup | Eff CT | UPH |');
    lines.push('|---------|-----|-----|-----------|--------|-------|--------|-----|');
    step.stations.forEach(station => {
      const uph = computeStationUPH(station);
      const effCT = computeEffectiveCycleTimeSec(station);
      const ct = station.cycleTime || 60;
      const batch = station.batchSize || 1;
      const uptime = station.uptimePercent ?? 100;
      const setup = station.setupTime || 0;
      lines.push(`| ${station.name} | ${station.machineIdDisplay || '-'} | ${ct}s | ${batch} | ${uptime}% | ${setup}s | ${effCT.toFixed(1)}s | ${Math.round(uph)} |`);
    });
    lines.push('');
  });
  
  // Insights & Recommendations
  lines.push('## 💡 Insights & Recommendations');
  lines.push('');
  
  // Cell Balance insight
  if (metrics.cellBalancePercent < 70) {
    lines.push(`### Low Cell Balance (${metrics.cellBalancePercent.toFixed(1)}%)`);
    lines.push('');
    lines.push('Operations are significantly imbalanced. Consider:');
    lines.push('- Rebalancing work content between operations');
    lines.push('- Adding machines at slower operations');
    lines.push('- Combining operations where feasible');
    lines.push('');
  }
  
  // Underutilized operations
  const underutilized = metrics.steps.filter(s => s.avgUtilPercent < 50 && metrics.bottleneckStep?.step !== s.step);
  if (underutilized.length > 0) {
    lines.push('### Underutilized Operations');
    lines.push('');
    lines.push('These operations have significant excess capacity:');
    lines.push('');
    underutilized.forEach(s => {
      const opName = operationNames?.[s.step] || s.stations[0]?.name || `Op ${s.step}`;
      lines.push(`- **Op ${s.step}: ${opName}** - ${s.avgUtilPercent.toFixed(0)}% utilization (${Math.round(s.combinedRateUPH - metrics.systemThroughputUPH)} UPH spare capacity)`);
    });
    lines.push('');
    lines.push('*Note: Do not invest in improving these operations until the bottleneck is addressed.*');
    lines.push('');
  }
  
  // High WIP
  if (metrics.totalWip > metrics.steps.length * 10) {
    lines.push('### High WIP Inventory');
    lines.push('');
    lines.push(`Total WIP of ${metrics.totalWip} units indicates potential flow issues.`);
    lines.push('');
    lines.push("Per Little's Law: **Lead Time = WIP / Throughput**");
    lines.push('');
    const estimatedLeadTime = (metrics.totalWip / metrics.systemThroughputUPH) * 3600;
    lines.push(`Estimated queue-based lead time: ${formatTime(estimatedLeadTime)}`);
    lines.push('');
    lines.push('Consider reducing batch sizes and implementing pull systems.');
    lines.push('');
  }
  
  // Theory of Constraints summary
  lines.push('### Theory of Constraints Summary');
  lines.push('');
  lines.push('1. **IDENTIFY** the constraint: ' + (metrics.isRawMaterialBottleneck 
    ? 'Raw material supply'
    : `Op ${metrics.bottleneckStep?.step} (${operationNames?.[metrics.bottleneckStep?.step || 0] || metrics.bottleneckStep?.stations[0]?.name})`));
  lines.push('2. **EXPLOIT** the constraint: Ensure it never waits for work');
  lines.push('3. **SUBORDINATE** everything else: Match pace to the constraint');
  lines.push('4. **ELEVATE** the constraint: Add capacity only here');
  lines.push('5. **REPEAT**: Find the new constraint after improvement');
  lines.push('');
  
  // Footer
  lines.push('---');
  lines.push('');
  lines.push('*Report generated by CellStatus VSM Builder*');
  
  return lines.join('\n');
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)} min`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

/**
 * Legacy plain-text export (kept for backward compatibility)
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
