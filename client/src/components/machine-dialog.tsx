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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import type { Machine } from "@shared/schema";

const machineFormSchema = z.object({
  name: z.string().min(1, "Machine name is required"),
  machineId: z.string().min(1, "Machine ID is required"),
  status: z.enum(["running", "idle", "maintenance", "down", "setup"]),
});

type MachineFormValues = z.infer<typeof machineFormSchema>;

interface MachineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  machine?: Machine | null;
  onSubmit: (data: MachineFormValues) => void;
  isPending: boolean;
}

export function MachineDialog({
  open,
  onOpenChange,
  machine,
  onSubmit,
  isPending,
}: MachineDialogProps) {
  const isEditing = !!machine;

  const form = useForm<MachineFormValues>({
    resolver: zodResolver(machineFormSchema),
    defaultValues: {
      name: "",
      machineId: "",
      status: "idle",
    },
  });

  useEffect(() => {
    if (open) {
      if (machine) {
        form.reset({
          name: machine.name,
          machineId: machine.machineId,
          status: machine.status,
        });
      } else {
        form.reset({
          name: "",
          machineId: "",
          status: "idle",
        });
      }
    }
  }, [open, machine, form]);

  const handleSubmit = (data: MachineFormValues) => {
    onSubmit(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle data-testid="dialog-title-machine">
            {isEditing ? "Edit Machine" : "Add New Machine"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update machine details and production targets"
              : "Add a new machine to your manufacturing cell"}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4" data-testid="form-machine">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Machine Name</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="CNC Mill #1" 
                        {...field} 
                        data-testid="input-machine-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="machineId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Machine ID</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="M-001" 
                        {...field} 
                        className="font-mono"
                        data-testid="input-machine-id"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-machine-status">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="running" data-testid="option-status-running">Running</SelectItem>
                      <SelectItem value="idle" data-testid="option-status-idle">Idle</SelectItem>
                      <SelectItem value="maintenance" data-testid="option-status-maintenance">Maintenance</SelectItem>
                      <SelectItem value="down" data-testid="option-status-down">Down</SelectItem>
                      <SelectItem value="setup" data-testid="option-status-setup">Setup</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-machine"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} data-testid="button-save-machine">
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? "Save Changes" : "Add Machine"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
