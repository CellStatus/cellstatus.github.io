import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MachineStatusCard } from "@/components/machine-status-card";
import { MachineDialog } from "@/components/machine-dialog";
import { MaintenanceDialog } from "@/components/maintenance-dialog";
import { AssignOperatorDialog } from "@/components/assign-operator-dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
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
} from "lucide-react";
import type { Machine, Operator, MachineStatus } from "@shared/schema";

export default function Dashboard() {
  const { toast } = useToast();
  const [machineDialogOpen, setMachineDialogOpen] = useState(false);
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null);
  const [maintenanceDialogOpen, setMaintenanceDialogOpen] = useState(false);
  const [maintenanceMachineId, setMaintenanceMachineId] = useState<string | undefined>();
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assigningMachine, setAssigningMachine] = useState<Machine | null>(null);

  const { data: machines = [], isLoading: machinesLoading } = useQuery<Machine[]>({
    queryKey: ["/api/machines"],
  });

  const { data: operators = [] } = useQuery<Operator[]>({
    queryKey: ["/api/operators"],
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
      apiRequest("PATCH", `/api/machines/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
      setMachineDialogOpen(false);
      setEditingMachine(null);
      toast({ title: "Machine updated successfully" });
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

  const handleAddMachine = () => {
    setEditingMachine(null);
    setMachineDialogOpen(true);
  };

  const handleEditMachine = (machine: Machine) => {
    setEditingMachine(machine);
    setMachineDialogOpen(true);
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

  // Calculate summary stats
  const runningCount = machines.filter((m) => m.status === "running").length;
  const idleCount = machines.filter((m) => m.status === "idle").length;
  const maintenanceCount = machines.filter((m) => m.status === "maintenance").length;
  const downCount = machines.filter((m) => m.status === "down").length;
  const setupCount = machines.filter((m) => m.status === "setup").length;

  const totalUnits = machines.reduce((sum, m) => sum + m.unitsProduced, 0);
  const totalTarget = machines.reduce((sum, m) => sum + m.targetUnits, 0);
  const avgEfficiency = machines.length > 0
    ? machines.reduce((sum, m) => sum + (m.efficiency ?? 0), 0) / machines.length
    : 0;

  const getOperatorById = (id: string | null) => {
    if (!id) return undefined;
    return operators.find((o) => o.id === id);
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
          <Button onClick={handleAddMachine} className="gap-2 shrink-0" data-testid="button-add-machine">
            <Plus className="h-4 w-4" />
            Add Machine
          </Button>
        </div>

        {/* Summary Stats */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="flex items-center gap-3 rounded-md bg-background p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-machine-running/10">
              <Play className="h-5 w-5 text-machine-running" />
            </div>
            <div>
              <p className="text-2xl font-mono font-bold" data-testid="stat-running">{runningCount}</p>
              <p className="text-xs text-muted-foreground">Running</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-md bg-background p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-machine-idle/10">
              <Pause className="h-5 w-5 text-machine-idle" />
            </div>
            <div>
              <p className="text-2xl font-mono font-bold" data-testid="stat-idle">{idleCount}</p>
              <p className="text-xs text-muted-foreground">Idle</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-md bg-background p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-machine-maintenance/10">
              <Wrench className="h-5 w-5 text-machine-maintenance" />
            </div>
            <div>
              <p className="text-2xl font-mono font-bold" data-testid="stat-maintenance">{maintenanceCount + setupCount}</p>
              <p className="text-xs text-muted-foreground">Maint/Setup</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-md bg-background p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-machine-down/10">
              <AlertTriangle className="h-5 w-5 text-machine-down" />
            </div>
            <div>
              <p className="text-2xl font-mono font-bold" data-testid="stat-down">{downCount}</p>
              <p className="text-xs text-muted-foreground">Down</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-md bg-background p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
              <Target className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-mono font-bold" data-testid="stat-units">
                {totalUnits}<span className="text-sm text-muted-foreground font-normal">/{totalTarget}</span>
              </p>
              <p className="text-xs text-muted-foreground">Units</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-md bg-background p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className={`text-2xl font-mono font-bold ${avgEfficiency >= 90 ? 'text-machine-running' : avgEfficiency >= 70 ? 'text-machine-maintenance' : 'text-machine-down'}`} data-testid="stat-efficiency">
                {avgEfficiency > 0 ? `${avgEfficiency.toFixed(0)}%` : "--"}
              </p>
              <p className="text-xs text-muted-foreground">Avg Eff.</p>
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
        ) : machines.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted mb-4">
              <Settings2 className="h-10 w-10 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">No Machines Yet</h2>
            <p className="text-muted-foreground mb-6 max-w-md">
              Add your first machine to start tracking production status and metrics
            </p>
            <Button onClick={handleAddMachine} className="gap-2" data-testid="button-add-first-machine">
              <Plus className="h-4 w-4" />
              Add Your First Machine
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {machines.map((machine) => (
              <MachineStatusCard
                key={machine.id}
                machine={machine}
                operator={getOperatorById(machine.operatorId)}
                onStatusChange={handleStatusChange}
                onAssignOperator={handleAssignOperator}
                onLogMaintenance={handleLogMaintenance}
                onEditMachine={handleEditMachine}
              />
            ))}
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
    </div>
  );
}
