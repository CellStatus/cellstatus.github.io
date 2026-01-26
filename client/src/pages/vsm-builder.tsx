import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useSearch } from 'wouter';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Trash2, ChevronUp, ChevronDown, Plus, Factory, HelpCircle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { apiRequest } from '@/lib/queryClient';
import { simulateVsm, VsmStation, VsmDetailedMetrics, VsmConfig, computeStationUPH, computePerUnitCycleTimeSec, computeEffectiveCycleTimeSec } from '@/lib/vsm-sim';
import { exportVsmMarkdown } from '@/lib/vsm-export';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';

type Machine = { 
  id: string; 
  name: string; 
  machineId?: string;
  cell?: string;
  idealCycleTime?: number;
  batchSize?: number;
  uptimePercent?: number;
  setupTime?: number;
};

function renderStations(stationsJson: unknown, machinesById: Record<string, Machine> = {}, machinesByMachineId: Record<string, Machine> = {}) {
  if (!stationsJson) return null;
  const data = stationsJson as any;
  const stations = Array.isArray(data) ? data : (data.stations || data.stationsJson || []);
  const operationNames: Record<number, string> = data.operationNames || {};
  if (!stations || stations.length === 0) return null;
  
  // Group stations by process step
  const stepGroups = new Map<number, any[]>();
  stations.forEach((station: any) => {
    const step = station.processStep || 1;
    if (!stepGroups.has(step)) stepGroups.set(step, []);
    stepGroups.get(step)!.push(station);
  });
  
  const sortedSteps = Array.from(stepGroups.entries()).sort((a, b) => a[0] - b[0]);
  
  return (
    <div className="flex flex-wrap items-center gap-1 py-2">
      {sortedSteps.map(([step, stationsInStep], idx: number) => {
        // Get display name: operation name first, then first machine name
        const machineNames = stationsInStep.map((s: any) => s.name || s.opName || s.operationName || '').filter(Boolean);
        const displayName = operationNames[step] || (machineNames.length > 0 ? machineNames[0] : `Op ${step}`);
        const machineCount = stationsInStep.length;
        
        return (
          <div key={step} className="flex items-center gap-1">
            <Badge 
              variant="outline" 
              className="text-xs"
              title={machineCount > 1 ? `${machineCount} machines at this step` : undefined}
            >
              <span className="text-muted-foreground mr-1">Op{step}:</span>
              <span>{displayName}</span>
              {machineCount > 1 && <span className="text-muted-foreground ml-1">(×{machineCount})</span>}
            </Badge>
            {idx < sortedSteps.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
          </div>
        );
      })}
    </div>
  );
}

function normalizeStationsInput(stationsJson: any) {
  if (!stationsJson) return [];
  if (Array.isArray(stationsJson)) return stationsJson;
  if (stationsJson.stations && Array.isArray(stationsJson.stations)) return stationsJson.stations;
  if (stationsJson.stationsJson && Array.isArray(stationsJson.stationsJson)) return stationsJson.stationsJson;
  return [];
}

// Group stations by process step for visual flow
function groupByStep(stations: any[]) {
  const groups = new Map<number, any[]>();
  stations.forEach(s => {
    const step = s.processStep || 1;
    if (!groups.has(step)) groups.set(step, []);
    groups.get(step)!.push(s);
  });
  return Array.from(groups.entries()).sort((a, b) => a[0] - b[0]);
}

function VisualProcessFlow({ 
  stations, 
  machinesById,
  selectedStep,
  setSelectedStep,
  updateStation,
  removeStation,
  metrics,
  rawMaterialUPH,
  setRawMaterialUPH,
  stepOperationNames,
  setStepOperationName,
}: { 
  stations: any[]; 
  machinesById: Record<string, Machine>;
  selectedStep: number | null;
  setSelectedStep: (step: number | null) => void;
  updateStation: (idx: number, updates: Partial<VsmStation>) => void;
  removeStation: (id: string) => void;
  metrics?: VsmDetailedMetrics | null;
  rawMaterialUPH?: number;
  setRawMaterialUPH?: (val: number | undefined) => void;
  stepOperationNames: Record<number, string>;
  setStepOperationName: (step: number, name: string) => void;
}) {
  if (!stations || stations.length === 0) return null;
  const stepGroups = groupByStep(stations);
  const selectedStations = selectedStep !== null ? stations.filter(s => s.processStep === selectedStep) : [];
  
  // Get WIP for each step from metrics
  const wipByStep = new Map<number, number>();
  metrics?.steps.forEach(s => {
    wipByStep.set(s.step, s.wipBefore);
  });
  
  // Get operation names for each step
  const opNamesByStep = new Map<number, string[]>();
  stations.forEach(s => {
    const step = s.processStep || 1;
    if (!opNamesByStep.has(step)) opNamesByStep.set(step, []);
    if (s.name) opNamesByStep.get(step)!.push(s.name);
  });
  
  // State for editing raw material UPH
  const [editingRawUPH, setEditingRawUPH] = useState(false);
  
  return (
    <div className="my-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold">Value Stream Map</div>
        <span className="text-xs text-muted-foreground">Click an operation to configure</span>
      </div>
      <div className="flex items-stretch gap-2 overflow-x-auto py-2">
        {/* Incoming Material indicator - clickable to edit Raw Material UPH */}
        <div 
          className={`flex flex-col items-center justify-center min-w-[100px] p-2 rounded-lg border cursor-pointer hover:border-blue-500 transition-all ${metrics?.isRawMaterialBottleneck ? 'bg-orange-500/10 border-orange-500' : 'bg-blue-500/10 border-blue-500/30'}`}
          onClick={() => !editingRawUPH && setEditingRawUPH(true)}
          title="Click to set incoming raw material rate"
        >
          <div className={`text-xs font-semibold ${metrics?.isRawMaterialBottleneck ? 'text-orange-600' : 'text-blue-600'}`}>Incoming</div>
          {editingRawUPH ? (
            <Input
              inputMode="numeric"
              value={rawMaterialUPH ?? ''}
              onChange={e => setRawMaterialUPH?.(e.target.value ? Number(e.target.value) : undefined)}
              className="h-8 w-20 text-center text-sm font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              placeholder="∞"
              autoFocus
              onClick={e => e.stopPropagation()}
              onBlur={() => setEditingRawUPH(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') setEditingRawUPH(false);
              }}
            />
          ) : (
            <div className={`text-lg font-bold ${metrics?.isRawMaterialBottleneck ? 'text-orange-600' : 'text-blue-600'}`}>
              {rawMaterialUPH ? Math.round(rawMaterialUPH).toLocaleString() : '∞'}
            </div>
          )}
          <div className={`text-[10px] ${metrics?.isRawMaterialBottleneck ? 'text-orange-500' : 'text-blue-500'}`}>UPH</div>
          {metrics?.isRawMaterialBottleneck && (
            <Badge variant="outline" className="text-[9px] mt-1 text-orange-600 border-orange-500">Bottleneck</Badge>
          )}
          {!rawMaterialUPH && (
            <div className="text-[9px] text-blue-400 mt-0.5">click to set</div>
          )}
        </div>
        
        <div className="flex items-center">
          <ArrowRight className="h-5 w-5 text-muted-foreground" />
        </div>
        {stepGroups.map(([step, stationsInStep], groupIdx) => {
          const stepMetric = metrics?.steps.find(s => s.step === step);
          const isBottleneck = metrics?.bottleneckStep?.step === step;
          // Get WIP before this step
          const wipBeforeThisStep = stationsInStep.reduce((sum, s) => sum + (s.wipBefore || 0), 0);
          // Get WIP before next step (for inventory between operations)
          const wipBeforeNextStep = groupIdx < stepGroups.length - 1 
            ? stepGroups[groupIdx + 1][1].reduce((sum, s) => sum + (s.wipBefore || 0), 0)
            : 0;
          const opNames = opNamesByStep.get(step) || [];
          // Use step operation name if set, otherwise fall back to first machine name
          const displayName = stepOperationNames[step] || (opNames.length > 0 ? opNames[0] : `Op ${step}`);
          
          return (
            <React.Fragment key={step}>
              {/* Show inventory triangle before first operation if it has WIP */}
              {groupIdx === 0 && wipBeforeThisStep > 0 && (
                <>
                  <div className="flex flex-col items-center justify-center min-w-[80px]">
                    <div className="flex flex-col items-center" title={`WIP Inventory: ${wipBeforeThisStep} units before first operation`}>
                      <svg width="48" height="42" viewBox="0 0 48 42" className="text-amber-500">
                        <polygon points="24,2 46,40 2,40" fill="none" stroke="currentColor" strokeWidth="2" />
                        <text x="24" y="32" textAnchor="middle" fontSize="12" fill="currentColor" fontWeight="bold">{wipBeforeThisStep}</text>
                      </svg>
                      <span className="text-[10px] text-amber-600 font-medium">I</span>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <ArrowRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                </>
              )}
              <div 
                className={`flex flex-col gap-2 min-w-[200px] p-3 rounded-lg border cursor-pointer transition-all hover:border-primary/50 ${selectedStep === step ? 'bg-primary/10 border-primary ring-2 ring-primary' : isBottleneck ? 'bg-orange-500/10 border-orange-500' : 'bg-muted/30'}`}
                onClick={() => setSelectedStep(selectedStep === step ? null : step)}
              >
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-primary" title={opNames.join(', ')}>
                    Op {step}: {displayName}
                    {stationsInStep.length > 1 && <span className="text-muted-foreground ml-1">({stationsInStep.length})</span>}
                  </div>
                  {isBottleneck && <Badge variant="outline" className="text-orange-600 border-orange-500 text-[10px]">Bottleneck</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">{stationsInStep.length} machine(s)</div>
                {stepMetric && (
                  <div className="text-xs text-muted-foreground border-t pt-1 mt-1 space-y-0.5">
                    <div title={`Combined UPH = Sum of individual machine UPHs\n${stationsInStep.map((s: any) => `${s.name || s.machineIdDisplay || 'Machine'}: ${Math.round(computeStationUPH(s))} UPH`).join('\n')}\nTotal: ${Math.round(stepMetric.combinedRateUPH)} UPH`}>
                      Rate: <span className="font-medium text-foreground">{Math.round(stepMetric.combinedRateUPH).toLocaleString()} UPH</span>
                    </div>
                    <div title={`Average Cycle Time across ${stationsInStep.length} machine(s)\n${stationsInStep.map((s: any) => `${s.name || s.machineIdDisplay || 'Machine'}: ${s.cycleTime || 60}s`).join('\n')}\nAverage: ${stepMetric.avgStationCT.toFixed(1)}s`}>
                      CT: <span className="font-medium text-foreground">{stepMetric.avgStationCT.toFixed(1)}s</span>
                    </div>
                    <div title={`Utilization = (System Throughput / Operation Capacity) × 100%\n= (${Math.round(metrics?.systemThroughputUPH || 0)} / ${Math.round(stepMetric.combinedRateUPH)}) × 100%\n= ${stepMetric.avgUtilPercent.toFixed(1)}%`}>
                      Util: <span className={`font-medium ${stepMetric.avgUtilPercent >= 95 ? 'text-red-600' : stepMetric.avgUtilPercent >= 80 ? 'text-amber-600' : 'text-green-600'}`}>{stepMetric.avgUtilPercent.toFixed(0)}%</span>
                    </div>
                    {stepMetric.waitingTimeSec > 0 && (
                      <div title={`Wait Time = System CT - Operation CT\n= ${(3600 / (metrics?.systemThroughputUPH || 1)).toFixed(1)}s - ${stepMetric.effectiveCTsec.toFixed(1)}s\n= ${stepMetric.waitingTimeSec.toFixed(1)}s idle per unit`}>
                        Wait: <span className="font-medium text-rose-500">{stepMetric.waitingTimeSec.toFixed(1)}s</span>
                      </div>
                    )}
                  </div>
                )}
                <div className="flex flex-col gap-1 mt-1">
                  {stationsInStep.map((s: any, idx: number) => {
                    const machine = s.machineId && machinesById[s.machineId];
                    const machineUPH = computeStationUPH(s);
                    const perUnitCT = computePerUnitCycleTimeSec(s);
                    const effCT = computeEffectiveCycleTimeSec(s);
                    // Display values with defaults
                    const displayCT = s.cycleTime || 60;
                    const displayBatch = s.batchSize || 1;
                    const displayUptime = s.uptimePercent ?? 100;
                    const displaySetup = s.setupTime || 0;
                    // Tooltip with calculation
                    const calcTooltip = `Per-Unit CT = ${displayCT} + (${displaySetup}/${displayBatch}) = ${perUnitCT.toFixed(1)}s
Eff CT = ${perUnitCT.toFixed(1)} / ${displayUptime}% = ${effCT.toFixed(1)}s/unit
UPH = 3600 / ${effCT.toFixed(1)} = ${Math.round(machineUPH)}`;
                    return (
                      <div 
                        key={s.id || idx} 
                        className="p-2 bg-background rounded border text-xs"
                        title={calcTooltip}
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-medium">{s.name}</div>
                          <div className="font-bold text-primary">{Math.round(machineUPH)} UPH</div>
                        </div>
                        <div className="text-muted-foreground flex flex-wrap items-center gap-x-2">
                          {s.machineIdDisplay && <span>#{s.machineIdDisplay}</span>}
                          <span>CT: {displayCT}s</span>
                          <span>Up: {displayUptime}%</span>
                          <span>Pcs/Setup: {displayBatch}</span>
                          <span>Setup: {displaySetup}s</span>
                          <span className="text-blue-500 font-medium">→ {effCT.toFixed(1)}s/unit</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Inventory Triangle (VSM standard) between operations - shows WIP before next step */}
              {groupIdx < stepGroups.length - 1 && (
                <div className="flex flex-col items-center justify-center min-w-[80px]">
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                  {wipBeforeNextStep > 0 && (
                    <div className="mt-1 flex flex-col items-center" title={`WIP Inventory: ${wipBeforeNextStep} units before next operation`}>
                      {/* Inventory Triangle Symbol - larger for 3-digit numbers */}
                      <svg width="48" height="42" viewBox="0 0 48 42" className="text-amber-500">
                        <polygon points="24,2 46,40 2,40" fill="none" stroke="currentColor" strokeWidth="2" />
                        <text x="24" y="32" textAnchor="middle" fontSize="12" fill="currentColor" fontWeight="bold">{wipBeforeNextStep}</text>
                      </svg>
                      <span className="text-[10px] text-amber-600 font-medium">I</span>
                    </div>
                  )}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
      
      {/* Configuration Panel for Selected Step */}
      {selectedStep !== null && selectedStations.length > 0 && (
        <div className="mt-4 p-4 border rounded-lg bg-muted/20">
          <div className="flex items-center justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold">Op {selectedStep}:</span>
                <Input
                  value={stepOperationNames[selectedStep] || ''}
                  onChange={(e) => setStepOperationName(selectedStep, e.target.value)}
                  placeholder="Enter operation name..."
                  className="h-7 text-sm font-medium max-w-[200px]"
                />
                {selectedStations.length > 1 && <span className="text-xs text-muted-foreground">({selectedStations.length} machines)</span>}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Label className="text-xs">WIP Before Operation:</Label>
                <Input
                  inputMode="numeric"
                  value={selectedStations[0]?.wipBefore ?? ''}
                  onChange={(e) => {
                    // Set WIP on the first station of this step
                    const firstStation = selectedStations[0];
                    if (firstStation) {
                      const globalIdx = stations.findIndex(s => s.id === firstStation.id);
                      updateStation(globalIdx, { wipBefore: e.target.value ? Number(e.target.value) : undefined });
                    }
                  }}
                  placeholder="0"
                  className="h-7 text-sm w-20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-xs text-muted-foreground">units</span>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelectedStep(null)}>Close</Button>
          </div>
          <div className="space-y-3">
            {selectedStations.map((station, localIdx) => {
              const globalIdx = stations.findIndex(s => s.id === station.id);
              return (
                <div key={station.id} className="p-3 border rounded bg-card">
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-medium text-sm">
                      {station.name}
                      {station.machineIdDisplay && <span className="text-muted-foreground ml-2">#{station.machineIdDisplay}</span>}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => removeStation(station.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <Label className="text-xs">Machine Name</Label>
                      <Input
                        value={station.name || ''}
                        onChange={(e) => updateStation(globalIdx, { name: e.target.value })}
                        className="mt-1 h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Cycle Time (sec)</Label>
                      <Input
                        inputMode="numeric"
                        value={station.cycleTime ?? ''}
                        onChange={(e) => updateStation(globalIdx, { cycleTime: e.target.value ? Number(e.target.value) : undefined })}
                        placeholder="60"
                        className="mt-1 h-8 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Setup Time (sec)</Label>
                      <Input
                        inputMode="numeric"
                        value={station.setupTime ?? ''}
                        onChange={(e) => updateStation(globalIdx, { setupTime: e.target.value ? Number(e.target.value) : undefined })}
                        placeholder="0"
                        className="mt-1 h-8 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Pcs/Setup</Label>
                      <Input
                        inputMode="numeric"
                        value={station.batchSize ?? ''}
                        onChange={(e) => updateStation(globalIdx, { batchSize: e.target.value ? Number(e.target.value) : undefined })}
                        placeholder="1"
                        className="mt-1 h-8 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Uptime %</Label>
                      <Input
                        inputMode="numeric"
                        value={station.uptimePercent ?? ''}
                        onChange={(e) => updateStation(globalIdx, { uptimePercent: e.target.value ? Number(e.target.value) : undefined })}
                        placeholder="100"
                        className="mt-1 h-8 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Op Step</Label>
                      <Input
                        inputMode="numeric"
                        value={station.processStep || ''}
                        onChange={(e) => updateStation(globalIdx, { processStep: Number(e.target.value) || 1 })}
                        className="mt-1 h-8 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// WIP Flow Simulation - animated balls in baskets visualization
function WipFlowSimulation({ 
  metrics,
  rawMaterialUPH,
  operationNames,
}: { 
  metrics?: VsmDetailedMetrics | null;
  rawMaterialUPH?: number;
  operationNames: Record<number, string>;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [simulationTime, setSimulationTime] = useState(0);
  const [speed, setSpeed] = useState(1); // 1x, 2x, 5x, 10x
  const [wipState, setWipState] = useState<number[]>([]);
  const [processedCounts, setProcessedCounts] = useState<number[]>([]);
  
  // Initialize WIP state based on metrics
  useEffect(() => {
    if (metrics?.steps) {
      setWipState(metrics.steps.map(s => s.wipBefore || 0));
      setProcessedCounts(metrics.steps.map(() => 0));
    }
  }, [metrics?.steps]);
  
  // Simulation loop
  useEffect(() => {
    if (!isPlaying || !metrics?.steps || metrics.steps.length === 0) return;
    
    const interval = setInterval(() => {
      setSimulationTime(prev => prev + 0.1 * speed);
      
      setWipState(prevWip => {
        const newWip = [...prevWip];
        const steps = metrics.steps;
        
        // Calculate arrivals and departures based on rates
        // Incoming rate
        const incomingRate = rawMaterialUPH || metrics.systemThroughputUPH;
        const incomingPerTick = (incomingRate / 3600) * 0.1 * speed;
        
        // Add incoming to first operation's WIP
        if (newWip.length > 0) {
          newWip[0] += incomingPerTick;
        }
        
        // Process through each operation
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          const processRate = step.combinedRateUPH / 3600; // units per second
          const canProcess = Math.min(newWip[i], processRate * 0.1 * speed);
          
          newWip[i] -= canProcess;
          
          // Add to next operation's WIP (or count as finished)
          if (i < steps.length - 1) {
            newWip[i + 1] += canProcess;
          }
        }
        
        // Clamp to reasonable values (max 10000 for display purposes)
        return newWip.map(w => Math.max(0, Math.min(w, 10000)));
      });
    }, 100);
    
    return () => clearInterval(interval);
  }, [isPlaying, metrics, rawMaterialUPH, speed]);
  
  const resetSimulation = () => {
    setSimulationTime(0);
    if (metrics?.steps) {
      setWipState(metrics.steps.map(s => s.wipBefore || 0));
      setProcessedCounts(metrics.steps.map(() => 0));
    }
    setIsPlaying(false);
  };
  
  if (!metrics?.steps || metrics.steps.length === 0) {
    return null;
  }
  
  // Render balls in a basket
  const renderBalls = (count: number, maxBalls: number = 100) => {
    const displayCount = Math.min(Math.round(count), maxBalls);
    const balls = [];
    const cols = 10;
    
    for (let i = 0; i < displayCount; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      // Offset odd rows for stacking effect
      const xOffset = row % 2 === 1 ? 4 : 0;
      balls.push(
        <circle
          key={i}
          cx={5 + col * 8 + xOffset}
          cy={78 - row * 8}
          r={3}
          className="fill-blue-500 stroke-blue-600"
          strokeWidth={0.5}
        />
      );
    }
    return balls;
  };
  
  return (
    <Card className="mt-4">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            🎬 WIP Flow Simulation
            <Badge variant="outline" className="text-xs">
              {(() => {
                const totalSec = Math.floor(simulationTime);
                const hours = Math.floor(totalSec / 3600);
                const minutes = Math.floor((totalSec % 3600) / 60);
                const seconds = totalSec % 60;
                if (hours > 0) {
                  return `${hours}h ${minutes}m ${seconds}s`;
                } else if (minutes > 0) {
                  return `${minutes}m ${seconds}s`;
                }
                return `${simulationTime.toFixed(1)}s`;
              })()}
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button 
              size="sm" 
              variant={isPlaying ? "destructive" : "default"}
              onClick={() => setIsPlaying(!isPlaying)}
            >
              {isPlaying ? '⏸ Pause' : '▶ Play'}
            </Button>
            <Button size="sm" variant="outline" onClick={resetSimulation}>
              ↺ Reset
            </Button>
            <select 
              className="h-8 px-2 text-sm border rounded bg-background"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            >
              <option value={1}>1x</option>
              <option value={2}>2x</option>
              <option value={5}>5x</option>
              <option value={10}>10x</option>
              <option value={100}>100x</option>
              <option value={500}>500x</option>
              <option value={1000}>1000x</option>
            </select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-3 overflow-x-auto pb-2 pt-2">
          {/* Incoming source */}
          <div className={`flex flex-col items-center min-w-[80px] p-2 rounded-lg border ${metrics.isRawMaterialBottleneck ? 'bg-orange-500/10 border-orange-500' : 'bg-blue-500/10 border-blue-500/30'}`}>
            <div className={`text-xs font-semibold mb-1 ${metrics.isRawMaterialBottleneck ? 'text-orange-600' : 'text-blue-600'}`}>Incoming</div>
            <div className={`text-sm font-bold ${metrics.isRawMaterialBottleneck ? 'text-orange-600' : 'text-blue-600'}`}>
              {rawMaterialUPH ? Math.round(rawMaterialUPH) : '∞'}
            </div>
            <div className={`text-[10px] ${metrics.isRawMaterialBottleneck ? 'text-orange-500' : 'text-blue-500'}`}>UPH</div>
            {metrics.isRawMaterialBottleneck && (
              <Badge variant="outline" className="text-[9px] mt-1 text-orange-600 border-orange-500">Bottleneck</Badge>
            )}
          </div>
          
          <div className="flex items-center">
            <ArrowRight className="h-5 w-5 text-muted-foreground animate-pulse" />
          </div>
          
          {/* Operations with baskets */}
          {metrics.steps.map((step, idx) => {
            const wip = wipState[idx] || 0;
            const isBottleneck = metrics.bottleneckStep?.step === step.step;
            
            return (
              <React.Fragment key={step.step}>
                {/* WIP Basket before operation */}
                <div className="flex flex-col items-center min-w-[80px]">
                  <div className="text-[10px] text-muted-foreground mb-1">WIP Buffer</div>
                  <div className={`text-sm font-bold ${wip > 10 ? 'text-amber-600' : 'text-foreground'}`}>
                    {Math.round(wip)} units
                  </div>
                  {/* Basket SVG */}
                  <svg width="90" height="90" viewBox="0 0 90 90" className="mt-1">
                    {/* Basket outline */}
                    <path 
                      d="M5 10 L5 85 L85 85 L85 10" 
                      fill="none" 
                      className="stroke-muted-foreground" 
                      strokeWidth="2"
                    />
                    <line x1="5" y1="10" x2="0" y2="5" className="stroke-muted-foreground" strokeWidth="2" />
                    <line x1="85" y1="10" x2="90" y2="5" className="stroke-muted-foreground" strokeWidth="2" />
                    {/* Balls */}
                    {renderBalls(wip)}
                  </svg>
                </div>
                
                <div className="flex items-center">
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                </div>
                
                {/* Operation box */}
                <div className={`flex flex-col items-center min-w-[100px] p-2 rounded-lg border ${isBottleneck ? 'bg-orange-500/10 border-orange-500' : 'bg-muted/30'}`}>
                  <div className="text-xs font-semibold truncate max-w-[90px]" title={operationNames[step.step] || step.stations[0]?.name}>
                    Op {step.step}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate max-w-[90px]">
                    {operationNames[step.step] || step.stations[0]?.name || '-'}
                  </div>
                  <div className="text-sm font-bold mt-1">
                    {Math.round(step.combinedRateUPH)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">UPH</div>
                  {isBottleneck && (
                    <Badge variant="outline" className="text-[9px] mt-1 text-orange-600 border-orange-500">
                      Bottleneck
                    </Badge>
                  )}
                  {/* Processing animation */}
                  {isPlaying && (
                    <div className="mt-1 w-6 h-6">
                      <svg width="24" height="24" viewBox="0 0 24 24" className="animate-spin">
                        <circle cx="12" cy="12" r="8" fill="none" className="stroke-primary/30" strokeWidth="3" />
                        <path d="M12 4 A8 8 0 0 1 20 12" fill="none" className="stroke-primary" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                    </div>
                  )}
                </div>
                
                {idx < metrics.steps.length - 1 && (
                  <div className="flex items-center">
                    <ArrowRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
              </React.Fragment>
            );
          })}
          
          <div className="flex items-center">
            <ArrowRight className="h-5 w-5 text-green-500" />
          </div>
          
          {/* Output */}
          <div className="flex flex-col items-center min-w-[80px] p-2 rounded-lg border bg-green-500/10 border-green-500">
            <div className="text-xs font-semibold text-green-600 mb-1">Output</div>
            <div className="text-sm font-bold text-green-600">
              {Math.round(metrics.systemThroughputUPH)}
            </div>
            <div className="text-[10px] text-green-500">UPH</div>
          </div>
        </div>
        
        <div className="mt-4 text-xs text-muted-foreground">
          <p>💡 The simulation shows how WIP accumulates before each operation based on throughput rates. Watch the balls stack up at bottlenecks!</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function VsmBuilder() {
  const [showRaw, setShowRaw] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importedStations, setImportedStations] = useState<VsmStation[] | null>(null);
  const [importMetrics, setImportMetrics] = useState<VsmDetailedMetrics | null>(null);
  
  // Get URL params - useSearch returns the query string reactively
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const id = searchParams.get('id');

  const { data: vsm, isLoading } = useQuery({
      queryKey: id ? [`/api/vsm-configurations/${id}`] : ['vsm-config-none'],
      queryFn: async () => {
        if (!id) return null;
        return apiRequest('GET', `/api/vsm-configurations/${id}`);
      },
      enabled: !!id && id !== 'new',
    });

  const { data: machines = [] } = useQuery<Machine[]>({
    queryKey: ['/api/machines'],
    queryFn: async () => apiRequest('GET', '/api/machines'),
  });

  const queryClient = useQueryClient();

  // fetch list of saved VSMs when no id is provided
  const { data: vsmList = [] as any[] } = useQuery({
    queryKey: ['/api/vsm-configurations', 'list'],
    queryFn: async () => apiRequest('GET', '/api/vsm-configurations'),
    refetchOnMount: 'always', // Always refresh when navigating back to list
  });

  const machinesById = machines.reduce((acc: Record<string, Machine>, m) => ({ ...acc, [m.id]: m }), {});
  const machinesByMachineId = machines.reduce((acc: Record<string, Machine>, m) => (m.machineId ? { ...acc, [m.machineId]: m } : acc), {});

  // Create-mode state (kept at top-level to satisfy hooks rules)
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createStatus, setCreateStatus] = useState('active');
  const [newStations, setNewStations] = useState<VsmStation[]>([]);
  const [newStationRow, setNewStationRow] = useState<any>({ name: '', processStep: 10, cycleTime: 60, batchSize: 1, uptimePercent: 100, machineIdDisplay: '' });
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  function onDragStart(e: React.DragEvent, idx: number) {
    setDragIndex(idx);
    try { e.dataTransfer.effectAllowed = 'move'; } catch (e) {}
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  function onDrop(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (dragIndex === null) return;
    const arr = [...newStations];
    const [moved] = arr.splice(dragIndex, 1);
    arr.splice(idx, 0, moved);
    setNewStations(arr);
    setDragIndex(null);
  }

  function moveStationUp(i: number) {
    if (i <= 0) return;
    const arr = [...newStations];
    const t = arr[i - 1]; arr[i - 1] = arr[i]; arr[i] = t;
    setNewStations(arr);
  }

  function moveStationDown(i: number) {
    if (i >= newStations.length - 1) return;
    const arr = [...newStations];
    const t = arr[i + 1]; arr[i + 1] = arr[i]; arr[i] = t;
    setNewStations(arr);
  }

  function removeNewStation(id: string) {
    setNewStations(prev => prev.filter(s => s.id !== id));
  }

  function addNewStation() {
    setNewStations(prev => [...prev, { id: Math.random().toString(36).slice(2), name: newStationRow.name || 'Operation', processStep: Number(newStationRow.processStep) || 1, cycleTime: Number(newStationRow.cycleTime) || 60, setupTime: undefined, machineIdDisplay: newStationRow.machineIdDisplay || undefined }]);
    setNewStationRow({ name: '', processStep: 10, cycleTime: 60, batchSize: 1, uptimePercent: 100, machineIdDisplay: '' });
  }

  async function saveNewVsm() {
    try {
      const payload = {
        name: createName,
        description: createDescription,
        status: createStatus,
        stationsJson: { stations: newStations },
      };
      const created = await apiRequest('POST', '/api/vsm-configurations', payload);
      queryClient.invalidateQueries({ queryKey: ['/api/vsm-configurations', 'list'] });
      // navigate to newly created VSM using base URL
      const baseUrl = import.meta.env.BASE_URL || '/';
      window.location.href = `${baseUrl}vsm-builder?id=${created.id}`;
    } catch (err) {
      alert('Save failed');
    }
  }

  // Editing state for an existing VSM
  const [editingName, setEditingName] = useState('');
  const [editingDescription, setEditingDescription] = useState('');
  const [editingStatus, setEditingStatus] = useState('');
  const [editingStations, setEditingStations] = useState<VsmStation[] | null>(null);
  const [dragIndexEdit, setDragIndexEdit] = useState<number | null>(null);
  const [editingMetrics, setEditingMetrics] = useState<VsmDetailedMetrics | null>(null);
  const [selectedEditStep, setSelectedEditStep] = useState<number | null>(null);
  const [initialVsmState, setInitialVsmState] = useState<string | null>(null);
  const [deleteVsm, setDeleteVsm] = useState<any | null>(null);
  const [rawMaterialUPH, setRawMaterialUPH] = useState<number | undefined>(undefined);
  const [operationNames, setOperationNames] = useState<Record<number, string>>({});
  
  // Inline editing state for header fields
  const [editingField, setEditingField] = useState<'name' | 'description' | 'status' | 'rawUPH' | null>(null);

  // Check if there are unsaved changes
  const hasUnsavedChanges = React.useMemo(() => {
    if (!vsm || !initialVsmState) return false;
    const currentState = JSON.stringify({
      name: editingName,
      description: editingDescription,
      status: editingStatus,
      stations: editingStations,
      rawMaterialUPH: rawMaterialUPH,
      operationNames: operationNames,
    });
    return currentState !== initialVsmState;
  }, [vsm, initialVsmState, editingName, editingDescription, editingStatus, editingStations, rawMaterialUPH, operationNames]);

  // Warn user about unsaved changes when leaving the page
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!vsm) {
      setEditingStations(null);
      setInitialVsmState(null);
      return;
    }
    setEditingName(vsm.name || '');
    setEditingDescription(vsm.description || '');
    setEditingStatus(vsm.status || '');
    // normalize and set stations
    try {
      const stationsData = vsm.stationsJson as any;
      const raw = normalizeStationsInput(stationsData);
      const norm = (raw || []).map((r: any, idx: number) => ({
        id: r.id || `s-${idx}`,
        name: r.name || r.opName || r.operationName || (r.machine && r.machine.name) || `Op ${r.processStep || idx + 1}`,
        processStep: r.processStep || (r.step || 1),
        machineId: r.machineId || r.machine?.id || r.machine?.machineId,
        machineIdDisplay: r.machineIdDisplay || r.machine?.machineId,
        cycleTime: r.cycleTime || r.ct || r.cycle_time || undefined,
        setupTime: r.setupTime || r.setup_time || undefined,
        batchSize: r.batchSize || r.batch_size || undefined,
        uptimePercent: r.uptimePercent || r.uptime_percent || undefined,
        wipBefore: r.wipBefore || undefined,
      }));
      setEditingStations(norm);
      // Load rawMaterialUPH from stationsJson if saved there
      const savedRawUPH = stationsData?.rawMaterialUPH;
      setRawMaterialUPH(savedRawUPH);
      // Load operation names from stationsJson if saved there
      const savedOpNames = stationsData?.operationNames || {};
      setOperationNames(savedOpNames);
      // Save initial state for unsaved changes detection
      setInitialVsmState(JSON.stringify({
        name: vsm.name || '',
        description: vsm.description || '',
        status: vsm.status || '',
        stations: norm,
        rawMaterialUPH: savedRawUPH,
        operationNames: savedOpNames,
      }));
    } catch (e) {
      setEditingStations(null);
      setInitialVsmState(null);
      setOperationNames({});
    }
  }, [vsm]);

  // Auto-simulate whenever stations or rawMaterialUPH change
  useEffect(() => {
    if (editingStations && editingStations.length > 0) {
      const metrics = simulateVsm(editingStations, { rawMaterialUPH });
      setEditingMetrics(metrics);
    } else {
      setEditingMetrics(null);
    }
  }, [editingStations, rawMaterialUPH]);

  function onDragStartEdit(e: React.DragEvent, idx: number) {
    setDragIndexEdit(idx);
    try { e.dataTransfer.effectAllowed = 'move'; } catch (e) {}
  }
  function onDropEdit(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (dragIndexEdit === null || !editingStations) return;
    const arr = [...editingStations];
    const [moved] = arr.splice(dragIndexEdit, 1);
    arr.splice(idx, 0, moved);
    setEditingStations(arr);
    setDragIndexEdit(null);
  }
  function onDragOverEdit(e: React.DragEvent) { e.preventDefault(); }
  function moveEditUp(i: number) {
    if (!editingStations) return;
    if (i <= 0) return;
    const arr = [...editingStations];
    const t = arr[i - 1]; arr[i - 1] = arr[i]; arr[i] = t;
    setEditingStations(arr);
  }
  function moveEditDown(i: number) {
    if (!editingStations) return;
    if (i >= editingStations.length - 1) return;
    const arr = [...editingStations];
    const t = arr[i + 1]; arr[i + 1] = arr[i]; arr[i] = t;
    setEditingStations(arr);
  }
  function removeEditStation(id: string) {
    if (!editingStations) return;
    setEditingStations(prev => prev ? prev.filter(s => s.id !== id) : prev);
  }
  function updateEditStation(idx: number, patch: Partial<VsmStation>) {
    if (!editingStations) return;
    const arr = [...editingStations];
    arr[idx] = { ...arr[idx], ...patch };
    setEditingStations(arr);
  }

  async function saveEditedVsm() {
    if (!vsm) return;
    try {
      const payload = {
        name: editingName,
        description: editingDescription,
        status: editingStatus,
        stationsJson: { stations: editingStations || [], rawMaterialUPH, operationNames },
      };
      await apiRequest('PUT', `/api/vsm-configurations/${vsm.id}`, payload);
      queryClient.invalidateQueries({ queryKey: ['/api/vsm-configurations', 'list'] });
      queryClient.invalidateQueries({ queryKey: [`/api/vsm-configurations/${vsm.id}`] });
      // Update initial state to current state so unsaved changes indicator clears
      setInitialVsmState(JSON.stringify({
        name: editingName,
        description: editingDescription,
        status: editingStatus,
        stations: editingStations,
        rawMaterialUPH: rawMaterialUPH,
        operationNames: operationNames,
      }));
    } catch (err) {
      alert('Save failed');
    }
  }

  async function handleDeleteVsm() {
    if (!deleteVsm) return;
    try {
      await apiRequest('DELETE', `/api/vsm-configurations/${deleteVsm.id}`);
      queryClient.invalidateQueries({ queryKey: ['/api/vsm-configurations', 'list'] });
      setDeleteVsm(null);
    } catch (err) {
      alert('Delete failed');
    }
  }

  if (!id) {
    // List view: show saved VSMs and create new
    return (
      <div className="p-6 h-full overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Saved Value Streams</h2>
          <Link href={`/vsm-builder?id=new`}>
            <Button size="sm">Create New VSM</Button>
          </Link>
        </div>

        <div className="grid gap-3">
          {vsmList.length === 0 ? (
            <Card>
              <CardContent>No saved VSMs found.</CardContent>
            </Card>
          ) : (
            vsmList.map((v: any) => (
              <Card key={v.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>{v.name}</CardTitle>
                    <div className="flex gap-2">
                      <Link href={`/vsm-builder?id=${v.id}`}>
                        <Button size="sm">Open</Button>
                      </Link>
                      <Button size="sm" onClick={() => {
                        // export markdown report
                        try {
                          const stationsData = v.stationsJson as any;
                          const stations = Array.isArray(stationsData) ? stationsData : (stationsData?.stations || stationsData || []);
                          const rawUPH = stationsData?.rawMaterialUPH;
                          const opNames = stationsData?.operationNames || {};
                          const md = exportVsmMarkdown(v.name, v.description, stations, rawUPH, opNames);
                          const blob = new Blob([md], { type: 'text/markdown' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `vsm-${v.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.md`;
                          document.body.appendChild(a);
                          a.click();
                          a.remove();
                          URL.revokeObjectURL(url);
                        } catch (err) {
                          alert('Export failed');
                        }
                      }}>Export</Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => setDeleteVsm(v)}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Link href={`/vsm-builder?id=${v.id}`} className="block hover:bg-muted/50 rounded-lg transition-colors cursor-pointer -mx-2 px-2 py-1">
                    <div className="text-xs text-primary mb-1 flex items-center gap-1">
                      <ArrowRight className="h-3 w-3" />
                      Click to view in VSM Builder
                    </div>
                    <div className="text-sm text-muted-foreground mb-2">{v.description}</div>
                    {renderStations(v.stationsJson, machinesById, machinesByMachineId)}
                  </Link>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deleteVsm} onOpenChange={(open) => !open && setDeleteVsm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Value Stream?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete <strong>"{deleteVsm?.name}"</strong>? This action cannot be undone and all configuration data will be permanently removed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteVsm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

    // If creating a new VSM, create a blank one immediately and redirect to it
    if (id === 'new') {
      // Auto-create blank VSM and redirect
      (async () => {
        try {
          const payload = {
            name: 'New VSM',
            description: '',
            status: 'active',
            stationsJson: { stations: [] },
          };
          const created = await apiRequest('POST', '/api/vsm-configurations', payload);
          queryClient.invalidateQueries({ queryKey: ['/api/vsm-configurations', 'list'] });
          // Navigate to the newly created VSM
          const baseUrl = import.meta.env.BASE_URL || '/';
          window.location.href = `${baseUrl}vsm-builder?id=${created.id}`;
        } catch (err) {
          console.error('Failed to create VSM:', err);
        }
      })();

      return (
        <div className="p-6 flex items-center justify-center h-32">
          <div className="text-muted-foreground">Creating new VSM...</div>
        </div>
      );
    }

  return (
    <div className="p-6 h-full overflow-auto">
      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <div className="text-muted-foreground">Loading VSM...</div>
        </div>
      ) : !vsm ? (
        <div className="flex items-center justify-center h-32">
          <div className="text-muted-foreground">VSM not found</div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Header with VSM info and actions */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="flex-1 space-y-3">
                  {/* VSM Name - Inline Editable */}
                  <div className="flex items-center gap-2">
                    {editingField === 'name' ? (
                      <Input 
                        value={editingName} 
                        onChange={e => setEditingName(e.target.value)} 
                        className="text-xl font-bold max-w-md"
                        placeholder="VSM Name"
                        autoFocus
                        onBlur={() => setEditingField(null)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === 'Escape') setEditingField(null);
                        }}
                      />
                    ) : (
                      <h1 
                        className="text-xl font-bold cursor-pointer hover:text-primary transition-colors"
                        onClick={() => setEditingField('name')}
                        title="Click to edit"
                      >
                        {editingName || 'Untitled VSM'}
                      </h1>
                    )}
                  </div>
                  
                  {/* Description - Inline Editable */}
                  {editingField === 'description' ? (
                    <Input 
                      value={editingDescription} 
                      onChange={e => setEditingDescription(e.target.value)} 
                      className="text-sm text-muted-foreground max-w-lg"
                      placeholder="Description"
                      autoFocus
                      onBlur={() => setEditingField(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'Escape') setEditingField(null);
                      }}
                    />
                  ) : (
                    <p 
                      className="text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                      onClick={() => setEditingField('description')}
                      title="Click to edit"
                    >
                      {editingDescription || 'Click to add description...'}
                    </p>
                  )}
                  
                  {/* Status and Raw UPH row */}
                  <div className="flex flex-wrap gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Status:</span>
                      {editingField === 'status' ? (
                        <Input 
                          value={editingStatus} 
                          onChange={e => setEditingStatus(e.target.value)} 
                          className="h-7 w-32 text-sm"
                          placeholder="active"
                          autoFocus
                          onBlur={() => setEditingField(null)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === 'Escape') setEditingField(null);
                          }}
                        />
                      ) : (
                        <span 
                          className="font-medium cursor-pointer hover:text-primary transition-colors"
                          onClick={() => setEditingField('status')}
                          title="Click to edit"
                        >
                          {editingStatus || 'Click to set'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 items-center">
                  {hasUnsavedChanges && (
                    <>
                      <Badge variant="outline" className="text-orange-600 border-orange-600">Unsaved changes</Badge>
                      <Button size="sm" onClick={saveEditedVsm}>Save Changes</Button>
                    </>
                  )}
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => {
                      try {
                        const md = exportVsmMarkdown(editingName, editingDescription, editingStations || [], rawMaterialUPH, operationNames);
                        const blob = new Blob([md], { type: 'text/markdown' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `vsm-${editingName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.md`;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        URL.revokeObjectURL(url);
                      } catch (err) {
                        alert('Export failed');
                      }
                    }}
                  >
                    Export
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost"
                    onClick={() => {
                      if (hasUnsavedChanges) {
                        if (!confirm('You have unsaved changes. Are you sure you want to leave? All changes will be lost.')) {
                          return;
                        }
                      }
                      const baseUrl = import.meta.env.BASE_URL || '/';
                      window.location.href = baseUrl;
                    }}
                  >
                    Back
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* VSM Metrics Summary - positioned prominently at the top */}
          {editingMetrics && (
            <Card className="border-2 border-primary/20">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    📊 VSM Metrics
                    {editingMetrics.isRawMaterialConstrained && (
                      <Badge variant="outline" className="text-blue-600 border-blue-500">Raw Material Constrained</Badge>
                    )}
                  </CardTitle>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <HelpCircle className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-3xl max-h-[90vh]">
                      <DialogHeader>
                        <DialogTitle>VSM Metrics & Manufacturing Theory</DialogTitle>
                        <DialogDescription>Understanding the calculations and principles behind Value Stream Mapping</DialogDescription>
                      </DialogHeader>
                      <ScrollArea className="h-[70vh] pr-4">
                        <div className="space-y-6 text-sm">
                          {/* Theory of Constraints */}
                          <section>
                            <h3 className="text-lg font-semibold text-primary mb-2">🎯 Theory of Constraints (TOC)</h3>
                            <p className="text-muted-foreground mb-2">
                              Developed by Dr. Eliyahu Goldratt, TOC states that every system has at least one constraint (bottleneck) 
                              that limits its output. The system's throughput is determined entirely by this constraint.
                            </p>
                            <div className="bg-muted/50 p-3 rounded-lg mb-2">
                              <p className="font-medium">The Five Focusing Steps:</p>
                              <ol className="list-decimal list-inside space-y-1 mt-2 text-muted-foreground">
                                <li><strong>Identify</strong> the constraint (bottleneck)</li>
                                <li><strong>Exploit</strong> the constraint (maximize its efficiency)</li>
                                <li><strong>Subordinate</strong> everything else to the constraint</li>
                                <li><strong>Elevate</strong> the constraint (add capacity)</li>
                                <li><strong>Repeat</strong> - find the new constraint</li>
                              </ol>
                            </div>
                            <p className="text-muted-foreground">
                              <strong>In this VSM:</strong> The bottleneck is highlighted in orange. Improving non-bottleneck operations 
                              won't increase system throughput - only improving the bottleneck will.
                            </p>
                          </section>

                          {/* Little's Law */}
                          <section>
                            <h3 className="text-lg font-semibold text-primary mb-2">📐 Little's Law</h3>
                            <p className="text-muted-foreground mb-2">
                              A fundamental theorem in queueing theory that relates inventory, throughput, and lead time:
                            </p>
                            <div className="bg-primary/10 p-4 rounded-lg text-center mb-3">
                              <p className="text-lg font-mono font-bold">WIP = Throughput × Lead Time</p>
                              <p className="text-xs text-muted-foreground mt-1">or equivalently: Lead Time = WIP / Throughput</p>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                              <div className="bg-blue-500/10 p-2 rounded">
                                <p className="font-semibold">WIP</p>
                                <p className="text-muted-foreground">Work In Progress - units in the system</p>
                              </div>
                              <div className="bg-green-500/10 p-2 rounded">
                                <p className="font-semibold">Throughput</p>
                                <p className="text-muted-foreground">Rate of output (UPH)</p>
                              </div>
                              <div className="bg-purple-500/10 p-2 rounded">
                                <p className="font-semibold">Lead Time</p>
                                <p className="text-muted-foreground">Time through system</p>
                              </div>
                            </div>
                            <p className="text-muted-foreground">
                              <strong>Key insight:</strong> To reduce lead time, you must either increase throughput or reduce WIP. 
                              High WIP = long lead times = slow response to customers.
                            </p>
                          </section>

                          {/* Metrics Explanations */}
                          <section>
                            <h3 className="text-lg font-semibold text-primary mb-2">📊 Metric Definitions</h3>
                            <div className="space-y-3">
                              <div className="border-l-4 border-green-500 pl-3">
                                <p className="font-semibold">System Throughput (UPH)</p>
                                <p className="text-muted-foreground text-xs">Units Per Hour the entire system can produce. Limited by the bottleneck operation or raw material input rate.</p>
                                <p className="text-xs font-mono bg-muted/50 p-1 rounded mt-1">= MIN(all operation rates, raw material rate)</p>
                              </div>
                              
                              <div className="border-l-4 border-cyan-500 pl-3">
                                <p className="font-semibold">Cell Balance (Line Efficiency)</p>
                                <p className="text-muted-foreground text-xs">How balanced are the cycle times across operations? 100% means all operations have equal work content.</p>
                                <p className="text-xs font-mono bg-muted/50 p-1 rounded mt-1">= (Sum of Cycle Times) / (Total Lead Time) × 100%</p>
                              </div>
                              
                              <div className="border-l-4 border-indigo-500 pl-3">
                                <p className="font-semibold">Average Utilization</p>
                                <p className="text-muted-foreground text-xs">How much of each operation's capacity is being used on average. Lower utilization = spare capacity.</p>
                                <p className="text-xs font-mono bg-muted/50 p-1 rounded mt-1">= Average of (System Throughput / Operation Capacity) × 100%</p>
                              </div>
                              
                              <div className="border-l-4 border-purple-500 pl-3">
                                <p className="font-semibold">Lead Time</p>
                                <p className="text-muted-foreground text-xs">Total time for one unit to flow through all operations (assuming no waiting in queues).</p>
                                <p className="text-xs font-mono bg-muted/50 p-1 rounded mt-1">= Sum of (3600 / Operation Rate) for each operation</p>
                              </div>
                              
                              <div className="border-l-4 border-amber-500 pl-3">
                                <p className="font-semibold">Value-Add Time</p>
                                <p className="text-muted-foreground text-xs">Time spent actually processing/transforming the product. The "useful" work time.</p>
                                <p className="text-xs font-mono bg-muted/50 p-1 rounded mt-1">= Sum of Cycle Times across all operations</p>
                              </div>
                              
                              <div className="border-l-4 border-rose-500 pl-3">
                                <p className="font-semibold">Waiting Time</p>
                                <p className="text-muted-foreground text-xs">Time operations spend idle waiting for parts from slower upstream operations.</p>
                                <p className="text-xs font-mono bg-muted/50 p-1 rounded mt-1">= (System Cycle Time - Operation Cycle Time) per operation</p>
                              </div>
                            </div>
                          </section>

                          {/* Operation Metrics */}
                          <section>
                            <h3 className="text-lg font-semibold text-primary mb-2">⚙️ Operation Calculations</h3>
                            <div className="space-y-2 text-xs">
                              <div className="bg-muted/50 p-2 rounded">
                                <p className="font-medium">Per-Unit Cycle Time</p>
                                <p className="font-mono">= Cycle Time + (Setup Time / Pcs per Setup)</p>
                                <p className="text-muted-foreground mt-1">Cycle Time is per unit. Setup is amortized across the batch.</p>
                              </div>
                              <div className="bg-muted/50 p-2 rounded">
                                <p className="font-medium">Effective Cycle Time (includes uptime)</p>
                                <p className="font-mono">= Per-Unit CT / (Uptime% / 100)</p>
                                <p className="text-muted-foreground mt-1">Accounts for downtime - the "real world" time per unit.</p>
                              </div>
                              <div className="bg-muted/50 p-2 rounded">
                                <p className="font-medium">Operation UPH (single machine)</p>
                                <p className="font-mono">= 3600 / Effective CT</p>
                              </div>
                              <div className="bg-muted/50 p-2 rounded">
                                <p className="font-medium">Step UPH (parallel machines)</p>
                                <p className="font-mono">= Sum of individual machine UPHs</p>
                              </div>
                              <div className="bg-muted/50 p-2 rounded">
                                <p className="font-medium">Operation Utilization</p>
                                <p className="font-mono">= (System Throughput / Operation Capacity) × 100%</p>
                              </div>
                            </div>
                          </section>

                          {/* Tips */}
                          <section>
                            <h3 className="text-lg font-semibold text-primary mb-2">💡 Improvement Tips</h3>
                            <ul className="space-y-2 text-muted-foreground">
                              <li>• <strong>Low Cell Balance?</strong> Operations are imbalanced. Consider rebalancing work content or adding parallel machines at slow operations.</li>
                              <li>• <strong>Low Utilization at some ops?</strong> These have spare capacity. Don't invest here - focus on the bottleneck.</li>
                              <li>• <strong>High WIP?</strong> Per Little's Law, this means long lead times. Reduce batch sizes or improve flow.</li>
                              <li>• <strong>Raw Material Constrained?</strong> Your process can handle more - increase material supply.</li>
                              <li>• <strong>Want higher throughput?</strong> Only improving the bottleneck will help. Everything else is waste.</li>
                            </ul>
                          </section>
                        </div>
                      </ScrollArea>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 text-sm">
                  <div className="p-3 bg-green-500/10 rounded border border-green-500/20">
                    <div className="text-xs text-muted-foreground">System Throughput</div>
                    <div className="text-xl font-bold text-green-600">{Math.round(editingMetrics.systemThroughputUPH).toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">UPH</div>
                    {editingMetrics.isRawMaterialConstrained && (
                      <div className="text-xs text-blue-600 mt-1">⚠ Limited by raw material</div>
                    )}
                  </div>
                  <div className="p-3 bg-cyan-500/10 rounded border border-cyan-500/20">
                    <div className="text-xs text-muted-foreground">Cell Balance</div>
                    <div className="text-xl font-bold text-cyan-600">{editingMetrics.cellBalancePercent.toFixed(1)}%</div>
                    <div className="text-xs text-muted-foreground">line efficiency</div>
                  </div>
                  <div className="p-3 bg-indigo-500/10 rounded border border-indigo-500/20">
                    <div className="text-xs text-muted-foreground">Avg Utilization</div>
                    <div className="text-xl font-bold text-indigo-600">{editingMetrics.avgUtilizationPercent.toFixed(1)}%</div>
                    <div className="text-xs text-muted-foreground">capacity used</div>
                  </div>
                  <div className="p-3 bg-purple-500/10 rounded border border-purple-500/20">
                    <div className="text-xs text-muted-foreground">Lead Time</div>
                    <div className="text-xl font-bold text-purple-600">{editingMetrics.totalLeadTimeSec.toFixed(1)}s</div>
                    <div className="text-xs text-muted-foreground">{(editingMetrics.totalLeadTimeSec / 60).toFixed(2)} min</div>
                  </div>
                  <div className="p-3 bg-amber-500/10 rounded border border-amber-500/20">
                    <div className="text-xs text-muted-foreground">Value-Add Time</div>
                    <div className="text-xl font-bold text-amber-600">{editingMetrics.valueAddTimeSec.toFixed(1)}s</div>
                    <div className="text-xs text-muted-foreground">processing</div>
                  </div>
                  <div className="p-3 bg-rose-500/10 rounded border border-rose-500/20">
                    <div className="text-xs text-muted-foreground">Waiting Time</div>
                    <div className="text-xl font-bold text-rose-600">{editingMetrics.totalWaitingTimeSec.toFixed(1)}s</div>
                    <div className="text-xs text-muted-foreground">idle/starved</div>
                  </div>
                  <div className="p-3 bg-blue-500/10 rounded border border-blue-500/20">
                    <div className="text-xs text-muted-foreground">Total WIP</div>
                    <div className="text-xl font-bold text-blue-600">{editingMetrics.totalWip}</div>
                    <div className="text-xs text-muted-foreground">units in buffer</div>
                  </div>
                  <div className="p-3 bg-orange-500/10 rounded border border-orange-500/20">
                    <div className="text-xs text-muted-foreground">Bottleneck</div>
                    <div className="text-xl font-bold text-orange-600">
                      {editingMetrics.isRawMaterialBottleneck 
                        ? 'Raw Material' 
                        : editingMetrics.bottleneckStep 
                          ? `Op ${editingMetrics.bottleneckStep.step}` 
                          : '-'}
                    </div>
                    {editingMetrics.isRawMaterialBottleneck ? (
                      <div className="text-xs text-muted-foreground">Incoming rate limiting</div>
                    ) : editingMetrics.bottleneckStep && (
                      <div className="text-xs text-muted-foreground truncate" title={editingMetrics.bottleneckStep.stations[0]?.name}>
                        {editingMetrics.bottleneckStep.stations[0]?.name || 'Unknown'}
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Per-Operation Metrics Table */}
                {editingMetrics.steps.length > 0 && (
                  <div className="mt-4">
                    <div className="text-xs font-semibold text-muted-foreground mb-2">Per-Operation Analysis</div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 px-2">Operation</th>
                            <th className="text-right py-2 px-2">Rate (UPH)</th>
                            <th className="text-right py-2 px-2">CT (s)</th>
                            <th className="text-right py-2 px-2">Utilization</th>
                            <th className="text-right py-2 px-2">Wait (s)</th>
                            <th className="text-right py-2 px-2">WIP</th>
                            <th className="text-center py-2 px-2">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {editingMetrics.steps.map(step => {
                            const isBottleneck = editingMetrics.bottleneckStep?.step === step.step;
                            const utilColor = step.avgUtilPercent >= 95 ? 'text-red-600' : step.avgUtilPercent >= 80 ? 'text-amber-600' : 'text-green-600';
                            // Use operation name if set, otherwise use first station name
                            const opDisplayName = operationNames[step.step] || step.stations[0]?.name || '-';
                            return (
                              <tr key={step.step} className={`border-b ${isBottleneck ? 'bg-orange-500/10' : ''}`}>
                                <td className="py-2 px-2 font-medium">
                                  Op {step.step}: {opDisplayName}
                                  {step.machines > 1 && <span className="text-muted-foreground"> ({step.machines}x)</span>}
                                </td>
                                <td className="text-right py-2 px-2">{Math.round(step.combinedRateUPH).toLocaleString()}</td>
                                <td className="text-right py-2 px-2">{step.avgStationCT.toFixed(1)}</td>
                                <td className={`text-right py-2 px-2 font-medium ${utilColor}`}>{step.avgUtilPercent.toFixed(1)}%</td>
                                <td className="text-right py-2 px-2">{step.waitingTimeSec.toFixed(1)}</td>
                                <td className="text-right py-2 px-2">{step.wipBefore || '-'}</td>
                                <td className="text-center py-2 px-2">
                                  {isBottleneck ? (
                                    <Badge variant="outline" className="text-orange-600 border-orange-500 text-[10px]">Constraint</Badge>
                                  ) : step.avgUtilPercent < 70 ? (
                                    <Badge variant="outline" className="text-blue-600 border-blue-500 text-[10px]">Underutilized</Badge>
                                  ) : null}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Visual Process Flow */}
          {editingStations && editingStations.length > 0 && (
            <Card>
              <CardContent className="pt-4">
                <VisualProcessFlow 
                  stations={editingStations} 
                  machinesById={machinesById} 
                  selectedStep={selectedEditStep}
                  setSelectedStep={setSelectedEditStep}
                  updateStation={updateEditStation}
                  removeStation={removeEditStation}
                  metrics={editingMetrics}
                  rawMaterialUPH={rawMaterialUPH}
                  setRawMaterialUPH={setRawMaterialUPH}
                  stepOperationNames={operationNames}
                  setStepOperationName={(step, name) => setOperationNames(prev => ({ ...prev, [step]: name }))}
                />
              </CardContent>
            </Card>
          )}

          {/* WIP Flow Simulation */}
          {editingStations && editingStations.length > 0 && editingMetrics && (
            <WipFlowSimulation 
              metrics={editingMetrics}
              rawMaterialUPH={rawMaterialUPH}
              operationNames={operationNames}
            />
          )}

          {/* Add Machine Section */}
          <Card>
            <Collapsible defaultOpen={false}>
              <CardHeader className="pb-2">
                <CollapsibleTrigger className="flex items-center justify-between w-full">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Factory className="h-4 w-4" />
                    Add Machine to VSM
                    <Badge variant="secondary" className="ml-2">{machines.length} available</Badge>
                  </CardTitle>
                  <ChevronDown className="h-4 w-4" />
                </CollapsibleTrigger>
              </CardHeader>
              <CollapsibleContent>
                <CardContent>
                  <p className="text-xs text-muted-foreground mb-3">Click a machine to add it to your value stream. Values are copied from the machine but changes only affect this VSM.</p>
                  {(() => {
                    const machinesByCell = machines.reduce((acc, machine) => {
                      const cellName = machine.cell || 'Unassigned';
                      if (!acc[cellName]) acc[cellName] = [];
                      acc[cellName].push(machine);
                      return acc;
                    }, {} as Record<string, typeof machines>);
                    const sortedCells = Object.keys(machinesByCell).sort((a, b) => {
                      if (a === 'Unassigned') return 1;
                      if (b === 'Unassigned') return -1;
                      return a.localeCompare(b);
                    });
                    return sortedCells.map(cellName => (
                      <div key={cellName} className="mb-3">
                        <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">{cellName}</Badge>
                          <span className="text-xs">({machinesByCell[cellName].length})</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {machinesByCell[cellName].map((machine) => {
                            const alreadyAdded = editingStations?.some(s => s.machineId === machine.id);
                            const idSuffix = machine.machineId?.slice(-3) || '';
                            return (
                              <Button
                                key={machine.id}
                                onClick={() => {
                                  if (!editingStations) return;
                                  const nextStep = editingStations.length === 0 ? 10 : Math.max(...editingStations.map(s => s.processStep)) + 10;
                                  const newStation: VsmStation = {
                                    id: crypto.randomUUID(),
                                    name: machine.name,
                                    machineId: machine.id,
                                    machineIdDisplay: machine.machineId,
                                    processStep: nextStep,
                                    cycleTime: machine.idealCycleTime || 60,
                                    setupTime: machine.setupTime,
                                    batchSize: machine.batchSize || 1,
                                    uptimePercent: machine.uptimePercent || 100,
                                  };
                                  setEditingStations([...editingStations, newStation]);
                                }}
                                disabled={alreadyAdded}
                                variant={alreadyAdded ? "outline" : "secondary"}
                                size="sm"
                                className="gap-1 text-xs"
                              >
                                <Factory className="h-3 w-3" />
                                <span className="truncate max-w-[100px]">{machine.name}</span>
                                {idSuffix && <Badge variant="outline" className="ml-1 text-xs font-mono">{idSuffix}</Badge>}
                                {alreadyAdded && <Badge variant="secondary" className="ml-1 text-xs">✓</Badge>}
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                    ));
                  })()}
                  <Button
                    onClick={() => {
                      if (!editingStations) return;
                      const nextStep = editingStations.length === 0 ? 10 : Math.max(...editingStations.map(s => s.processStep)) + 10;
                      const newStation: VsmStation = {
                        id: crypto.randomUUID(),
                        name: 'Custom Operation',
                        processStep: nextStep,
                        cycleTime: 60,
                        batchSize: 1,
                        uptimePercent: 100,
                      };
                      setEditingStations([...editingStations, newStation]);
                    }}
                    variant="outline"
                    size="sm"
                    className="mt-3"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Custom Operation
                  </Button>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* Raw JSON toggle */}
          <div className="text-center">
            <button onClick={() => setShowRaw(s => !s)} className="text-xs text-muted-foreground underline">
              {showRaw ? 'Hide' : 'Show'} raw JSON
            </button>
            {showRaw && (
              <pre className="mt-2 max-h-48 overflow-auto text-xs bg-muted/50 p-2 rounded text-left">{JSON.stringify(vsm.stationsJson, null, 2)}</pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
