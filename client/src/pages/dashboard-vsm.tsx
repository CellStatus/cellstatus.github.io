import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { MachineVSMCard } from "@/components/machine-vsm-card";
import { MachineDialog, type MachineSubmitData } from "@/components/machine-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Plus, 
  Search,
  Factory,
  GitBranch,
  ArrowRight,
  TrendingUp,
  Trash2,
  Pencil,
  Check,
  X,
  Cog,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { Machine, MachineStatus, VsmConfiguration } from "@shared/schema";

// Helper function to render stations from VSM config
function renderStations(stationsJson: unknown) {
  if (!stationsJson || !Array.isArray(stationsJson)) return null;
  const stations = stationsJson as Array<{name: string}>;
  return (
    <div className="flex flex-wrap items-center gap-1 py-2">
      {stations.slice(0, 4).map((station, idx) => (
        <div key={idx} className="flex items-center gap-1">
          <Badge variant="outline" className="text-xs">
            {station.name}
          </Badge>
          {idx < Math.min(stations.length, 4) - 1 && (
            <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
          )}
        </div>
      ))}
      {stations.length > 4 && (
        <Badge variant="secondary" className="text-xs">
          +{stations.length - 4} more
        </Badge>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [machineDialogOpen, setMachineDialogOpen] = useState(false);
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingMachineId, setDeletingMachineId] = useState<string | null>(null);
  const [editingVsmStatus, setEditingVsmStatus] = useState<string | null>(null);
  const [editVsmStatusValue, setEditVsmStatusValue] = useState("");
  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set());

  // Fetch machines
  const { data: machines = [], isLoading: machinesLoading } = useQuery<Machine[]>({
    queryKey: ["/api/machines"],
  });

  // Fetch VSM configurations
  const { data: vsmConfigurations = [], isLoading: vsmLoading } = useQuery<VsmConfiguration[]>({
    queryKey: ["/api/vsm-configurations"],
  });

  // Mutations
  const createMachineMutation = useMutation({
    mutationFn: (data: Partial<Machine>) => apiRequest("POST", "/api/machines", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
      setMachineDialogOpen(false);
      toast({ title: "Machine added successfully" });
    },
    onError: () => {
      toast({ title: "Failed to add machine", variant: "destructive" });
    },
  });

  const updateMachineMutation = useMutation({
    mutationFn: (data: Partial<Machine> & { id: string }) => 
      apiRequest("PATCH", `/api/machines/${data.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
      toast({ title: "Machine updated" });
    },
    onError: () => {
      toast({ title: "Failed to update machine", variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: MachineStatus }) =>
      apiRequest("PATCH", `/api/machines/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
    },
  });

  const updateStatusNoteMutation = useMutation({
    mutationFn: ({ id, statusUpdate }: { id: string; statusUpdate: string }) =>
      apiRequest("PATCH", `/api/machines/${id}/status-update`, { statusUpdate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
      toast({ title: "Status note updated" });
    },
    onError: () => {
      toast({ title: "Failed to update status note", variant: "destructive" });
    },
  });

  const deleteMachineMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/machines/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
      setDeleteConfirmOpen(false);
      setDeletingMachineId(null);
      toast({ title: "Machine deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete machine", variant: "destructive" });
    },
  });

  const deleteVsmMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/vsm-configurations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vsm-configurations"] });
      toast({ title: "VSM deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete VSM", variant: "destructive" });
    },
  });

  const updateVsmStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PUT", `/api/vsm-configurations/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vsm-configurations"] });
      setEditingVsmStatus(null);
      toast({ title: "Cell status updated" });
    },
    onError: () => {
      toast({ title: "Failed to update cell status", variant: "destructive" });
    },
  });

  // Filter machines
  const filteredMachines = machines.filter(machine => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      machine.name.toLowerCase().includes(query) ||
      machine.machineId.toLowerCase().includes(query) ||
      (machine.cell && machine.cell.toLowerCase().includes(query))
    );
  });

  // Group machines by cell
  const machinesByCell = useMemo(() => {
    const grouped: Record<string, Machine[]> = {};
    filteredMachines.forEach(machine => {
      const cellName = machine.cell || "Unassigned";
      if (!grouped[cellName]) {
        grouped[cellName] = [];
      }
      grouped[cellName].push(machine);
    });
    // Sort cells alphabetically, but put "Unassigned" at the end
    const sortedKeys = Object.keys(grouped).sort((a, b) => {
      if (a === "Unassigned") return 1;
      if (b === "Unassigned") return -1;
      return a.localeCompare(b);
    });
    return { grouped, sortedKeys };
  }, [filteredMachines]);

  const toggleCell = (cellName: string) => {
    setExpandedCells(prev => {
      const newSet = new Set(prev);
      if (newSet.has(cellName)) {
        newSet.delete(cellName);
      } else {
        newSet.add(cellName);
      }
      return newSet;
    });
  };

  const handleStatusChange = (machineId: string, status: MachineStatus) => {
    updateStatusMutation.mutate({ id: machineId, status });
  };

  const handleStatusNoteChange = (machineId: string, statusUpdate: string) => {
    updateStatusNoteMutation.mutate({ id: machineId, statusUpdate });
  };

  const handleDeleteMachine = (machineId: string) => {
    setDeletingMachineId(machineId);
    setDeleteConfirmOpen(true);
  };

  // Calculate summary stats
  const runningMachines = machines.filter(m => m.status === "running").length;
  const machinesWithCycleTime = machines.filter(m => m.idealCycleTime && m.idealCycleTime > 0).length;

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="border-b bg-card/50 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Factory className="h-10 w-10 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">
                Value Stream Dashboard
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Manage machines and build value stream maps
              </p>
            </div>
          </div>
          <Link href="/vsm-builder">
            <Button className="gap-2">
              <GitBranch className="h-4 w-4" />
              Open VSM Builder
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex-1 p-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid gap-4 grid-cols-1 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Machines
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{machines.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Running
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{runningMachines}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                VSM Ready
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">{machinesWithCycleTime}</div>
              <p className="text-xs text-muted-foreground">with cycle time set</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Saved VSMs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-purple-600">{vsmConfigurations.length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Saved VSM Configurations */}
        {vsmConfigurations.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Saved Value Stream Maps
            </h2>
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {vsmConfigurations.map((vsm) => (
                <Card key={vsm.id} className="hover:shadow-lg transition hover:border-purple-500/50 group">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-xl flex items-center justify-between">
                      <Link href={`/vsm-builder?id=${vsm.id}`} className="flex items-center gap-2 cursor-pointer hover:text-purple-600 transition-colors">
                        <GitBranch className="h-5 w-5 text-purple-500" />
                        {vsm.name}
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          deleteVsmMutation.mutate(vsm.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </CardTitle>
                    {vsm.description && (
                      <p className="text-sm text-muted-foreground">{vsm.description}</p>
                    )}
                    {/* Editable Cell Status - Focal Point */}
                    <div className="mt-3">
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Cell Status</div>
                      {editingVsmStatus === vsm.id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={editVsmStatusValue}
                            onChange={(e) => setEditVsmStatusValue(e.target.value)}
                            placeholder="Enter cell status..."
                            className="h-10 text-base font-semibold"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                updateVsmStatusMutation.mutate({ id: vsm.id, status: editVsmStatusValue });
                              } else if (e.key === 'Escape') {
                                setEditingVsmStatus(null);
                              }
                            }}
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => updateVsmStatusMutation.mutate({ id: vsm.id, status: editVsmStatusValue })}
                          >
                            <Check className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => setEditingVsmStatus(null)}
                          >
                            <X className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </div>
                      ) : (
                        <div 
                          className="text-base font-medium bg-muted/50 rounded-md px-3 py-2 cursor-pointer hover:bg-muted transition-colors flex items-center justify-between group/status min-h-[40px]"
                          onClick={() => {
                            setEditingVsmStatus(vsm.id);
                            setEditVsmStatusValue(vsm.status || '');
                          }}
                        >
                          <span className={vsm.status ? '' : 'text-muted-foreground italic font-normal text-sm'}>
                            {vsm.status || 'Click to set status...'}
                          </span>
                          <Pencil className="h-4 w-4 text-muted-foreground opacity-0 group-hover/status:opacity-100 transition-opacity" />
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <Link href={`/vsm-builder?id=${vsm.id}`} className="cursor-pointer">
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        {vsm.bottleneckRate && (
                          <div className="p-2 bg-muted/50 rounded">
                            <div className="text-xs text-muted-foreground">Throughput</div>
                            <div className="font-bold">{(vsm.bottleneckRate * 3600).toFixed(0)} UPH</div>
                          </div>
                        )}
                        {vsm.processEfficiency && (
                          <div className="p-2 bg-muted/50 rounded">
                            <div className="text-xs text-muted-foreground">Efficiency</div>
                            <div className="font-bold text-green-600">{vsm.processEfficiency.toFixed(0)}%</div>
                          </div>
                        )}
                      </div>
                      {renderStations(vsm.stationsJson)}
                      <div className="text-xs text-muted-foreground text-center pt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        Click to view in VSM Builder
                      </div>
                    </CardContent>
                  </Link>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Machines Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Cog className="h-5 w-5" />
              Machines
            </h2>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search machines or cells..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-64"
                />
              </div>
            </div>
          </div>

          {machinesLoading ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-48" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-24 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredMachines.length === 0 ? (
            <div className="text-center py-12">
              <Cog className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                {searchQuery ? "No machines found" : "No machines yet"}
              </h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery 
                  ? "Try a different search term" 
                  : "Add machines from the Machines page to get started"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {machinesByCell.sortedKeys.map((cellName) => {
                const cellMachines = machinesByCell.grouped[cellName];
                const isExpanded = expandedCells.has(cellName);
                const runningCount = cellMachines.filter(m => m.status === "running").length;
                const downCount = cellMachines.filter(m => m.status === "down").length;
                
                return (
                  <Collapsible key={cellName} open={isExpanded} onOpenChange={() => toggleCell(cellName)}>
                    <Card className="overflow-hidden">
                      <CollapsibleTrigger asChild>
                        <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {isExpanded ? (
                                <ChevronDown className="h-5 w-5 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-5 w-5 text-muted-foreground" />
                              )}
                              <CardTitle className="text-lg flex items-center gap-2">
                                {cellName === "Unassigned" ? (
                                  <span className="text-muted-foreground italic">{cellName}</span>
                                ) : (
                                  cellName
                                )}
                              </CardTitle>
                              <Badge variant="secondary" className="ml-2">
                                {cellMachines.length} machine{cellMachines.length !== 1 ? 's' : ''}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              {runningCount > 0 && (
                                <Badge variant="default" className="bg-green-500 hover:bg-green-600">
                                  {runningCount} running
                                </Badge>
                              )}
                              {downCount > 0 && (
                                <Badge variant="destructive">
                                  {downCount} down
                                </Badge>
                              )}
                            </div>
                          </div>
                        </CardHeader>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <CardContent className="pt-0 pb-4">
                          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {cellMachines.map((machine) => (
                              <MachineVSMCard
                                key={machine.id}
                                machine={machine}
                                onStatusChange={handleStatusChange}
                                onUpdateMachine={(data: { id: string } & Partial<Machine>) => updateMachineMutation.mutate(data)}
                                onStatusNoteChange={handleStatusNoteChange}
                                onDeleteMachine={handleDeleteMachine}
                                isPending={updateMachineMutation.isPending || updateStatusNoteMutation.isPending}
                              />
                            ))}
                          </div>
                        </CardContent>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Machine Dialog */}
      <MachineDialog
        open={machineDialogOpen}
        onOpenChange={setMachineDialogOpen}
        machine={editingMachine}
        onSubmit={(data: MachineSubmitData) => {
          if (editingMachine) {
            updateMachineMutation.mutate({ id: editingMachine.id, ...data });
          } else {
            createMachineMutation.mutate(data);
          }
        }}
        isPending={createMachineMutation.isPending || updateMachineMutation.isPending}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Machine?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the machine
              and remove it from any value stream maps.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingMachineId && deleteMachineMutation.mutate(deletingMachineId)}
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
