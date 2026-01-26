import React, { useState, useRef } from 'react';
import { Plus, Trash2, Download, Factory, ArrowRight, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { exportVsmText } from '@/lib/vsm-export';
import { simulateVsm } from '@/lib/vsm-sim';

type Machine = { id: string; name: string; machineId?: string; cell?: string };
type Station = { id: string; name: string; processStep: number; machineId?: string; machineIdDisplay?: string };

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
}: {
  stations: Station[];
  selectedStep: number | null;
  setSelectedStep: (s: number | null) => void;
  removeStation: (id: string) => void;
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
                <Badge onClick={() => setSelectedStep(selectedStep === step ? null : step)} className={`cursor-pointer ${selectedStep === step ? 'ring-2 ring-primary' : ''}`}>
                  <span className="text-muted-foreground mr-1">Op{step}:</span>
                  <span className="font-mono">{display}</span>
                </Badge>
                {idx < sortedSteps.length - 1 && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
              </div>
            );
          })}
        </div>
        {selectedStep !== null && (
          <div className="mt-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Op {selectedStep} Configuration</h3>
                <p className="text-xs text-muted-foreground">Changes here are for VSM analysis only.</p>
              </div>
              <div>
                {stepGroups.get(selectedStep)?.map(s => (
                  <Button key={s.id} variant="outline" size="sm" onClick={() => removeStation(s.id)} className="ml-2"><Trash2 className="h-4 w-4" /></Button>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function VsmAnalyser() {
  const [machines] = useState<Machine[]>([]); // TODO: load from API
  const [stations, setStations] = useState<Station[]>([]);
  const [vsmName, setVsmName] = useState('');
  const [vsmDescription, setVsmDescription] = useState('');
  const [vsmStatus, setVsmStatus] = useState('');
  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const [isLoading] = useState(false);

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

  function reset() {
    setStations([]);
    setVsmName('');
    setVsmDescription('');
    setVsmStatus('');
    setSelectedStep(null);
  }

  function exportVSM() {
    try {
      const txt = exportVsmText(vsmName || 'VSM', vsmDescription, stations);
      const blob = new Blob([txt], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vsm-${Date.now()}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      // fallback
      alert('Export failed');
    }
  }

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

      <VsmProcessFlow stations={stations} selectedStep={selectedStep} setSelectedStep={setSelectedStep} removeStation={removeStation} />
    </div>
  );
}