import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
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
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronUp, Calculator } from "lucide-react";
import type { Machine, ScrapIncident, Characteristic, Part } from "@shared/schema";

type IncidentForm = {
  machineId: string;
  partId: string | null;
  characteristic: string;
  quantity: string;
  estimatedCost: string;
  note: string;
  status: "open" | "closed";
  dateCreated: string;
  dateClosed: string;
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const emptyForm: IncidentForm = {
  machineId: "",
  partId: null,
  characteristic: "",
  quantity: "1",
  estimatedCost: "",
  note: "",
  status: "open",
  dateCreated: todayIso(),
  dateClosed: "",
};

export default function SpcData() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterMachineId, setFilterMachineId] = useState<string | null>(null);
  const [filterCellName, setFilterCellName] = useState<string | null>(null);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<IncidentForm>(emptyForm);
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingIncidentId, setDeletingIncidentId] = useState<string | null>(null);
  const [pendingOpenIncidentId, setPendingOpenIncidentId] = useState<string | null>(null);

  const { data: machines = [] } = useQuery<Machine[]>({
    queryKey: ["/api/machines"],
    queryFn: async () => apiRequest("GET", "/api/machines"),
  });

  const { data: incidents = [], isLoading: incidentsLoading } = useQuery<ScrapIncident[]>({
    queryKey: ["/api/scrap-incidents"],
    queryFn: async () => apiRequest("GET", "/api/scrap-incidents"),
  });

  const { data: characteristics = [] } = useQuery<Characteristic[]>({
    queryKey: ["/api/characteristics"],
    queryFn: async () => apiRequest("GET", "/api/characteristics"),
  });

  const { data: parts = [] } = useQuery<Part[]>({
    queryKey: ["/api/parts"],
    queryFn: async () => apiRequest("GET", "/api/parts"),
  });

  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      const machineId = u.searchParams.get("machineId");
      const cell = u.searchParams.get("cell");
      const char = u.searchParams.get("char");
      const incidentId = u.searchParams.get("incidentId");
      if (machineId) {
        setForm((prev) => ({ ...prev, machineId }));
        setFilterMachineId(machineId);
      }
      if (cell) {
        setFilterCellName(cell);
      }
      if (char) setSearch(char);
      if (incidentId) setPendingOpenIncidentId(incidentId);
    } catch {
      // ignore URL parsing errors
    }
  }, []);

  useEffect(() => {
    if (!pendingOpenIncidentId || incidents.length === 0) return;
    const target = incidents.find((i) => i.id === pendingOpenIncidentId);
    if (target) {
      setPendingOpenIncidentId(null);
      openIncident(target);
    }
  // openIncident is stable (defined in render scope) — incidents is the real dependency
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidents, pendingOpenIncidentId]);

  const machineById = useMemo(() => {
    const map = new Map<string, Machine>();
    machines.forEach((machine) => map.set(machine.id, machine));
    return map;
  }, [machines]);

  const partById = useMemo(() => {
    const map = new Map<string, Part>();
    parts.forEach((p) => map.set(p.id, p));
    return map;
  }, [parts]);

  const filteredCharacteristics = useMemo(() => {
    if (!form.partId) return [];
    return characteristics.filter((char) => char.partId === form.partId);
  }, [characteristics, form.partId]);

  const rows = useMemo(() => {
    return incidents
      .filter((incident) => {
        if (filterMachineId && incident.machineId !== filterMachineId) return false;
        if (filterCellName) {
          const machineCell = machineById.get(incident.machineId)?.cell || "Unassigned";
          if (machineCell !== filterCellName) return false;
        }
        if (!search.trim()) return true;
        const machineLabel = machineById.get(incident.machineId)?.machineId || machineById.get(incident.machineId)?.name || "";
        const needle = search.toLowerCase();
        const partNumber = incident.partId ? partById.get(incident.partId)?.partNumber || "" : "";
        return [partNumber, incident.characteristic, machineLabel, incident.status]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      })
      .sort((left, right) => {
        const createdDate = (incident: typeof left) => incident.dateCreated || incident.createdAt || "";
        return createdDate(right).localeCompare(createdDate(left));
      });
  }, [incidents, machineById, partById, search, filterMachineId, filterCellName]);

  const characteristicLabel = (char: Characteristic) =>
    char.charName ? `${char.charNumber} – ${char.charName}` : char.charNumber;

  const characteristicByLabel = useMemo(() => {
    const map = new Map<string, Characteristic>();
    characteristics.forEach((char) => {
      map.set(characteristicLabel(char), char);
    });
    return map;
  }, [characteristics]);

  const selectedPart = form.partId ? partById.get(form.partId) : undefined;

  const createMutation = useMutation({
    mutationFn: (payload: IncidentForm) =>
      apiRequest("POST", "/api/scrap-incidents", {
        machineId: payload.machineId,
        partId: payload.partId,
        characteristic: payload.characteristic.trim(),
        quantity: Number(payload.quantity),
        estimatedCost: Number(payload.estimatedCost),
        note: payload.note.trim() || null,
        status: payload.status,
        dateCreated: payload.dateCreated || null,
        dateClosed: payload.dateClosed || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scrap-incidents"] });
      setForm(emptyForm);
      setSelectedIncidentId(null);
      toast({ title: "Scrap incident created" });
    },
    onError: () => {
      toast({ title: "Failed to create scrap incident", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: IncidentForm }) =>
      apiRequest("PATCH", `/api/scrap-incidents/${id}`, {
        machineId: payload.machineId,
        partId: payload.partId,
        characteristic: payload.characteristic.trim(),
        quantity: Number(payload.quantity),
        estimatedCost: Number(payload.estimatedCost),
        note: payload.note.trim() || null,
        status: payload.status,
        dateCreated: payload.dateCreated || null,
        dateClosed: payload.dateClosed || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scrap-incidents"] });
      setSelectedIncidentId(editingId);
      setEditingId(null);
      toast({ title: "Scrap incident updated" });
    },
    onError: () => {
      toast({ title: "Failed to update scrap incident", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/scrap-incidents/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scrap-incidents"] });
      toast({ title: "Scrap incident deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete scrap incident", variant: "destructive" });
    },
  });

  const onSubmit = async () => {
    if (!form.machineId || !form.partId || !form.characteristic.trim() || !form.quantity.trim() || !form.estimatedCost.trim()) {
      toast({
        title: "Missing required fields",
        description: "Machine, part number, characteristic, quantity, and estimated cost are required.",
        variant: "destructive",
      });
      return;
    }

    if (Number(form.quantity) <= 0 || Number(form.estimatedCost) < 0) {
      toast({
        title: "Invalid values",
        description: "Quantity must be > 0 and estimated cost must be ≥ 0.",
        variant: "destructive",
      });
      return;
    }

    if (form.dateCreated && form.dateClosed && form.dateClosed < form.dateCreated) {
      toast({
        title: "Invalid dates",
        description: "Date Closed cannot be before Date Created.",
        variant: "destructive",
      });
      return;
    }

    if (editingId) {
      await updateMutation.mutateAsync({ id: editingId, payload: form });
      return;
    }

    await createMutation.mutateAsync(form);
  };

  const loadIncidentIntoForm = (incident: ScrapIncident) => {
    setForm({
      machineId: incident.machineId,
      partId: incident.partId,
      characteristic: incident.characteristic,
      quantity: String(incident.quantity),
      estimatedCost: String(incident.estimatedCost),
      note: incident.note || "",
      status: incident.status,
      dateCreated: incident.dateCreated || "",
      dateClosed: incident.dateClosed || "",
    });
  };

  const openIncident = (incident: ScrapIncident) => {
    setSelectedIncidentId(incident.id);
    setEditingId(null);
    setFormOpen(true);
    loadIncidentIntoForm(incident);
  };

  const startEdit = (incident: ScrapIncident) => {
    setSelectedIncidentId(incident.id);
    setEditingId(incident.id);
    setFormOpen(true);
    loadIncidentIntoForm(incident);
  };

  const isViewMode = selectedIncidentId !== null && editingId === null;

  const toggleNote = (id: string) => {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const clearFilters = () => {
    setFilterMachineId(null);
    setFilterCellName(null);
    try {
      window.history.replaceState({}, "", "/spc-data");
    } catch {
      // ignore
    }
  };

  return (
    <div className="p-6 h-full overflow-y-auto space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Scrap Incidents</h2>
        <p className="text-sm text-muted-foreground">Track incidents by machine, characteristic, quantity, and estimated cost.</p>
        {(filterMachineId || filterCellName) && (
          <div className="text-sm text-muted-foreground mt-1">
            {filterMachineId && (
              <span>
                Filtering by machine: {machineById.get(filterMachineId)?.name || filterMachineId}
              </span>
            )}
            {filterMachineId && filterCellName && <span className="mx-2">|</span>}
            {filterCellName && <span>Filtering by cell: {filterCellName}</span>}
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
            >
              Clear
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader
          className="cursor-pointer select-none"
          onClick={() => {
            if (!editingId && !selectedIncidentId) setFormOpen((o) => !o);
          }}
        >
          <div className="flex items-center justify-between">
            <CardTitle>{editingId ? "Edit Scrap Incident" : selectedIncidentId ? "View Scrap Incident" : "New Scrap Incident"}</CardTitle>
            {!editingId && !selectedIncidentId && (formOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
          </div>
        </CardHeader>
        {(formOpen || selectedIncidentId || editingId) && (
        <CardContent className="space-y-3">
          {isViewMode ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">Machine</div>
                  <div className="text-sm font-medium">{machineById.get(form.machineId)?.name || machineById.get(form.machineId)?.machineId || "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Part Number</div>
                  <div className="text-sm font-medium">{form.partId ? (partById.get(form.partId)?.partName ? `${partById.get(form.partId)?.partNumber} - ${partById.get(form.partId)?.partName}` : (partById.get(form.partId)?.partNumber || "-")) : "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Characteristic</div>
                  <div className="text-sm font-medium">{form.characteristic || "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Quantity</div>
                  <div className="text-sm font-medium">{form.quantity || "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Estimated Cost</div>
                  <div className="text-sm font-medium">{form.estimatedCost ? `$${Number(form.estimatedCost).toLocaleString()}` : "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Status</div>
                  <div className="text-sm font-medium capitalize">{form.status}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Date Created</div>
                  <div className="text-sm font-medium">{form.dateCreated || "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Date Closed</div>
                  <div className="text-sm font-medium">{form.dateClosed || "-"}</div>
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Note</div>
                <div className="text-sm whitespace-pre-wrap">{form.note || "-"}</div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    const incident = rows.find((row) => row.id === selectedIncidentId);
                    if (!incident) return;
                    startEdit(incident);
                  }}
                >
                  Edit
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingId(null);
                    setSelectedIncidentId(null);
                    setFormOpen(false);
                    setForm(emptyForm);
                  }}
                >
                  Close
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                <Select value={form.machineId} onValueChange={(value) => setForm((prev) => ({ ...prev, machineId: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Machine *" />
                  </SelectTrigger>
                  <SelectContent>
                    {machines.map((machine) => (
                      <SelectItem key={machine.id} value={machine.id}>
                        {machine.name} ({machine.machineId})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={form.partId ?? undefined}
                  onValueChange={(value) => {
                    setForm((prev) => {
                      const nextPartId = value;
                      const nextCharacteristic = prev.characteristic
                        && characteristicByLabel.get(prev.characteristic)?.partId === nextPartId
                        ? prev.characteristic
                        : "";
                      return {
                        ...prev,
                        partId: nextPartId,
                        characteristic: nextCharacteristic,
                      };
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Part Number *" />
                  </SelectTrigger>
                  <SelectContent>
                    {parts.map((part) => (
                      <SelectItem key={part.id} value={part.id}>
                        {part.partName ? `${part.partNumber} - ${part.partName}` : part.partNumber}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={form.characteristic}
                  onValueChange={(value) => {
                    setForm((prev) => ({
                      ...prev,
                      characteristic: value,
                    }));
                  }}
                  disabled={!form.partId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Characteristic *" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredCharacteristics.map((char) => (
                      <SelectItem key={char.id} value={characteristicLabel(char)}>
                        {characteristicLabel(char)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={1}
                  placeholder="Quantity *"
                  value={form.quantity}
                  onChange={(e) => setForm((prev) => ({ ...prev, quantity: e.target.value }))}
                />
                <div className="flex gap-1 items-center">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="Estimated Cost *"
                    value={form.estimatedCost}
                    onChange={(e) => setForm((prev) => ({ ...prev, estimatedCost: e.target.value }))}
                  />
                  {(() => {
                    const canCalc = selectedPart?.rawMaterialCost != null;
                    return canCalc ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        title={`Calculate: $${selectedPart!.rawMaterialCost} × qty`}
                        onClick={() => {
                          const qty = Number(form.quantity) || 1;
                          setForm((prev) => ({
                            ...prev,
                            estimatedCost: String((selectedPart!.rawMaterialCost! * qty).toFixed(2)),
                          }));
                        }}
                      >
                        <Calculator className="h-4 w-4" />
                      </Button>
                    ) : null;
                  })()}
                </div>
                <Select value={form.status} onValueChange={(value: "open" | "closed") => setForm((prev) => ({ ...prev, status: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium mb-1 block">Date Created</label>
                  <Input
                    type="date"
                    value={form.dateCreated}
                    onChange={(e) => setForm((prev) => ({ ...prev, dateCreated: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Date Closed</label>
                  <Input
                    type="date"
                    value={form.dateClosed}
                    onChange={(e) => setForm((prev) => ({ ...prev, dateClosed: e.target.value }))}
                  />
                </div>
              </div>
              <Textarea
                placeholder="Note"
                value={form.note}
                onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
                rows={3}
              />
              <div className="flex items-center gap-2">
                <Button onClick={onSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingId ? "Save Changes" : "Add Incident"}
                </Button>
                {(editingId || selectedIncidentId) && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditingId(null);
                      setSelectedIncidentId(null);
                      setFormOpen(false);
                      setForm(emptyForm);
                    }}
                  >
                    {editingId ? "Cancel" : "Close"}
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CardTitle>Incident Log</CardTitle>
              {search.trim() && (
                <span className="text-xs text-muted-foreground">Showing {rows.length} of {incidents.length}</span>
              )}
            </div>
            <Input
              className="max-w-sm"
              placeholder="Search by part, machine, characteristic, status..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {incidentsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground">No scrap incidents recorded.</div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="text-left p-2">Machine</th>
                    <th className="text-left p-2">Part Number</th>
                    <th className="text-left p-2">Characteristic</th>
                    <th className="text-left p-2">Quantity</th>
                    <th className="text-left p-2">Estimated Cost</th>
                    <th className="text-left p-2">Note</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Date Created</th>
                    <th className="text-left p-2">Date Closed</th>
                    <th className="text-right p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const note = row.note || "";
                    const isExpanded = expandedNotes.has(row.id);
                    const shortNote = note.length > 60 ? `${note.slice(0, 60)}...` : note;
                    return (
                    <tr key={row.id} className="border-t cursor-pointer hover:bg-muted/40" onClick={() => openIncident(row)}>
                      <td className="p-2">{machineById.get(row.machineId)?.machineId || row.machineId}</td>
                      <td className="p-2">{row.partId ? (partById.get(row.partId)?.partNumber || <span className="text-xs text-muted-foreground">-</span>) : <span className="text-xs text-muted-foreground">-</span>}</td>
                      <td className="p-2">{row.characteristic}</td>
                      <td className="p-2">{row.quantity}</td>
                      <td className="p-2">${row.estimatedCost.toLocaleString()}</td>
                      <td className="p-2 max-w-[280px]">
                        {note ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleNote(row.id);
                            }}
                            className="text-left text-xs text-muted-foreground hover:text-foreground"
                          >
                            {isExpanded ? note : shortNote}
                            {note.length > 60 ? (
                              <span className="ml-1 underline">{isExpanded ? "show less" : "show more"}</span>
                            ) : null}
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="p-2 capitalize">{row.status}</td>
                      <td className="p-2">{row.dateCreated || <span className="text-xs text-muted-foreground">-</span>}</td>
                      <td className="p-2">{row.dateClosed || <span className="text-xs text-muted-foreground">-</span>}</td>
                      <td className="p-2 text-right">
                        <div className="inline-flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(event) => {
                              event.stopPropagation();
                              startEdit(row);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={(event) => {
                              event.stopPropagation();
                              setDeletingIncidentId(row.id);
                              setDeleteConfirmOpen(true);
                            }}
                            disabled={deleteMutation.isPending}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Scrap Incident</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this scrap incident? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingIncidentId) deleteMutation.mutate(deletingIncidentId);
                setDeleteConfirmOpen(false);
                setDeletingIncidentId(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
