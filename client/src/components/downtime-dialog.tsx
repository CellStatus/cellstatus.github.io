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
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import type { Machine } from "@shared/schema";
import { downtimeReasonCodes, downtimeCategories } from "@shared/schema";

const downtimeFormSchema = z.object({
  machineId: z.string().min(1, "Machine is required"),
  reasonCategory: z.enum(downtimeCategories, { required_error: "Category is required" }),
  reasonCode: z.string().min(1, "Reason code is required"),
  description: z.string().optional(),
  reportedBy: z.string().optional(),
  startTime: z.string().min(1, "Start time is required"),
});

type DowntimeFormValues = z.infer<typeof downtimeFormSchema>;

interface DowntimeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  machines: Machine[];
  preselectedMachineId?: string;
  onSubmit: (data: DowntimeFormValues) => void;
  isPending: boolean;
}

// Get reason codes by category
const getReasonCodesByCategory = (category: string) => {
  return Object.entries(downtimeReasonCodes)
    .filter(([_, value]) => value.category === category)
    .map(([code, value]) => ({
      code,
      label: value.label,
    }));
};

// Get category display name
const getCategoryLabel = (category: string) => {
  const labels: Record<string, string> = {
    mechanical: "Mechanical",
    electrical: "Electrical",
    material: "Material",
    operator: "Operator",
    quality: "Quality",
    other: "Other",
  };
  return labels[category] || category;
};

export function DowntimeDialog({
  open,
  onOpenChange,
  machines,
  preselectedMachineId,
  onSubmit,
  isPending,
}: DowntimeDialogProps) {
  const form = useForm<DowntimeFormValues>({
    resolver: zodResolver(downtimeFormSchema),
    defaultValues: {
      machineId: "",
      reasonCategory: undefined,
      reasonCode: "",
      description: "",
      reportedBy: "",
      startTime: new Date().toISOString().slice(0, 16),
    },
  });

  const selectedCategory = form.watch("reasonCategory");

  useEffect(() => {
    if (open) {
      form.reset({
        machineId: preselectedMachineId ?? "",
        reasonCategory: undefined,
        reasonCode: "",
        description: "",
        reportedBy: "",
        startTime: new Date().toISOString().slice(0, 16),
      });
    }
  }, [open, preselectedMachineId, form]);

  // Reset reason code when category changes
  useEffect(() => {
    if (selectedCategory) {
      form.setValue("reasonCode", "");
    }
  }, [selectedCategory, form]);

  const handleSubmit = (data: DowntimeFormValues) => {
    // Get the category from the reason code
    const reasonCodeInfo = downtimeReasonCodes[data.reasonCode as keyof typeof downtimeReasonCodes];
    onSubmit({
      ...data,
      reasonCategory: reasonCodeInfo?.category || data.reasonCategory,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle data-testid="dialog-title-downtime">
            Log Machine Downtime
          </DialogTitle>
          <DialogDescription>
            Record downtime event with reason and start time
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4" data-testid="form-downtime">
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
                      <SelectTrigger data-testid="select-downtime-machine">
                        <SelectValue placeholder="Select machine" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {machines.map((machine) => (
                        <SelectItem key={machine.id} value={machine.id}>
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
                name="reasonCategory"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-downtime-category">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {downtimeCategories.map((category) => (
                          <SelectItem key={category} value={category}>
                            {getCategoryLabel(category)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="reasonCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      value={field.value}
                      disabled={!selectedCategory}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-downtime-reason">
                          <SelectValue placeholder={selectedCategory ? "Select reason" : "Select category first"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {selectedCategory && getReasonCodesByCategory(selectedCategory).map(({ code, label }) => (
                          <SelectItem key={code} value={code}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="startTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Start Time</FormLabel>
                  <FormControl>
                    <Input 
                      type="datetime-local" 
                      {...field} 
                      className="font-mono"
                      data-testid="input-downtime-start"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Additional details about the downtime..."
                      className="resize-none"
                      rows={2}
                      {...field} 
                      data-testid="input-downtime-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reportedBy"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reported By (Optional)</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Your name" 
                      {...field} 
                      data-testid="input-downtime-reporter"
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
                data-testid="button-cancel-downtime"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} data-testid="button-save-downtime">
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Log Downtime
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
