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
import { Loader2, Clock } from "lucide-react";
import type { DowntimeLog } from "@shared/schema";
import { downtimeReasonCodes } from "@shared/schema";

const resolveFormSchema = z.object({
  endTime: z.string().min(1, "End time is required"),
  resolvedBy: z.string().optional(),
  description: z.string().optional(),
});

type ResolveFormValues = z.infer<typeof resolveFormSchema>;

interface ResolveDowntimeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  downtimeLog: DowntimeLog | null;
  machineName?: string;
  onSubmit: (id: string, data: ResolveFormValues) => void;
  isPending: boolean;
}

// Calculate duration in a human-readable format
const formatDuration = (startTime: string, endTime: string): string => {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  const diffMs = end - start;
  
  if (diffMs < 0) return "Invalid (end before start)";
  
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (hours > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }
  return `${minutes}m`;
};

export function ResolveDowntimeDialog({
  open,
  onOpenChange,
  downtimeLog,
  machineName,
  onSubmit,
  isPending,
}: ResolveDowntimeDialogProps) {
  const form = useForm<ResolveFormValues>({
    resolver: zodResolver(resolveFormSchema),
    defaultValues: {
      endTime: new Date().toISOString().slice(0, 16),
      resolvedBy: "",
      description: "",
    },
  });

  const endTime = form.watch("endTime");

  useEffect(() => {
    if (open) {
      form.reset({
        endTime: new Date().toISOString().slice(0, 16),
        resolvedBy: "",
        description: downtimeLog?.description ?? "",
      });
    }
  }, [open, downtimeLog, form]);

  const handleSubmit = (data: ResolveFormValues) => {
    if (downtimeLog) {
      onSubmit(downtimeLog.id, data);
    }
  };

  if (!downtimeLog) return null;

  const reasonCodeInfo = downtimeReasonCodes[downtimeLog.reasonCode as keyof typeof downtimeReasonCodes];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle data-testid="dialog-title-resolve-downtime">
            Resolve Downtime
          </DialogTitle>
          <DialogDescription>
            Mark this downtime event as resolved
          </DialogDescription>
        </DialogHeader>
        
        {/* Downtime Summary */}
        <div className="rounded-md bg-muted/50 p-4 space-y-2">
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Machine:</span>
            <span className="text-sm font-medium">{machineName || "Unknown"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Reason:</span>
            <span className="text-sm font-medium">{reasonCodeInfo?.label || downtimeLog.reasonCode}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Started:</span>
            <span className="text-sm font-mono">{new Date(downtimeLog.startTime).toLocaleString()}</span>
          </div>
          {endTime && (
            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                Duration:
              </span>
              <span className="text-sm font-bold text-primary">
                {formatDuration(downtimeLog.startTime, endTime)}
              </span>
            </div>
          )}
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4" data-testid="form-resolve-downtime">
            <FormField
              control={form.control}
              name="endTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>End Time</FormLabel>
                  <FormControl>
                    <Input 
                      type="datetime-local" 
                      {...field} 
                      className="font-mono"
                      data-testid="input-resolve-end-time"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="resolvedBy"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Resolved By (Optional)</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Your name" 
                      {...field} 
                      data-testid="input-resolve-by"
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
                  <FormLabel>Resolution Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="How was the issue resolved?"
                      className="resize-none"
                      rows={2}
                      {...field} 
                      data-testid="input-resolve-notes"
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
                data-testid="button-cancel-resolve"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} data-testid="button-save-resolve">
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Resolve Downtime
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
