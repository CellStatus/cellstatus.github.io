import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Machine } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface ScrapTicket {
  id: string;
  machineId: string;
  quantity: number;
  reason: string;
  description: string;
  date: string;
  createdAt: string;
}

const scrapReasons = [
  { value: "defect", label: "Product Defect" },
  { value: "material", label: "Material Issue" },
  { value: "setup", label: "Setup/Calibration" },
  { value: "tooling", label: "Tooling Problem" },
  { value: "operator", label: "Operator Error" },
  { value: "quality", label: "Quality Hold" },
  { value: "other", label: "Other" },
];

export default function ScrapPage() {
  const todayLocal = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const { data: machines = [], isLoading: isLoadingMachines } = useQuery<Machine[]>({
    queryKey: ["/api/machines"],
    staleTime: 60000,
  });

  // Placeholder for scrap tickets - would be replaced with actual API calls
  const [scrapTickets, setScrapTickets] = useState<ScrapTicket[]>([]);

  const [form, setForm] = useState({
    machineId: "",
    quantity: "",
    reason: "",
    description: "",
    date: todayLocal,
  });

  const submitScrapMutation = useMutation({
    mutationFn: async () => {
      const newTicket: ScrapTicket = {
        id: `scrap-${Date.now()}`,
        machineId: form.machineId,
        quantity: Number(form.quantity),
        reason: form.reason,
        description: form.description,
        date: form.date,
        createdAt: new Date().toISOString(),
      };
      setScrapTickets([...scrapTickets, newTicket]);
      setForm({
        machineId: "",
        quantity: "",
        reason: "",
        description: "",
        date: todayLocal,
      });
    },
  });

  const deleteScrapMutation = useMutation({
    mutationFn: async (id: string) => {
      setScrapTickets(scrapTickets.filter((t) => t.id !== id));
    },
  });

  if (isLoadingMachines) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="p-4">
          <h1 className="text-2xl font-bold mb-1">Scrap Tickets</h1>
          <p className="text-muted-foreground text-sm">Loading data...</p>
        </div>
        <div className="flex-1 px-4 pb-4">
          <Skeleton className="h-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 border-b p-4">
        <div>
          <h1 className="text-2xl font-bold">Scrap Tickets</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track and record scrap incidents
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4">
          {/* Create Scrap Ticket Form */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Record Scrap Incident</CardTitle>
              <CardDescription className="text-xs">Create a new scrap ticket</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Machine</Label>
                  <Select value={form.machineId} onValueChange={(v) => setForm((f) => ({ ...f, machineId: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select machine" />
                    </SelectTrigger>
                    <SelectContent>
                      {machines.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Quantity</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="Number of units scrapped"
                    value={form.quantity}
                    onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Reason</Label>
                  <Select value={form.reason} onValueChange={(v) => setForm((f) => ({ ...f, reason: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select reason" />
                    </SelectTrigger>
                    <SelectContent>
                      {scrapReasons.map((r) => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Description / Comments</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Add details about the scrap incident..."
                  className="min-h-20"
                />
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={() => submitScrapMutation.mutate()}
                  disabled={!form.machineId || !form.quantity || !form.reason || submitScrapMutation.isPending}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Create Ticket
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Scrap Tickets List */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Recent Tickets</CardTitle>
              <CardDescription className="text-xs">Latest scrap records (most recent first)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {scrapTickets.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No scrap tickets recorded</p>
                  </div>
                ) : (
                  [...scrapTickets]
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .map((ticket) => {
                      const machine = machines.find((m) => m.id === ticket.machineId);
                      const reasonLabel = scrapReasons.find((r) => r.value === ticket.reason)?.label || ticket.reason;

                      return (
                        <div
                          key={ticket.id}
                          className="border rounded-lg p-3 space-y-2 hover:bg-muted/50 transition"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-medium text-sm">{machine?.name || ticket.machineId}</h3>
                                <Badge variant="destructive" className="text-xs">
                                  {ticket.quantity} units
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">{reasonLabel}</p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-2 gap-1 flex-shrink-0"
                              onClick={() => deleteScrapMutation.mutate(ticket.id)}
                              disabled={deleteScrapMutation.isPending}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </Button>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                            <div>
                              <span className="text-muted-foreground">Date:</span>
                              <p className="font-mono">{new Date(ticket.date).toLocaleDateString()}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Recorded:</span>
                              <p className="font-mono">{new Date(ticket.createdAt).toLocaleString()}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Reason:</span>
                              <p className="font-mono">{reasonLabel}</p>
                            </div>
                          </div>

                          {ticket.description && (
                            <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded">
                              <p className="font-medium mb-1">Comments:</p>
                              <p>{ticket.description}</p>
                            </div>
                          )}
                        </div>
                      );
                    })
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
