import { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, AlertTriangle, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Station {
  id: number;
  name: string;
  cycleTime: number;
  operators: number;
  setupTime: number;
  uptimePercent: number;
  batchSize: number;
}

interface StationMetrics extends Station {
  effectiveCycleTime: number;
  rate: number;
  theoreticalRate: number;
  taktTime: number;
  isBottleneck: boolean;
  utilization: number;
  waitTime: number;
  setupImpact: number;
  downtimeImpact: number;
}

export default function VSMAnalyser() {
  const [stations, setStations] = useState<Station[]>([
    { id: 1, name: 'Cutting', cycleTime: 10, operators: 1, setupTime: 0, uptimePercent: 100, batchSize: 10 },
    { id: 2, name: 'Drilling', cycleTime: 15, operators: 1, setupTime: 0, uptimePercent: 100, batchSize: 10 },
    { id: 3, name: 'Assembly', cycleTime: 8, operators: 1, setupTime: 0, uptimePercent: 100, batchSize: 10 },
    { id: 4, name: 'Packaging', cycleTime: 12, operators: 1, setupTime: 0, uptimePercent: 100, batchSize: 10 }
  ]);
  const [nextId, setNextId] = useState(5);
  const [showConfig, setShowConfig] = useState(true);

  const addStation = () => {
    setStations([...stations, {
      id: nextId,
      name: `Station ${nextId}`,
      cycleTime: 10,
      operators: 1,
      setupTime: 0,
      uptimePercent: 100,
      batchSize: 10
    }]);
    setNextId(nextId + 1);
  };

  const removeStation = (id: number) => {
    setStations(stations.filter(s => s.id !== id));
  };

  const updateStation = (id: number, field: keyof Station, value: string | number) => {
    setStations(stations.map(s => 
      s.id === id ? { ...s, [field]: value } : s
    ));
  };

  const calculateMetrics = () => {
    const metrics: StationMetrics[] = stations.map((s) => {
      // Setup time is amortized across the batch
      const setupImpact = s.setupTime / s.batchSize;
      const effectiveCycleTime = s.cycleTime + setupImpact;
      
      // Uptime affects available capacity
      const uptimeMultiplier = s.uptimePercent / 100;
      
      // Rate calculation with both setup and uptime factors
      const theoreticalRate = s.operators / effectiveCycleTime;
      const actualRate = theoreticalRate * uptimeMultiplier;
      
      const taktTime = effectiveCycleTime / s.operators / uptimeMultiplier;
      
      return {
        ...s,
        effectiveCycleTime,
        rate: actualRate,
        theoreticalRate,
        taktTime,
        isBottleneck: false,
        utilization: 0,
        waitTime: 0,
        setupImpact,
        downtimeImpact: 100 - s.uptimePercent
      };
    });

    if (metrics.length === 0) return { metrics: [], bottleneckRate: 0, bottleneckIndex: -1 };

    // Find bottleneck (slowest actual rate)
    const bottleneckIndex = metrics.reduce((minIdx, curr, idx, arr) => 
      curr.rate < arr[minIdx].rate ? idx : minIdx
    , 0);
    
    metrics[bottleneckIndex].isBottleneck = true;
    const bottleneckRate = metrics[bottleneckIndex].rate;

    // Calculate utilization and wait times
    metrics.forEach((m, index) => {
      m.utilization = (bottleneckRate / m.rate) * 100;
      
      if (index > 0) {
        const prevRate = metrics[index - 1].rate;
        const currentRate = m.rate;
        if (currentRate > prevRate) {
          m.waitTime = (1 / prevRate) - (1 / currentRate);
        }
      }
    });

    return { metrics, bottleneckRate, bottleneckIndex };
  };

  const reset = () => {
    setStations([
      { id: 1, name: 'Cutting', cycleTime: 10, operators: 1, setupTime: 0, uptimePercent: 100, batchSize: 10 },
      { id: 2, name: 'Drilling', cycleTime: 15, operators: 1, setupTime: 0, uptimePercent: 100, batchSize: 10 },
      { id: 3, name: 'Assembly', cycleTime: 8, operators: 1, setupTime: 0, uptimePercent: 100, batchSize: 10 },
      { id: 4, name: 'Packaging', cycleTime: 12, operators: 1, setupTime: 0, uptimePercent: 100, batchSize: 10 }
    ]);
    setNextId(5);
  };

  const exportVSM = () => {
    const { metrics, bottleneckRate, bottleneckIndex } = calculateMetrics();
    
    if (metrics.length === 0) {
      alert('No stations to export');
      return;
    }

    const date = new Date().toLocaleDateString();
    const time = new Date().toLocaleTimeString();
    
    let content = `VALUE STREAM MAP ANALYSIS REPORT
Generated: ${date} at ${time}

================================================================================
PROCESS FLOW OVERVIEW
================================================================================

`;

    // Process stations
    metrics.forEach((m, index) => {
      const bottleneckMarker = m.isBottleneck ? ' ⚠ BOTTLENECK' : '';
      content += `${index + 1}. ${m.name.toUpperCase()}${bottleneckMarker}\n`;
      content += `   ├─ Cycle Time: ${m.cycleTime} seconds\n`;
      content += `   ├─ Operators: ${m.operators}\n`;
      content += `   ├─ Takt Time: ${m.taktTime.toFixed(2)} seconds\n`;
      content += `   ├─ Throughput Rate: ${m.rate.toFixed(3)} units/sec\n`;
      content += `   ├─ Utilization: ${m.utilization.toFixed(1)}%\n`;
      if (m.waitTime > 0) {
        content += `   └─ Wait Time: ${m.waitTime.toFixed(2)} seconds\n`;
      } else {
        content += `   └─ Wait Time: 0 seconds\n`;
      }
      
      if (index < metrics.length - 1) {
        content += `   ↓\n`;
      }
      content += `\n`;
    });

    content += `================================================================================
SYSTEM PERFORMANCE METRICS
================================================================================

System Throughput:     ${bottleneckRate.toFixed(3)} units/sec
                       ${(bottleneckRate * 3600).toFixed(0)} units/hour
                       ${(bottleneckRate * 3600 * 8).toFixed(0)} units/8-hour shift

Total Lead Time:       ${metrics.reduce((sum, m) => sum + m.taktTime, 0).toFixed(1)} seconds

Process Efficiency:    ${((bottleneckRate / Math.max(...metrics.map(m => m.rate))) * 100).toFixed(1)}%

Bottleneck Station:    ${metrics[bottleneckIndex].name}
Bottleneck Rate:       ${bottleneckRate.toFixed(3)} units/sec

================================================================================
ANALYSIS & RECOMMENDATIONS
================================================================================

CONSTRAINT IDENTIFICATION:
• ${metrics[bottleneckIndex].name} is the system constraint
• This station limits overall throughput to ${bottleneckRate.toFixed(3)} units/sec
• Bottleneck takt time: ${metrics[bottleneckIndex].taktTime.toFixed(2)} seconds

`;

    const underutilized = metrics.filter(m => m.utilization < 70);
    if (underutilized.length > 0) {
      content += `UNDERUTILIZED CAPACITY:
`;
      underutilized.forEach(m => {
        const idlePercentage = 100 - m.utilization;
        const canBeIdleTime = (idlePercentage / 100) * 60; // minutes per hour
        content += `• ${m.name}: ${m.utilization.toFixed(1)}% utilized\n`;
        content += `  - Can be idle ${idlePercentage.toFixed(1)}% of the time (${canBeIdleTime.toFixed(1)} min/hour)\n`;
        content += `  - Running this station continuously creates unnecessary inventory\n`;
      });
      content += `\n`;
    }

    content += `IMPROVEMENT RECOMMENDATIONS:
1. Focus on the bottleneck (${metrics[bottleneckIndex].name}):
   - Current: ${metrics[bottleneckIndex].operators} operator(s), ${metrics[bottleneckIndex].cycleTime}s cycle time
   - Adding 1 operator would increase rate to ${((metrics[bottleneckIndex].operators + 1) / metrics[bottleneckIndex].cycleTime).toFixed(3)} units/sec
   - Reducing cycle time by 20% would increase rate to ${(metrics[bottleneckIndex].operators / (metrics[bottleneckIndex].cycleTime * 0.8)).toFixed(3)} units/sec

2. Do NOT invest in non-bottleneck stations:
   - Improvements to other stations will not increase system throughput
   - Focus all resources on eliminating or elevating the constraint

3. Protect the bottleneck:
   - Ensure upstream stations maintain buffer inventory
   - Minimize downtime at ${metrics[bottleneckIndex].name}
   - Consider quality checks before the bottleneck to prevent waste

================================================================================
STATION DETAILS
================================================================================

`;

    metrics.forEach((m) => {
      content += `${m.name}:\n`;
      content += `  Configuration:\n`;
      content += `    - Cycle Time: ${m.cycleTime}s\n`;
      content += `    - Operators: ${m.operators}\n`;
      content += `    - Takt Time: ${m.taktTime.toFixed(2)}s per unit\n`;
      content += `  Performance:\n`;
      content += `    - Maximum Rate: ${m.rate.toFixed(3)} units/sec\n`;
      content += `    - Actual Utilization: ${m.utilization.toFixed(1)}%\n`;
      content += `    - Idle Time: ${(100 - m.utilization).toFixed(1)}%\n`;
      if (m.waitTime > 0) {
        content += `    - Wait Time per Unit: ${m.waitTime.toFixed(2)}s\n`;
      }
      content += `  Status: ${m.isBottleneck ? 'CONSTRAINT (Bottleneck)' : 'Non-Constraint'}\n`;
      content += `\n`;
    });

    content += `================================================================================
THEORY OF CONSTRAINTS SUMMARY
================================================================================

The Theory of Constraints states that:
1. Every system has at least one constraint limiting performance
2. System throughput is determined by the constraint
3. Improving non-constraints does not improve overall performance
4. Focus on identifying, exploiting, and elevating the constraint

For this process:
• The constraint is ${metrics[bottleneckIndex].name}
• All improvement efforts should focus here first
• Once elevated, a new bottleneck may emerge - continuous improvement

================================================================================
END OF REPORT
================================================================================
`;

    // Create and download the file
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `VSM_Analysis_${date.replace(/\//g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const { metrics, bottleneckRate, bottleneckIndex } = calculateMetrics();

  return (
    <div className="h-full overflow-auto bg-background p-4">
      <div className="max-w-full mx-auto">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-bold">Value Stream Mapper</h1>
            <p className="text-muted-foreground text-sm">Theory of Constraints Analysis</p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={exportVSM}
              disabled={metrics.length === 0}
              variant="default"
              size="sm"
            >
              <Download className="h-4 w-4 mr-2" />
              Export Report
            </Button>
            <Button
              onClick={reset}
              variant="outline"
              size="sm"
            >
              Reset Default
            </Button>
          </div>
        </div>

        {/* Collapsible Configuration Panel */}
        <div className="mb-4">
          <Button
            onClick={() => setShowConfig(!showConfig)}
            variant="outline"
            className="w-full justify-between"
          >
            <span className="font-bold">⚙️ Process Stations Configuration</span>
            {showConfig ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          
          {showConfig && (
            <div className="border rounded-b-lg p-4 mt-0 border-t-0">
              <div className="flex justify-end mb-3">
                <Button
                  onClick={addStation}
                  variant="default"
                  size="sm"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Station
                </Button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {stations.map((station) => (
                  <div key={station.id} className="border rounded p-3 bg-card">
                    <div className="flex justify-between items-center mb-2">
                      <Input
                        type="text"
                        value={station.name}
                        onChange={(e) => updateStation(station.id, 'name', e.target.value)}
                        className="font-bold text-sm flex-1 mr-2 h-8"
                      />
                      <Button
                        onClick={() => removeStation(station.id)}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Cycle (sec)</Label>
                          <Input
                            type="number"
                            min="1"
                            value={station.cycleTime}
                            onChange={(e) => updateStation(station.id, 'cycleTime', parseFloat(e.target.value) || 1)}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Operators</Label>
                          <Input
                            type="number"
                            min="1"
                            value={station.operators}
                            onChange={(e) => updateStation(station.id, 'operators', parseInt(e.target.value) || 1)}
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Setup (sec)</Label>
                          <Input
                            type="number"
                            min="0"
                            value={station.setupTime}
                            onChange={(e) => updateStation(station.id, 'setupTime', parseFloat(e.target.value) || 0)}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Pcs/Setup</Label>
                          <Input
                            type="number"
                            min="1"
                            value={station.batchSize}
                            onChange={(e) => updateStation(station.id, 'batchSize', parseInt(e.target.value) || 1)}
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Uptime %</Label>
                        <Input
                          type="number"
                          min="1"
                          max="100"
                          value={station.uptimePercent}
                          onChange={(e) => updateStation(station.id, 'uptimePercent', Math.min(100, Math.max(1, parseFloat(e.target.value) || 100)))}
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Value Stream Map */}
        <div className="border rounded-lg p-6 bg-card">
          <h2 className="text-xl font-bold mb-6">Value Stream Map</h2>
          
          {metrics.length > 0 ? (
            <div className="space-y-6">
              {/* Process Flow - Adaptive sizing */}
              <div className="overflow-x-auto overflow-y-visible pb-4 pt-4">
                <div className="flex items-start gap-3 mx-auto" style={{ 
                  width: 'fit-content',
                  maxWidth: '100%',
                  minHeight: '400px'
                }}>
                  {metrics.map((m, index) => {
                    const boxWidth = metrics.length <= 3 ? '220px' : 
                                    metrics.length <= 5 ? '180px' : 
                                    metrics.length <= 7 ? '160px' : '140px';
                    
                    return (
                      <div key={m.id} className="flex items-start gap-3 flex-shrink-0">
                        <div className="flex flex-col items-center flex-shrink-0" style={{ width: boxWidth }}>
                          {/* Process Box */}
                          <div className={`w-full p-4 rounded-lg border-2 ${m.isBottleneck ? 'bg-destructive/10 border-destructive' : 'bg-muted border-border'}`}>
                            <div className="text-center">
                              <div className="font-bold text-base mb-1 break-words">{m.name}</div>
                              {m.isBottleneck && (
                                <div className="flex items-center justify-center gap-1 text-destructive text-xs mb-2">
                                  <AlertTriangle className="h-3 w-3" />
                                  BOTTLENECK
                                </div>
                              )}
                              <div className="text-xs text-muted-foreground space-y-1">
                                <div>C/T: <span className="font-semibold">{m.cycleTime}s</span></div>
                                <div>Ops: <span className="font-semibold">{m.operators}</span></div>
                                {m.setupTime > 0 && (
                                  <div className="text-orange-500">Setup: <span className="font-semibold">{m.setupTime}s/{m.batchSize}pc</span></div>
                                )}
                                {m.uptimePercent < 100 && (
                                  <div className="text-destructive">Uptime: <span className="font-semibold">{m.uptimePercent}%</span></div>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          {/* Data Box */}
                          <div className="w-full mt-3 p-3 bg-background rounded border">
                            <div className="text-xs space-y-1.5">
                              <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Eff. C/T:</span>
                                <span className="font-bold">{m.effectiveCycleTime.toFixed(2)}s</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Takt Time:</span>
                                <span className="font-bold">{m.taktTime.toFixed(2)}s</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Actual Rate:</span>
                                <span className="font-bold text-blue-500">{m.rate.toFixed(3)}/s</span>
                              </div>
                              {(m.setupTime > 0 || m.uptimePercent < 100) && (
                                <div className="flex justify-between items-center">
                                  <span className="text-muted-foreground">Max Rate:</span>
                                  <span className="font-bold text-muted-foreground/50">{m.theoreticalRate.toFixed(3)}/s</span>
                                </div>
                              )}
                              <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Utilization:</span>
                                <span className={`font-bold ${m.utilization < 80 ? 'text-yellow-500' : 'text-green-500'}`}>
                                  {m.utilization.toFixed(0)}%
                                </span>
                              </div>
                              {m.waitTime > 0 && (
                                <div className="flex justify-between items-center">
                                  <span className="text-muted-foreground">Idle Time:</span>
                                  <span className="font-bold text-orange-500">{m.waitTime.toFixed(2)}s</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        {index < metrics.length - 1 && (
                          <div className="text-3xl text-muted-foreground font-bold flex-shrink-0" style={{ marginTop: '50px' }}>
                            →
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* System Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
                <div className="bg-muted p-4 rounded border">
                  <div className="text-sm text-muted-foreground mb-1">System Throughput</div>
                  <div className="text-2xl font-bold text-green-600">
                    {bottleneckRate.toFixed(3)} <span className="text-sm">units/sec</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {(bottleneckRate * 3600).toFixed(0)} units/hour
                  </div>
                </div>
                <div className="bg-muted p-4 rounded border">
                  <div className="text-sm text-muted-foreground mb-1">Total Lead Time</div>
                  <div className="text-2xl font-bold text-blue-600">
                    {metrics.reduce((sum, m) => sum + m.taktTime, 0).toFixed(1)} <span className="text-sm">sec</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    End-to-end process time
                  </div>
                </div>
                <div className="bg-muted p-4 rounded border">
                  <div className="text-sm text-muted-foreground mb-1">Process Efficiency</div>
                  <div className="text-2xl font-bold text-yellow-600">
                    {((bottleneckRate / Math.max(...metrics.map(m => m.rate))) * 100).toFixed(0)}%
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Capacity utilization
                  </div>
                </div>
              </div>

              {/* Insights */}
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-4 rounded">
                <h3 className="font-bold mb-2 text-blue-700 dark:text-blue-300">💡 Key Insights</h3>
                <div className="text-sm space-y-1">
                  <div>• <span className="text-blue-600 dark:text-blue-400 font-bold">{metrics[bottleneckIndex].name}</span> is your constraint - limiting system output to {bottleneckRate.toFixed(3)} units/sec</div>
                  {metrics.filter(m => m.utilization < 70).length > 0 && (
                    <div>• <span className="text-yellow-600 dark:text-yellow-400">{metrics.filter(m => m.utilization < 70).map(m => m.name).join(', ')}</span> can be idle {((100 - Math.max(...metrics.filter(m => m.utilization < 70).map(m => m.utilization)))).toFixed(0)}% of the time without reducing system output</div>
                  )}
                  <div>• To increase throughput: Add operators to <span className="font-bold">{metrics[bottleneckIndex].name}</span> or reduce its cycle time</div>
                  <div>• Improving non-bottleneck stations will not increase overall output</div>
                  <div>• Running non-bottlenecks at full capacity wastes resources and creates excess inventory</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-muted-foreground">
              Add process stations above to see the value stream map
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
