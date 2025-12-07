import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Clock, AlertTriangle } from "lucide-react";
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
import type { Machine, DowntimeLog } from "@shared/schema";
import { downtimeReasonCodes, downtimeCategories } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";

const categoryColors: Record<string, string> = {
  mechanical: "#ef4444",
  electrical: "#f59e0b",
  material: "#3b82f6",
  operator: "#8b5cf6",
  quality: "#ec4899",
  other: "#6b7280",
};

export default function DowntimePage() {
  const todayLocal = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const { data: machines = [], isLoading: isLoadingMachines } = useQuery<Machine[]>({
    queryKey: ["/api/machines"],
    staleTime: 60000,
  });

  const { data: downtimeLogs = [], isLoading: isLoadingLogs } = useQuery<DowntimeLog[]>({
    queryKey: ["/api/downtime"],
    staleTime: 0,
  });

  const [form, setForm] = useState({
    machineId: "",
    reasonCode: "",
    description: "",
    startTime: `${todayLocal}T08:00`,
    endTime: "",
  });

  const submitDowntimeMutation = useMutation({
    mutationFn: async () => {
      const startDate = new Date(form.startTime);
      const endDate = form.endTime ? new Date(form.endTime) : null;
      const durationMs = endDate ? endDate.getTime() - startDate.getTime() : 0;
      const durationMin = Math.round(durationMs / 60000);

      const reasonCodeKey = form.reasonCode as keyof typeof downtimeReasonCodes;
      const reasonInfo = downtimeReasonCodes[reasonCodeKey];

      const payload = {
        machineId: form.machineId,
        reasonCode: form.reasonCode,
        reasonCategory: reasonInfo.category,
        description: form.description,
        startTime: form.startTime,
        endTime: form.endTime || undefined,
        duration: endDate ? durationMin : undefined,
      };
      await apiRequest("POST", "/api/downtime", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/downtime"] });
      queryClient.invalidateQueries({ queryKey: ["/api/downtime/stats"] });
      setForm({
        machineId: "",
        reasonCode: "",
        description: "",
        startTime: `${todayLocal}T08:00`,
        endTime: "",
      });
    },
  });

  const deleteDowntimeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/downtime/${id}`);
      try { await res.json(); } catch {}
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/downtime"] });
      queryClient.invalidateQueries({ queryKey: ["/api/downtime/stats"] });
    },
  });

  const getReasonLabel = (code: string) => {
    const reasonInfo = downtimeReasonCodes[code as keyof typeof downtimeReasonCodes];
    return reasonInfo?.label || code;
  };

  if (isLoadingMachines || isLoadingLogs) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="p-4">
          <h1 className="text-2xl font-bold mb-1">Downtime Incidents</h1>
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
          <h1 className="text-2xl font-bold">Downtime Incidents</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Record and track machine downtime incidents
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4">
          {/* Create Downtime Form */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Record Downtime Incident</CardTitle>
              <CardDescription className="text-xs">Add a new downtime event for a machine</CardDescription>
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
                  <Label>Reason Code</Label>
                  <Select value={form.reasonCode} onValueChange={(v) => setForm((f) => ({ ...f, reasonCode: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select reason" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(downtimeReasonCodes).map(([code, info]) => (
                        <SelectItem key={code} value={code}>{info.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Start Time</Label>
                  <Input 
                    type="datetime-local" 
                    value={form.startTime} 
                    onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} 
                  />
                </div>
                <div className="space-y-1">
                  <Label>End Time (optional)</Label>
                  <Input 
                    type="datetime-local" 
                    value={form.endTime} 
                    onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} 
                    placeholder="Leave blank if still ongoing"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Description / Comments</Label>
                <Textarea 
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Add details about the downtime incident..."
                  className="min-h-24"
                />
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={() => submitDowntimeMutation.mutate()}
                  disabled={!form.machineId || !form.reasonCode || !form.startTime || submitDowntimeMutation.isPending}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Record Incident
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Downtime Logs List */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Recent Incidents</CardTitle>
              <CardDescription className="text-xs">Latest downtime records (most recent first)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {downtimeLogs.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">
                    <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No downtime incidents recorded</p>
                  </div>
                ) : (
                  [...downtimeLogs]
                    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
                    .map((log) => {
                      const machine = machines.find((m) => m.id === log.machineId);
                      const reasonInfo = downtimeReasonCodes[log.reasonCode as keyof typeof downtimeReasonCodes];
                      const startDate = new Date(log.startTime);
                      const endDate = log.endTime ? new Date(log.endTime) : null;
                      const durationMin = log.duration ?? (endDate ? Math.round((endDate.getTime() - startDate.getTime()) / 60000) : 0);
                      const categoryColor = categoryColors[log.reasonCategory];

                      return (
                        <div
                          key={log.id}
                          className="border rounded-lg p-3 space-y-2 hover:bg-muted/50 transition"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-medium text-sm">{machine?.name || log.machineId}</h3>
                                <Badge
                                  variant="outline"
                                  style={{ borderColor: categoryColor, color: categoryColor }}
                                  className="text-xs"
                                >
                                  {log.reasonCategory}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">{reasonInfo?.label || log.reasonCode}</p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-2 gap-1 flex-shrink-0"
                              onClick={() => deleteDowntimeMutation.mutate(log.id)}
                              disabled={deleteDowntimeMutation.isPending}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </Button>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                            <div>
                              <span className="text-muted-foreground">Start:</span>
                              <p className="font-mono">{startDate.toLocaleString()}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">End:</span>
                              <p className="font-mono">{endDate ? endDate.toLocaleString() : "Ongoing"}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Duration:</span>
                              <p className="font-mono flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {durationMin}m
                              </p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Reported:</span>
                              <p className="font-mono">{log.reportedBy || "—"}</p>
                            </div>
                          </div>

                          {log.description && (
                            <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded">
                              <p className="font-medium mb-1">Comments:</p>
                              <p>{log.description}</p>
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
