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
import type { Operator } from "@shared/schema";

const operatorFormSchema = z.object({
  name: z.string().min(1, "Operator name is required"),
  initials: z.string().min(1, "Initials are required").max(3, "Maximum 3 characters"),
  shift: z.string().min(1, "Shift is required"),
});

type OperatorFormValues = z.infer<typeof operatorFormSchema>;

interface OperatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operator?: Operator | null;
  onSubmit: (data: OperatorFormValues) => void;
  isPending: boolean;
}

export function OperatorDialog({
  open,
  onOpenChange,
  operator,
  onSubmit,
  isPending,
}: OperatorDialogProps) {
  const isEditing = !!operator;

  const form = useForm<OperatorFormValues>({
    resolver: zodResolver(operatorFormSchema),
    defaultValues: {
      name: "",
      initials: "",
      shift: "Day",
    },
  });

  useEffect(() => {
    if (open) {
      if (operator) {
        form.reset({
          name: operator.name,
          initials: operator.initials,
          shift: operator.shift,
        });
      } else {
        form.reset({
          name: "",
          initials: "",
          shift: "Day",
        });
      }
    }
  }, [open, operator, form]);

  const handleSubmit = (data: OperatorFormValues) => {
    onSubmit(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle data-testid="dialog-title-operator">
            {isEditing ? "Edit Operator" : "Add New Operator"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update operator details and shift assignment"
              : "Add a new operator to your manufacturing cell"}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4" data-testid="form-operator">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="John Smith" 
                      {...field} 
                      data-testid="input-operator-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="initials"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Initials</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="JS" 
                        {...field} 
                        maxLength={3}
                        className="font-mono uppercase"
                        data-testid="input-operator-initials"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="shift"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Shift</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-operator-shift">
                          <SelectValue placeholder="Select shift" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Day" data-testid="option-shift-day">Day</SelectItem>
                        <SelectItem value="Swing" data-testid="option-shift-swing">Swing</SelectItem>
                        <SelectItem value="Night" data-testid="option-shift-night">Night</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-operator"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} data-testid="button-save-operator">
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? "Save Changes" : "Add Operator"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
