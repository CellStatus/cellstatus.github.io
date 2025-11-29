import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import type { Machine, MaintenanceLog } from "@shared/schema";

const maintenanceFormSchema = z.object({
  machineId: z.string().min(1, "Machine is required"),
  type: z.string().min(1, "Maintenance type is required"),
  description: z.string().min(1, "Description is required"),
  status: z.string().min(1, "Status is required"),
  scheduledDate: z.string().optional(),
  completedDate: z.string().optional(),
  technician: z.string().optional(),
  notes: z.string().optional(),
});

type MaintenanceFormValues = z.infer<typeof maintenanceFormSchema>;

interface MaintenanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  maintenanceLog?: MaintenanceLog | null;
  machines: Machine[];
  preselectedMachineId?: string;
  onSubmit: (data: MaintenanceFormValues) => void;
  isPending: boolean;
}

export function MaintenanceDialog({
  open,
  onOpenChange,
  maintenanceLog,
  machines,
  preselectedMachineId,
  onSubmit,
  isPending,
}: MaintenanceDialogProps) {
  const isEditing = !!maintenanceLog;

  const form = useForm<MaintenanceFormValues>({
    resolver: zodResolver(maintenanceFormSchema),
    defaultValues: {
      machineId: "",
      type: "",
      description: "",
      status: "scheduled",
      scheduledDate: "",
      completedDate: "",
      technician: "",
      notes: "",
    },
  });

  useEffect(() => {
    if (open) {
      if (maintenanceLog) {
        form.reset({
          machineId: maintenanceLog.machineId,
          type: maintenanceLog.type,
          description: maintenanceLog.description,
          status: maintenanceLog.status,
          scheduledDate: maintenanceLog.scheduledDate ?? "",
          completedDate: maintenanceLog.completedDate ?? "",
          technician: maintenanceLog.technician ?? "",
          notes: maintenanceLog.notes ?? "",
        });
      } else {
        form.reset({
          machineId: preselectedMachineId ?? "",
          type: "",
          description: "",
          status: "scheduled",
          scheduledDate: "",
          completedDate: "",
          technician: "",
          notes: "",
        });
      }
    }
  }, [open, maintenanceLog, preselectedMachineId, form]);

  const handleSubmit = (data: MaintenanceFormValues) => {
    onSubmit(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle data-testid="dialog-title-maintenance">
            {isEditing ? "Edit Maintenance Log" : "Log Maintenance"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update maintenance record details"
              : "Create a new maintenance record for a machine"}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4" data-testid="form-maintenance">
            <FormField
              control={form.control}
              name="machineId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Machine</FormLabel>
                  <Select 
                    onValueChange={field.onChange} 
                    value={field.value}
                    disabled={!!preselectedMachineId}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-maintenance-machine">
                        <SelectValue placeholder="Select machine" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {machines.map((machine) => (
                        <SelectItem key={machine.id} value={machine.id} data-testid={`option-machine-${machine.id}`}>
                          {machine.name} ({machine.machineId})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-maintenance-type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="preventive" data-testid="option-type-preventive">Preventive</SelectItem>
                        <SelectItem value="corrective" data-testid="option-type-corrective">Corrective</SelectItem>
                        <SelectItem value="emergency" data-testid="option-type-emergency">Emergency</SelectItem>
                        <SelectItem value="inspection" data-testid="option-type-inspection">Inspection</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-maintenance-status">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="scheduled" data-testid="option-maint-status-scheduled">Scheduled</SelectItem>
                        <SelectItem value="in-progress" data-testid="option-maint-status-in-progress">In Progress</SelectItem>
                        <SelectItem value="completed" data-testid="option-maint-status-completed">Completed</SelectItem>
                        <SelectItem value="cancelled" data-testid="option-maint-status-cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Brief description of maintenance" 
                      {...field} 
                      data-testid="input-maintenance-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="scheduledDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Scheduled Date</FormLabel>
                    <FormControl>
                      <Input 
                        type="date" 
                        {...field} 
                        className="font-mono"
                        data-testid="input-scheduled-date"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="completedDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Completed Date</FormLabel>
                    <FormControl>
                      <Input 
                        type="date" 
                        {...field} 
                        className="font-mono"
                        data-testid="input-completed-date"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="technician"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Technician</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Technician name" 
                      {...field} 
                      data-testid="input-technician"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Additional notes or details..."
                      className="resize-none"
                      rows={3}
                      {...field} 
                      data-testid="input-maintenance-notes"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-maintenance"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} data-testid="button-save-maintenance">
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? "Save Changes" : "Log Maintenance"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
