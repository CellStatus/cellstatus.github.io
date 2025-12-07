import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Trash2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, Line, LineChart } from "recharts";
import type {
  MachineLog,
  ReportResponse,
  MachineHistoryResponse,
  DowntimeStats,
  MaintenanceLog,
  JobSetterActivity,
} from "./reports.types";

export default function Reports() {
  const [reportTimestamp, setReportTimestamp] = useState<Date | null>(new Date());
  const { data: reportData, isLoading } = useQuery<ReportResponse>({
    queryKey: ["/api/reports/efficiency"],
    staleTime: 0,
  });
  const { data: historyData, isLoading: isLoadingHistory } = useQuery<MachineHistoryResponse>({
    queryKey: ["/api/reports/machine-history"],
    staleTime: 0,
  });
  const { data: downtimeStats } = useQuery<DowntimeStats>({
    queryKey: ["/api/downtime/stats"],
    staleTime: 0,
  });
  const { data: downtimeLogs = [] } = useQuery<any[]>({
    queryKey: ["/api/downtime"],
    staleTime: 0,
  });
  const { data: machines = [] } = useQuery<any[]>({
    queryKey: ["/api/machines"],
    staleTime: 0,
  });
  const deleteDowntimeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/downtime/${id}`, { method: "DELETE" });
      try { await res.json(); } catch {}
    },
    onSuccess: () => {
      // Invalidate queries if needed
    },
  });
  const handleGenerateReport = () => setReportTimestamp(new Date());

  // OEE history prep
  const oeeHistory: { [machineId: string]: { name: string; machineIdTag: string; data: { date: string; shift: string; oee: number | null, performance?: number | null, quality?: number | null, availability?: number | null }[] } } = {};
  if (historyData?.machines) {
    for (const machine of historyData.machines) {
      oeeHistory[machine.machineId] = {
        name: machine.machineName,
        machineIdTag: machine.machineIdTag,
        data: (machine.productionStats || []).map(stat => ({
          date: stat.date,
          shift: stat.shift,
          oee: typeof stat.oee === "number" ? Math.round(stat.oee * 1000) / 10 : null,
          performance: typeof stat.performance === "number" ? Math.round(stat.performance * 1000) / 10 : null,
          quality: typeof stat.quality === "number" ? Math.round(stat.quality * 1000) / 10 : null,
          availability: typeof stat.availability === "number" ? Math.round(stat.availability * 1000) / 10 : null,
        }))
      };
    }
  }
  const allDates = Array.from(new Set(
    Object.values(oeeHistory).flatMap(m => m.data.map(d => d.date))
  )).sort();


  // Calculate per-machine averages for A, P, Q, OEE
  const machineAverages = Object.entries(oeeHistory).map(([machineId, { name, machineIdTag, data }]) => {
    const oees = data.map(d => d.oee).filter((v): v is number => v != null);
    const ps = data.map(d => d.performance).filter((v): v is number => v != null);
    const qs = data.map(d => d.quality).filter((v): v is number => v != null);
    const as = data.map(d => d.availability).filter((v): v is number => v != null);
    return {
      machineId,
      name,
      machineIdTag,
      avgOEE: oees.length ? (oees.reduce((a, b) => a + b, 0) / oees.length) : null,
      avgP: ps.length ? (ps.reduce((a, b) => a + b, 0) / ps.length) : null,
      avgQ: qs.length ? (qs.reduce((a, b) => a + b, 0) / qs.length) : null,
      avgA: as.length ? (as.reduce((a, b) => a + b, 0) / as.length) : null,
    };
  });

  // Calculate daily average OEE, P, Q across all machines for the trend chart
  const avgOEETrend = allDates.map(date => {
    let oees: number[] = [];
    let ps: number[] = [];
    let qs: number[] = [];
    Object.values(oeeHistory).forEach(machine => {
      const stat = machine.data.find(d => d.date === date);
      if (stat) {
        if (typeof stat.oee === 'number') oees.push(stat.oee);
        if (typeof stat.performance === 'number') ps.push(stat.performance);
        if (typeof stat.quality === 'number') qs.push(stat.quality);
      }
    });
    return {
      date,
      avgOEE: oees.length ? oees.reduce((a, b) => a + b, 0) / oees.length : null,
      avgP: ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : null,
      avgQ: qs.length ? qs.reduce((a, b) => a + b, 0) / qs.length : null,
    };
  });

  if (isLoading || isLoadingHistory) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="p-4">
          <h1 className="text-2xl font-bold mb-1">Reports</h1>
          <p className="text-muted-foreground text-sm">Loading data...</p>
        </div>
        <div className="flex-1 px-4 pb-4">
          <Skeleton className="h-full" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-shrink-0 border-b p-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">OEE Reports</h1>
              <p className="text-muted-foreground text-sm mt-1">
                Generated on {reportTimestamp?.toLocaleDateString()} at {reportTimestamp?.toLocaleTimeString()}
              </p>
            </div>
            <Button
              onClick={handleGenerateReport}
              variant="outline"
              size="sm"
              data-testid="button-refresh-report"
            >
              Refresh Timestamp
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-6">
            {/* Machine Averages Table */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Machine OEE Averages</CardTitle>
                <CardDescription className="text-xs">
                  Average OEE, Availability (A), Performance (P), and Quality (Q) for each machine
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b sticky top-0 bg-background">
                      <tr>
                        <th className="text-left py-1 px-1">Machine</th>
                        <th className="text-left py-1 px-1">ID</th>
                        <th className="text-center py-1 px-1">Avg OEE</th>
                        <th className="text-center py-1 px-1">Avg A</th>
                        <th className="text-center py-1 px-1">Avg P</th>
                        <th className="text-center py-1 px-1">Avg Q</th>
                      </tr>
                    </thead>
                    <tbody>
                      {machineAverages.map(row => (
                        <tr key={row.machineId} className="border-b hover:bg-muted/50">
                          <td className="py-1 px-1 font-medium truncate">{row.name}</td>
                          <td className="py-1 px-1 font-mono text-xs truncate">{row.machineIdTag}</td>
                          <td className="text-center py-1 px-1 tabular-nums">{row.avgOEE != null ? `${row.avgOEE.toFixed(1)}%` : "--"}</td>
                          <td className="text-center py-1 px-1 tabular-nums">{row.avgA != null ? `${row.avgA.toFixed(1)}%` : "--"}</td>
                          <td className="text-center py-1 px-1 tabular-nums">{row.avgP != null ? `${row.avgP.toFixed(1)}%` : "--"}</td>
                          <td className="text-center py-1 px-1 tabular-nums">{row.avgQ != null ? `${row.avgQ.toFixed(1)}%` : "--"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
            {/* Average OEE, P, Q Trend Chart */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Average OEE, P, Q Trend</CardTitle>
                <CardDescription className="text-xs">
                  Daily average OEE (%), Performance (P), and Quality (Q) across all machines
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={avgOEETrend} margin={{ top: 16, right: 32, left: 8, bottom: 8 }}>
                    <XAxis dataKey="date" fontSize={12} />
                    <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} fontSize={12} />
                    <Tooltip formatter={v => v != null ? `${v.toFixed(1)}%` : "--"} />
                    <Legend />
                    <Line type="monotone" dataKey="avgOEE" name="Avg OEE" stroke="#3b82f6" strokeWidth={3} dot />
                    <Line type="monotone" dataKey="avgP" name="Avg P" stroke="#10b981" strokeWidth={2} dot />
                    <Line type="monotone" dataKey="avgQ" name="Avg Q" stroke="#f59e42" strokeWidth={2} dot />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            {/* Downtime Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs">Total Downtime Incidents</CardDescription>
                  <CardTitle className="text-2xl font-mono">{downtimeStats?.summary.totalIncidents ?? 0}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs">Total Downtime</CardDescription>
                  <CardTitle className="text-2xl font-mono">{downtimeStats?.summary.totalDowntimeHours?.toFixed(1) ?? 0}h</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs">Today's Downtime</CardDescription>
                  <CardTitle className="text-2xl font-mono">{downtimeStats?.summary.todayDowntimeHours?.toFixed(1) ?? 0}h</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs">Avg Duration</CardDescription>
                  <CardTitle className="text-2xl font-mono">{downtimeStats?.summary.avgDurationMinutes?.toFixed(0) ?? 0}m</CardTitle>
                </CardHeader>
              </Card>
            </div>
            {/* Downtime Table */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Downtime Summary</CardTitle>
                <CardDescription className="text-xs">Recent downtime by machine, time, and duration</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto max-h-64 border rounded-md">
                  <table className="w-full text-xs">
                    <thead className="border-b sticky top-0 bg-background">
                      <tr>
                        <th className="text-left py-2 px-2">Machine</th>
                        <th className="text-left py-2 px-2">Start</th>
                        <th className="text-left py-2 px-2">End</th>
                        <th className="text-right py-2 px-2">Duration</th>
                        <th className="text-left py-2 px-2">Reason</th>
                        <th className="text-right py-2 px-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {downtimeLogs && downtimeLogs.length > 0 ? (
                        [...downtimeLogs]
                          .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
                          .slice(0, 100)
                          .map((log) => {
                            const machineName = machines.find((m) => m.id === log.machineId)?.name || log.machineId;
                            const start = new Date(log.startTime);
                            const end = log.endTime ? new Date(log.endTime) : null;
                            const durationMin = log.duration ?? (end ? Math.max(0, Math.round((end.getTime() - start.getTime())/60000)) : null);
                            return (
                              <tr key={log.id} className="border-b hover:bg-muted/50">
                                <td className="py-2 px-2 truncate">{machineName}</td>
                                <td className="py-2 px-2 truncate">{start.toLocaleString()}</td>
                                <td className="py-2 px-2 truncate">{end ? end.toLocaleString() : "Active"}</td>
                                <td className="text-right py-2 px-2 tabular-nums">{durationMin != null ? `${durationMin}m` : "—"}</td>
                                <td className="py-2 px-2 truncate capitalize">{log.reasonCode}</td>
                                <td className="text-right py-2 px-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 gap-1"
                                    onClick={() => deleteDowntimeMutation.mutate(log.id)}
                                    disabled={deleteDowntimeMutation.isPending}
                                    title="Delete this downtime log"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Delete
                                  </Button>
                                </td>
                              </tr>
                            );
                          })
                      ) : (
                        <tr>
                          <td colSpan={6} className="py-2 px-2 text-center text-muted-foreground">No downtime incidents</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}

