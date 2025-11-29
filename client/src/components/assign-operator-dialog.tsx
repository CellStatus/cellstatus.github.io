import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UserCircle, X } from "lucide-react";
import type { Operator, Machine } from "@shared/schema";

interface AssignOperatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  machine: Machine | null;
  operators: Operator[];
  onAssign: (machineId: string, operatorId: string | null) => void;
  isPending: boolean;
}

export function AssignOperatorDialog({
  open,
  onOpenChange,
  machine,
  operators,
  onAssign,
  isPending,
}: AssignOperatorDialogProps) {
  if (!machine) return null;

  const handleAssign = (operatorId: string | null) => {
    onAssign(machine.id, operatorId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Operator</DialogTitle>
          <DialogDescription>
            Select an operator to run {machine.name}
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="max-h-[300px]">
          <div className="space-y-2">
            {machine.operatorId && (
              <Button
                variant="outline"
                className="w-full justify-start gap-3 h-auto py-3"
                onClick={() => handleAssign(null)}
                disabled={isPending}
                data-testid="button-unassign-operator"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <X className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex flex-col items-start">
                  <span className="font-medium">Unassign Operator</span>
                  <span className="text-xs text-muted-foreground">Remove current operator</span>
                </div>
              </Button>
            )}
            
            {operators.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <UserCircle className="h-12 w-12 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">No operators available</p>
                <p className="text-xs text-muted-foreground mt-1">Add operators in the Operators section</p>
              </div>
            ) : (
              operators.map((operator) => (
                <Button
                  key={operator.id}
                  variant={machine.operatorId === operator.id ? "secondary" : "outline"}
                  className="w-full justify-start gap-3 h-auto py-3"
                  onClick={() => handleAssign(operator.id)}
                  disabled={isPending || machine.operatorId === operator.id}
                  data-testid={`button-assign-${operator.id}`}
                >
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="text-sm font-medium bg-primary/10 text-primary">
                      {operator.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col items-start">
                    <span className="font-medium">{operator.name}</span>
                    <span className="text-xs text-muted-foreground">{operator.shift} Shift</span>
                  </div>
                  {machine.operatorId === operator.id && (
                    <span className="ml-auto text-xs text-primary font-medium">Current</span>
                  )}
                </Button>
              ))
            )}
          </div>
        </ScrollArea>

        <div className="flex justify-end pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-close-assign"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
