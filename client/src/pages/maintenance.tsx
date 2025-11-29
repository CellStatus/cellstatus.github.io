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
import { MaintenanceDialog } from "@/components/maintenance-dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Plus, 
  Pencil, 
  Trash2, 
  Wrench, 
  CheckCircle2, 
  Clock, 
  XCircle,
  AlertCircle,
} from "lucide-react";
import type { MaintenanceLog, Machine } from "@shared/schema";

const statusConfig: Record<string, { label: string; icon: typeof Clock; className: string }> = {
  scheduled: { label: "Scheduled", icon: Clock, className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  "in-progress": { label: "In Progress", icon: AlertCircle, className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  completed: { label: "Completed", icon: CheckCircle2, className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  cancelled: { label: "Cancelled", icon: XCircle, className: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400" },
};

const typeConfig: Record<string, { label: string; className: string }> = {
  preventive: { label: "Preventive", className: "bg-primary/10 text-primary border-primary/20" },
  corrective: { label: "Corrective", className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800" },
  emergency: { label: "Emergency", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800" },
  inspection: { label: "Inspection", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800" },
};

export default function MaintenancePage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<MaintenanceLog | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingLog, setDeletingLog] = useState<MaintenanceLog | null>(null);

  const { data: maintenanceLogs = [], isLoading } = useQuery<MaintenanceLog[]>({
    queryKey: ["/api/maintenance"],
  });

  const { data: machines = [] } = useQuery<Machine[]>({
    queryKey: ["/api/machines"],
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<MaintenanceLog>) => apiRequest("POST", "/api/maintenance", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance"] });
      setDialogOpen(false);
      toast({ title: "Maintenance log created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create maintenance log", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: Partial<MaintenanceLog> & { id: string }) =>
      apiRequest("PATCH", `/api/maintenance/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance"] });
      setDialogOpen(false);
      setEditingLog(null);
      toast({ title: "Maintenance log updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update maintenance log", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/maintenance/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance"] });
      setDeleteConfirmOpen(false);
      setDeletingLog(null);
      toast({ title: "Maintenance log deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete maintenance log", variant: "destructive" });
    },
  });

  const handleAdd = () => {
    setEditingLog(null);
    setDialogOpen(true);
  };

  const handleEdit = (log: MaintenanceLog) => {
    setEditingLog(log);
    setDialogOpen(true);
  };

  const handleDelete = (log: MaintenanceLog) => {
    setDeletingLog(log);
    setDeleteConfirmOpen(true);
  };

  const handleSubmit = (data: Record<string, unknown>) => {
    if (editingLog) {
      updateMutation.mutate({ id: editingLog.id, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const confirmDelete = () => {
    if (deletingLog) {
      deleteMutation.mutate(deletingLog.id);
    }
  };

  const getMachineName = (machineId: string) => {
    const machine = machines.find((m) => m.id === machineId);
    return machine ? `${machine.name} (${machine.machineId})` : "Unknown Machine";
  };

  // Sort logs: in-progress first, then scheduled, then completed/cancelled
  const sortedLogs = [...maintenanceLogs].sort((a, b) => {
    const order = { "in-progress": 0, scheduled: 1, completed: 2, cancelled: 3 };
    return (order[a.status as keyof typeof order] ?? 4) - (order[b.status as keyof typeof order] ?? 4);
  });

  return (
    <div className="flex flex-col h-full">
      <div className="border-b bg-card/50 px-6 py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-maintenance-title">Maintenance</h1>
            <p className="text-sm text-muted-foreground">Track and manage machine maintenance records</p>
          </div>
          <Button onClick={handleAdd} className="gap-2 shrink-0" data-testid="button-add-maintenance">
            <Plus className="h-4 w-4" />
            Log Maintenance
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Maintenance Logs</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : sortedLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Wrench className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="font-medium mb-1">No Maintenance Records</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Log maintenance activities to keep track of equipment upkeep
                </p>
                <Button onClick={handleAdd} variant="outline" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Log Maintenance
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Machine</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Scheduled</TableHead>
                    <TableHead>Technician</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedLogs.map((log) => {
                    const status = statusConfig[log.status] || statusConfig.scheduled;
                    const type = typeConfig[log.type] || typeConfig.preventive;
                    const StatusIcon = status.icon;
                    return (
                      <TableRow key={log.id} data-testid={`row-maintenance-${log.id}`}>
                        <TableCell className="font-medium">
                          {getMachineName(log.machineId)}
                        </TableCell>
                        <TableCell>
                          <Badge className={`${type.className} border`}>
                            {type.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {log.description}
                        </TableCell>
                        <TableCell>
                          <Badge className={`${status.className} border-transparent gap-1`}>
                            <StatusIcon className="h-3 w-3" />
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {log.scheduledDate || "--"}
                        </TableCell>
                        <TableCell>
                          {log.technician || <span className="text-muted-foreground">--</span>}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(log)}
                              data-testid={`button-edit-${log.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(log)}
                              data-testid={`button-delete-${log.id}`}
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

      <MaintenanceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        maintenanceLog={editingLog}
        machines={machines}
        onSubmit={handleSubmit}
        isPending={createMutation.isPending || updateMutation.isPending}
      />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Maintenance Log</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this maintenance record? This action cannot be undone.
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
