import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MachineStatusCard } from "@/components/machine-status-card";
import { MachineDialog } from "@/components/machine-dialog";
import { MaintenanceDialog } from "@/components/maintenance-dialog";
import { AssignOperatorDialog } from "@/components/assign-operator-dialog";
import { DowntimeDialog } from "@/components/downtime-dialog";
import { ResolveDowntimeDialog } from "@/components/resolve-downtime-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { 
  Plus, 
  Play, 
  Pause, 
  Wrench, 
  AlertTriangle, 
  Settings2,
  TrendingUp,
  Target,
  Clock,
  Search,
} from "lucide-react";
import type { Machine, Operator, MachineStatus, ProductionStat, DowntimeLog } from "@shared/schema";
import { calculateOEEStats } from "@/lib/oeeUtils";

export default function Dashboard() {
  const { toast } = useToast();
  const [machineDialogOpen, setMachineDialogOpen] = useState(false);
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null);
  const [maintenanceDialogOpen, setMaintenanceDialogOpen] = useState(false);
  const [maintenanceMachineId, setMaintenanceMachineId] = useState<string | undefined>();
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assigningMachine, setAssigningMachine] = useState<Machine | null>(null);
  const [selectedShift, setSelectedShift] = useState<string>("Day");
  const [downtimeDialogOpen, setDowntimeDialogOpen] = useState(false);
  const [downtimeMachineId, setDowntimeMachineId] = useState<string | undefined>();
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [resolvingDowntime, setResolvingDowntime] = useState<DowntimeLog | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");

  const { data: machines = [], isLoading: machinesLoading } = useQuery<Machine[]>({
    queryKey: ["/api/machines"],
  });

  const { data: operators = [] } = useQuery<Operator[]>({
    queryKey: ["/api/operators"],
  });

  const { data: productionStats = [] } = useQuery<ProductionStat[]>({
    queryKey: ["/api/production-stats"],
    staleTime: 0,
  });

  const { data: activeDowntime = [] } = useQuery<DowntimeLog[]>({
    queryKey: ["/api/downtime/active"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: downtimeLogs = [] } = useQuery<DowntimeLog[]>({
    queryKey: ["/api/downtime"],
  });

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
    mutationFn: ({ id, ...data }: Partial<Machine> & { id: string }) => 
      apiRequest("PATCH", `/api/machines/${id}`, data).then(res => res.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
      setMachineDialogOpen(false);
      setEditingMachine(null);
      toast({ title: "Machine updated successfully" });
    },
    onError: (error: any) => {
      console.error("Update error:", error);
      toast({ title: "Failed to update machine", description: error.message, variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: MachineStatus }) =>
      apiRequest("PATCH", `/api/machines/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
    },
    onError: () => {
      toast({ title: "Failed to update status", variant: "destructive" });
    },
  });

  const assignOperatorMutation = useMutation({
    mutationFn: ({ machineId, operatorId }: { machineId: string; operatorId: string | null }) =>
      apiRequest("PATCH", `/api/machines/${machineId}/operator`, { operatorId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
      setAssignDialogOpen(false);
      setAssigningMachine(null);
      toast({ title: "Operator assignment updated" });
    },
    onError: () => {
      toast({ title: "Failed to assign operator", variant: "destructive" });
    },
  });

  const updateStatusUpdateMutation = useMutation({
    mutationFn: ({ machineId, statusUpdate }: { machineId: string; statusUpdate: string }) =>
      apiRequest("PATCH", `/api/machines/${machineId}/status-update`, { statusUpdate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
      toast({ title: "Status update saved" });
    },
    onError: () => {
      toast({ title: "Failed to save status update", variant: "destructive" });
    },
  });

  const submitProductionStatMutation = useMutation({
    mutationFn: (data: { 
      machineId: string; 
      shift: string; 
      date: string; 
      unitsProduced: number; 
      targetUnits: number; 
      efficiency: number | null;
    }) => apiRequest("POST", "/api/production-stats", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/production-stats"] });
      // Ensure reports reflect today's submission immediately
      queryClient.invalidateQueries({ queryKey: ["/api/reports/efficiency"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/machine-history"] });
      toast({ title: "Production stats submitted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to submit production stats", variant: "destructive" });
    },
  });

  const deleteProductionStatsMutation = useMutation({
    mutationFn: async ({ machineId, date, shift }: { machineId: string; date: string; shift?: string }) => {
      // Single bulk delete request to avoid rate limits
      const url = `/api/production-stats/by-date?machineId=${encodeURIComponent(machineId)}&date=${encodeURIComponent(date)}${shift ? `&shift=${encodeURIComponent(shift)}` : ""}`;
      await apiRequest("DELETE", url);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/production-stats"] });
      // Ensure reports reflect deletion immediately
      queryClient.invalidateQueries({ queryKey: ["/api/reports/efficiency"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/machine-history"] });
      toast({ title: "Production stats deleted successfully" });
    },
    onError: (error) => {
      console.error("Delete stats error:", error);
      toast({ title: "Failed to delete production stats", variant: "destructive" });
    },
  });

  // Fallback: delete by specific stat id if bulk delete fails on some setups
  const deleteProductionStatById = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/production-stats/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/production-stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/efficiency"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/machine-history"] });
      toast({ title: "Production stat deleted" });
    },
    onError: (error) => {
      console.error("Delete stat by id error:", error);
      toast({ title: "Failed to delete production stat", variant: "destructive" });
    },
  });

  const createMaintenanceMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/maintenance", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
      setMaintenanceDialogOpen(false);
      setMaintenanceMachineId(undefined);
      toast({ title: "Maintenance logged successfully" });
    },
    onError: () => {
      toast({ title: "Failed to log maintenance", variant: "destructive" });
    },
  });

  const createDowntimeMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/downtime", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/downtime/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/downtime"] });
      setDowntimeDialogOpen(false);
      setDowntimeMachineId(undefined);
      toast({ title: "Downtime logged successfully" });
    },
    onError: () => {
      toast({ title: "Failed to log downtime", variant: "destructive" });
    },
  });

  const resolveDowntimeMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => 
      apiRequest("PATCH", `/api/downtime/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/downtime/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/downtime"] });
      setResolveDialogOpen(false);
      setResolvingDowntime(null);
      toast({ title: "Downtime resolved successfully" });
    },
    onError: () => {
      toast({ title: "Failed to resolve downtime", variant: "destructive" });
    },
  });

  const handleAddMachine = () => {
    setEditingMachine(null);
    setMachineDialogOpen(true);
  };

  const handleEditMachine = (machine: Machine) => {
    // Extract only the OEE metrics to update
    const updateData = { 
      id: machine.id,
      goodPartsRan: machine.goodPartsRan,
      scrapParts: machine.scrapParts,
      idealCycleTime: machine.idealCycleTime,
    };
    console.log("Updating machine with:", updateData);
    updateMachineMutation.mutate(updateData);
  };

  const handleStatusChange = (machineId: string, status: MachineStatus) => {
    updateStatusMutation.mutate({ id: machineId, status });
  };

  const handleAssignOperator = (machineId: string) => {
    const machine = machines.find((m) => m.id === machineId);
    if (machine) {
      setAssigningMachine(machine);
      setAssignDialogOpen(true);
    }
  };

  const handleLogMaintenance = (machineId: string) => {
    setMaintenanceMachineId(machineId);
    setMaintenanceDialogOpen(true);
  };

  const handleLogDowntime = (machineId: string) => {
    setDowntimeMachineId(machineId);
    setDowntimeDialogOpen(true);
  };

  const handleResolveDowntime = (downtimeLog: DowntimeLog) => {
    setResolvingDowntime(downtimeLog);
    setResolveDialogOpen(true);
  };

  const handleSubmitStats = (machineId: string) => {
    const machine = machines.find((m) => m.id === machineId);
    if (!machine) return;
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    // Aggregate downtime for selected machine, date, and shift
    const relevantDowntimeLogs = downtimeLogs.filter((log) => {
      // If downtime logs have a date/shift field, use it; else fallback to startTime
      if (log.date && log.shift) {
        return log.machineId === machineId && log.date === today && log.shift === selectedShift;
      }
      // Fallback: match by startTime date
      return log.machineId === machineId && log.startTime.startsWith(today);
    });
    const aggregatedDowntime = relevantDowntimeLogs.reduce((sum, log) => sum + (log.duration || 0), 0);
    // Calculate OEE metrics using shared logic
    const plannedProductionTime = 420;
    const goodPartsRan = machine.goodPartsRan || 0;
    const scrapParts = machine.scrapParts || 0;
    const idealCycleTime = machine.idealCycleTime || 0;
    const oeeStats = calculateOEEStats({
      plannedProductionTime,
      downtime: aggregatedDowntime,
      goodPartsRan,
      scrapParts,
      idealCycleTime,
    });
    submitProductionStatMutation.mutate({
      machineId: machine.id,
      shift: selectedShift,
      date: today,
      goodPartsRan,
      scrapParts,
      idealCycleTime,
      downtime: aggregatedDowntime,
      oee: oeeStats.oee,
      availability: oeeStats.availability,
      performance: oeeStats.performance,
      quality: oeeStats.quality,
    });
  };

  const handleDeleteStats = (machineId: string) => {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    // Try to find today's stat(s) and delete by id as a robust fallback
    const todaysStats = productionStats.filter(s => s.machineId === machineId && s.date === today);
    if (todaysStats.length > 0) {
      // Delete the most recent one first
      deleteProductionStatById.mutate(todaysStats[0].id);
    } else {
      // Fallback to bulk delete by date
      deleteProductionStatsMutation.mutate({ machineId, date: today });
    }
  };

  const handleMachineSubmit = (data: Record<string, unknown>) => {
    if (editingMachine) {
      updateMachineMutation.mutate({ id: editingMachine.id, ...data });
    } else {
      createMachineMutation.mutate(data);
    }
  };

  const handleOperatorAssign = (machineId: string, operatorId: string | null) => {
    assignOperatorMutation.mutate({ machineId, operatorId });
  };

  const getOperatorById = (id: string | null) => {
    if (!id) return undefined;
    return operators.find((o) => o.id === id);
  };

  // Filter machines based on search query
  const filteredMachines = machines.filter(machine => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      machine.name.toLowerCase().includes(query) ||
      machine.machineId.toLowerCase().includes(query) ||
      machine.status.toLowerCase().includes(query) ||
      (getOperatorById(machine.operatorId)?.name.toLowerCase().includes(query))
    );
  });

  // Calculate summary stats from filtered machines
  const runningCount = filteredMachines.filter((m) => m.status === "running").length;
  const idleCount = filteredMachines.filter((m) => m.status === "idle").length;
  const maintenanceCount = filteredMachines.filter((m) => m.status === "maintenance").length;
  const downCount = filteredMachines.filter((m) => m.status === "down").length;
  const setupCount = filteredMachines.filter((m) => m.status === "setup").length;

  // Calculate active downtime duration
  const getActiveDowntimeForMachine = (machineId: string) => {
    return activeDowntime.find(d => d.machineId === machineId);
  };

  // Calculate total active downtime duration in minutes
  const totalActiveDowntimeMinutes = activeDowntime.reduce((sum, d) => {
    const start = new Date(d.startTime).getTime();
    const now = Date.now();
    return sum + Math.round((now - start) / 60000);
  }, 0);

  const formatDowntimeDuration = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${remainingMinutes}m`;
    }
    return `${minutes}m`;
  };

  // Get latest production stat date for each machine
  const getLatestStatDate = (machineId: string): string | null => {
    const machineStats = productionStats
      .filter(s => s.machineId === machineId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return machineStats.length > 0 ? machineStats[0].date : null;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header Stats */}
      <div className="border-b bg-card/50 px-6 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-dashboard-title">Cell Dashboard</h1>
            <p className="text-sm text-muted-foreground">Real-time manufacturing cell status</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-[300px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search machines..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-machines"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Shift</span>
              <Select value={selectedShift} onValueChange={(v) => setSelectedShift(v)}>
                <SelectTrigger className="w-[140px]" data-testid="select-shift-picker">
                  <SelectValue placeholder="Select shift" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Day">Day</SelectItem>
                  <SelectItem value="Afternoon">Afternoon</SelectItem>
                  <SelectItem value="Midnight">Midnight</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAddMachine} className="gap-2 shrink-0" data-testid="button-add-machine">
              <Plus className="h-4 w-4" />
              Add Machine
            </Button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="mt-3 grid grid-cols-4 gap-3">
          <div className="flex items-center gap-2 rounded-md bg-background p-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-machine-running/10">
              <Play className="h-4 w-4 text-machine-running" />
            </div>
            <div>
              <p className="text-lg font-mono font-bold" data-testid="stat-running">{runningCount}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">Running</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md bg-background p-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-machine-idle/10">
              <Pause className="h-4 w-4 text-machine-idle" />
            </div>
            <div>
              <p className="text-lg font-mono font-bold" data-testid="stat-idle">{idleCount}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">Idle</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md bg-background p-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-machine-maintenance/10">
              <Wrench className="h-4 w-4 text-machine-maintenance" />
            </div>
            <div>
              <p className="text-lg font-mono font-bold" data-testid="stat-maintenance">{maintenanceCount + setupCount}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">Maint</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md bg-background p-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-machine-down/10">
              <AlertTriangle className="h-4 w-4 text-machine-down" />
            </div>
            <div>
              <p className="text-lg font-mono font-bold" data-testid="stat-down">{downCount}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">
                Down
                {activeDowntime.length > 0 && (
                  <span className="text-machine-down ml-0.5 text-[9px]">
                    ({formatDowntimeDuration(totalActiveDowntimeMinutes)})
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Machine Grid */}
      <div className="flex-1 overflow-auto p-6">
        {machinesLoading ? (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-lg border p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-6 w-16" />
                </div>
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-10 w-full" />
                <div className="grid grid-cols-2 gap-3">
                  <Skeleton className="h-20" />
                  <Skeleton className="h-20" />
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-9 flex-1" />
                  <Skeleton className="h-9 flex-1" />
                  <Skeleton className="h-9 w-9" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredMachines.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted mb-4">
              {searchQuery ? (
                <Search className="h-10 w-10 text-muted-foreground" />
              ) : (
                <Settings2 className="h-10 w-10 text-muted-foreground" />
              )}
            </div>
            <h2 className="text-xl font-semibold mb-2">
              {searchQuery ? "No Machines Found" : "No Machines Yet"}
            </h2>
            <p className="text-muted-foreground mb-6 max-w-md">
              {searchQuery 
                ? `No machines match "${searchQuery}". Try a different search term.`
                : "Add your first machine to start tracking production status and metrics"
              }
            </p>
            {!searchQuery && (
              <Button onClick={handleAddMachine} className="gap-2" data-testid="button-add-first-machine">
                <Plus className="h-4 w-4" />
                Add Your First Machine
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredMachines.map((machine) => {
              const d = new Date();
              const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
              const isSubmittedToday = productionStats.some(s => s.machineId === machine.id && s.date === today && s.shift === selectedShift);
              const machineDowntime = getActiveDowntimeForMachine(machine.id);
              
              return (
                <MachineStatusCard
                  key={machine.id}
                  machine={machine}
                  operator={getOperatorById(machine.operatorId)}
                  downtimeLogs={downtimeLogs}
                  onStatusChange={handleStatusChange}
                  onAssignOperator={handleAssignOperator}
                  onLogMaintenance={handleLogMaintenance}
                  onLogDowntime={handleLogDowntime}
                  onEditMachine={handleEditMachine}
                  onSubmitStats={handleSubmitStats}
                  onDeleteStats={handleDeleteStats}
                  onUpdateStatusUpdate={(machineId, statusUpdate) => 
                    updateStatusUpdateMutation.mutate({ machineId, statusUpdate })
                  }
                  isSubmittedToday={isSubmittedToday}
                  isPendingSubmit={submitProductionStatMutation.isPending}
                  isPendingDelete={deleteProductionStatsMutation.isPending}
                  isPendingStatusUpdate={updateStatusUpdateMutation.isPending}
                  activeDowntime={machineDowntime}
                  onResolveDowntime={handleResolveDowntime}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <MachineDialog
        open={machineDialogOpen}
        onOpenChange={setMachineDialogOpen}
        machine={editingMachine}
        onSubmit={handleMachineSubmit}
        isPending={createMachineMutation.isPending || updateMachineMutation.isPending}
      />

      <MaintenanceDialog
        open={maintenanceDialogOpen}
        onOpenChange={setMaintenanceDialogOpen}
        machines={machines}
        preselectedMachineId={maintenanceMachineId}
        onSubmit={(data) => createMaintenanceMutation.mutate(data)}
        isPending={createMaintenanceMutation.isPending}
      />

      <AssignOperatorDialog
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        machine={assigningMachine}
        operators={operators}
        onAssign={handleOperatorAssign}
        isPending={assignOperatorMutation.isPending}
      />

      <DowntimeDialog
        open={downtimeDialogOpen}
        onOpenChange={setDowntimeDialogOpen}
        machines={machines}
        preselectedMachineId={downtimeMachineId}
        onSubmit={(data) => createDowntimeMutation.mutate(data)}
        isPending={createDowntimeMutation.isPending}
      />

      <ResolveDowntimeDialog
        open={resolveDialogOpen}
        onOpenChange={setResolveDialogOpen}
        downtimeLog={resolvingDowntime}
        machineName={resolvingDowntime ? machines.find(m => m.id === resolvingDowntime.machineId)?.name : undefined}
        onSubmit={(id, data) => resolveDowntimeMutation.mutate({ id, data })}
        isPending={resolveDowntimeMutation.isPending}
      />
    </div>
  );
}
