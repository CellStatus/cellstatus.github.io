import { useMemo, useState } from "react";
// ...existing code...
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Machine, ProductionStat } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { calculateOEEStats } from "@/lib/oeeUtils";
import { useQuery } from "@tanstack/react-query";

export default function ProductionStats() {
  const todayLocal = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const { data: machines = [], isLoading: isLoadingMachines } = useQuery<Machine[]>({
    queryKey: ["/api/machines"],
    staleTime: 60000,
  });

  const { data: productionStats = [], isLoading: isLoadingStats } = useQuery<ProductionStat[]>({
    queryKey: ["/api/production-stats"],
    staleTime: 0,
  });

  // Fetch all downtime logs
  const { data: downtimeLogs = [], isLoading: isLoadingDowntime } = useQuery({
    queryKey: ["/api/downtime"],
    staleTime: 0,
  });

  const [form, setForm] = useState({
    machineId: "",
    shift: "Day",
    date: todayLocal,
    goodPartsRan: "",
    scrapParts: "",
    idealCycleTime: "",
    downtime: "0",
    oee: "",
    availability: "",
    performance: "",
    quality: "",
  });

  const submitStatMutation = useMutation({
    mutationFn: async () => {
      // Find the selected machine
      const selectedMachine = machines.find(m => m.id === form.machineId);

      // Aggregate downtime for selected machine/date/shift
      const selectedDate = form.date;
      const selectedShift = form.shift;
      const machineId = form.machineId;
      // Filter downtime logs for this machine, date, and shift
      const relevantDowntimeLogs = downtimeLogs.filter((log) => {
        // log.machineId, log.date, log.shift must match
        return log.machineId === machineId && log.date === selectedDate && log.shift === selectedShift;
      });
      const aggregatedDowntime = relevantDowntimeLogs.reduce((sum, log) => sum + (log.duration || 0), 0);

      // Use aggregated downtime in OEE calculation
      const oeeStats = calculateOEEStats({
        plannedProductionTime: 420,
        downtime: aggregatedDowntime,
        goodPartsRan: Number(form.goodPartsRan || 0),
        scrapParts: Number(form.scrapParts || 0),
        idealCycleTime: Number(form.idealCycleTime || 0),
      });
      const payload = {
        machineId: form.machineId,
        shift: form.shift,
        date: form.date,
        goodPartsRan: Number(form.goodPartsRan || 0),
        scrapParts: Number(form.scrapParts || 0),
        idealCycleTime: Number(form.idealCycleTime || 0),
        downtime: aggregatedDowntime,
        oee: oeeStats.oee,
        availability: oeeStats.availability,
        performance: oeeStats.performance,
        quality: oeeStats.quality,
      };
      await apiRequest("POST", "/api/production-stats", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/production-stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/efficiency"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/machine-history"] });
      setForm((f) => ({ ...f,
        goodPartsRan: "",
        scrapParts: "",
        idealCycleTime: "",
        downtime: "0",
        oee: "",
        availability: "",
        performance: "",
        quality: "",
      }));
    },
  });

  const deleteStatMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/production-stats/${id}`);
      try { await res.json(); } catch {}
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/production-stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/efficiency"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/machine-history"] });
    },
  });

  if (isLoadingMachines || isLoadingStats) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="p-4">
          <h1 className="text-2xl font-bold mb-1">Production Stats</h1>
          <p className="text-muted-foreground text-sm">Loading data...</p>
        </div>
        <div className="flex-1 px-4 pb-4">
          <Skeleton className="h-full" />
        </div>
      </div>
    );
  }

  // Calculate live OEE metrics for the form
  const selectedDate = form.date;
  const selectedShift = form.shift;
  const machineId = form.machineId;
  const relevantDowntimeLogs = downtimeLogs.filter((log) => {
    return log.machineId === machineId && log.date === selectedDate && log.shift === selectedShift;
  });
  const aggregatedDowntime = relevantDowntimeLogs.reduce((sum, log) => sum + (log.duration || 0), 0);
  const oeeStats = calculateOEEStats({
    plannedProductionTime: 420,
    downtime: aggregatedDowntime,
    goodPartsRan: Number(form.goodPartsRan || 0),
    scrapParts: Number(form.scrapParts || 0),
    idealCycleTime: Number(form.idealCycleTime || 0),
  });

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 border-b p-4">
        <div>
          <h1 className="text-2xl font-bold">Production Stats</h1>
          <p className="text-muted-foreground text-sm mt-1">
            View and manage production statistics for machines
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Create Production Stat</CardTitle>
              <CardDescription className="text-xs">Add a new production entry</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Machine</Label>
                  <Select value={form.machineId} onValueChange={(v) => setForm((f) => ({ ...f, machineId: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select machine" />
                    </SelectTrigger>
                    <SelectContent>
                      {machines.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name} <span className="text-muted-foreground text-xs font-mono">({m.machineId})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Shift</Label>
                  <Select value={form.shift} onValueChange={(v) => setForm((f) => ({ ...f, shift: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {['Day','Afternoon','Midnight'].map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Date</Label>
                  <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label>Good Parts Ran</Label>
                  <Input type="number" inputMode="numeric" value={form.goodPartsRan} onChange={(e) => setForm((f) => ({ ...f, goodPartsRan: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Scrap Parts</Label>
                  <Input type="number" inputMode="numeric" value={form.scrapParts} onChange={(e) => setForm((f) => ({ ...f, scrapParts: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Ideal Cycle Time (sec)</Label>
                  <Input type="number" inputMode="numeric" value={form.idealCycleTime} onChange={(e) => setForm((f) => ({ ...f, idealCycleTime: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Downtime (min)</Label>
                  <Input type="number" inputMode="numeric" value={aggregatedDowntime} disabled />
                </div>
                <div className="space-y-1">
                  <Label>OEE</Label>
                  <Input type="number" inputMode="decimal" step="0.01" value={oeeStats.oee} disabled />
                </div>
                <div className="space-y-1">
                  <Label>Availability</Label>
                  <Input type="number" inputMode="decimal" step="0.01" value={oeeStats.availability} disabled />
                </div>
                <div className="space-y-1">
                  <Label>Performance</Label>
                  <Input type="number" inputMode="decimal" step="0.01" value={oeeStats.performance} disabled />
                </div>
                <div className="space-y-1">
                  <Label>Quality</Label>
                  <Input type="number" inputMode="decimal" step="0.01" value={oeeStats.quality} disabled />
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={() => submitStatMutation.mutate()}
                  disabled={!form.machineId || !form.date || submitStatMutation.isPending}
                  className={`gap-2${submitStatMutation.isPending ? ' opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Plus className="h-4 w-4" />
                  {submitStatMutation.isPending ? 'Submitting...' : 'Add Entry'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Production Stats</CardTitle>
              <CardDescription className="text-xs">Latest entries (most recent first)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto max-h-[50vh] border rounded-md">
                <table className="w-full text-xs">
                  <thead className="border-b sticky top-0 bg-background">
                    <tr>
                      <th className="text-left py-2 px-2">Date</th>
                      <th className="text-left py-2 px-2">Machine</th>
                      <th className="text-left py-2 px-2">Shift</th>
                      <th className="text-right py-2 px-2">Good Parts</th>
                      <th className="text-right py-2 px-2">Scrap Parts</th>
                      <th className="text-right py-2 px-2">Ideal Cycle Time</th>
                      <th className="text-right py-2 px-2">Downtime</th>
                      <th className="text-right py-2 px-2">OEE</th>
                      <th className="text-right py-2 px-2">Availability</th>
                      <th className="text-right py-2 px-2">Performance</th>
                      <th className="text-right py-2 px-2">Quality</th>
                      <th className="text-right py-2 px-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...productionStats]
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .slice(0, 200)
                      .map((stat) => {
                        const machineName = machines.find((m) => m.id === stat.machineId)?.name || stat.machineId;
                        return (
                          <tr key={stat.id} className="border-b hover:bg-muted/50">
                            <td className="py-2 px-2 truncate">{stat.date}</td>
                            <td className="py-2 px-2 truncate">{machineName}</td>
                            <td className="py-2 px-2 truncate">{stat.shift}</td>
                            <td className="text-right py-2 px-2 tabular-nums">{stat.goodPartsRan}</td>
                            <td className="text-right py-2 px-2 tabular-nums">{stat.scrapParts}</td>
                            <td className="text-right py-2 px-2 tabular-nums">{stat.idealCycleTime}</td>
                            <td className="text-right py-2 px-2 tabular-nums">{stat.downtime ?? 0}m</td>
                            <td className="text-right py-2 px-2 tabular-nums">{stat.oee}</td>
                            <td className="text-right py-2 px-2 tabular-nums">{stat.availability}</td>
                            <td className="text-right py-2 px-2 tabular-nums">{stat.performance}</td>
                            <td className="text-right py-2 px-2 tabular-nums">{stat.quality}</td>
                            <td className="text-right py-2 px-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 gap-1"
                                onClick={() => deleteStatMutation.mutate(stat.id)}
                                disabled={deleteStatMutation.isPending}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Delete
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
