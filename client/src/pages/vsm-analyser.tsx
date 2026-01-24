import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation, useSearch } from 'wouter';
import { Plus, Trash2, ChevronDown, ChevronUp, AlertTriangle, Download, Factory, ArrowRight, Save, PanelTopClose, PanelTop } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { Machine, VsmConfiguration } from '@shared/schema';

interface Station {
  id: string;
  machineId?: string; // Link to actual machine (single machine only - atomic)
  name: string;
  cycleTime: number;
  operators: number;
  setupTime: number;
  uptimePercent: number;
  batchSize: number;
  processStep: number; // Groups parallel machines into the same step
}

// Helper function to get short ID display (last 3 chars)
const getShortId = (name: string): string => {
  return name.slice(-3);
};

// Group stations by process step for parallel machine display
const groupStationsByStep = (stations: Station[]): Map<number, Station[]> => {
  const groups = new Map<number, Station[]>();
  stations.forEach(station => {
    const step = station.processStep;
    if (!groups.has(step)) {
      groups.set(step, []);
    }
    groups.get(step)!.push(station);
  });
  return groups;
};

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

export default function VSMBuilder() {
  const { toast } = useToast();
  const searchString = useSearch();
  const [, setLocation] = useLocation();
  
  const [stations, setStations] = useState<Station[]>([]);
  const [showConfig, setShowConfig] = useState(true);
  const [showMachineSelector, setShowMachineSelector] = useState(true);
  const [vsmName, setVsmName] = useState('');
  const [vsmDescription, setVsmDescription] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [loadedVsmId, setLoadedVsmId] = useState<string | null>(null);
  const [vsmStatus, setVsmStatus] = useState('');
  const [vsmNotes, setVsmNotes] = useState('');

  // Parse VSM ID from URL query params
  const vsmIdFromUrl = new URLSearchParams(searchString).get('id');

  // Fetch machines from database
  const { data: machines = [], isLoading } = useQuery<Machine[]>({
    queryKey: ['/api/machines'],
  });

  // Fetch specific VSM configuration if ID is in URL
  const { data: loadedVsm } = useQuery<VsmConfiguration>({
    queryKey: [`/api/vsm-configurations/${vsmIdFromUrl}`],
    enabled: !!vsmIdFromUrl,
  });

  // Load VSM data when fetched
  useEffect(() => {
    if (loadedVsm && loadedVsm.id !== loadedVsmId) {
      setLoadedVsmId(loadedVsm.id);
      setVsmName(loadedVsm.name);
      setVsmDescription(loadedVsm.description || '');
      setVsmStatus(loadedVsm.status || '');
      setVsmNotes(loadedVsm.notes || '');
      
      // Parse stations from JSON
      const stationsData = loadedVsm.stationsJson as Station[];
      if (Array.isArray(stationsData)) {
        setStations(stationsData);
      }
    }
  }, [loadedVsm, loadedVsmId]);

  // Save VSM mutation
  const saveVsmMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/vsm-configurations', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vsm-configurations'] });
      toast({ title: 'VSM saved successfully' });
      setShowSaveDialog(false);
      setVsmName('');
      setVsmDescription('');
      setVsmStatus('');
      setVsmNotes('');
      setStations([]);
    },
    onError: () => {
      toast({ title: 'Failed to save VSM', variant: 'destructive' });
    }
  });

  const handleSaveVSM = () => {
    if (!vsmName.trim()) {
      toast({ title: 'Please enter a VSM name', variant: 'destructive' });
      return;
    }

    const { metrics, bottleneckRate } = calculateMetrics();
    const processEfficiency = metrics.length > 0 
      ? (bottleneckRate / Math.max(...metrics.map(m => m.rate))) * 100 
      : 0;

    saveVsmMutation.mutate({
      name: vsmName,
      description: vsmDescription,
      status: vsmStatus,
      notes: vsmNotes,
      stationsJson: stations,
      bottleneckRate,
      processEfficiency
    });
  };

  // Get the next available process step number
  const getNextProcessStep = () => {
    if (stations.length === 0) return 1;
    return Math.max(...stations.map(s => s.processStep)) + 1;
  };

  const addMachineToVSM = (machine: Machine, toStep?: number) => {
    // Use machine's VSM data or defaults
    const cycleTime = machine.idealCycleTime || 10;
    const batchSize = machine.batchSize || 10;
    const uptimePercent = machine.uptimePercent || 100;
    
    // If toStep provided, add to that step (parallel machine); otherwise create new step
    const processStep = toStep ?? getNextProcessStep();
    
    setStations([...stations, {
      id: crypto.randomUUID(),
      machineId: machine.id,
      name: machine.name,
      cycleTime,
      operators: 1,
      setupTime: 0,
      uptimePercent,
      batchSize,
      processStep
    }]);
    setShowMachineSelector(false);
  };

  const addCustomStation = () => {
    setStations([...stations, {
      id: crypto.randomUUID(),
      name: `Station ${stations.length + 1}`,
      cycleTime: 10,
      operators: 1,
      setupTime: 0,
      uptimePercent: 100,
      batchSize: 10,
      processStep: getNextProcessStep()
    }]);
  };

  const removeStation = (id: string) => {
    setStations(stations.filter(s => s.id !== id));
  };

  const updateStation = (id: string, field: keyof Station, value: string | number) => {
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
    setStations([]);
    setVsmName('');
    setVsmDescription('');
    setLoadedVsmId(null);
    // Clear URL param if present
    if (vsmIdFromUrl) {
      setLocation('/vsm-builder');
    }
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

  const handleNewVsm = () => {
    setStations([]);
    setVsmName('');
    setVsmDescription('');
    setLoadedVsmId(null);
    // Clear URL param
    setLocation('/vsm-builder');
  };

  return (
    <div className="h-full overflow-auto bg-background p-3 sm:p-4">
      <div className="max-w-full mx-auto">
        {/* Header - Mobile responsive */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Value Stream Mapper</h1>
            <p className="text-muted-foreground text-xs sm:text-sm">
              {loadedVsmId ? (
                <>Viewing: <span className="font-medium text-purple-600">{vsmName}</span></>
              ) : (
                'Build your process flow from machines'
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {loadedVsmId && (
              <Button
                onClick={handleNewVsm}
                variant="outline"
                size="sm"
                className="text-xs sm:text-sm"
              >
                <Plus className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden xs:inline">New VSM</span>
                <span className="xs:hidden">New</span>
              </Button>
            )}
            <Button
              onClick={() => setShowSaveDialog(true)}
              disabled={stations.length === 0}
              variant="default"
              size="sm"
              className="text-xs sm:text-sm"
            >
              <Save className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              Save
            </Button>
            <Button
              onClick={exportVSM}
              disabled={metrics.length === 0}
              variant="default"
              size="sm"
              className="text-xs sm:text-sm"
            >
              <Download className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              Export
            </Button>
            <Button
              onClick={reset}
              variant="outline"
              size="sm"
              className="text-xs sm:text-sm"
            >
              Clear
            </Button>
          </div>
        </div>

        {/* Save VSM Dialog */}
        {showSaveDialog && (
          <Card className="mb-4 border-primary/50 bg-card">
            <CardHeader>
              <CardTitle className="text-lg">Save Value Stream Map</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="vsm-name">VSM Name *</Label>
                  <Input
                    id="vsm-name"
                    value={vsmName}
                    onChange={(e) => setVsmName(e.target.value)}
                    placeholder="e.g., Production Line A - Q1 2026"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="vsm-description">Description</Label>
                  <Input
                    id="vsm-description"
                    value={vsmDescription}
                    onChange={(e) => setVsmDescription(e.target.value)}
                    placeholder="Brief description of this value stream"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="vsm-status">Cell Status</Label>
                  <Input
                    id="vsm-status"
                    value={vsmStatus}
                    onChange={(e) => setVsmStatus(e.target.value)}
                    placeholder="e.g., Running at 85% capacity, waiting on parts..."
                    className="mt-1"
                  />
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <Button
                    onClick={() => setShowSaveDialog(false)}
                    variant="outline"
                    size="sm"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveVSM}
                    disabled={saveVsmMutation.isPending}
                    size="sm"
                  >
                    {saveVsmMutation.isPending ? 'Saving...' : 'Save VSM'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Machine Selector - Collapsible */}
        <Collapsible open={showMachineSelector} onOpenChange={setShowMachineSelector} className="mb-4">
          <Card>
            <CardHeader className="pb-3">
              <CollapsibleTrigger asChild>
                <button className="flex items-center justify-between w-full text-left">
                  <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                    <Factory className="h-4 w-4 sm:h-5 sm:w-5" />
                    Build Your Value Stream
                    <Badge variant="secondary" className="ml-2 text-xs">
                      {machines.length} machines
                    </Badge>
                  </CardTitle>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="text-xs hidden sm:inline">
                      {showMachineSelector ? 'Collapse' : 'Expand'}
                    </span>
                    {showMachineSelector ? (
                      <PanelTopClose className="h-4 w-4 sm:h-5 sm:w-5 transition-transform" />
                    ) : (
                      <PanelTop className="h-4 w-4 sm:h-5 sm:w-5 transition-transform" />
                    )}
                  </div>
                </button>
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="pt-0">
                {isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : (
                  <>
                    <p className="text-xs sm:text-sm text-muted-foreground mb-4">
                      Select machines from your shop floor to build the value stream, or add custom stations.
                    </p>
                    {/* Group machines by cell */}
                    {(() => {
                      const machinesByCell = machines.reduce((acc, machine) => {
                        const cellName = machine.cell || 'Unassigned';
                        if (!acc[cellName]) acc[cellName] = [];
                        acc[cellName].push(machine);
                        return acc;
                      }, {} as Record<string, typeof machines>);
                      
                      // Sort cell names alphabetically, but keep "Unassigned" at the end
                      const sortedCells = Object.keys(machinesByCell).sort((a, b) => {
                        if (a === 'Unassigned') return 1;
                        if (b === 'Unassigned') return -1;
                        return a.localeCompare(b);
                      });
                      
                      return sortedCells.map(cellName => (
                        <div key={cellName} className="mb-4">
                          <div className="text-xs sm:text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">{cellName}</Badge>
                            <span className="text-xs">({machinesByCell[cellName].length})</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 sm:gap-2">
                            {machinesByCell[cellName].map((machine) => {
                              const alreadyAdded = stations.some(s => s.machineId === machine.id);
                                  return (
                                <Button
                                  key={machine.id}
                                  onClick={() => addMachineToVSM(machine)}
                                  disabled={alreadyAdded}
                                  variant={alreadyAdded ? "outline" : "default"}
                                  size="sm"
                                  className="gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3"
                                >
                                  <Factory className="h-3 w-3 sm:h-4 sm:w-4" />
                                  <span className="truncate max-w-[80px] sm:max-w-none">{machine.name}</span>
                                  {alreadyAdded && <Badge variant="secondary" className="ml-1 text-xs">✓</Badge>}
                                </Button>
                              );
                            })}
                          </div>
                        </div>
                      ));
                    })()}
                    {machines.length === 0 && (
                      <p className="text-xs sm:text-sm text-muted-foreground">No machines found. Create machines first or add custom stations below.</p>
                    )}
                    <Button
                      onClick={addCustomStation}
                      variant="outline"
                      size="sm"
                      className="text-xs sm:text-sm"
                    >
                      <Plus className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                      Add Custom Station
                    </Button>
                  </>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Process Flow Display */}
        {stations.length > 0 && (
          <Card className="mb-4">
            <CardHeader className="flex flex-row items-center justify-between py-3 sm:py-4">
              <CardTitle className="text-base sm:text-lg">Process Flow</CardTitle>
              <Button
                onClick={() => setShowConfig(!showConfig)}
                variant="ghost"
                size="sm"
                className="text-xs sm:text-sm"
              >
                {showConfig ? <ChevronUp className="h-3 w-3 sm:h-4 sm:w-4" /> : <ChevronDown className="h-3 w-3 sm:h-4 sm:w-4" />}
                <span className="ml-1">{showConfig ? 'Hide' : 'Show'}</span>
                <span className="hidden sm:inline ml-1">Configuration</span>
              </Button>
            </CardHeader>
            <CardContent className="pt-0">
              {/* Process Flow Visualization - Grouped by Process Step */}
              <div className="flex items-center gap-1.5 sm:gap-2 mb-4 overflow-x-auto pb-2">
                {(() => {
                  const stepGroups = groupStationsByStep(stations);
                  const sortedSteps = Array.from(stepGroups.keys()).sort((a, b) => a - b);
                  
                  return sortedSteps.map((step, stepIndex) => {
                    const stationsInStep = stepGroups.get(step)!;
                    const isParallel = stationsInStep.length > 1;
                    
                    // Build display for this step
                    const displayIds = stationsInStep.map(s => 
                      s.machineId ? getShortId(s.name) : s.name.substring(0, 6)
                    );
                    
                    return (
                      <div key={step} className="flex items-center gap-1.5 sm:gap-2">
                        <Badge 
                          variant="outline" 
                          className={`whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3 ${isParallel ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30' : ''}`}
                        >
                          {stepIndex + 1}. 
                          <span className="font-mono ml-1">
                            {isParallel ? (
                              <span className="text-blue-600 dark:text-blue-400">[{displayIds.join(' | ')}]</span>
                            ) : (
                              displayIds[0]
                            )}
                          </span>
                        </Badge>
                        {stepIndex < sortedSteps.length - 1 && (
                          <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
                        )}
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Station Configuration */}
              {showConfig && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3">{stations.map((station) => (
                  <div key={station.id} className="border rounded p-2 sm:p-3 bg-card">
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-1 sm:gap-2 flex-1 min-w-0">
                        {station.machineId && <Factory className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />}
                        {station.machineId ? (
                          <span className="font-bold text-xs sm:text-sm truncate">{station.name}</span>
                        ) : (
                          <Input
                            type="text"
                            value={station.name}
                            onChange={(e) => updateStation(station.id, 'name', e.target.value)}
                            className="font-bold text-xs sm:text-sm flex-1 h-7 sm:h-8"
                          />
                        )}
                      </div>
                      <Button
                        onClick={() => removeStation(station.id)}
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 sm:h-8 sm:w-8 text-destructive ml-1 sm:ml-2"
                      >
                        <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                    </div>

                    <div className="space-y-1.5 sm:space-y-2">
                      <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                        <div>
                          <Label className="text-[10px] sm:text-xs text-muted-foreground">Cycle (sec)</Label>
                          {station.machineId ? (
                            <div className="h-7 sm:h-8 flex items-center text-xs sm:text-sm font-medium">{station.cycleTime}</div>
                          ) : (
                            <Input
                              type="number"
                              min="1"
                              value={station.cycleTime}
                              onChange={(e) => updateStation(station.id, 'cycleTime', parseFloat(e.target.value) || 1)}
                              className="h-7 sm:h-8 text-xs sm:text-sm"
                            />
                          )}
                        </div>
                        <div>
                          <Label className="text-[10px] sm:text-xs text-muted-foreground">Operators</Label>
                          {station.machineId ? (
                            <div className="h-7 sm:h-8 flex items-center text-xs sm:text-sm font-medium">{station.operators}</div>
                          ) : (
                            <Input
                              type="number"
                              min="1"
                              value={station.operators}
                              onChange={(e) => updateStation(station.id, 'operators', parseInt(e.target.value) || 1)}
                              className="h-7 sm:h-8 text-xs sm:text-sm"
                            />
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                        <div>
                          <Label className="text-[10px] sm:text-xs text-muted-foreground">Setup (sec)</Label>
                          {station.machineId ? (
                            <div className="h-7 sm:h-8 flex items-center text-xs sm:text-sm font-medium">{station.setupTime}</div>
                          ) : (
                            <Input
                              type="number"
                              min="0"
                              value={station.setupTime}
                              onChange={(e) => updateStation(station.id, 'setupTime', parseFloat(e.target.value) || 0)}
                              className="h-7 sm:h-8 text-xs sm:text-sm"
                            />
                          )}
                        </div>
                        <div>
                          <Label className="text-[10px] sm:text-xs text-muted-foreground">Pcs/Setup</Label>
                          {station.machineId ? (
                            <div className="h-7 sm:h-8 flex items-center text-xs sm:text-sm font-medium">{station.batchSize}</div>
                          ) : (
                            <Input
                              type="number"
                              min="1"
                              value={station.batchSize}
                              onChange={(e) => updateStation(station.id, 'batchSize', parseInt(e.target.value) || 1)}
                              className="h-7 sm:h-8 text-xs sm:text-sm"
                            />
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                        <div>
                          <Label className="text-[10px] sm:text-xs text-muted-foreground">Uptime %</Label>
                          {station.machineId ? (
                            <div className="h-7 sm:h-8 flex items-center text-xs sm:text-sm font-medium">{station.uptimePercent}%</div>
                          ) : (
                            <Input
                              type="number"
                              min="1"
                              max="100"
                              value={station.uptimePercent}
                              onChange={(e) => updateStation(station.id, 'uptimePercent', Math.min(100, Math.max(1, parseFloat(e.target.value) || 100)))}
                              className="h-7 sm:h-8 text-xs sm:text-sm"
                            />
                          )}
                        </div>
                        <div>
                          <Label className="text-[10px] sm:text-xs text-muted-foreground">Step #</Label>
                          <Input
                            type="number"
                            min="1"
                            value={station.processStep}
                            onChange={(e) => updateStation(station.id, 'processStep', parseInt(e.target.value) || 1)}
                            className="h-7 sm:h-8 text-xs sm:text-sm"
                            title="Machines with the same step number run in parallel"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Value Stream Map */}
        <div className="border rounded-lg p-3 sm:p-6 bg-card">
          <h2 className="text-lg sm:text-xl font-bold mb-4 sm:mb-6">Value Stream Analysis</h2>
          
          {metrics.length > 0 ? (
            <div className="space-y-4 sm:space-y-6">
              {/* Process Flow - Adaptive sizing */}
              <div className="overflow-x-auto overflow-y-visible pb-4 pt-2 sm:pt-4">
                <div className="flex items-start gap-2 sm:gap-3 mx-auto" style={{ 
                  width: 'fit-content',
                  maxWidth: '100%',
                  minHeight: '320px'
                }}>
                  {metrics.map((m, index) => {
                    // More aggressive sizing for mobile
                    const boxWidth = metrics.length <= 2 ? '180px' : 
                                    metrics.length <= 3 ? '160px' : 
                                    metrics.length <= 5 ? '140px' : 
                                    metrics.length <= 7 ? '120px' : '100px';
                    
                    return (
                      <div key={m.id} className="flex items-start gap-2 sm:gap-3 flex-shrink-0">
                        <div className="flex flex-col items-center flex-shrink-0" style={{ width: boxWidth }}>
                          {/* Process Box */}
                          <div className={`w-full p-2 sm:p-4 rounded-lg border-2 ${m.isBottleneck ? 'bg-destructive/10 border-destructive' : 'bg-muted border-border'}`}>
                            <div className="text-center">
                              <div className="font-bold text-xs sm:text-base mb-1 break-words leading-tight">{m.name}</div>
                              {m.isBottleneck && (
                                <div className="flex items-center justify-center gap-1 text-destructive text-[10px] sm:text-xs mb-1 sm:mb-2">
                                  <AlertTriangle className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                                  <span className="hidden xs:inline">BOTTLENECK</span>
                                  <span className="xs:hidden">BTN</span>
                                </div>
                              )}
                              <div className="text-[10px] sm:text-xs text-muted-foreground space-y-0.5 sm:space-y-1">
                                <div>C/T: <span className="font-semibold">{m.cycleTime}s</span></div>
                                <div>Ops: <span className="font-semibold">{m.operators}</span></div>
                                {m.setupTime > 0 && (
                                  <div className="text-orange-500">Setup: <span className="font-semibold">{m.setupTime}s/{m.batchSize}pc</span></div>
                                )}
                                {m.uptimePercent < 100 && (
                                  <div className="text-destructive">Up: <span className="font-semibold">{m.uptimePercent}%</span></div>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          {/* Data Box */}
                          <div className="w-full mt-2 sm:mt-3 p-2 sm:p-3 bg-background rounded border">
                            <div className="text-[10px] sm:text-xs space-y-1 sm:space-y-1.5">
                              <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Eff:</span>
                                <span className="font-bold">{m.effectiveCycleTime.toFixed(1)}s</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Takt:</span>
                                <span className="font-bold">{m.taktTime.toFixed(1)}s</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Rate:</span>
                                <span className="font-bold text-blue-500">{m.rate.toFixed(3)}/s</span>
                              </div>
                              {(m.setupTime > 0 || m.uptimePercent < 100) && (
                                <div className="flex justify-between items-center">
                                  <span className="text-muted-foreground">Max:</span>
                                  <span className="font-bold text-muted-foreground/50">{m.theoreticalRate.toFixed(3)}/s</span>
                                </div>
                              )}
                              <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Util:</span>
                                <span className={`font-bold ${m.utilization < 80 ? 'text-yellow-500' : 'text-green-500'}`}>
                                  {m.utilization.toFixed(0)}%
                                </span>
                              </div>
                              {m.waitTime > 0 && (
                                <div className="flex justify-between items-center">
                                  <span className="text-muted-foreground">Idle:</span>
                                  <span className="font-bold text-orange-500">{m.waitTime.toFixed(1)}s</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        {index < metrics.length - 1 && (
                          <div className="text-xl sm:text-3xl text-muted-foreground font-bold flex-shrink-0" style={{ marginTop: '40px' }}>
                            →
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* System Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 mt-4 sm:mt-8">
                <div className="bg-muted p-3 sm:p-4 rounded border">
                  <div className="text-xs sm:text-sm text-muted-foreground mb-1">System Throughput</div>
                  <div className="text-lg sm:text-2xl font-bold text-green-600">
                    {bottleneckRate.toFixed(3)} <span className="text-xs sm:text-sm">units/sec</span>
                  </div>
                  <div className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                    {(bottleneckRate * 3600).toFixed(0)} units/hour
                  </div>
                </div>
                <div className="bg-muted p-3 sm:p-4 rounded border">
                  <div className="text-xs sm:text-sm text-muted-foreground mb-1">Total Lead Time</div>
                  <div className="text-lg sm:text-2xl font-bold text-blue-600">
                    {metrics.reduce((sum, m) => sum + m.taktTime, 0).toFixed(1)} <span className="text-xs sm:text-sm">sec</span>
                  </div>
                  <div className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                    End-to-end process time
                  </div>
                </div>
                <div className="bg-muted p-3 sm:p-4 rounded border">
                  <div className="text-xs sm:text-sm text-muted-foreground mb-1">Process Efficiency</div>
                  <div className="text-lg sm:text-2xl font-bold text-yellow-600">
                    {((bottleneckRate / Math.max(...metrics.map(m => m.rate))) * 100).toFixed(0)}%
                  </div>
                  <div className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                    Capacity utilization
                  </div>
                </div>
              </div>

              {/* Insights */}
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-3 sm:p-4 rounded">
                <h3 className="font-bold mb-2 text-sm sm:text-base text-blue-700 dark:text-blue-300">💡 Key Insights</h3>
                <div className="text-xs sm:text-sm space-y-1">
                  <div>• <span className="text-blue-600 dark:text-blue-400 font-bold">{metrics[bottleneckIndex].name}</span> is your constraint - limiting output to {bottleneckRate.toFixed(3)} units/sec</div>
                  {metrics.filter(m => m.utilization < 70).length > 0 && (
                    <div>• <span className="text-yellow-600 dark:text-yellow-400">{metrics.filter(m => m.utilization < 70).map(m => m.name).join(', ')}</span> can be idle {((100 - Math.max(...metrics.filter(m => m.utilization < 70).map(m => m.utilization)))).toFixed(0)}% without reducing output</div>
                  )}
                  <div>• To increase throughput: Add operators to <span className="font-bold">{metrics[bottleneckIndex].name}</span> or reduce its cycle time</div>
                  <div className="hidden sm:block">• Improving non-bottleneck stations will not increase overall output</div>
                  <div className="hidden sm:block">• Running non-bottlenecks at full capacity wastes resources and creates excess inventory</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-40 sm:h-64 flex items-center justify-center text-muted-foreground text-xs sm:text-sm text-center px-4">
              {stations.length === 0 ? 'Add machines or stations above to begin your value stream analysis' : 'Configure station parameters to see analysis'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
