import React, { useState, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useEffect } from 'react';
import { Plus, Trash2, Download, Factory, ArrowRight, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { exportVsmMarkdown } from '@/lib/vsm-export';
import { simulateVsm, type VsmStation } from '@/lib/vsm-sim';

type Machine = { id: string; name: string; machineId?: string; cell?: string };
type Station = { 
  id: string; 
  name: string; 
  processStep: number; 
  machineId?: string; 
  machineIdDisplay?: string;
  cycleTime?: number;
  setupTime?: number;
  batchSize?: number;
  uptimePercent?: number;
};

function getShortId(id?: string) {
  if (!id) return '';
  return id.slice(-3);
}

function groupStationsByStep(stations: Station[]) {
  return stations.reduce((map, s) => {
    const step = s.processStep || 1;
    if (!map.has(step)) map.set(step, [] as Station[]);
    map.get(step)!.push(s);
    return map;
  }, new Map<number, Station[]>());
}

function VsmHeader({
  vsmName,
  setVsmName,
  vsmDescription,
  setVsmDescription,
  vsmStatus,
  setVsmStatus,
  onReset,
  onSave,
}: {
  vsmName: string;
  setVsmName: (v: string) => void;
  vsmDescription: string;
  setVsmDescription: (v: string) => void;
  vsmStatus: string;
  setVsmStatus: (v: string) => void;
  onReset: () => void;
  onSave: () => void;
}) {
  return (
    <Card className="mb-4">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Value Stream Mapper</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onReset}>Reset</Button>
            <Button size="sm" onClick={onSave}><Save className="mr-2 h-4 w-4" /> Save</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label htmlFor="vsm-name">VSM Name</Label>
            <Input id="vsm-name" value={vsmName} onChange={(e) => setVsmName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="vsm-description">Description</Label>
            <Input id="vsm-description" value={vsmDescription} onChange={(e) => setVsmDescription(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="vsm-status">Cell Status</Label>
            <Input id="vsm-status" value={vsmStatus} onChange={(e) => setVsmStatus(e.target.value)} className="mt-1" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function VsmMachineSelector({
  machines,
  stations,
  addMachineToVSM,
  addCustomStation,
  isLoading,
}: {
  machines: Machine[];
  stations: Station[];
  addMachineToVSM: (m: Machine) => void;
  addCustomStation: () => void;
  isLoading: boolean;
}) {
  return (
    <Collapsible open={true} className="mb-4">
      <Card>
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <button className="flex items-center justify-between w-full text-left">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Factory className="h-4 w-4 sm:h-5 sm:w-5" />
                Build Your Value Stream
                <Badge variant="secondary" className="ml-2 text-xs">{machines.length} machines</Badge>
              </CardTitle>
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
                <p className="text-xs sm:text-sm text-muted-foreground mb-4">Select machines or add custom stations.</p>
                {machines.length === 0 ? (
                  <p className="text-xs sm:text-sm text-muted-foreground">No machines found.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {machines.map((m) => {
                      const alreadyAdded = stations.some(s => s.machineId === m.id);
                      return (
                        <Button key={m.id} onClick={() => addMachineToVSM(m)} disabled={alreadyAdded} size="sm">
                          <Factory className="h-3 w-3 mr-2" />
                          {m.name}
                        </Button>
                      );
                    })}
                  </div>
                )}
                <div className="mt-3">
                  <Button variant="outline" size="sm" onClick={addCustomStation}><Plus className="mr-2 h-4 w-4" /> Add Custom Station</Button>
                </div>
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function VsmProcessFlow({
  stations,
  selectedStep,
  setSelectedStep,
  removeStation,
  updateStation,
}: {
  stations: Station[];
  selectedStep: number | null;
  setSelectedStep: (s: number | null) => void;
  removeStation: (id: string) => void;
  updateStation: (id: string, updates: Partial<Station>) => void;
}) {
  const stepGroups = groupStationsByStep(stations);
  const sortedSteps = Array.from(stepGroups.keys()).sort((a, b) => a - b);

  if (stations.length === 0) return null;

  return (
    <Card className="mb-4">
      <CardHeader className="flex items-center justify-between py-3">
        <CardTitle>Process Flow</CardTitle>
        <span className="text-xs text-muted-foreground">Click an op to configure</span>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 mb-4 overflow-x-auto">
          {sortedSteps.map((step, idx) => {
            const inStep = stepGroups.get(step) || [];
            const display = inStep.map(s => s.name + (s.machineIdDisplay ? ` (${getShortId(s.machineIdDisplay)})` : '')).join(', ');
            return (
              <div key={step} className="flex items-center gap-2">
                <Badge onClick={() => setSelectedStep(selectedStep === step ? null : step)} className={`cursor-pointer hover:bg-primary/80 transition-colors ${selectedStep === step ? 'ring-2 ring-primary bg-primary text-primary-foreground' : ''}`}>
                  <span className="mr-1">Op{step}:</span>
                  <span className="font-mono">{display}</span>
                </Badge>
                {idx < sortedSteps.length - 1 && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
              </div>
            );
          })}
        </div>
        {selectedStep !== null && (
          <div className="mt-3 p-4 border rounded-lg bg-muted/30">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold">Op {selectedStep} Configuration</h3>
                <p className="text-xs text-muted-foreground">Configure cycle time, batch size, and uptime for this operation.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedStep(null)}>Close</Button>
            </div>
            <div className="space-y-4">
              {stepGroups.get(selectedStep)?.map(station => (
                <div key={station.id} className="p-3 border rounded bg-background">
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
                      <Label className="text-xs">Station Name</Label>
                      <Input
                        value={station.name}
                        onChange={(e) => updateStation(station.id, { name: e.target.value })}
                        className="mt-1 h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Cycle Time (sec)</Label>
                      <Input
                        type="number"
                        value={station.cycleTime ?? ''}
                        onChange={(e) => updateStation(station.id, { cycleTime: e.target.value ? Number(e.target.value) : undefined })}
                        placeholder="60"
                        className="mt-1 h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Batch Size</Label>
                      <Input
                        type="number"
                        value={station.batchSize ?? ''}
                        onChange={(e) => updateStation(station.id, { batchSize: e.target.value ? Number(e.target.value) : undefined })}
                        placeholder="1"
                        className="mt-1 h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Uptime %</Label>
                      <Input
                        type="number"
                        value={station.uptimePercent ?? ''}
                        onChange={(e) => updateStation(station.id, { uptimePercent: e.target.value ? Number(e.target.value) : undefined })}
                        placeholder="100"
                        className="mt-1 h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Op Step</Label>
                      <Input
                        type="number"
                        value={station.processStep}
                        onChange={(e) => updateStation(station.id, { processStep: Number(e.target.value) || 1 })}
                        className="mt-1 h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Setup Time (sec)</Label>
                      <Input
                        type="number"
                        value={station.setupTime ?? ''}
                        onChange={(e) => updateStation(station.id, { setupTime: e.target.value ? Number(e.target.value) : undefined })}
                        placeholder="0"
                        className="mt-1 h-8 text-sm"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function VsmAnalyser() {
  // read id from URL query string
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams('');
  const vsmId = params.get('id');

  const { data: vsmConfig, isLoading: vsmLoading } = useQuery({
    queryKey: vsmId ? [`/api/vsm-configurations/${vsmId}`] : ['vsm-none'],
    queryFn: async () => {
      if (!vsmId) return null;
      return apiRequest('GET', `/api/vsm-configurations/${vsmId}`);
    },
    enabled: !!vsmId,
  });
  const { data: machines = [], isLoading: machinesLoading } = useQuery<Machine[]>({
    queryKey: ['/api/machines'],
    queryFn: async () => apiRequest('GET', '/api/machines'),
  });
  const [stations, setStations] = useState<Station[]>([]);
  const [vsmName, setVsmName] = useState('');
  const [vsmDescription, setVsmDescription] = useState('');
  const [vsmStatus, setVsmStatus] = useState('');
  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const isLoading = vsmLoading || machinesLoading;

  function addMachineToVSM(m: Machine) {
    setStations(prev => [...prev, { id: Date.now().toString(), name: m.name, processStep: prevMaxStep(prev) + 1, machineId: m.id }]);
  }

  function prevMaxStep(prev: Station[]) {
    if (prev.length === 0) return 0;
    return Math.max(...prev.map(p => p.processStep));
  }

  function addCustomStation() {
    setStations(prev => [...prev, { id: Date.now().toString(), name: 'Custom Station', processStep: prevMaxStep(prev) + 1 }]);
  }

  function removeStation(id: string) {
    setStations(prev => prev.filter(s => s.id !== id));
  }

  function updateStation(id: string, updates: Partial<Station>) {
    setStations(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }

  function reset() {
    setStations([]);
    setVsmName('');
    setVsmDescription('');
    setVsmStatus('');
    setSelectedStep(null);
  }

  // when a VSM config is loaded, initialize the header and stations (only if user hasn't edited stations)
  useEffect(() => {
    if (!vsmConfig) return;
    // set header fields
    if (!vsmName) setVsmName(vsmConfig.name || '');
    if (!vsmDescription) setVsmDescription(vsmConfig.description || '');
    if (!vsmStatus) setVsmStatus(vsmConfig.status || '');
    // initialize stations only when the current stations state is empty
    if (stations.length === 0) {
      try {
        const raw = Array.isArray(vsmConfig.stationsJson) ? vsmConfig.stationsJson as any[] : (vsmConfig.stationsJson && (vsmConfig.stationsJson.stations || vsmConfig.stationsJson.stationsJson)) || vsmConfig.stations || [];
        const normalized = (raw || []).map((r: any, idx: number) => ({
          id: r.id || `s-${idx}`,
          name: r.name || r.opName || r.operationName || (r.machine && r.machine.name) || `Op ${r.processStep || idx + 1}`,
          processStep: r.processStep || (r.step || 1),
          machineId: r.machineId || r.machine?.id || r.machine?.machineId,
          machineIdDisplay: r.machineIdDisplay || r.machine?.machineId,
          cycleTime: r.cycleTime || r.ct || r.cycle_time,
          setupTime: r.setupTime || r.setup_time,
          batchSize: r.batchSize || r.batch_size,
          uptimePercent: r.uptimePercent || r.uptime_percent,
        }));
        setStations(normalized);
      } catch (e) {
        // ignore parsing errors and keep stations empty
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vsmConfig]);

  function exportVSM() {
    try {
      // Get operation names from stationsJson if available
      const operationNames: Record<number, string> = (vsmConfig?.stationsJson as any)?.operationNames || {};
      const rawMaterialUPH: number | undefined = (vsmConfig?.stationsJson as any)?.rawMaterialUPH;
      
      // Convert stations to VsmStation format
      const vsmStations: VsmStation[] = stations.map(s => ({
        id: s.id,
        name: s.name,
        processStep: s.processStep,
        machineId: s.machineId,
        machineIdDisplay: s.machineIdDisplay,
        cycleTime: s.cycleTime,
        setupTime: s.setupTime,
        batchSize: s.batchSize,
        uptimePercent: s.uptimePercent,
      }));
      
      // Generate markdown export
      const markdown = exportVsmMarkdown(
        vsmName || 'VSM',
        vsmDescription,
        vsmStations,
        rawMaterialUPH,
        operationNames
      );
      
      // Create safe filename from VSM name
      const safeName = (vsmName || 'VSM').replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '_');
      const timestamp = new Date().toISOString().slice(0, 10);
      const filename = `${safeName}_${timestamp}.md`;
      
      // Use File System Access API if available to save to Downloads/VSM Reports
      if ('showSaveFilePicker' in window) {
        (async () => {
          try {
            const handle = await (window as any).showSaveFilePicker({
              suggestedName: filename,
              startIn: 'downloads',
              types: [{
                description: 'Markdown Files',
                accept: { 'text/markdown': ['.md'] },
              }],
            });
            const writable = await handle.createWritable();
            await writable.write(markdown);
            await writable.close();
          } catch (e: any) {
            // User cancelled or API not fully supported, fall back to regular download
            if (e.name !== 'AbortError') {
              downloadFile(markdown, filename);
            }
          }
        })();
      } else {
        // Fallback for browsers without File System Access API
        downloadFile(markdown, filename);
      }
    } catch (err) {
      alert('Export failed');
    }
  }

  // Helper function to download file
  function downloadFile(content: string, filename: string) {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // loadedStations is the current stations state (which will be initialized from vsmConfig when available)
  const loadedStations: Station[] = stations;

  const analysis = useMemo(() => {
    if (!vsmConfig && stations.length === 0) return null;
    try {
      return simulateVsm(loadedStations as any);
    } catch (e) {
      return null;
    }
  }, [vsmConfig, loadedStations]);

  return (
    <div className="vsm-page h-full overflow-auto bg-background p-3 sm:p-4">
      <VsmHeader
        vsmName={vsmName}
        setVsmName={setVsmName}
        vsmDescription={vsmDescription}
        setVsmDescription={setVsmDescription}
        vsmStatus={vsmStatus}
        setVsmStatus={setVsmStatus}
        onReset={reset}
        onSave={() => alert('Save not implemented')}
      />

      <VsmMachineSelector machines={machines} stations={stations} addMachineToVSM={addMachineToVSM} addCustomStation={addCustomStation} isLoading={isLoading} />

      <div className="mb-4 flex justify-end gap-2">
        <Button onClick={exportVSM} size="sm"><Download className="mr-2 h-4 w-4" /> Export</Button>
      </div>

      <VsmProcessFlow stations={stations} selectedStep={selectedStep} setSelectedStep={setSelectedStep} removeStation={removeStation} updateStation={updateStation} />
      {/* Analysis preview for saved VSM */}
      {vsmConfig && analysis && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Value Stream Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div 
                  className="p-3 bg-muted/50 rounded cursor-help"
                  title={`System Throughput = Minimum rate across all operations\n= min(${analysis.steps.map(s => s.combinedRateUPH.toFixed(1)).join(', ')}) UPH\n= ${analysis.systemThroughputUPH.toFixed(1)} UPH`}
                >
                  <div className="text-xs text-muted-foreground">System Throughput</div>
                  <div className="text-2xl font-bold">{analysis.systemThroughputUPH.toFixed(1)} UPH</div>
                </div>
                <div 
                  className="p-3 bg-muted/50 rounded cursor-help"
                  title={`Lead Time = Value-Add Time + Waiting Time\n= ${analysis.valueAddTimeSec.toFixed(1)}s + ${analysis.totalWaitingTimeSec.toFixed(1)}s\n= ${analysis.totalLeadTimeSec.toFixed(1)}s\n\nTotal time for one unit to flow through.`}
                >
                  <div className="text-xs text-muted-foreground">Total Lead Time</div>
                  <div className="text-2xl font-bold">{analysis.totalLeadTimeSec.toFixed(1)} sec</div>
                </div>
                <div 
                  className="p-3 bg-muted/50 rounded cursor-help"
                  title={`Process Efficiency = Value-Add Time / Lead Time × 100%\n= ${analysis.valueAddTimeSec.toFixed(1)}s / ${analysis.totalLeadTimeSec.toFixed(1)}s × 100%\n= ${analysis.processEfficiencyPercent.toFixed(1)}%\n\nMeasures how balanced the line is.`}
                >
                  <div className="text-xs text-muted-foreground">Process Efficiency</div>
                  <div className="text-2xl font-bold">{analysis.processEfficiencyPercent.toFixed(0)}%</div>
                </div>
              </div>

              <div>
                {analysis.steps.map(step => (
                  <Card key={step.step} className="mb-2">
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium">Op {step.step} — {step.stations.map(s=>s.name).join(', ')}</div>
                          <div 
                            className="text-xs text-muted-foreground cursor-help"
                            title={`Eff CT = 3600 / Combined UPH\n= 3600 / ${step.combinedRateUPH.toFixed(2)}\n= ${step.effectiveCTsec.toFixed(2)}s\n\nWith ${step.machines} parallel machine(s), effective CT is reduced.`}
                          >
                            {step.machines} machines • Eff CT: {step.effectiveCTsec.toFixed(1)}s
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm">Comb Rate: <span className="font-bold">{step.combinedRateUPH.toFixed(1)} UPH</span></div>
                          <div className="text-xs">Per Machine (Avg): {(analysis.systemThroughputUPH / Math.max(1, step.machines)).toFixed(1)} UPH</div>
                          <div 
                            className="text-xs cursor-help"
                            title={`Utilization = System Throughput / Op Capacity × 100%\n= ${analysis.systemThroughputUPH.toFixed(2)} / ${step.combinedRateUPH.toFixed(2)} × 100%\n= ${step.avgUtilPercent.toFixed(1)}%`}
                          >
                            Util: {step.avgUtilPercent.toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div>
                <h4 className="font-semibold">Key Insights</h4>
                <ul className="list-disc pl-5 text-sm">
                  {analysis.bottleneckStep && (
                    <li>Op {analysis.bottleneckStep.step} is your constraint - limiting output to {analysis.systemThroughputUPH.toFixed(1)} UPH</li>
                  )}
                  <li>To increase throughput: add parallel machines at the bottleneck or reduce individual cycle times.</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}