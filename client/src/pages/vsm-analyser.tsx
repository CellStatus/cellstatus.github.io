import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation, useSearch } from 'wouter';
import { Plus, Trash2, ChevronDown, ChevronUp, AlertTriangle, Download, Factory, ArrowRight, Save, PanelTopClose, PanelTop, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { Machine, VsmConfiguration } from '@shared/schema';

interface Station {
  id: string;
  machineId?: string; // Link to actual machine (single machine only - atomic)
  machineIdDisplay?: string; // The machine_id field for display (last 3 chars)
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

// Step-level metrics for parallel machine aggregation
interface ProcessStepMetrics {
  stepNumber: number;
  stations: StationMetrics[];
  combinedRate: number;           // Sum of all parallel machine rates
  effectiveCycleTime: number;     // CT / number of machines (parallel effect)
  isBottleneck: boolean;
  utilization: number;
  waitTime: number;
  displayName: string;            // Combined name for display
  totalOperators: number;
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

    const { stepMetrics, bottleneckRate } = calculateMetrics();
    const processEfficiency = stepMetrics.length > 0 
      ? (bottleneckRate / Math.max(...stepMetrics.map(s => s.combinedRate))) * 100 
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
      machineIdDisplay: machine.machineId,
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

  // Calculate metrics with parallel machine aggregation at the process step level
  const calculateMetrics = () => {
    // First, calculate individual station metrics
    const stationMetrics: StationMetrics[] = stations.map((s) => {
      // Setup time is amortized across the batch
      const setupImpact = s.setupTime / s.batchSize;
      const effectiveCycleTime = s.cycleTime + setupImpact;
      
      // Uptime affects available capacity
      const uptimeMultiplier = s.uptimePercent / 100;
      
      // Rate calculation with both setup and uptime factors
      // Rate = operators / effective_cycle_time * uptime
      const theoreticalRate = s.operators / effectiveCycleTime;
      const actualRate = theoreticalRate * uptimeMultiplier;
      
      // Takt time = time between units leaving this station
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

    if (stationMetrics.length === 0) {
      return { 
        metrics: [] as StationMetrics[], 
        stepMetrics: [] as ProcessStepMetrics[],
        bottleneckRate: 0, 
        bottleneckIndex: -1,
        bottleneckStepIndex: -1
      };
    }

    // Group stations by process step for parallel machine analysis
    const stepGroups = groupStationsByStep(stations);
    const sortedSteps = Array.from(stepGroups.keys()).sort((a, b) => a - b);
    
    // Calculate step-level metrics (aggregating parallel machines)
    const stepMetrics: ProcessStepMetrics[] = sortedSteps.map((stepNum, stepIndex) => {
      const stationsInStep = stepGroups.get(stepNum)!;
      const stationMetricsInStep = stationMetrics.filter(m => 
        stationsInStep.some(s => s.id === m.id)
      );
      
      // PARALLEL MACHINES: Rates ADD together
      // If 2 machines each produce 1/min, together they produce 2/min
      const combinedRate = stationMetricsInStep.reduce((sum, m) => sum + m.rate, 0);
      
      // Effective cycle time for the step = 1 / combined rate
      // This represents the time between units leaving this step
      const effectiveCycleTime = combinedRate > 0 ? 1 / combinedRate : Infinity;
      
      // Total operators at this step
      const totalOperators = stationMetricsInStep.reduce((sum, m) => sum + m.operators, 0);
      
      // Build display name
      const displayName = stationMetricsInStep.length > 1 
        ? `[${stationMetricsInStep.map(m => m.name).join(' | ')}]`
        : stationMetricsInStep[0]?.name || 'Unknown';
      
      return {
        stepNumber: stepIndex + 1,
        stations: stationMetricsInStep,
        combinedRate,
        effectiveCycleTime,
        isBottleneck: false,
        utilization: 0,
        waitTime: 0,
        displayName,
        totalOperators
      };
    });

    // Find bottleneck step (lowest combined rate)
    const bottleneckStepIndex = stepMetrics.reduce((minIdx, curr, idx, arr) => 
      curr.combinedRate < arr[minIdx].combinedRate ? idx : minIdx
    , 0);
    
    stepMetrics[bottleneckStepIndex].isBottleneck = true;
    const bottleneckRate = stepMetrics[bottleneckStepIndex].combinedRate;

    // Mark individual stations at bottleneck step
    stepMetrics[bottleneckStepIndex].stations.forEach(s => {
      const stationMetric = stationMetrics.find(m => m.id === s.id);
      if (stationMetric) stationMetric.isBottleneck = true;
    });

    // Calculate step-level utilization and wait times
    stepMetrics.forEach((step, index) => {
      // Utilization = bottleneck rate / step rate * 100
      step.utilization = (bottleneckRate / step.combinedRate) * 100;
      
      // Wait time = difference in cycle times between steps
      if (index > 0) {
        const prevStepRate = stepMetrics[index - 1].combinedRate;
        const currentStepRate = step.combinedRate;
        // If this step is faster than previous, it waits
        if (currentStepRate > prevStepRate) {
          step.waitTime = (1 / prevStepRate) - (1 / currentStepRate);
        }
      }
      
      // Propagate to individual stations
      step.stations.forEach(s => {
        const stationMetric = stationMetrics.find(m => m.id === s.id);
        if (stationMetric) {
          stationMetric.utilization = step.utilization;
          stationMetric.waitTime = step.waitTime;
        }
      });
    });

    // For backwards compatibility, also find bottleneck in flat metrics
    const bottleneckIndex = stationMetrics.findIndex(m => m.isBottleneck);

    return { 
      metrics: stationMetrics, 
      stepMetrics,
      bottleneckRate, 
      bottleneckIndex,
      bottleneckStepIndex
    };
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
    const { metrics, stepMetrics, bottleneckRate, bottleneckIndex, bottleneckStepIndex } = calculateMetrics();
    
    if (metrics.length === 0) {
      alert('No stations to export');
      return;
    }

    const date = new Date().toLocaleDateString();
    const time = new Date().toLocaleTimeString();
    const bottleneckStep = stepMetrics[bottleneckStepIndex];
    
    let content = `VALUE STREAM MAP ANALYSIS REPORT
Generated: ${date} at ${time}

================================================================================
PROCESS FLOW OVERVIEW (Step-Based Analysis)
================================================================================

`;

    // Process steps (grouped by parallel machines)
    stepMetrics.forEach((step, index) => {
      const isParallel = step.stations.length > 1;
      const bottleneckMarker = step.isBottleneck ? ' ⚠ BOTTLENECK' : '';
      const parallelMarker = isParallel ? ` [${step.stations.length} PARALLEL MACHINES]` : '';
      
      content += `STEP ${step.stepNumber}. ${step.displayName.toUpperCase()}${bottleneckMarker}${parallelMarker}\n`;
      
      if (isParallel) {
        content += `   ├─ Machines: ${step.stations.map(s => s.name).join(', ')}\n`;
        content += `   ├─ Combined Rate: ${step.combinedRate.toFixed(3)} units/sec (rates ADD for parallel machines)\n`;
        content += `   ├─ Per-Machine Rate: ${(step.combinedRate / step.stations.length).toFixed(3)} units/sec\n`;
        content += `   ├─ Effective Step Cycle Time: ${step.effectiveCycleTime.toFixed(2)} seconds\n`;
        content += `   ├─ Total Operators: ${step.totalOperators}\n`;
      } else {
        const m = step.stations[0];
        content += `   ├─ Cycle Time: ${m.cycleTime} seconds\n`;
        content += `   ├─ Operators: ${m.operators}\n`;
        content += `   ├─ Effective Cycle Time: ${m.effectiveCycleTime.toFixed(2)} seconds\n`;
        content += `   ├─ Rate: ${step.combinedRate.toFixed(3)} units/sec\n`;
      }
      
      content += `   ├─ Utilization: ${step.utilization.toFixed(1)}%\n`;
      if (step.waitTime > 0) {
        content += `   └─ Wait Time: ${step.waitTime.toFixed(2)} seconds\n`;
      } else {
        content += `   └─ Wait Time: 0 seconds\n`;
      }
      
      if (index < stepMetrics.length - 1) {
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

Total Lead Time:       ${stepMetrics.reduce((sum, s) => sum + s.effectiveCycleTime, 0).toFixed(1)} seconds

Process Efficiency:    ${((bottleneckRate / Math.max(...stepMetrics.map(s => s.combinedRate))) * 100).toFixed(1)}%

Bottleneck Step:       Step ${bottleneckStepIndex + 1} - ${bottleneckStep.displayName}
Bottleneck Rate:       ${bottleneckRate.toFixed(3)} units/sec

================================================================================
PARALLEL MACHINE ANALYSIS
================================================================================

`;

    const parallelSteps = stepMetrics.filter(s => s.stations.length > 1);
    if (parallelSteps.length > 0) {
      content += `Steps with Parallel Machines:\n`;
      parallelSteps.forEach(step => {
        content += `• Step ${step.stepNumber}: ${step.stations.length} machines\n`;
        content += `  - Individual rates: ${step.stations.map(s => s.rate.toFixed(3)).join(' + ')} = ${step.combinedRate.toFixed(3)} units/sec\n`;
        content += `  - Effective step cycle time: ${step.effectiveCycleTime.toFixed(2)}s (vs ${step.stations[0].effectiveCycleTime.toFixed(2)}s single machine)\n`;
      });
      content += `\n`;
    } else {
      content += `No parallel machines configured.\n\n`;
    }

    content += `================================================================================
ANALYSIS & RECOMMENDATIONS
================================================================================

CONSTRAINT IDENTIFICATION:
• Step ${bottleneckStepIndex + 1} (${bottleneckStep.displayName}) is the system constraint
• This step limits overall throughput to ${bottleneckRate.toFixed(3)} units/sec
• Bottleneck effective cycle time: ${bottleneckStep.effectiveCycleTime.toFixed(2)} seconds

`;

    const underutilizedSteps = stepMetrics.filter(s => s.utilization < 70);
    if (underutilizedSteps.length > 0) {
      content += `UNDERUTILIZED CAPACITY:\n`;
      underutilizedSteps.forEach(step => {
        const idlePercentage = 100 - step.utilization;
        const canBeIdleTime = (idlePercentage / 100) * 60;
        content += `• Step ${step.stepNumber} (${step.displayName}): ${step.utilization.toFixed(1)}% utilized\n`;
        content += `  - Can be idle ${idlePercentage.toFixed(1)}% of the time (${canBeIdleTime.toFixed(1)} min/hour)\n`;
      });
      content += `\n`;
    }

    content += `IMPROVEMENT RECOMMENDATIONS:
1. Focus on the bottleneck (Step ${bottleneckStepIndex + 1} - ${bottleneckStep.displayName}):
   - Current combined rate: ${bottleneckStep.combinedRate.toFixed(3)} units/sec
   - Adding 1 parallel machine would increase step capacity by ~${(bottleneckStep.combinedRate / bottleneckStep.stations.length).toFixed(3)} units/sec
   - This would elevate the constraint and potentially create a new bottleneck

2. Do NOT invest in non-bottleneck steps:
   - Improvements to other steps will not increase system throughput
   - Focus all resources on eliminating or elevating the constraint

3. Protect the bottleneck:
   - Ensure upstream steps maintain buffer inventory
   - Minimize downtime at Step ${bottleneckStepIndex + 1}
   - Consider quality checks before the bottleneck to prevent waste

================================================================================
INDIVIDUAL STATION DETAILS
================================================================================

`;

    metrics.forEach((m) => {
      content += `${m.name}:\n`;
      content += `  Configuration:\n`;
      content += `    - Cycle Time: ${m.cycleTime}s\n`;
      content += `    - Operators: ${m.operators}\n`;
      content += `    - Effective Cycle Time: ${m.effectiveCycleTime.toFixed(2)}s per unit\n`;
      content += `    - Setup Time: ${m.setupTime}s per ${m.batchSize} pcs\n`;
      content += `    - Uptime: ${m.uptimePercent}%\n`;
      content += `  Performance:\n`;
      content += `    - Individual Rate: ${m.rate.toFixed(3)} units/sec\n`;
      content += `    - Theoretical Rate: ${m.theoreticalRate.toFixed(3)} units/sec\n`;
      content += `  Status: ${m.isBottleneck ? 'PART OF CONSTRAINT (Bottleneck Step)' : 'Non-Constraint'}\n`;
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
• The constraint is Step ${bottleneckStepIndex + 1} (${bottleneckStep.displayName})
• All improvement efforts should focus here first
• Parallel machines at a step ADD their rates together
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

  const { metrics, stepMetrics, bottleneckRate, bottleneckIndex, bottleneckStepIndex } = calculateMetrics();

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
                              const idSuffix = machine.machineId.slice(-3);
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
                                  <Badge variant="outline" className="ml-1 text-xs font-mono">{idSuffix}</Badge>
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
                    
                    // Build display for this step - show machine name with last 3 of machine ID
                    const displayIds = stationsInStep.map(s => {
                      let idSuffix = '';
                      if (s.machineIdDisplay) {
                        idSuffix = getShortId(s.machineIdDisplay);
                      } else if (s.machineId) {
                        const machine = machines.find(m => m.id === s.machineId);
                        if (machine) {
                          idSuffix = getShortId(machine.machineId);
                        }
                      }
                      return idSuffix ? `${s.name} (${idSuffix})` : s.name;
                    });
                    
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
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <h2 className="text-lg sm:text-xl font-bold">Value Stream Analysis</h2>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  <HelpCircle className="h-4 w-4" />
                  <span className="hidden sm:inline">Calculations</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh]">
                <DialogHeader>
                  <DialogTitle>VSM Calculations Explained</DialogTitle>
                </DialogHeader>
                <ScrollArea className="h-[60vh] pr-4">
                  <div className="space-y-4 text-sm">
                    <div>
                      <h4 className="font-bold text-base mb-2">📊 Individual Station Metrics</h4>
                      <div className="space-y-3 pl-2">
                        <div>
                          <div className="font-semibold">Effective Cycle Time</div>
                          <code className="text-xs bg-muted px-1 rounded">Effective CT = Cycle Time + (Setup Time ÷ Batch Size)</code>
                          <p className="text-muted-foreground text-xs mt-1">Setup time is amortized across the batch to get the true per-part processing time.</p>
                        </div>
                        <div>
                          <div className="font-semibold">Theoretical Rate</div>
                          <code className="text-xs bg-muted px-1 rounded">Theoretical Rate = Operators ÷ Effective CT</code>
                          <p className="text-muted-foreground text-xs mt-1">Maximum possible output assuming 100% uptime (units per second).</p>
                        </div>
                        <div>
                          <div className="font-semibold">Actual Rate</div>
                          <code className="text-xs bg-muted px-1 rounded">Actual Rate = Theoretical Rate × (Uptime% ÷ 100)</code>
                          <p className="text-muted-foreground text-xs mt-1">Realistic output accounting for machine downtime.</p>
                        </div>
                        <div>
                          <div className="font-semibold">Takt Time</div>
                          <code className="text-xs bg-muted px-1 rounded">Takt Time = 1 ÷ Actual Rate</code>
                          <p className="text-muted-foreground text-xs mt-1">Time between completed units leaving the station (seconds per unit).</p>
                        </div>
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <h4 className="font-bold text-base mb-2">⚡ Parallel Machine Aggregation</h4>
                      <div className="space-y-3 pl-2">
                        <div>
                          <div className="font-semibold">Combined Step Rate</div>
                          <code className="text-xs bg-muted px-1 rounded">Step Rate = Sum of all machine rates at that step</code>
                          <p className="text-muted-foreground text-xs mt-1">Parallel machines ADD their capacity. Two machines at 1/min each = 2/min combined.</p>
                        </div>
                        <div>
                          <div className="font-semibold">Effective Step Cycle Time</div>
                          <code className="text-xs bg-muted px-1 rounded">Step CT = 1 ÷ Combined Step Rate</code>
                          <p className="text-muted-foreground text-xs mt-1">Time between units leaving this process step.</p>
                        </div>
                        <div className="bg-blue-50 dark:bg-blue-950/30 p-2 rounded text-xs">
                          <strong>Example:</strong> Step has 2 machines, each with 60s cycle time<br/>
                          • Individual rate: 1/60 = 0.0167/sec each<br/>
                          • Combined rate: 0.0167 + 0.0167 = 0.0333/sec<br/>
                          • Effective step CT: 1/0.0333 = 30 seconds<br/>
                          → One unit exits every 30 seconds (not 60!)
                        </div>
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <h4 className="font-bold text-base mb-2">🎯 System Metrics</h4>
                      <div className="space-y-3 pl-2">
                        <div>
                          <div className="font-semibold">Bottleneck Identification</div>
                          <code className="text-xs bg-muted px-1 rounded">Bottleneck = Step with LOWEST combined rate</code>
                          <p className="text-muted-foreground text-xs mt-1">The constraint that limits entire system throughput.</p>
                        </div>
                        <div>
                          <div className="font-semibold">System Throughput</div>
                          <code className="text-xs bg-muted px-1 rounded">Throughput = Bottleneck Rate</code>
                          <p className="text-muted-foreground text-xs mt-1">No matter how fast other steps are, output is limited by the constraint.</p>
                        </div>
                        <div>
                          <div className="font-semibold">Station Utilization</div>
                          <code className="text-xs bg-muted px-1 rounded">Utilization = (Bottleneck Rate ÷ Station Rate) × 100%</code>
                          <p className="text-muted-foreground text-xs mt-1">How much of capacity is actually used. Non-bottlenecks are &lt;100%.</p>
                        </div>
                        <div>
                          <div className="font-semibold">Wait Time</div>
                          <code className="text-xs bg-muted px-1 rounded">Wait = (1/Prev Rate) - (1/Current Rate)</code>
                          <p className="text-muted-foreground text-xs mt-1">Time a faster station waits for upstream to deliver parts.</p>
                        </div>
                        <div>
                          <div className="font-semibold">Total Lead Time</div>
                          <code className="text-xs bg-muted px-1 rounded">Lead Time = Sum of all step effective cycle times</code>
                          <p className="text-muted-foreground text-xs mt-1">End-to-end time for one part to traverse the entire process.</p>
                        </div>
                        <div>
                          <div className="font-semibold">Process Efficiency</div>
                          <code className="text-xs bg-muted px-1 rounded">Efficiency = (Bottleneck Rate ÷ Fastest Rate) × 100%</code>
                          <p className="text-muted-foreground text-xs mt-1">How balanced the line is. 100% means all steps run at same rate.</p>
                        </div>
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <h4 className="font-bold text-base mb-2">📈 Theory of Constraints</h4>
                      <div className="text-xs text-muted-foreground space-y-2 pl-2">
                        <p><strong>1. Identify</strong> the constraint (bottleneck step)</p>
                        <p><strong>2. Exploit</strong> it - maximize bottleneck efficiency</p>
                        <p><strong>3. Subordinate</strong> - align all other steps to support the bottleneck</p>
                        <p><strong>4. Elevate</strong> - invest in bottleneck capacity (more machines, operators, or reduce CT)</p>
                        <p><strong>5. Repeat</strong> - a new constraint will emerge</p>
                        <div className="bg-yellow-50 dark:bg-yellow-950/30 p-2 rounded mt-2">
                          <strong>Key insight:</strong> Improving non-bottleneck stations does NOT increase throughput. It only creates excess inventory and wasted resources.
                        </div>
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </DialogContent>
            </Dialog>
          </div>
          
          {metrics.length > 0 && stepMetrics.length > 0 ? (
            <div className="space-y-4 sm:space-y-6">
              {/* Process Flow - Step-based visualization with parallel machine support */}
              <div className="overflow-x-auto overflow-y-visible pb-4 pt-2 sm:pt-4">
                <div className="flex items-start gap-2 sm:gap-3 mx-auto" style={{ 
                  width: 'fit-content',
                  maxWidth: '100%',
                  minHeight: '320px'
                }}>
                  {stepMetrics.map((step, stepIndex) => {
                    const isParallel = step.stations.length > 1;
                    // Sizing based on number of steps, not individual stations
                    const boxWidth = stepMetrics.length <= 2 ? '200px' : 
                                    stepMetrics.length <= 3 ? '180px' : 
                                    stepMetrics.length <= 5 ? '160px' : 
                                    stepMetrics.length <= 7 ? '140px' : '120px';
                    
                    return (
                      <div key={step.stepNumber} className="flex items-start gap-2 sm:gap-3 flex-shrink-0">
                        <div className="flex flex-col items-center flex-shrink-0" style={{ width: boxWidth }}>
                          {/* Process Step Box */}
                          <div className={`w-full p-2 sm:p-4 rounded-lg border-2 ${step.isBottleneck ? 'bg-destructive/10 border-destructive' : isParallel ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-500' : 'bg-muted border-border'}`}>
                            <div className="text-center">
                              {/* Step header */}
                              <div className="text-[10px] sm:text-xs text-muted-foreground mb-1">Step {step.stepNumber}</div>
                              
                              {isParallel ? (
                                // Parallel machines display
                                <div className="space-y-1">
                                  <Badge variant="outline" className="text-[10px] border-blue-500 text-blue-600 dark:text-blue-400">
                                    {step.stations.length} Parallel
                                  </Badge>
                                  <div className="text-[10px] sm:text-xs space-y-0.5">
                                    {step.stations.map(s => (
                                      <div key={s.id} className="font-medium truncate">{s.name}</div>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                // Single machine display
                                <div className="font-bold text-xs sm:text-base mb-1 break-words leading-tight">
                                  {step.stations[0]?.name}
                                </div>
                              )}
                              
                              {step.isBottleneck && (
                                <div className="flex items-center justify-center gap-1 text-destructive text-[10px] sm:text-xs mt-1 sm:mt-2">
                                  <AlertTriangle className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                                  <span>BOTTLENECK</span>
                                </div>
                              )}
                              
                              {/* Station details */}
                              <div className="text-[10px] sm:text-xs text-muted-foreground space-y-0.5 sm:space-y-1 mt-2">
                                {isParallel ? (
                                  <>
                                    <div>Total Ops: <span className="font-semibold">{step.totalOperators}</span></div>
                                    <div className="text-blue-600 dark:text-blue-400">Combined</div>
                                  </>
                                ) : (
                                  <>
                                    <div>C/T: <span className="font-semibold">{step.stations[0]?.cycleTime}s</span></div>
                                    <div>Ops: <span className="font-semibold">{step.stations[0]?.operators}</span></div>
                                    {step.stations[0]?.setupTime > 0 && (
                                      <div className="text-orange-500">Setup: <span className="font-semibold">{step.stations[0].setupTime}s/{step.stations[0].batchSize}pc</span></div>
                                    )}
                                    {step.stations[0]?.uptimePercent < 100 && (
                                      <div className="text-destructive">Up: <span className="font-semibold">{step.stations[0].uptimePercent}%</span></div>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          {/* Step Data Box */}
                          <div className="w-full mt-2 sm:mt-3 p-2 sm:p-3 bg-background rounded border">
                            <div className="text-[10px] sm:text-xs space-y-1 sm:space-y-1.5">
                              <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Eff CT:</span>
                                <span className="font-bold">{step.effectiveCycleTime.toFixed(1)}s</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">{isParallel ? 'Comb Rate:' : 'Rate:'}</span>
                                <span className="font-bold text-blue-500">{step.combinedRate.toFixed(3)}/s</span>
                              </div>
                              {isParallel && (
                                <div className="flex justify-between items-center text-blue-600 dark:text-blue-400">
                                  <span className="text-muted-foreground">Per Machine:</span>
                                  <span className="font-bold">{(step.combinedRate / step.stations.length).toFixed(3)}/s</span>
                                </div>
                              )}
                              <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Util:</span>
                                <span className={`font-bold ${step.utilization < 80 ? 'text-yellow-500' : 'text-green-500'}`}>
                                  {step.utilization.toFixed(0)}%
                                </span>
                              </div>
                              {step.waitTime > 0 && (
                                <div className="flex justify-between items-center">
                                  <span className="text-muted-foreground">Wait:</span>
                                  <span className="font-bold text-orange-500">{step.waitTime.toFixed(1)}s</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        {stepIndex < stepMetrics.length - 1 && (
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
                    {stepMetrics.reduce((sum, s) => sum + s.effectiveCycleTime, 0).toFixed(1)} <span className="text-xs sm:text-sm">sec</span>
                  </div>
                  <div className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                    End-to-end process time
                  </div>
                </div>
                <div className="bg-muted p-3 sm:p-4 rounded border">
                  <div className="text-xs sm:text-sm text-muted-foreground mb-1">Process Efficiency</div>
                  <div className="text-lg sm:text-2xl font-bold text-yellow-600">
                    {((bottleneckRate / Math.max(...stepMetrics.map(s => s.combinedRate))) * 100).toFixed(0)}%
                  </div>
                  <div className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                    Line balance
                  </div>
                </div>
              </div>

              {/* Insights - Using step metrics */}
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-3 sm:p-4 rounded">
                <h3 className="font-bold mb-2 text-sm sm:text-base text-blue-700 dark:text-blue-300">💡 Key Insights</h3>
                <div className="text-xs sm:text-sm space-y-1">
                  <div>• <span className="text-blue-600 dark:text-blue-400 font-bold">{stepMetrics[bottleneckStepIndex]?.displayName}</span> is your constraint - limiting output to {bottleneckRate.toFixed(3)} units/sec ({(bottleneckRate * 3600).toFixed(0)}/hr)</div>
                  {stepMetrics.filter(s => s.utilization < 70).length > 0 && (
                    <div>• <span className="text-yellow-600 dark:text-yellow-400">{stepMetrics.filter(s => s.utilization < 70).map(s => s.displayName).join(', ')}</span> can be idle up to {(100 - Math.min(...stepMetrics.filter(s => s.utilization < 70).map(s => s.utilization))).toFixed(0)}% without reducing output</div>
                  )}
                  {stepMetrics[bottleneckStepIndex]?.stations.length === 1 ? (
                    <div>• To increase throughput: Add parallel machine to Step {bottleneckStepIndex + 1}, add operators, or reduce cycle time</div>
                  ) : (
                    <div>• To increase throughput: Add more parallel machines to Step {bottleneckStepIndex + 1} or reduce individual cycle times</div>
                  )}
                  <div className="hidden sm:block">• Improving non-bottleneck steps will not increase overall output</div>
                  {stepMetrics.some(s => s.stations.length > 1) && (
                    <div className="text-blue-600 dark:text-blue-400 hidden sm:block">• Parallel machines at same step combine their rates (e.g., 2× machines = 2× capacity)</div>
                  )}
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
