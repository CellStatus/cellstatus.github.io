import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AlertTriangle, ChevronDown, ChevronRight, Clock, Plus, Save, Trash2, X } from "lucide-react";

type CellOperation = {
  id: string;
  name: string;
  machineIds?: string[];
};

type Machine = {
  id: string;
  name: string;
  machineId: string;
  cell: string | null;
  status: string;
  idealCycleTime: number | null;
};

type ScrapIncident = {
  id: string;
  machineId: string;
  characteristic: string;
  quantity: number;
  estimatedCost: number;
  status: string;
};

type CellConfiguration = {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
  operationsJson: unknown;
  throughputUph: number | null;
  totalWip: number | null;
  notes: string | null;
};

function parseOperations(value: unknown): CellOperation[] {
  if (!Array.isArray(value)) return [];
  return value.map((item: any, index: number) => ({
    id: item.id || `op-${index}`,
    name: item.name || "",
    machineIds: Array.isArray(item.machineIds)
      ? Array.from(new Set(item.machineIds.filter((id: unknown) => typeof id === "string")))
      : [],
  }));
}

export default function CellsPage() {
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isEditingCell, setIsEditingCell] = useState(false);
  const [cellListOpen, setCellListOpen] = useState(true);
  const [configOpen, setConfigOpen] = useState(true);
  const [name, setName] = useState("New Cell");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("1");
  const [operations, setOperations] = useState<CellOperation[]>([]);
  const [machinePickerByOperation, setMachinePickerByOperation] = useState<Record<string, string>>({});
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const { data: cells = [] } = useQuery<CellConfiguration[]>({
    queryKey: ["/api/cells"],
    queryFn: () => apiRequest("GET", "/api/cells"),
  });

  const { data: allMachines = [] } = useQuery<Machine[]>({
    queryKey: ["/api/machines"],
    queryFn: () => apiRequest("GET", "/api/machines"),
  });

  const { data: allIncidents = [] } = useQuery<ScrapIncident[]>({
    queryKey: ["/api/scrap-incidents"],
    queryFn: () => apiRequest("GET", "/api/scrap-incidents"),
  });

  const selectedCell = cells.find((cell) => cell.id === selectedId) || null;
  const isViewMode = selectedCell !== null && !isEditingCell;

  const sortedCells = useMemo(() => {
    const toCellNumber = (value: string | null) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    return [...cells].sort((left, right) => {
      const leftNumber = toCellNumber(left.status);
      const rightNumber = toCellNumber(right.status);

      if (leftNumber !== null && rightNumber !== null) {
        if (leftNumber !== rightNumber) {
          return leftNumber - rightNumber;
        }

        return (left.name || "").localeCompare(right.name || "", undefined, {
          sensitivity: "base",
        });
      }

      if (leftNumber !== null) return -1;
      if (rightNumber !== null) return 1;

      const statusCompare = (left.status || "").localeCompare(right.status || "", undefined, {
        numeric: true,
        sensitivity: "base",
      });

      if (statusCompare !== 0) {
        return statusCompare;
      }

      return (left.name || "").localeCompare(right.name || "", undefined, {
        sensitivity: "base",
      });
    });
  }, [cells]);

  useEffect(() => {
    const queryIndex = location.indexOf("?");
    if (queryIndex === -1) return;

    const search = new URLSearchParams(location.slice(queryIndex + 1));
    const targetCell = search.get("cell");
    if (!targetCell) return;

    const match = cells.find((cell) => cell.name === targetCell || cell.id === targetCell);
    if (!match || match.id === selectedId) return;

    setSelectedId(match.id);
    setName(match.name || "");
    setDescription(match.description || "");
    setStatus(match.status || "1");
    setOperations(parseOperations(match.operationsJson));
    setMachinePickerByOperation({});
  }, [cells, location, selectedId]);

  const machineById = useMemo(() => {
    const map = new Map<string, Machine>();
    allMachines.forEach((machine) => map.set(machine.id, machine));
    return map;
  }, [allMachines]);

  const assignedMachineIds = useMemo(() => {
    const ids = new Set<string>();
    operations.forEach((operation) => {
      (operation.machineIds ?? []).forEach((machineId) => ids.add(machineId));
    });
    return ids;
  }, [operations]);

  const cellMachines = useMemo(
    () => Array.from(assignedMachineIds).map((id) => machineById.get(id)).filter((machine): machine is Machine => Boolean(machine)),
    [assignedMachineIds, machineById],
  );

  const availableMachines = useMemo(
    () => allMachines.filter((machine) => !assignedMachineIds.has(machine.id)),
    [allMachines, assignedMachineIds],
  );

  const getOperationContributingCycleTimes = (operation: CellOperation): number[] => {
    return (operation.machineIds ?? [])
      .map((machineId) => machineById.get(machineId))
      .filter((machine): machine is Machine => Boolean(machine))
      .filter((machine) => machine.status !== "down")
      .map((machine) => machine.idealCycleTime ?? null)
      .filter((cycleTime): cycleTime is number => typeof cycleTime === "number" && cycleTime > 0);
  };

  const getOperationCycleTimeSec = (operation: CellOperation): number | null => {
    const cycleTimes = getOperationContributingCycleTimes(operation);

    if (cycleTimes.length === 0) return null;

    const combinedRate = cycleTimes.reduce((sum, cycleTime) => sum + 1 / cycleTime, 0);
    if (combinedRate <= 0) return null;

    return 1 / combinedRate;
  };

  const cellMachineIds = useMemo(() => new Set(cellMachines.map((m) => m.id)), [cellMachines]);

  const cellIncidents = useMemo(
    () => allIncidents.filter((i) => cellMachineIds.has(i.machineId)),
    [allIncidents, cellMachineIds],
  );

  const incidentsByMachine = useMemo(() => {
    const map = new Map<string, ScrapIncident[]>();
    cellIncidents.forEach((incident) => {
      const list = map.get(incident.machineId) ?? [];
      list.push(incident);
      map.set(incident.machineId, list);
    });
    return map;
  }, [cellIncidents]);

  const operationCycleTimes = useMemo(() => {
    return operations.map((operation, index) => ({
      operation,
      operationLabel: operation.name || `Operation ${index + 1}`,
      cycleTimeSec: getOperationCycleTimeSec(operation),
    }));
  }, [operations, machineById]);

  const bottleneckOperation = useMemo(() => {
    const withCycle = operationCycleTimes.filter((entry) => entry.cycleTimeSec != null) as Array<{
      operation: CellOperation;
      operationLabel: string;
      cycleTimeSec: number;
    }>;
    if (withCycle.length === 0) return null;
    return withCycle.reduce((longest, entry) => (entry.cycleTimeSec > longest.cycleTimeSec ? entry : longest));
  }, [operationCycleTimes]);

  const bottleneckUph = useMemo(() => {
    const cycleTime = bottleneckOperation?.cycleTimeSec;
    if (cycleTime == null || cycleTime <= 0) return null;
    return 3600 / cycleTime;
  }, [bottleneckOperation]);

  const cellTotalScrapCost = useMemo(
    () => cellIncidents.reduce((sum, i) => sum + i.estimatedCost, 0),
    [cellIncidents],
  );

  const syncMachineCellAssignments = async (targetCellName: string, previousCellName?: string | null) => {
    const updates: Promise<unknown>[] = [];

    allMachines.forEach((machine) => {
      const shouldBeInCell = assignedMachineIds.has(machine.id);
      const isInTargetCell = machine.cell === targetCellName;
      const isInPreviousCell = Boolean(previousCellName && machine.cell === previousCellName);

      if (shouldBeInCell) {
        if (!isInTargetCell) {
          updates.push(apiRequest("PATCH", `/api/machines/${machine.id}`, { cell: targetCellName }));
        }
        return;
      }

      if (isInTargetCell || isInPreviousCell) {
        updates.push(apiRequest("PATCH", `/api/machines/${machine.id}`, { cell: null }));
      }
    });

    if (updates.length > 0) {
      await Promise.all(updates);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const previousCellName = selectedCell?.name;
      const payload = {
        name,
        description,
        status,
        operationsJson: operations,
        throughputUph: null,
        totalWip: null,
        notes: null,
      };

      let saved: CellConfiguration;
      if (selectedId) {
        saved = await apiRequest("PUT", `/api/cells/${selectedId}`, payload);
      } else {
        saved = await apiRequest("POST", "/api/cells", payload);
      }

      await syncMachineCellAssignments(saved.name, previousCellName);
      return saved;
    },
    onSuccess: (saved: CellConfiguration) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cells"] });
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
      setSelectedId(saved.id);
      setIsEditingCell(false);
      toast({ title: "Cell saved" });
    },
    onError: () => toast({ title: "Failed to save cell", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/cells/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cells"] });
      setSelectedId(null);
      setIsEditingCell(false);
      setName("New Cell");
      setDescription("");
      setStatus("1");
      setOperations([]);
      setMachinePickerByOperation({});
      toast({ title: "Cell deleted" });
    },
    onError: () => toast({ title: "Failed to delete cell", variant: "destructive" }),
  });

  const loadCell = (cell: CellConfiguration) => {
    setSelectedId(cell.id);
    setIsEditingCell(false);
    setName(cell.name || "");
    setDescription(cell.description || "");
    setStatus(cell.status || "1");
    setOperations(parseOperations(cell.operationsJson));
    setMachinePickerByOperation({});
  };

  const addOperation = () => {
    setOperations((previous) => [
      ...previous,
      { id: Math.random().toString(36).slice(2), name: "", machineIds: [] },
    ]);
  };

  const updateOperation = (id: string, patch: Partial<CellOperation>) => {
    setOperations((previous) => previous.map((operation) => (operation.id === id ? { ...operation, ...patch } : operation)));
  };

  const removeOperation = (id: string) => {
    setOperations((previous) => previous.filter((operation) => operation.id !== id));
    setMachinePickerByOperation((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
  };

  const addMachineToOperation = (operationId: string, machineId: string) => {
    if (!machineId) return;
    setOperations((previous) =>
      previous.map((operation) => {
        if (operation.id !== operationId) return operation;
        const currentIds = operation.machineIds ?? [];
        if (currentIds.includes(machineId)) return operation;
        return { ...operation, machineIds: [...currentIds, machineId] };
      }),
    );
    setMachinePickerByOperation((previous) => ({ ...previous, [operationId]: "" }));
  };

  const removeMachineFromOperation = (operationId: string, machineId: string) => {
    setOperations((previous) =>
      previous.map((operation) =>
        operation.id === operationId
          ? { ...operation, machineIds: (operation.machineIds ?? []).filter((id) => id !== machineId) }
          : operation,
      ),
    );
  };

  return (
    <div className="p-6 h-full overflow-auto space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader
            className="cursor-pointer"
            onClick={() => setCellListOpen((open) => !open)}
          >
            <div className="flex items-center justify-between">
              <CardTitle>Cells</CardTitle>
              {cellListOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </div>
          </CardHeader>
          {cellListOpen && (
          <CardContent className="space-y-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setSelectedId(null);
                setIsEditingCell(true);
                setName("New Cell");
                setDescription("");
                setStatus("1");
                setOperations([]);
                setMachinePickerByOperation({});
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              New Cell
            </Button>
            {sortedCells.map((cell) => (
              <button
                key={cell.id}
                className={`w-full text-left border rounded p-2 ${selectedId === cell.id ? "border-primary" : "border-border"}`}
                onClick={() => loadCell(cell)}
              >
                <div className="font-medium">{cell.name}</div>
                <div className="text-xs text-muted-foreground">Cell Number: {cell.status || "-"}</div>
              </button>
            ))}
          </CardContent>
          )}
        </Card>

        <div className="lg:col-span-2 space-y-4">
          {selectedCell && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card>
                <CardContent className="pt-4">
                  <div className="text-xs text-muted-foreground">Machines</div>
                  <div className="text-2xl font-bold">{cellMachines.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-xs text-muted-foreground">Scrap Incidents</div>
                  <div className="text-2xl font-bold">{cellIncidents.length}</div>
                  <div className="text-xs text-muted-foreground">
                    {cellIncidents.filter((i) => i.status === "open").length} open
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-xs text-muted-foreground">Total Scrap Cost</div>
                  <div className="text-2xl font-bold">${cellTotalScrapCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Bottleneck
                  </div>
                  {bottleneckOperation ? (
                    <>
                      <div className="text-sm font-semibold truncate">{bottleneckOperation.operationLabel}</div>
                      <div className="text-xs text-muted-foreground">
                        {`${bottleneckOperation.cycleTimeSec.toFixed(1)}s cycle`}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        UPH: {bottleneckUph != null ? bottleneckUph.toLocaleString(undefined, { maximumFractionDigits: 1 }) : "-"}
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-muted-foreground">No machines</div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          <Card>
            <CardHeader className="cursor-pointer select-none" onClick={() => setConfigOpen((open) => !open)}>
              <div className="flex items-center justify-between">
                <CardTitle>Cell Configuration</CardTitle>
                {configOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </div>
            </CardHeader>
            {configOpen && (
            <CardContent className="space-y-3">
              {isViewMode ? (
                <>
                  <div className="grid md:grid-cols-3 gap-3">
                    <div>
                      <Label>Name</Label>
                      <div className="text-sm font-medium mt-1">{name || "-"}</div>
                    </div>
                    <div>
                      <Label>Cell Number</Label>
                      <div className="text-sm font-medium mt-1">{status || "-"}</div>
                    </div>
                    <div>
                      <Label>Description</Label>
                      <div className="text-sm font-medium mt-1">{description || "-"}</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Operations</Label>
                    {operations.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No operations added yet.</div>
                    ) : (
                      operations.map((operation, index) => (
                        <div key={operation.id} className="rounded border p-2">
                          <div className="font-medium">{operation.name || `Operation ${index + 1}`}</div>
                          <div className="text-xs text-muted-foreground">
                            Effective Operation Cycle Time: {(() => {
                              const operationCycleTimeSec = getOperationCycleTimeSec(operation);
                              if (operationCycleTimeSec == null) return "Unavailable (no assigned machine cycle times)";
                              const machineCount = getOperationContributingCycleTimes(operation).length;
                              if (machineCount <= 1) return `${operationCycleTimeSec.toFixed(1)}s`;
                              return `${operationCycleTimeSec.toFixed(1)}s (based on ${machineCount} machines in parallel)`;
                            })()}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={() => setIsEditingCell(true)}>
                      <Save className="h-4 w-4 mr-2" />Edit Cell
                    </Button>
                    {selectedCell && (
                      <Button variant="destructive" onClick={() => setDeleteConfirmOpen(true)}>Delete Cell</Button>
                    )}
                  </div>
                </>
              ) : (
                <>
              <div className="grid md:grid-cols-3 gap-3">
                <div>
                  <Label>Name</Label>
                  <Input value={name} onChange={(event) => setName(event.target.value)} />
                </div>
                <div>
                  <Label>Cell Number</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                  />
                </div>
                <div>
                  <Label>Description</Label>
                  <Input value={description} onChange={(event) => setDescription(event.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Operations</Label>
                  <Button variant="outline" size="sm" onClick={addOperation}>
                    <Plus className="h-4 w-4 mr-1" />Add Operation
                  </Button>
                </div>
                {operations.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No operations added yet.</div>
                ) : (
                  operations.map((operation, index) => (
                    <div key={operation.id} className="grid md:grid-cols-12 gap-2 items-end border rounded p-2">
                      <div className="md:col-span-11">
                        <Label>Operation</Label>
                        <Input
                          value={operation.name}
                          onChange={(event) => updateOperation(operation.id, { name: event.target.value })}
                          placeholder={`Operation ${index + 1}`}
                        />
                      </div>
                      <div className="md:col-span-1 flex justify-end">
                        <Button variant="ghost" size="icon" onClick={() => removeOperation(operation.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="md:col-span-12 space-y-2">
                        <Label>Machines In Operation</Label>
                        <div className="text-xs text-muted-foreground">
                          Effective Operation Cycle Time:{" "}
                          {(() => {
                            const operationCycleTimeSec = getOperationCycleTimeSec(operation);
                            if (operationCycleTimeSec == null) return "Unavailable (no assigned machine cycle times)";
                            const machineCount = getOperationContributingCycleTimes(operation).length;
                            if (machineCount <= 1) return `${operationCycleTimeSec.toFixed(1)}s`;
                            return `${operationCycleTimeSec.toFixed(1)}s (based on ${machineCount} machines in parallel)`;
                          })()}
                        </div>
                        {(operation.machineIds ?? []).length === 0 ? (
                          <div className="text-xs text-muted-foreground">No machines assigned.</div>
                        ) : (
                          <div className="space-y-1">
                            {(operation.machineIds ?? []).map((machineId) => {
                              const machine = machineById.get(machineId);
                              if (!machine) return null;
                              return (
                                <div key={machine.id} className="flex items-center justify-between rounded border p-2">
                                  <div className="flex items-center gap-2">
                                    <button
                                      className="font-medium hover:underline text-left"
                                      onClick={() => setLocation(`/machines?id=${encodeURIComponent(machine.id)}`)}
                                    >
                                      {machine.name}
                                    </button>
                                    <span className="text-xs text-muted-foreground">({machine.machineId})</span>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeMachineFromOperation(operation.id, machine.id)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <div className="flex items-center gap-2">
                          <select
                            className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                            value={machinePickerByOperation[operation.id] || ""}
                            onChange={(event) =>
                              setMachinePickerByOperation((previous) => ({
                                ...previous,
                                [operation.id]: event.target.value,
                              }))
                            }
                          >
                            <option value="">Select machine</option>
                            {availableMachines.map((machine) => (
                              <option key={machine.id} value={machine.id}>
                                {machine.name} ({machine.machineId})
                              </option>
                            ))}
                          </select>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => addMachineToOperation(operation.id, machinePickerByOperation[operation.id] || "")}
                            disabled={!machinePickerByOperation[operation.id]}
                          >
                            <Plus className="h-4 w-4 mr-1" />Assign
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="flex gap-2">
                <Button onClick={() => saveMutation.mutate()}>
                  <Save className="h-4 w-4 mr-2" />Save Cell
                </Button>
                {selectedCell && (
                  <Button variant="destructive" onClick={() => setDeleteConfirmOpen(true)}>Delete Cell</Button>
                )}
              </div>
                </>
              )}
            </CardContent>
            )}
          </Card>

          {selectedCell && (
            <Card>
              <CardHeader>
                <CardTitle>Machines by Operation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {operations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No operations in this cell yet.</p>
                ) : (
                  <div className="space-y-2">
                    {operations.map((operation, index) => {
                      const opMachineIds = operation.machineIds ?? [];
                      const operationCycleTimeSec = getOperationCycleTimeSec(operation);
                      return (
                        <div key={operation.id} className="border rounded p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <div className="font-medium">{operation.name || `Operation ${index + 1}`}</div>
                            {bottleneckOperation?.operation.id === operation.id && (
                              <Badge variant="destructive" className="text-xs">Bottleneck</Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Effective Operation Cycle Time:{" "}
                            {operationCycleTimeSec != null
                              ? (getOperationContributingCycleTimes(operation).length > 1
                                  ? `${operationCycleTimeSec.toFixed(1)}s (based on ${getOperationContributingCycleTimes(operation).length} machines in parallel)`
                                  : `${operationCycleTimeSec.toFixed(1)}s`)
                              : "Unavailable (no assigned machine cycle times)"}
                          </div>
                          {opMachineIds.length === 0 ? (
                            <div className="text-xs text-muted-foreground">No machines assigned.</div>
                          ) : (
                            <div className="space-y-2">
                              {opMachineIds.map((machineId) => {
                                const machine = machineById.get(machineId);
                                if (!machine) return null;
                                const machineIncidents = incidentsByMachine.get(machine.id) ?? [];
                                const characteristics = Array.from(new Set(machineIncidents.map((i) => i.characteristic)));
                                return (
                                  <div key={machine.id} className="rounded border p-2 space-y-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <button
                                        className="font-medium hover:underline text-left"
                                        onClick={() => setLocation(`/machines?id=${encodeURIComponent(machine.id)}`)}
                                      >
                                        {machine.name}
                                      </button>
                                      <span className="text-xs text-muted-foreground">({machine.machineId})</span>
                                      <Badge variant="outline" className="text-xs">{machine.status}</Badge>
                                    </div>
                                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                      <span className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {machine.idealCycleTime != null ? `${machine.idealCycleTime}s cycle` : "No cycle time"}
                                      </span>
                                    </div>
                                    {characteristics.length > 0 && (
                                      <div className="flex flex-wrap gap-1">
                                        {characteristics.map((char) => (
                                          <Badge key={char} variant="secondary" className="text-xs">{char}</Badge>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete cell?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete this cell configuration. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => {
                    if (!selectedCell) return;
                    deleteMutation.mutate(selectedCell.id);
                  }}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

        </div>
      </div>
    </div>
  );
}
