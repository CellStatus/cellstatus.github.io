import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { MachineDialog } from "@/components/machine-dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Plus, 
  Pencil, 
  Trash2,
  Play,
  Pause,
  Wrench,
  AlertTriangle,
  Settings2,
} from "lucide-react";
import type { Machine, MachineStatus } from "@shared/schema";

const statusConfig: Record<MachineStatus, { label: string; icon: typeof Play; className: string }> = {
  running: { label: "Running", icon: Play, className: "bg-machine-running/15 text-machine-running border-machine-running/30" },
  idle: { label: "Idle", icon: Pause, className: "bg-machine-idle/15 text-machine-idle border-machine-idle/30" },
  maintenance: { label: "Maintenance", icon: Wrench, className: "bg-machine-maintenance/15 text-machine-maintenance border-machine-maintenance/30" },
  down: { label: "Down", icon: AlertTriangle, className: "bg-machine-down/15 text-machine-down border-machine-down/30" },
  setup: { label: "Setup", icon: Settings2, className: "bg-machine-setup/15 text-machine-setup border-machine-setup/30" },
};

export default function MachinesPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingMachine, setDeletingMachine] = useState<Machine | null>(null);

  const { data: machines = [], isLoading } = useQuery<Machine[]>({
    queryKey: ["/api/machines"],
  });

  const { data: downtimeLogs = [] } = useQuery<any[]>({
    queryKey: ["/api/downtime"],
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Machine>) => apiRequest("POST", "/api/machines", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
      setDialogOpen(false);
      toast({ title: "Machine added successfully" });
    },
    onError: () => {
      toast({ title: "Failed to add machine", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: Partial<Machine> & { id: string }) =>
      apiRequest("PATCH", `/api/machines/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
      setDialogOpen(false);
      setEditingMachine(null);
      toast({ title: "Machine updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update machine", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/machines/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
      setDeleteConfirmOpen(false);
      setDeletingMachine(null);
      toast({ title: "Machine deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete machine", variant: "destructive" });
    },
  });

  const handleAdd = () => {
    setEditingMachine(null);
    setDialogOpen(true);
  };

  const handleEdit = (machine: Machine) => {
    setEditingMachine(machine);
    setDialogOpen(true);
  };

  const handleDelete = (machine: Machine) => {
    setDeletingMachine(machine);
    setDeleteConfirmOpen(true);
  };

  const handleSubmit = (data: Record<string, unknown>) => {
    if (editingMachine) {
      updateMutation.mutate({ id: editingMachine.id, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const confirmDelete = () => {
    if (deletingMachine) {
      deleteMutation.mutate(deletingMachine.id);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="border-b bg-card/50 px-6 py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-machines-title">Machines</h1>
            <p className="text-sm text-muted-foreground">Manage your manufacturing cell equipment</p>
          </div>
          <Button onClick={handleAdd} className="gap-2 shrink-0" data-testid="button-add-machine">
            <Plus className="h-4 w-4" />
            Add Machine
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">All Machines</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : machines.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Settings2 className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="font-medium mb-1">No Machines</h3>
                <p className="text-sm text-muted-foreground mb-4">Get started by adding your first machine</p>
                <Button onClick={handleAdd} variant="outline" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add Machine
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Machine</TableHead>
                    <TableHead>ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Good Parts</TableHead>
                    <TableHead className="text-right">Scrap Parts</TableHead>
                    <TableHead className="text-right">Run Time (hrs)</TableHead>
                    <TableHead className="text-right">OEE</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {machines.map((machine) => {
                    const status = statusConfig[machine.status];
                    const StatusIcon = status.icon;
                    
                    // Calculate actual runtime: 420 minutes (shift) - downtime
                    const machineDowntime = downtimeLogs
                      .filter((log) => log.machineId === machine.id)
                      .reduce((sum, log) => sum + (log.duration || 0), 0);
                    const actualRuntime = 420 - machineDowntime;
                    
                    // Calculate OEE using APQ (Availability × Performance × Quality)
                    let oee: number | null = null;
                    if (machine.idealCycleTime && actualRuntime > 0) {
                      const totalParts = (machine.goodPartsRan || 0) + (machine.scrapParts || 0);
                      
                      // Availability = Actual Runtime / Planned Runtime (420 min)
                      const availability = actualRuntime / 420;
                      
                      // Performance = (Actual Output × Ideal Cycle Time) / Actual Runtime
                      // Convert runtime to seconds to match cycle time units
                      const actualRuntimeSeconds = actualRuntime * 60;
                      const performance = totalParts > 0 
                        ? ((totalParts * machine.idealCycleTime) / actualRuntimeSeconds) 
                        : 0;
                      
                      // Quality = Good Parts / Total Parts
                      const quality = totalParts > 0 
                        ? (machine.goodPartsRan || 0) / totalParts 
                        : 0;
                      
                      // OEE = Availability × Performance × Quality × 100
                      oee = availability * performance * quality * 100;
                    }
                    
                    return (
                      <TableRow key={machine.id} data-testid={`row-machine-${machine.id}`}>
                        <TableCell className="font-medium">{machine.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">
                            {machine.machineId}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={`${status.className} border gap-1`}>
                            <StatusIcon className="h-3 w-3" />
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {machine.goodPartsRan || 0}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {machine.scrapParts || 0}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {(actualRuntime / 60).toFixed(1)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {oee !== null ? `${oee.toFixed(1)}%` : "--"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(machine)}
                              data-testid={`button-edit-${machine.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(machine)}
                              data-testid={`button-delete-${machine.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <MachineDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        machine={editingMachine}
        onSubmit={handleSubmit}
        isPending={createMutation.isPending || updateMutation.isPending}
      />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Machine</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {deletingMachine?.name}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete} 
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
