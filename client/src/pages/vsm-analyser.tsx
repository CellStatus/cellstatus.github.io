import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation, useSearch } from 'wouter';
import { Plus, Trash2, ChevronDown, ChevronUp, AlertTriangle, Download, Factory, ArrowRight, Save, PanelTopClose, PanelTop, HelpCircle, Play, Pause, RotateCcw, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
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
  opName?: string; // Optional operation name (Turn, Grind, Polish, Hob, Shave, etc)
  cycleTime: number;
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
  opName?: string;                // Optional operation name (Turn, Grind, etc)
}

// WIP inventory between operations
interface WipInventory {
  afterOpNumber: number;  // The op number this WIP comes after
  quantity: number;       // Number of units in buffer
}

export default function VSMBuilder() {
  const { toast } = useToast();
  const searchString = useSearch();
  const [, setLocation] = useLocation();
  
  const [stations, setStations] = useState<Station[]>([]);
  const [showConfig, setShowConfig] = useState(true);
  const [showMachineSelector, setShowMachineSelector] = useState(false);
  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const [wipInventory, setWipInventory] = useState<WipInventory[]>([]); // Kept for save/load compatibility
  const [vsmName, setVsmName] = useState('');
  const [vsmDescription, setVsmDescription] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [loadedVsmId, setLoadedVsmId] = useState<string | null>(null);
  const [vsmStatus, setVsmStatus] = useState('');
  const [vsmNotes, setVsmNotes] = useState('');

  // (Simulation removed) Editable WIP UI state remains
  // Editable WIP UI state (editing a buffer after an op)
  const [editingWipStep, setEditingWipStep] = useState<number | null>(null);
  const [editingWipValue, setEditingWipValue] = useState<string>('');
  const [supplyRateUPH, setSupplyRateUPH] = useState<number | null>(null);
  const [simTargetCompleted, setSimTargetCompleted] = useState<number | null>(null);

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
      const stationsData = loadedVsm.stationsJson as any;
      if (stationsData) {
        // Handle both old format (array) and new format (object with stations and wip)
        if (Array.isArray(stationsData)) {
          setStations(stationsData);
          setWipInventory([]);
          setSupplyRateUPH(null);
        } else {
          setStations(stationsData.stations || []);
          setWipInventory(stationsData.wipInventory || []);
          setSupplyRateUPH(typeof stationsData.supplyRateUPH === 'number' ? stationsData.supplyRateUPH : null);
        }
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
      setWipInventory([]);
      setSupplyRateUPH(null);
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
      stationsJson: { stations, wipInventory, supplyRateUPH },
      bottleneckRate,
      processEfficiency,
      totalWip: wipInventory.reduce((sum, w) => sum + w.quantity, 0)
    });
  };

  // Get the next available process step number
  const getNextProcessStep = () => {
    if (stations.length === 0) return 10;
    // Use increments of 10 to allow inserting operations between existing ones
    const maxStep = Math.max(...stations.map(s => s.processStep));
    return Math.ceil((maxStep + 10) / 10) * 10;
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

  // Save or remove WIP quantity for a buffer after an op
  const saveWipForStep = (afterOpNumber: number, quantity: number) => {
    setWipInventory(prev => {
      const q = Math.max(0, Math.floor(quantity));
      const exists = prev.find(w => w.afterOpNumber === afterOpNumber);
      if (q === 0) {
        return prev.filter(w => w.afterOpNumber !== afterOpNumber);
      }
      if (exists) {
        return prev.map(w => w.afterOpNumber === afterOpNumber ? { ...w, quantity: q } : w);
      }
      return [...prev, { afterOpNumber, quantity: q }];
    });
  };
  // Simulation removed: WIP is managed via `wipInventory` and editable triangles.

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
      // Rate = 1 / effective_cycle_time * uptime
      const theoreticalRate = 1 / effectiveCycleTime;
      const actualRate = theoreticalRate * uptimeMultiplier;
      
      // Takt time = time between units leaving this station
      const taktTime = effectiveCycleTime / uptimeMultiplier;
      
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
      
      // Build display name
      const displayName = stationMetricsInStep.length > 1 
        ? stationMetricsInStep.map(m => m.name).join(', ')
        : stationMetricsInStep[0]?.name || 'Unknown';
      
      // Get operation name from first station in step (all should have same opName)
      const opName = stationsInStep[0]?.opName;
      
      return {
        stepNumber: stepNum,
        stations: stationMetricsInStep,
        combinedRate,
        effectiveCycleTime,
        isBottleneck: false,
        utilization: 0,
        waitTime: 0,
        displayName,
        opName
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
    setSupplyRateUPH(null);
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
  VSM: ${vsmName || 'Untitled'}
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
      
      content += `OP ${step.stepNumber}. ${step.displayName.toUpperCase()}${bottleneckMarker}${parallelMarker}\n`;
      
      if (isParallel) {
        content += `   ├─ Machines: ${step.stations.map(s => s.name).join(', ')}\n`;
        content += `   ├─ Combined Rate: ${(step.combinedRate * 3600).toFixed(0)} UPH (rates ADD for parallel machines)\n`;
        content += `   ├─ Per-Machine Rate: ${((step.combinedRate / step.stations.length) * 3600).toFixed(0)} UPH\n`;
        content += `   ├─ Effective Op Cycle Time: ${step.effectiveCycleTime.toFixed(2)} seconds\n`;
      } else {
        const m = step.stations[0];
        content += `   ├─ Cycle Time: ${m.cycleTime} seconds\n`;
        content += `   ├─ Effective Cycle Time: ${m.effectiveCycleTime.toFixed(2)} seconds\n`;
        content += `   ├─ Rate: ${(step.combinedRate * 3600).toFixed(0)} UPH\n`;
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

System Throughput:     ${(bottleneckRate * 3600).toFixed(0)} UPH
                       ${(bottleneckRate * 3600 * 8).toFixed(0)} units/8-hour shift

Total Lead Time:       ${stepMetrics.reduce((sum, s) => sum + s.effectiveCycleTime, 0).toFixed(1)} seconds

Process Efficiency:    ${((bottleneckRate / Math.max(...stepMetrics.map(s => s.combinedRate))) * 100).toFixed(1)}%

Bottleneck Step:       Op ${bottleneckStep.stepNumber} - ${bottleneckStep.displayName}
Bottleneck Rate:       ${(bottleneckRate * 3600).toFixed(0)} UPH

================================================================================
PARALLEL MACHINE ANALYSIS
================================================================================

`;

    const parallelSteps = stepMetrics.filter(s => s.stations.length > 1);
    if (parallelSteps.length > 0) {
      content += `Ops with Parallel Machines:\n`;
      parallelSteps.forEach(step => {
        content += `• Op ${step.stepNumber}: ${step.stations.length} machines\n`;
        content += `  - Individual rates: ${step.stations.map(s => (s.rate * 3600).toFixed(0)).join(' + ')} = ${(step.combinedRate * 3600).toFixed(0)} UPH\n`;
        content += `  - Effective op cycle time: ${step.effectiveCycleTime.toFixed(2)}s (vs ${step.stations[0].effectiveCycleTime.toFixed(2)}s single machine)\n`;
      });
      content += `\n`;
    } else {
      content += `No parallel machines configured.\n\n`;
    }

    content += `================================================================================
ANALYSIS & RECOMMENDATIONS
================================================================================

CONSTRAINT IDENTIFICATION:
• Op ${bottleneckStep.stepNumber} (${bottleneckStep.displayName}) is the system constraint
• This op limits overall throughput to ${(bottleneckRate * 3600).toFixed(0)} UPH
• Bottleneck effective cycle time: ${bottleneckStep.effectiveCycleTime.toFixed(2)} seconds

`;

    const underutilizedSteps = stepMetrics.filter(s => s.utilization < 70);
    if (underutilizedSteps.length > 0) {
      content += `UNDERUTILIZED CAPACITY:\n`;
      underutilizedSteps.forEach(step => {
        const idlePercentage = 100 - step.utilization;
        const canBeIdleTime = (idlePercentage / 100) * 60;
        content += `• Op ${step.stepNumber} (${step.displayName}): ${step.utilization.toFixed(1)}% utilized\n`;
        content += `  - Can be idle ${idlePercentage.toFixed(1)}% of the time (${canBeIdleTime.toFixed(1)} min/hour)\n`;
      });
      content += `\n`;
    }

    content += `IMPROVEMENT RECOMMENDATIONS:
1. Focus on the bottleneck (Op ${bottleneckStep.stepNumber} - ${bottleneckStep.displayName}):
   - Current combined rate: ${(bottleneckStep.combinedRate * 3600).toFixed(0)} UPH
   - Adding 1 parallel machine would increase op capacity by ~${((bottleneckStep.combinedRate / bottleneckStep.stations.length) * 3600).toFixed(0)} UPH
   - This would elevate the constraint and potentially create a new bottleneck

2. Do NOT invest in non-bottleneck ops:
   - Improvements to other ops will not increase system throughput
   - Focus all resources on eliminating or elevating the constraint

3. Protect the bottleneck:
   - Ensure upstream ops maintain buffer inventory
   - Minimize downtime at Op ${bottleneckStep.stepNumber}
   - Consider quality checks before the bottleneck to prevent waste

================================================================================
INDIVIDUAL STATION DETAILS
================================================================================

`;

    metrics.forEach((m) => {
      content += `${m.name}:\n`;
      content += `  Configuration:\n`;
      content += `    - Cycle Time: ${m.cycleTime}s\n`;
      content += `    - Effective Cycle Time: ${m.effectiveCycleTime.toFixed(2)}s per unit\n`;
      content += `    - Setup Time: ${m.setupTime}s per ${m.batchSize} pcs\n`;
      content += `    - Uptime: ${m.uptimePercent}%\n`;
      content += `  Performance:\n`;
      content += `    - Individual Rate: ${(m.rate * 3600).toFixed(0)} UPH\n`;
      content += `    - Theoretical Rate: ${(m.theoreticalRate * 3600).toFixed(0)} UPH\n`;
      content += `  Status: ${m.isBottleneck ? 'PART OF CONSTRAINT (Bottleneck Op)' : 'Non-Constraint'}\n`;
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
• The constraint is Op ${bottleneckStep.stepNumber} (${bottleneckStep.displayName})
• All improvement efforts should focus here first
• Parallel machines at an op ADD their rates together
• Once elevated, a new bottleneck may emerge - continuous improvement

================================================================================
WIP INVENTORY & LITTLE'S LAW ANALYSIS
================================================================================

`;

    // Current WIP Status from saved VSM (`wipInventory`)
    const totalWip = (wipInventory || []).reduce((sum, w) => sum + (w.quantity || 0), 0);
    const sortedSteps = [...stepMetrics].sort((a, b) => a.stepNumber - b.stepNumber);

    content += `CURRENT WIP STATUS (from VSM buffers):\n\n`;

    // Report actual input supply rate (use user override if provided, otherwise first operation combined rate)
    const inputRatePerSecond = supplyRateUPH ? (supplyRateUPH / 3600) : ((sortedSteps[0]?.combinedRate) || 0);
    const inputRatePerHour = inputRatePerSecond * 3600;
    const inputRatePerShift = inputRatePerHour * 8;
    content += `  [IN] Supply Rate: ${inputRatePerHour.toFixed(0)} UPH (~${inputRatePerShift.toFixed(0)} units/8-hour shift)\n`;

    // WIP between each operation (from `wipInventory`)
    sortedSteps.forEach((step, idx) => {
      const entry = (wipInventory || []).find(w => w.afterOpNumber === step.stepNumber);
      const wipAfter = entry ? entry.quantity : 0;
      const marker = step.isBottleneck ? ' ⚠ BOTTLENECK' : '';
      content += `    ↓\n`;
      content += `  [Op ${step.stepNumber}] ${step.displayName}${marker}\n`;
      content += `    Rate: ${(step.combinedRate * 3600).toFixed(0)} UPH\n`;
      if (idx < sortedSteps.length - 1) {
        content += `    ↓\n`;
        content += `  [Buffer] After Op ${step.stepNumber}: ${wipAfter.toFixed(0)} units\n`;
      }
    });
    content += `    ↓\n`;
    content += `  [OUT] Finished Goods Exit (Estimated throughput) → ${(bottleneckRate * 3600).toFixed(0)} UPH\n\n`;

    content += `TOTAL WIP IN SYSTEM: ${totalWip.toFixed(0)} units\n`;
    content += `TOTAL THROUGHPUT (est.): ${(bottleneckRate * 3600).toFixed(0)} UPH\n\n`;
    
    // Little's Law Analysis
    if (totalWip > 0 && bottleneckRate > 0) {
      const throughputPerHour = bottleneckRate * 3600;
      const wipLeadTimeHours = totalWip / throughputPerHour;
      const wipLeadTimeMinutes = wipLeadTimeHours * 60;
      
      content += `LITTLE'S LAW CALCULATION:\n`;
      content += `  Formula: Lead Time = WIP ÷ Throughput\n`;
      content += `  \n`;
      content += `  • Total WIP: ${totalWip.toFixed(0)} units\n`;
      content += `  • System Throughput: ${throughputPerHour.toFixed(0)} UPH\n`;
      content += `  • WIP Lead Time: ${totalWip.toFixed(0)} ÷ ${throughputPerHour.toFixed(0)} = ${wipLeadTimeHours.toFixed(2)} hours (${wipLeadTimeMinutes.toFixed(0)} minutes)\n`;
      content += `  \n`;
      content += `  INTERPRETATION:\n`;
      content += `  A part entering the system will wait approximately ${wipLeadTimeMinutes.toFixed(0)} minutes\n`;
      content += `  before exiting as finished goods (in addition to processing time).\n`;
      content += `  \n`;
      content += `  To reduce lead time, reduce WIP inventory levels.\n\n`;
    } else {
      content += `LITTLE'S LAW: Run the simulation to generate WIP data.\n\n`;
    }

    // Run a quick simulation to show WIP behavior with continuous input
    content += `================================================================================
WIP FLOW SIMULATION (300 seconds with continuous input)
================================================================================

This simulation shows how WIP flows through your system with continuous input supply.
System receives new material at the rate of the first operation.

`;

    // Run simulation with continuous input. If `simTargetCompleted` is set,
    // capture snapshots at completed-unit milestones up to that target (useful
    // for large targets like 10,000); otherwise use time-based snapshots.
    const simSteps = sortedSteps;
    const simWip: {[key: number]: number} = { 0: 0 };
    simSteps.forEach(step => {
      const entry = (wipInventory || []).find(w => w.afterOpNumber === step.stepNumber);
      simWip[step.stepNumber] = entry ? (entry.quantity || 0) : 0;
    });

    const snapshots: {time: number, wip: {[key: number]: number}, exited: number, totalWip: number}[] = [];
    let totalExited = 0;

    // Determine snapshot strategy
    const captureByCompleted = !!(simTargetCompleted && simTargetCompleted > 0);
    let milestones: number[] = [];
    if (captureByCompleted) {
      const target = Math.max(0, Math.floor(simTargetCompleted || 0));
      const setM = new Set<number>([0, Math.floor(target * 0.10), Math.floor(target * 0.25), Math.floor(target * 0.5), Math.floor(target * 0.75), target]);
      milestones = Array.from(setM).sort((a,b) => a - b);
    }

    // Compute a safe maximum simulation duration (seconds). If we have a
    // bottleneckRate (units/sec), estimate required seconds and add a buffer.
    let maxSimSeconds = 300;
    if (captureByCompleted && bottleneckRate > 0) {
      const secondsNeeded = Math.ceil((simTargetCompleted || 0) / Math.max(1e-9, bottleneckRate));
      maxSimSeconds = Math.min(Math.max(300, secondsNeeded * 2), 1000000);
    }

    // If capturing by completed, track next milestone index
    let nextMilestoneIdx = 0;

    // Always capture initial snapshot
    const initialWipSum = Object.entries(simWip).filter(([k]) => parseInt(k) > 0).reduce((s, [, v]) => s + v, 0);
    snapshots.push({ time: 0, wip: { ...simWip }, exited: 0, totalWip: initialWipSum });

    // Run simulation loop (per-second)
    for (let t = 1; t <= maxSimSeconds; t++) {
      // Continuous input: feed at configured supply rate (per-second)
      simWip[0] = (simWip[0] || 0) + inputRatePerSecond;

      // Process each step
      simSteps.forEach((step, idx) => {
        const upstreamBuffer = idx === 0 ? 0 : simSteps[idx - 1].stepNumber;
        const currentBuffer = step.stepNumber;
        const unitsPerSecond = step.combinedRate;
        const canProcess = Math.min(simWip[upstreamBuffer] || 0, unitsPerSecond);

        if (canProcess > 0) {
          simWip[upstreamBuffer] = Math.max(0, (simWip[upstreamBuffer] || 0) - canProcess);
          simWip[currentBuffer] = (simWip[currentBuffer] || 0) + canProcess;
        }
      });

      // Exit from last buffer
      const lastStep = simSteps[simSteps.length - 1];
      if (lastStep) {
        const exitRate = lastStep.combinedRate;
        const exiting = Math.min(simWip[lastStep.stepNumber] || 0, exitRate);
        simWip[lastStep.stepNumber] = Math.max(0, (simWip[lastStep.stepNumber] || 0) - exiting);
        totalExited += exiting;
      }

      // Calculate total WIP
      const wipSum = Object.entries(simWip)
        .filter(([key]) => parseInt(key) > 0)
        .reduce((sum, [, val]) => sum + val, 0);

      if (captureByCompleted) {
        // Capture when we reach the next completed-unit milestone
        while (nextMilestoneIdx < milestones.length && totalExited >= milestones[nextMilestoneIdx]) {
          snapshots.push({ time: t, wip: { ...simWip }, exited: totalExited, totalWip: wipSum });
          nextMilestoneIdx++;
        }
        // Stop if we've captured the final milestone
        if (nextMilestoneIdx >= milestones.length) break;
      } else {
        // Time-based snapshots (legacy behavior)
        if (t === 30 || t === 60 || t === 120 || t === 180 || t === 300) {
          snapshots.push({ time: t, wip: { ...simWip }, exited: totalExited, totalWip: wipSum });
        }
      }
    }
    
    // Format simulation results as a table (WIP over completed throughput)
    content += `Completed Throughput │ Total WIP │`;
    simSteps.forEach(step => {
      content += ` After Op${step.stepNumber} │`;
    });
    content += ` Exited\n`;
    
    content += `───────────────────┼───────────┼`;
    simSteps.forEach(() => {
      content += `───────────┼`;
    });
    content += `────────\n`;
    
    snapshots.forEach(snap => {
      const completedStr = snap.exited.toFixed(0).padStart(19);
      const totalWipStr = snap.totalWip.toFixed(0).padStart(11);
      let row = `${completedStr} │${totalWipStr} │`;
      
      simSteps.forEach(step => {
        const wipStr = (snap.wip[step.stepNumber] || 0).toFixed(0).padStart(11);
        row += `${wipStr} │`;
      });
      
      row += ` ${snap.exited.toFixed(0)}`;
      content += row + `\n`;
    });
    
    content += `\n`;
    
    // Analysis of simulation results
    const finalSnapshot = snapshots[snapshots.length - 1];
    
    content += `SIMULATION ANALYSIS:\n`;
    content += `  • Continuous input supply feeding system at first operation rate\n`;
    content += `  • After 300 seconds (5 minutes):\n`;
    content += `    - Total WIP in system: ${finalSnapshot.totalWip.toFixed(0)} units\n`;
    
    // Find where WIP accumulated
    let maxWipBuffer = 0;
    let maxWipAmount = 0;
    simSteps.forEach(step => {
      if ((finalSnapshot.wip[step.stepNumber] || 0) > maxWipAmount) {
        maxWipAmount = finalSnapshot.wip[step.stepNumber] || 0;
        maxWipBuffer = step.stepNumber;
      }
    });
    
    if (maxWipAmount > 0) {
      const bufferStep = simSteps.find(s => s.stepNumber === maxWipBuffer);
      content += `    - Highest WIP: ${maxWipAmount.toFixed(0)} units after Op ${maxWipBuffer}`;
      if (bufferStep && !bufferStep.isBottleneck) {
        content += ` (before bottleneck - expected)\n`;
      } else {
        content += `\n`;
      }
    }
    
    content += `    - Total units exited: ${finalSnapshot.exited.toFixed(0)} units\n`;
    content += `    - Effective throughput: ${((finalSnapshot.exited / 300) * 3600).toFixed(0)} UPH\n`;
    content += `\n`;
    
    content += `KEY OBSERVATIONS:\n`;
    content += `  • WIP naturally accumulates BEFORE the bottleneck (Op ${bottleneckStep.stepNumber})\n`;
    content += `  • Buffers AFTER the bottleneck drain quickly (downstream ops are faster)\n`;
    content += `  • System reaches steady-state when all buffers stabilize\n`;
    content += `  • Bottleneck determines overall system throughput regardless of other op speeds\n`;

    content += `

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
    setSupplyRateUPH(null);
    // Clear URL param
    setLocation('/vsm-builder');
  };

  return (
    <div className="vsm-page h-full overflow-auto bg-background p-3 sm:p-4">
      <style>{`
        .vsm-page input[type=number]::-webkit-outer-spin-button,
        .vsm-page input[type=number]::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .vsm-page input[type=number] {
          -moz-appearance: textfield;
        }
        /* Hide tooltip triggers on small screens (mobile) */
        @media (max-width: 640px) {
          .vsm-page .tooltip-trigger { display: none; }
        }
      `}</style>
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
            {/* supply rate moved into process flow IN box */}
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
              <span className="text-xs text-muted-foreground">Click an op to configure</span>
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
                          onClick={() => setSelectedStep(selectedStep === step ? null : step)}
                          className={`whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3 cursor-pointer hover:bg-accent transition-colors border-blue-500 bg-blue-50 dark:bg-blue-950/30 ${selectedStep === step ? 'ring-2 ring-primary' : ''}`}
                        >
                          <span className="text-muted-foreground mr-1">Op{step}:</span>
                          <span className="font-mono text-blue-600 dark:text-blue-400">
                            {isParallel ? displayIds.join(', ') : displayIds[0]}
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

              {/* Station Configuration - Only shows when a step is selected */}
              {selectedStep !== null && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div>
                        <h3 className="text-sm font-semibold">Op {selectedStep} Configuration</h3>
                        <p className="text-[10px] text-muted-foreground">Changes here are for VSM analysis only and do not update machine data</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-[10px] text-muted-foreground whitespace-nowrap">Op Name:</Label>
                        <Input
                          type="text"
                          placeholder="e.g. Turn, Grind, Hob..."
                          value={stations.find(s => s.processStep === selectedStep)?.opName || ''}
                          onChange={(e) => {
                            // Update opName for all stations in this step
                            stations.filter(s => s.processStep === selectedStep).forEach(s => {
                              updateStation(s.id, 'opName', e.target.value);
                            });
                          }}
                          className="h-7 w-32 text-xs"
                        />
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedStep(null)} className="text-xs">
                      Close
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3">
                    {stations.filter(s => s.processStep === selectedStep).map((station) => {
                  // Get machine ID for display
                  const machineIdNum = station.machineIdDisplay || 
                    (station.machineId ? machines.find(m => m.id === station.machineId)?.machineId : null);
                  
                  return (
                  <div key={station.id} className="border rounded p-2 sm:p-3 bg-card">
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-1 sm:gap-2 flex-1 min-w-0">
                        {station.machineId && <Factory className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />}
                        {station.machineId ? (
                          <div className="flex flex-col min-w-0">
                            <span className="font-bold text-xs sm:text-sm truncate">{station.name}</span>
                            {machineIdNum && (
                              <span className="text-[10px] sm:text-xs text-muted-foreground font-mono">ID: {machineIdNum}</span>
                            )}
                          </div>
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
                      <div>
                        <Label className="text-[10px] sm:text-xs text-muted-foreground">Cycle (sec)</Label>
                        <Input
                          type="text"
                          inputMode="decimal"
                          defaultValue={station.cycleTime}
                          key={`cycle-${station.id}-${station.cycleTime}`}
                          onBlur={(e) => {
                            const val = parseFloat(e.target.value.replace(/[^0-9.]/g, '')) || 1;
                            if (val !== station.cycleTime) {
                              updateStation(station.id, 'cycleTime', val);
                            }
                          }}
                          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                          className="h-7 sm:h-8 text-xs sm:text-sm"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                        <div>
                          <Label className="text-[10px] sm:text-xs text-muted-foreground">Setup (sec)</Label>
                          <Input
                            type="text"
                            inputMode="decimal"
                            defaultValue={station.setupTime}
                            key={`setup-${station.id}-${station.setupTime}`}
                            onBlur={(e) => {
                              const val = parseFloat(e.target.value.replace(/[^0-9.]/g, '')) || 0;
                              if (val !== station.setupTime) {
                                updateStation(station.id, 'setupTime', val);
                              }
                            }}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                            className="h-7 sm:h-8 text-xs sm:text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] sm:text-xs text-muted-foreground">Pcs/Setup</Label>
                          <Input
                            type="text"
                            inputMode="numeric"
                            defaultValue={station.batchSize}
                            key={`batch-${station.id}-${station.batchSize}`}
                            onBlur={(e) => {
                              const val = parseInt(e.target.value.replace(/[^0-9]/g, '')) || 1;
                              if (val !== station.batchSize) {
                                updateStation(station.id, 'batchSize', val);
                              }
                            }}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                            className="h-7 sm:h-8 text-xs sm:text-sm"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                        <div>
                          <Label className="text-[10px] sm:text-xs text-muted-foreground">Uptime %</Label>
                          <Input
                            type="text"
                            inputMode="decimal"
                            defaultValue={station.uptimePercent}
                            key={`uptime-${station.id}-${station.uptimePercent}`}
                            onBlur={(e) => {
                              const val = Math.min(100, Math.max(1, parseFloat(e.target.value.replace(/[^0-9.]/g, '')) || 100));
                              if (val !== station.uptimePercent) {
                                updateStation(station.id, 'uptimePercent', val);
                              }
                            }}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                            className="h-7 sm:h-8 text-xs sm:text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] sm:text-xs text-muted-foreground">Op #</Label>
                          <Input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            defaultValue={station.processStep}
                            key={`op-${station.id}-${station.processStep}`}
                            onBlur={(e) => {
                              const val = e.target.value.replace(/[^0-9]/g, '');
                              const newVal = parseInt(val) || 1;
                              if (newVal !== station.processStep) {
                                updateStation(station.id, 'processStep', newVal);
                                setSelectedStep(null);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.currentTarget.blur();
                              }
                            }}
                            className="h-7 sm:h-8 text-xs sm:text-sm"
                            title="Machines with the same step number run in parallel"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
                })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Value Stream Map */}
        <div className="border rounded-lg p-3 sm:p-6 bg-card">
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <h2 className="text-lg sm:text-xl font-bold">Value Stream Analysis</h2>
            <div className="flex gap-2">
              {/* Simulation UI removed */}
              
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
                          <code className="text-xs bg-muted px-1 rounded">Theoretical Rate = 1 ÷ Effective CT</code>
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
                        <p><strong>1. Identify</strong> the constraint (bottleneck op)</p>
                        <p><strong>2. Exploit</strong> it - maximize bottleneck efficiency</p>
                        <p><strong>3. Subordinate</strong> - align all other ops to support the bottleneck</p>
                        <p><strong>4. Elevate</strong> - invest in bottleneck capacity (more machines or reduce CT)</p>
                        <p><strong>5. Repeat</strong> - a new constraint will emerge</p>
                        <div className="bg-yellow-50 dark:bg-yellow-950/30 p-2 rounded mt-2">
                          <strong>Key insight:</strong> Improving non-bottleneck stations does NOT increase throughput. It only creates excess inventory and wasted resources.
                        </div>
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <h4 className="font-bold text-base mb-2">📦 WIP & Little's Law</h4>
                      <div className="space-y-3 pl-2">
                        <div>
                          <div className="font-semibold">Work In Process (WIP)</div>
                          <p className="text-muted-foreground text-xs mt-1">Inventory sitting between operations. Yellow triangles (▼) represent buffer stock waiting to be processed.</p>
                        </div>
                        <div>
                          <div className="font-semibold">Little's Law</div>
                          <code className="text-xs bg-muted px-1 rounded">Lead Time = WIP ÷ Throughput</code>
                          <p className="text-muted-foreground text-xs mt-1">The fundamental law of queuing theory. More WIP = longer wait times.</p>
                        </div>
                        <div className="bg-yellow-50 dark:bg-yellow-950/30 p-2 rounded text-xs">
                          <strong>Example:</strong> 100 units WIP, 50 UPH throughput<br/>
                          • Lead Time = 100 ÷ 50 = 2 hours<br/>
                          • A part entering the system waits ~2 hours before exiting<br/>
                          → Reduce WIP to reduce lead time!
                        </div>
                        <div>
                          <div className="font-semibold">Why WIP Matters</div>
                          <ul className="text-muted-foreground text-xs mt-1 list-disc pl-4 space-y-1">
                            <li><strong>Capital tied up</strong> - WIP = money sitting on the floor</li>
                            <li><strong>Long lead times</strong> - slow response to customer changes</li>
                            <li><strong>Quality risks</strong> - defects found late in long queues</li>
                            <li><strong>Flow visibility</strong> - large piles hide problems</li>
                          </ul>
                        </div>
                        <div>
                          <div className="font-semibold">WIP Patterns to Watch</div>
                          <ul className="text-muted-foreground text-xs mt-1 list-disc pl-4 space-y-1">
                            <li><strong>Before bottleneck:</strong> WIP accumulates (normal - keeps constraint fed)</li>
                            <li><strong>After bottleneck:</strong> Should be minimal (signals downstream issues if high)</li>
                            <li><strong>Uneven distribution:</strong> Indicates flow disruptions or batch processing</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </DialogContent>
            </Dialog>
            </div>
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
                  {/* Starting Input (Supply) - editable inline */}
                  {stepMetrics.length > 0 && (
                    <div className="flex flex-col items-center gap-1 flex-shrink-0" style={{ marginTop: '20px' }}>
                      <div className="flex flex-col items-center">
                        <div className="text-[8px] text-muted-foreground mb-1">IN</div>
                        <div className="flex items-center space-x-2">
                          <Input
                            type="number"
                            value={supplyRateUPH ?? ''}
                            onChange={(e) => setSupplyRateUPH(e.target.value ? Number(e.target.value) : null)}
                            placeholder="auto"
                            className="w-20 text-xs text-center"
                          />
                          <Tooltip>
                              <TooltipTrigger asChild>
                              <button className="p-0 text-muted-foreground tooltip-trigger" aria-label="Supply help">
                                <HelpCircle className="h-4 w-4" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              Leave blank for <strong>auto</strong>: uses the first operation's combined capacity as the incoming supply rate.
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <span className="text-[9px] text-muted-foreground mt-0.5">supply UPH</span>
                        <div className="flex items-center space-x-2 mt-1">
                          <Input
                            type="number"
                            value={simTargetCompleted ?? ''}
                            onChange={(e) => setSimTargetCompleted(e.target.value ? Number(e.target.value) : null)}
                            placeholder="e.g. 10000"
                            className="w-28 text-xs text-center"
                          />
                          <Tooltip>
                            <TooltipTrigger asChild>
                                <button className="p-0 text-muted-foreground tooltip-trigger" aria-label="Sim target help">
                                  <HelpCircle className="h-4 w-4" />
                                </button>
                              </TooltipTrigger>
                            <TooltipContent side="top">
                              Target units (e.g. 10000). Snapshots: 0/10/25/50/75/100%. Blank = time-based.
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <span className="text-[9px] text-muted-foreground">sim target</span>
                        {supplyRateUPH !== null && (
                          (() => {
                            const entry0 = (wipInventory || []).find(w => w.afterOpNumber === 0);
                            const displayQty0 = entry0 ? entry0.quantity : 0;
                            const hasWip0 = displayQty0 > 0;

                            return (
                              <div className="mt-2 flex flex-col items-center" title={`WIP before first op`}>
                                <div
                                  onClick={() => {
                                    setEditingWipStep(0);
                                    setEditingWipValue(displayQty0 ? String(Math.round(displayQty0)) : '');
                                  }}
                                  className={`w-0 h-0 border-l-[16px] border-r-[16px] border-t-[20px] border-l-transparent border-r-transparent ${hasWip0 ? 'border-t-yellow-500' : 'border-t-gray-300'}`}
                                />

                                {editingWipStep === 0 ? (
                                  <input
                                    autoFocus
                                    value={editingWipValue}
                                    onChange={(e) => setEditingWipValue(e.target.value.replace(/[^0-9]/g, ''))}
                                    onBlur={() => {
                                      const val = editingWipValue === '' ? 0 : parseInt(editingWipValue || '0', 10);
                                      saveWipForStep(0, Number.isNaN(val) ? 0 : val);
                                      setEditingWipStep(null);
                                      setEditingWipValue('');
                                    }}
                                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                    className="mt-0.5 w-20 text-center text-[12px] font-bold bg-transparent border rounded"
                                  />
                                ) : (
                                  <span className={`text-[12px] font-bold mt-0.5 ${hasWip0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-muted-foreground'}`}>
                                    {displayQty0.toFixed(0)}
                                  </span>
                                )}

                                <div className="text-[9px] text-muted-foreground mt-1">Initial inventory</div>
                              </div>
                            );
                          })()
                        )}
                      </div>
                      <div className="text-lg sm:text-2xl text-muted-foreground font-bold mt-1">→</div>
                    </div>
                  )}
                  
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
                          {/* Process Step Box - Clickable */}
                          <div 
                            onClick={() => setSelectedStep(selectedStep === step.stepNumber ? null : step.stepNumber)}
                            className={`w-full p-2 sm:p-4 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md ${step.isBottleneck ? 'bg-destructive/10 border-destructive' : isParallel ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-500' : 'bg-muted border-border'} ${selectedStep === step.stepNumber ? 'ring-2 ring-primary ring-offset-2' : ''}`}>
                            <div className="text-center">
                              {/* Op header */}
                              <div className="text-[10px] sm:text-xs text-muted-foreground mb-1">{step.opName ? `Op ${step.stepNumber} - ${step.opName}` : `Op ${step.stepNumber}`}</div>
                              
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
                                    <div className="text-blue-600 dark:text-blue-400">{step.stations.length} machines</div>
                                  </>
                                ) : (
                                  <>
                                    <div>C/T: <span className="font-semibold">{step.stations[0]?.cycleTime}s</span></div>
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
                                <span className="font-bold text-blue-500">{(step.combinedRate * 3600).toFixed(0)} UPH</span>
                              </div>
                              {isParallel && (
                                <div className="flex justify-between items-center text-blue-600 dark:text-blue-400">
                                  <span className="text-muted-foreground">Per Machine (Avg):</span>
                                  <span className="font-bold">{((step.combinedRate / step.stations.length) * 3600).toFixed(0)} UPH</span>
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
                          <div className="flex flex-col items-center gap-1 flex-shrink-0" style={{ marginTop: '20px' }}>
                            {/* WIP Triangle - Editable buffer (click to edit) */}
                            {(() => {
                              const bufferEntry = (wipInventory || []).find(w => w.afterOpNumber === step.stepNumber);
                              const displayQty = bufferEntry ? bufferEntry.quantity : 0;
                              const hasWip = displayQty > 0;

                              return (
                                <div className="flex flex-col items-center" title={`WIP after Op ${step.stepNumber}`}>
                                  {/* Triangle pointing down - larger for easier tapping */}
                                  <div
                                    onClick={() => {
                                      setEditingWipStep(step.stepNumber);
                                      setEditingWipValue(displayQty ? String(Math.round(displayQty)) : '');
                                    }}
                                    className={`w-0 h-0 border-l-[16px] border-r-[16px] border-t-[20px] border-l-transparent border-r-transparent ${hasWip ? 'border-t-yellow-500' : 'border-t-gray-300'}`}
                                  />

                                  {editingWipStep === step.stepNumber ? (
                                    <input
                                      autoFocus
                                      value={editingWipValue}
                                      onChange={(e) => setEditingWipValue(e.target.value.replace(/[^0-9]/g, ''))}
                                      onBlur={() => {
                                        const val = editingWipValue === '' ? 0 : parseInt(editingWipValue || '0', 10);
                                        saveWipForStep(step.stepNumber, Number.isNaN(val) ? 0 : val);
                                        setEditingWipStep(null);
                                        setEditingWipValue('');
                                      }}
                                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                      className="mt-0.5 w-14 text-center text-[12px] font-bold bg-transparent border rounded"
                                    />
                                  ) : (
                                    <span className={`text-[12px] font-bold mt-0.5 ${hasWip ? 'text-yellow-600 dark:text-yellow-400' : 'text-muted-foreground'}`}>
                                      {displayQty.toFixed(0)}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                            {/* Arrow */}
                            <div className="text-lg sm:text-2xl text-muted-foreground font-bold mt-1">
                              →
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  
                  {/* Output with throughput counter */}
                  <div className="flex flex-col items-center gap-1 flex-shrink-0" style={{ marginTop: '20px' }}>
                    <div className="flex flex-col items-center">
                      <div className="text-[8px] text-muted-foreground mb-1">OUT</div>
                      <div className="text-lg sm:text-2xl text-green-600 font-bold">→</div>
                      <div className="text-lg font-bold text-green-600">{(bottleneckRate * 3600).toFixed(0)}</div>
                      <span className="text-[9px] text-muted-foreground">UPH</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* System Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mt-4 sm:mt-8">
                <div className="bg-muted p-3 sm:p-4 rounded border">
                  <div className="text-xs sm:text-sm text-muted-foreground mb-1">System Throughput</div>
                  <div className="text-lg sm:text-2xl font-bold text-green-600">
                    {(bottleneckRate * 3600).toFixed(0)} <span className="text-xs sm:text-sm">UPH</span>
                  </div>
                  <div className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                    {(bottleneckRate * 3600 * 8).toFixed(0)} per 8-hour shift
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
                  <div className="text-xs sm:text-sm text-muted-foreground mb-1">Total WIP</div>
                  <div className="text-lg sm:text-2xl font-bold text-yellow-600">
                    {(() => {
                      const totalWip = (wipInventory || []).reduce((sum, w) => sum + (w.quantity || 0), 0);
                      return totalWip.toFixed(0);
                    })()} <span className="text-xs sm:text-sm">units</span>
                  </div>
                  {(() => {
                    const totalWip = (wipInventory || []).reduce((sum, w) => sum + (w.quantity || 0), 0);
                    const throughputPerHour = bottleneckRate * 3600;
                    const wipLeadTimeHours = throughputPerHour > 0 ? totalWip / throughputPerHour : 0;
                    return (
                      <div className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                        {totalWip > 0 && throughputPerHour > 0 ? (
                          <span title="Little's Law: Lead Time = WIP ÷ Throughput">
                            ≈ {wipLeadTimeHours < 1 ? `${(wipLeadTimeHours * 60).toFixed(0)} min` : `${wipLeadTimeHours.toFixed(1)} hr`} wait time
                          </span>
                        ) : (
                          'No WIP buffers configured'
                        )}
                      </div>
                    );
                  })()}
                </div>
                <div className="bg-muted p-3 sm:p-4 rounded border">
                  <div className="text-xs sm:text-sm text-muted-foreground mb-1">Process Efficiency</div>
                  <div className="text-lg sm:text-2xl font-bold text-orange-600">
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
                  <div>• <span className="text-blue-600 dark:text-blue-400 font-bold">Op {stepMetrics[bottleneckStepIndex]?.stepNumber}</span> is your constraint - limiting output to {(bottleneckRate * 3600).toFixed(0)} UPH</div>
                  {stepMetrics.filter(s => s.utilization < 70).length > 0 && (
                    <div>• <span className="text-yellow-600 dark:text-yellow-400">{stepMetrics.filter(s => s.utilization < 70).map(s => `Op ${s.stepNumber}`).join(', ')}</span> can be idle up to {(100 - Math.min(...stepMetrics.filter(s => s.utilization < 70).map(s => s.utilization))).toFixed(0)}% without reducing output</div>
                  )}
                  {stepMetrics[bottleneckStepIndex]?.stations.length === 1 ? (
                    <div>• To increase throughput: Add parallel machine to Op {stepMetrics[bottleneckStepIndex]?.stepNumber} or reduce cycle time</div>
                  ) : (
                    <div>• To increase throughput: Add more parallel machines to Op {stepMetrics[bottleneckStepIndex]?.stepNumber} or reduce individual cycle times</div>
                  )}
                  {(() => {
                    const totalWip = (wipInventory || []).reduce((sum, w) => sum + (w.quantity || 0), 0);
                    const throughputPerHour = bottleneckRate * 3600;
                    if (totalWip > 0 && throughputPerHour > 0) {
                      const wipLeadTimeHours = totalWip / throughputPerHour;
                      const wipLeadTimeDisplay = wipLeadTimeHours < 1 
                        ? `${(wipLeadTimeHours * 60).toFixed(0)} minutes` 
                        : `${wipLeadTimeHours.toFixed(1)} hours`;
                      return (
                        <div>• <span className="text-yellow-600 dark:text-yellow-400 font-bold">Little's Law:</span> {totalWip.toFixed(0)} WIP ÷ {throughputPerHour.toFixed(0)} UPH = <span className="font-bold">{wipLeadTimeDisplay}</span> of waiting in system</div>
                      );
                    }
                    return null;
                  })()}
                  <div className="hidden sm:block">• Improving non-bottleneck ops will not increase overall output</div>
                  {stepMetrics.some(s => s.stations.length > 1) && (
                    <div className="text-blue-600 dark:text-blue-400 hidden sm:block">• Parallel machines at same op combine their rates (e.g., 2× machines = 2× capacity)</div>
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
