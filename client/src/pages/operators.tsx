import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { OperatorDialog } from "@/components/operator-dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Plus, Pencil, Trash2, Users, Sun, Moon, Sunset } from "lucide-react";
import type { Operator, Machine } from "@shared/schema";

const shiftConfig: Record<string, { icon: typeof Sun; className: string }> = {
  Day: { icon: Sun, className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  Swing: { icon: Sunset, className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  Night: { icon: Moon, className: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" },
};

export default function OperatorsPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOperator, setEditingOperator] = useState<Operator | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingOperator, setDeletingOperator] = useState<Operator | null>(null);

  const { data: operators = [], isLoading } = useQuery<Operator[]>({
    queryKey: ["/api/operators"],
  });

  const { data: machines = [] } = useQuery<Machine[]>({
    queryKey: ["/api/machines"],
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Operator>) => apiRequest("POST", "/api/operators", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/operators"] });
      setDialogOpen(false);
      toast({ title: "Operator added successfully" });
    },
    onError: () => {
      toast({ title: "Failed to add operator", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: Partial<Operator> & { id: string }) =>
      apiRequest("PATCH", `/api/operators/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/operators"] });
      setDialogOpen(false);
      setEditingOperator(null);
      toast({ title: "Operator updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update operator", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/operators/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/operators"] });
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
      setDeleteConfirmOpen(false);
      setDeletingOperator(null);
      toast({ title: "Operator deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete operator", variant: "destructive" });
    },
  });

  const handleAdd = () => {
    setEditingOperator(null);
    setDialogOpen(true);
  };

  const handleEdit = (operator: Operator) => {
    setEditingOperator(operator);
    setDialogOpen(true);
  };

  const handleDelete = (operator: Operator) => {
    setDeletingOperator(operator);
    setDeleteConfirmOpen(true);
  };

  const handleSubmit = (data: Record<string, unknown>) => {
    if (editingOperator) {
      updateMutation.mutate({ id: editingOperator.id, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const confirmDelete = () => {
    if (deletingOperator) {
      deleteMutation.mutate(deletingOperator.id);
    }
  };

  const getAssignedMachine = (operatorId: string) => {
    return machines.find((m) => m.operatorId === operatorId);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="border-b bg-card/50 px-6 py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-operators-title">Operators</h1>
            <p className="text-sm text-muted-foreground">Manage machine operators and shift assignments</p>
          </div>
          <Button onClick={handleAdd} className="gap-2 shrink-0" data-testid="button-add-operator">
            <Plus className="h-4 w-4" />
            Add Operator
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">All Operators</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : operators.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="font-medium mb-1">No Operators</h3>
                <p className="text-sm text-muted-foreground mb-4">Add operators to assign them to machines</p>
                <Button onClick={handleAdd} variant="outline" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add Operator
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Operator</TableHead>
                    <TableHead>Initials</TableHead>
                    <TableHead>Shift</TableHead>
                    <TableHead>Assigned Machine</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {operators.map((operator) => {
                    const shift = shiftConfig[operator.shift] || shiftConfig.Day;
                    const ShiftIcon = shift.icon;
                    const assignedMachine = getAssignedMachine(operator.id);
                    return (
                      <TableRow key={operator.id} data-testid={`row-operator-${operator.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9">
                              <AvatarFallback className="text-sm font-medium bg-primary/10 text-primary">
                                {operator.initials}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium">{operator.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs uppercase">
                            {operator.initials}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={`${shift.className} border-transparent gap-1`}>
                            <ShiftIcon className="h-3 w-3" />
                            {operator.shift}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {assignedMachine ? (
                            <span className="text-sm">
                              {assignedMachine.name}
                              <span className="text-muted-foreground ml-1.5 font-mono text-xs">
                                ({assignedMachine.machineId})
                              </span>
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">Unassigned</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(operator)}
                              data-testid={`button-edit-${operator.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(operator)}
                              data-testid={`button-delete-${operator.id}`}
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

      <OperatorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        operator={editingOperator}
        onSubmit={handleSubmit}
        isPending={createMutation.isPending || updateMutation.isPending}
      />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Operator</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {deletingOperator?.name}? They will be unassigned from any machines.
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
