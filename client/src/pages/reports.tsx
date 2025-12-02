import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { FileDown, History, TrendingUp, Plus, Trash2, AlertTriangle, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import type { Machine, ProductionStat, DowntimeLog } from "@shared/schema";
import { downtimeReasonCodes, downtimeCategories } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface MachineLog {
  machineId: string;
  machineName: string;
  status: string;
  operatorName: string;
  statsCount: number;
  totalUnitsProduced: number;
  avgEfficiency: string;
  completedShifts: string[];
  createdAt: string;
  createdBy: string;
  lastUpdated: string;
  lastUpdatedBy: string;
}

interface JobSetterActivity {
  operatorName: string;
  operatorId: string;
  type: string;
  target: string;
  timestamp: string;
  details: string;
}

interface MaintenanceLog {
  id: string;
  machineId: string;
  machineName: string;
  type: string;
  description: string;
  status: string;
  scheduledDate: string;
  completedDate: string;
  technician: string;
  notes: string;
  createdAt: string;
  createdBy: string;
}

interface ReportResponse {
  data: any[];
  machineLogs: MachineLog[];
  jobSetterActivities: JobSetterActivity[];
  maintenanceLogs: MaintenanceLog[];
}

interface MachineHistoryResponse {
  machines: MachineHistory[];
}

interface MachineHistory {
  machineId: string;
  machineName: string;
  machineIdTag: string;
  status: string;
  currentOperator: string;
  createdAt: string;
  updatedAt: string;
  summary: {
    totalProductionStats: number;
    totalUnitsProduced: number;
    avgEfficiency: number | null;
    totalMaintenanceRecords: number;
    openMaintenance: number;
    completedMaintenance: number;
  };
  productionStats: ProductionStatHistory[];
  maintenance: MaintenanceHistory[];
}

interface ProductionStatHistory {
  id: string;
  date: string;
  shift: string;
  unitsProduced: number;
  targetUnits: number;
  downtime: number;
  efficiency: number | null;
  createdAt: string;
  createdBy: string;
}

interface MaintenanceHistory {
  id: string;
  type: string;
  description: string;
  status: string;
  scheduledDate: string;
  completedDate: string;
  technician: string;
  notes: string;
  createdAt: string;
  createdBy: string;
}

interface DowntimeStats {
  summary: {
    totalIncidents: number;
    totalDowntimeMinutes: number;
    totalDowntimeHours: number;
    activeIncidents: number;
    todayDowntimeMinutes: number;
    todayDowntimeHours: number;
    avgDurationMinutes: number;
  };
  byReasonCode: Record<string, { count: number; totalMinutes: number }>;
  byCategory: Record<string, { count: number; totalMinutes: number }>;
  byMachine: Record<string, { count: number; totalMinutes: number; machineName: string }>;
}

// Colors for downtime categories
const categoryColors: Record<string, string> = {
  mechanical: "#ef4444",
  electrical: "#f59e0b",
  material: "#3b82f6",
  operator: "#8b5cf6",
  quality: "#ec4899",
  other: "#6b7280",
};

export default function Reports() {
  const [reportGenerated, setReportGenerated] = useState(false);
  const [reportTimestamp, setReportTimestamp] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<"efficiency" | "history" | "production" | "downtime">("efficiency");
  const todayLocal = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);
  

  const { data: reportData, isLoading } = useQuery<ReportResponse>({
    queryKey: ["/api/reports/efficiency"],
    enabled: reportGenerated && activeTab === "efficiency",
    staleTime: 0,
  });

  const { data: historyData, isLoading: isLoadingHistory } = useQuery<MachineHistoryResponse>({
    queryKey: ["/api/reports/machine-history"],
    enabled: reportGenerated && activeTab === "history",
    staleTime: 0,
  });

  // Production stats + machines for the new tab
  const { data: productionStats = [] } = useQuery<ProductionStat[]>({
    queryKey: ["/api/production-stats"],
    enabled: reportGenerated && activeTab === "production",
    staleTime: 0,
  });
  const { data: machines = [] } = useQuery<Machine[]>({
    queryKey: ["/api/machines"],
    enabled: reportGenerated && (activeTab === "production" || activeTab === "downtime"),
    staleTime: 0,
  });

  // Downtime data for the downtime analysis tab
  const { data: downtimeLogs = [] } = useQuery<DowntimeLog[]>({
    queryKey: ["/api/downtime"],
    enabled: reportGenerated && activeTab === "downtime",
    staleTime: 0,
  });

  const { data: downtimeStats } = useQuery<DowntimeStats>({
    queryKey: ["/api/downtime/stats"],
    enabled: reportGenerated && activeTab === "downtime",
    staleTime: 0,
  });

  // Form state for creating a new production stat
  const [form, setForm] = useState({
    machineId: "",
    shift: "Day",
    date: todayLocal,
    unitsProduced: "",
    targetUnits: "",
    downtime: "0",
    efficiency: "",
  });

  const submitStatMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        machineId: form.machineId,
        shift: form.shift,
        date: form.date,
        unitsProduced: Number(form.unitsProduced || 0),
        targetUnits: Number(form.targetUnits || 0),
        downtime: Number(form.downtime || 0),
        efficiency: form.efficiency === "" ? null : Number(form.efficiency),
      } as const;
      await apiRequest("POST", "/api/production-stats", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/production-stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/efficiency"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/machine-history"] });
      // Reset minimal fields
      setForm((f) => ({ ...f, unitsProduced: "", targetUnits: "", downtime: "0", efficiency: "" }));
    },
  });

  const deleteStatMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/production-stats/${id}`);
      // Optional: read response to confirm
      try { await res.json(); } catch {}
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/production-stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/efficiency"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/machine-history"] });
    },
  });

  const handleGenerateReport = () => {
    setReportTimestamp(new Date());
    setReportGenerated(true);
  };

  if (!reportGenerated) {
    return (
      <div className="h-full flex items-center justify-center">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>Production Reports</CardTitle>
            <CardDescription>
              Generate efficiency analysis and machine history reports
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleGenerateReport}
              size="lg"
              className="w-full gap-2"
              data-testid="button-generate-report"
            >
              <FileDown className="h-4 w-4" />
              Generate Reports
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading || isLoadingHistory) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="p-4">
          <h1 className="text-2xl font-bold mb-1">Production Efficiency Report</h1>
          <p className="text-muted-foreground text-sm">Generating efficiency analysis...</p>
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Production Reports</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Generated on {reportTimestamp?.toLocaleDateString()} at {reportTimestamp?.toLocaleTimeString()}
            </p>
          </div>
          <Button
            onClick={() => setReportGenerated(false)}
            variant="outline"
            size="sm"
            data-testid="button-new-report"
          >
            New Report
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "efficiency" | "history" | "production" | "downtime")} className="h-full flex flex-col">
          <div className="flex-shrink-0 border-b px-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between py-3">
              <TabsList className="grid w-full md:w-auto grid-cols-4">
                <TabsTrigger value="efficiency" className="gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Efficiency
                </TabsTrigger>
                <TabsTrigger value="history" className="gap-2">
                  <History className="h-4 w-4" />
                  History
                </TabsTrigger>
                <TabsTrigger value="production" className="gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Production
                </TabsTrigger>
                <TabsTrigger value="downtime" className="gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Downtime
                </TabsTrigger>
              </TabsList>
              
            </div>
          </div>

          <TabsContent value="efficiency" className="flex-1 overflow-y-auto m-0">
            <div className="p-4 space-y-4">
            <Card className="flex-shrink-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Machine Status</CardTitle>
                <CardDescription className="text-xs">
                  Summary of each machine and its latest production statistics
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto max-h-64">
                  <table className="w-full text-xs">
                    <thead className="border-b sticky top-0 bg-background">
                      <tr>
                        <th className="text-left py-1 px-1">Machine</th>
                        <th className="text-left py-1 px-1">Status</th>
                        <th className="text-left py-1 px-1">Operator</th>
                        <th className="text-right py-1 px-1">Units</th>
                        <th className="text-right py-1 px-1">Eff%</th>
                        <th className="text-right py-1 px-1">Finished Today</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData?.machineLogs?.map((log) => (
                        <tr key={log.machineId} className="border-b hover:bg-muted/50">
                          <td className="py-1 px-1 truncate font-medium">{log.machineName}</td>
                          <td className="py-1 px-1 capitalize text-xs">{log.status}</td>
                          <td className="py-1 px-1 truncate">{log.operatorName}</td>
                          <td className="text-right py-1 px-1 tabular-nums">{log.totalUnitsProduced}</td>
                          <td className="text-right py-1 px-1 tabular-nums">{log.avgEfficiency}%</td>
                          <td className="text-right py-1 px-1">
                            {(() => {
                              const shiftMap: Record<string, number> = { Day: 1, Afternoon: 2, Midnight: 3 };
                              const nums = log.completedShifts.map(s => shiftMap[s]).filter(Boolean).sort((a, b) => a - b);
                              const allShifts = nums.length === 3;
                              const display = allShifts ? "All" : nums.join(", ") || "—";
                              return (
                                <Badge variant={nums.length > 0 ? "default" : "secondary"} className="text-xxs">
                                  {display}
                                </Badge>
                              );
                            })()}
                          </td>
                          
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card className="flex-shrink-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Maintenance Logs</CardTitle>
                <CardDescription className="text-xs">
                  Maintenance activities and records
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto max-h-64">
                  <table className="w-full text-xs">
                    <thead className="border-b sticky top-0 bg-background">
                      <tr>
                        <th className="text-left py-1 px-1">Machine</th>
                        <th className="text-left py-1 px-1">Type</th>
                        <th className="text-left py-1 px-1">Description</th>
                        <th className="text-left py-1 px-1">Status</th>
                        <th className="text-left py-1 px-1">Technician</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData?.maintenanceLogs && reportData.maintenanceLogs.length > 0 ? (
                        reportData.maintenanceLogs.map((log) => (
                          <tr key={log.id} className="border-b hover:bg-muted/50">
                            <td className="py-1 px-1 truncate">{log.machineName}</td>
                            <td className="py-1 px-1 truncate capitalize">{log.type}</td>
                            <td className="py-1 px-1 truncate">{log.description}</td>
                            <td className="py-1 px-1 truncate capitalize">{log.status}</td>
                            <td className="py-1 px-1 truncate">{log.technician}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="py-2 px-1 text-center text-muted-foreground">No maintenance logs</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card className="flex-shrink-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Activities</CardTitle>
                <CardDescription className="text-xs">
                  Recent Completed activities and updates
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {reportData?.jobSetterActivities && reportData.jobSetterActivities.length > 0 ? (
                    reportData.jobSetterActivities.slice(0, 30).map((activity, idx) => (
                      <div key={idx} className="text-xs pb-2 border-b last:border-b-0">
                        <div className="flex items-start gap-2">
                          <div className="flex-1">
                            <div className="font-medium">{activity.operatorName}</div>
                            <div className="text-muted-foreground">{activity.type} - {activity.target}</div>
                            <div className="text-xs">{activity.details}</div>
                          </div>
                          <div className="text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(activity.timestamp).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground text-xs">No activities recorded</p>
                  )}
                </div>
              </CardContent>
            </Card>
            </div>
          </TabsContent>

          <TabsContent value="history" className="flex-1 overflow-y-auto m-0">
            <div className="p-4 space-y-4">
              {historyData?.machines.map((machine) => (
                <Card key={machine.machineId}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{machine.machineName}</CardTitle>
                        <CardDescription className="text-xs mt-1">
                          ID: {machine.machineIdTag} • Status: <span className="capitalize">{machine.status}</span> • Operator: {machine.currentOperator}
                        </CardDescription>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {machine.summary.totalProductionStats} Stats
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Summary Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="rounded-md bg-muted/50 p-3">
                        <p className="text-xs text-muted-foreground">Total Units</p>
                        <p className="text-xl font-bold font-mono">{machine.summary.totalUnitsProduced}</p>
                      </div>
                      <div className="rounded-md bg-muted/50 p-3">
                        <p className="text-xs text-muted-foreground">Avg Efficiency</p>
                        <p className="text-xl font-bold font-mono">
                          {machine.summary.avgEfficiency !== null ? `${machine.summary.avgEfficiency}%` : "--"}
                        </p>
                      </div>
                      <div className="rounded-md bg-muted/50 p-3">
                        <p className="text-xs text-muted-foreground">Open Maint.</p>
                        <p className="text-xl font-bold font-mono">{machine.summary.openMaintenance}</p>
                      </div>
                      <div className="rounded-md bg-muted/50 p-3">
                        <p className="text-xs text-muted-foreground">Completed Maint.</p>
                        <p className="text-xl font-bold font-mono">{machine.summary.completedMaintenance}</p>
                      </div>
                    </div>

                    {/* Production Stats Table */}
                    {machine.productionStats.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-2">Production Stats History</h4>
                        <div className="overflow-x-auto max-h-64 border rounded-md">
                          <table className="w-full text-xs">
                            <thead className="border-b sticky top-0 bg-background">
                              <tr>
                                <th className="text-left py-2 px-2">Date</th>
                                <th className="text-left py-2 px-2">Shift</th>
                                <th className="text-right py-2 px-2">Units</th>
                                <th className="text-right py-2 px-2">Target</th>
                                <th className="text-right py-2 px-2">Eff%</th>
                                <th className="text-right py-2 px-2">Downtime</th>
                                <th className="text-left py-2 px-2">By</th>
                              </tr>
                            </thead>
                            <tbody>
                              {machine.productionStats.map((stat) => (
                                <tr key={stat.id} className="border-b hover:bg-muted/50">
                                  <td className="py-2 px-2 truncate">{stat.date}</td>
                                  <td className="py-2 px-2 truncate">{stat.shift}</td>
                                  <td className="text-right py-2 px-2 tabular-nums">{stat.unitsProduced}</td>
                                  <td className="text-right py-2 px-2 tabular-nums">{stat.targetUnits}</td>
                                  <td className="text-right py-2 px-2 tabular-nums">
                                    {stat.efficiency !== null ? `${stat.efficiency.toFixed(1)}%` : "--"}
                                  </td>
                                  <td className="text-right py-2 px-2 tabular-nums">{stat.downtime}m</td>
                                  <td className="py-2 px-2 truncate text-xs">{stat.createdBy}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Maintenance Table */}
                    {machine.maintenance.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-2">Maintenance History</h4>
                        <div className="overflow-x-auto max-h-64 border rounded-md">
                          <table className="w-full text-xs">
                            <thead className="border-b sticky top-0 bg-background">
                              <tr>
                                <th className="text-left py-2 px-2">Type</th>
                                <th className="text-left py-2 px-2">Description</th>
                                <th className="text-left py-2 px-2">Status</th>
                                <th className="text-left py-2 px-2">Scheduled</th>
                                <th className="text-left py-2 px-2">Completed</th>
                                <th className="text-left py-2 px-2">Technician</th>
                              </tr>
                            </thead>
                            <tbody>
                              {machine.maintenance.map((log) => (
                                <tr key={log.id} className="border-b hover:bg-muted/50">
                                  <td className="py-2 px-2 truncate capitalize">{log.type}</td>
                                  <td className="py-2 px-2 truncate">{log.description}</td>
                                  <td className="py-2 px-2 truncate">
                                    <Badge variant={log.status === "completed" ? "default" : "secondary"} className="text-xs">
                                      {log.status}
                                    </Badge>
                                  </td>
                                  <td className="py-2 px-2 truncate">
                                    {log.scheduledDate ? new Date(log.scheduledDate).toLocaleDateString() : "--"}
                                  </td>
                                  <td className="py-2 px-2 truncate">
                                    {log.completedDate ? new Date(log.completedDate).toLocaleDateString() : "--"}
                                  </td>
                                  <td className="py-2 px-2 truncate">{log.technician || "--"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {machine.productionStats.length === 0 && machine.maintenance.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No production stats or maintenance records for this machine
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="production" className="flex-1 overflow-y-auto m-0">
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
                            <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
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
                      <Label>Units Produced</Label>
                      <Input type="number" inputMode="numeric" value={form.unitsProduced} onChange={(e) => setForm((f) => ({ ...f, unitsProduced: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>Target Units</Label>
                      <Input type="number" inputMode="numeric" value={form.targetUnits} onChange={(e) => setForm((f) => ({ ...f, targetUnits: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>Downtime (min)</Label>
                      <Input type="number" inputMode="numeric" value={form.downtime} onChange={(e) => setForm((f) => ({ ...f, downtime: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>Efficiency % (optional)</Label>
                      <Input type="number" inputMode="decimal" step="0.1" value={form.efficiency} onChange={(e) => setForm((f) => ({ ...f, efficiency: e.target.value }))} />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      onClick={() => submitStatMutation.mutate()}
                      disabled={!form.machineId || !form.date || submitStatMutation.isPending}
                      className="gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Add Entry
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
                          <th className="text-right py-2 px-2">Units</th>
                          <th className="text-right py-2 px-2">Target</th>
                          <th className="text-right py-2 px-2">Eff%</th>
                          <th className="text-right py-2 px-2">Downtime</th>
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
                                <td className="text-right py-2 px-2 tabular-nums">{stat.unitsProduced}</td>
                                <td className="text-right py-2 px-2 tabular-nums">{stat.targetUnits}</td>
                                <td className="text-right py-2 px-2 tabular-nums">{stat.efficiency != null ? `${stat.efficiency.toFixed(1)}%` : "--"}</td>
                                <td className="text-right py-2 px-2 tabular-nums">{stat.downtime ?? 0}m</td>
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
          </TabsContent>

          <TabsContent value="downtime" className="flex-1 overflow-y-auto m-0">
            <div className="p-4 space-y-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription className="text-xs">Total Incidents</CardDescription>
                    <CardTitle className="text-2xl font-mono">{downtimeStats?.summary.totalIncidents ?? 0}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription className="text-xs">Total Downtime</CardDescription>
                    <CardTitle className="text-2xl font-mono">{downtimeStats?.summary.totalDowntimeHours.toFixed(1) ?? 0}h</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription className="text-xs">Today's Downtime</CardDescription>
                    <CardTitle className="text-2xl font-mono">{downtimeStats?.summary.todayDowntimeHours.toFixed(1) ?? 0}h</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription className="text-xs">Avg Duration</CardDescription>
                    <CardTitle className="text-2xl font-mono">{downtimeStats?.summary.avgDurationMinutes.toFixed(0) ?? 0}m</CardTitle>
                  </CardHeader>
                </Card>
              </div>

              {/* Charts Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Downtime by Category Pie Chart */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Downtime by Category</CardTitle>
                    <CardDescription className="text-xs">
                      Distribution of downtime across categories
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      {downtimeStats?.byCategory && Object.keys(downtimeStats.byCategory).length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={Object.entries(downtimeStats.byCategory).map(([category, data]) => ({
                                name: category.charAt(0).toUpperCase() + category.slice(1),
                                value: data.totalMinutes,
                                count: data.count,
                              }))}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              outerRadius={80}
                              fill="#8884d8"
                              dataKey="value"
                              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                            >
                              {Object.entries(downtimeStats.byCategory).map(([category], index) => (
                                <Cell key={`cell-${index}`} fill={categoryColors[category] || "#6b7280"} />
                              ))}
                            </Pie>
                            <Tooltip 
                              formatter={(value: number) => [
                                `${Math.round(value / 60 * 10) / 10}h`, 
                                "Duration"
                              ]} 
                            />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground">
                          No downtime data available
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Downtime by Machine Bar Chart */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Downtime by Machine</CardTitle>
                    <CardDescription className="text-xs">
                      Total downtime hours per machine
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      {downtimeStats?.byMachine && Object.keys(downtimeStats.byMachine).length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={Object.entries(downtimeStats.byMachine).map(([_, data]) => ({
                              name: data.machineName,
                              hours: Math.round(data.totalMinutes / 60 * 10) / 10,
                              incidents: data.count,
                            }))}
                            layout="vertical"
                            margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
                          >
                            <XAxis type="number" />
                            <YAxis dataKey="name" type="category" width={70} tick={{ fontSize: 12 }} />
                            <Tooltip 
                              formatter={(value: number) => [
                                `${value}h`, 
                                "Downtime"
                              ]} 
                            />
                            <Bar dataKey="hours" fill="#ef4444" />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground">
                          No downtime data available
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Top Downtime Reasons (Pareto) */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Top Downtime Reasons</CardTitle>
                  <CardDescription className="text-xs">
                    Most common causes of downtime (Pareto analysis)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b">
                        <tr>
                          <th className="text-left py-2 px-2">Rank</th>
                          <th className="text-left py-2 px-2">Reason</th>
                          <th className="text-left py-2 px-2">Category</th>
                          <th className="text-right py-2 px-2">Incidents</th>
                          <th className="text-right py-2 px-2">Total Time</th>
                          <th className="text-right py-2 px-2">% of Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {downtimeStats?.byReasonCode && Object.entries(downtimeStats.byReasonCode)
                          .sort((a, b) => b[1].totalMinutes - a[1].totalMinutes)
                          .slice(0, 10)
                          .map(([code, data], index) => {
                            const reasonInfo = downtimeReasonCodes[code as keyof typeof downtimeReasonCodes];
                            const totalMinutes = downtimeStats.summary.totalDowntimeMinutes || 1;
                            const percentage = ((data.totalMinutes / totalMinutes) * 100).toFixed(1);
                            return (
                              <tr key={code} className="border-b hover:bg-muted/50">
                                <td className="py-2 px-2 font-mono">{index + 1}</td>
                                <td className="py-2 px-2">{reasonInfo?.label || code}</td>
                                <td className="py-2 px-2">
                                  <Badge 
                                    variant="outline" 
                                    style={{ borderColor: categoryColors[reasonInfo?.category || "other"] }}
                                    className="text-xs capitalize"
                                  >
                                    {reasonInfo?.category || "other"}
                                  </Badge>
                                </td>
                                <td className="text-right py-2 px-2 font-mono">{data.count}</td>
                                <td className="text-right py-2 px-2 font-mono">{(data.totalMinutes / 60).toFixed(1)}h</td>
                                <td className="text-right py-2 px-2 font-mono">{percentage}%</td>
                              </tr>
                            );
                          })}
                        {(!downtimeStats?.byReasonCode || Object.keys(downtimeStats.byReasonCode).length === 0) && (
                          <tr>
                            <td colSpan={6} className="py-4 text-center text-muted-foreground">
                              No downtime records found
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Downtime History Table */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Downtime History</CardTitle>
                  <CardDescription className="text-xs">
                    All recorded downtime events
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto max-h-96">
                    <table className="w-full text-xs">
                      <thead className="border-b sticky top-0 bg-background">
                        <tr>
                          <th className="text-left py-2 px-2">Machine</th>
                          <th className="text-left py-2 px-2">Reason</th>
                          <th className="text-left py-2 px-2">Category</th>
                          <th className="text-left py-2 px-2">Start</th>
                          <th className="text-left py-2 px-2">End</th>
                          <th className="text-right py-2 px-2">Duration</th>
                          <th className="text-left py-2 px-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {downtimeLogs.map((log) => {
                          const machine = machines.find(m => m.id === log.machineId);
                          const reasonInfo = downtimeReasonCodes[log.reasonCode as keyof typeof downtimeReasonCodes];
                          const isActive = !log.endTime;
                          
                          return (
                            <tr key={log.id} className="border-b hover:bg-muted/50">
                              <td className="py-2 px-2 truncate">{machine?.name || "Unknown"}</td>
                              <td className="py-2 px-2 truncate">{reasonInfo?.label || log.reasonCode}</td>
                              <td className="py-2 px-2">
                                <Badge 
                                  variant="outline" 
                                  style={{ borderColor: categoryColors[log.reasonCategory] }}
                                  className="text-xs capitalize"
                                >
                                  {log.reasonCategory}
                                </Badge>
                              </td>
                              <td className="py-2 px-2 font-mono whitespace-nowrap">
                                {new Date(log.startTime).toLocaleString()}
                              </td>
                              <td className="py-2 px-2 font-mono whitespace-nowrap">
                                {log.endTime ? new Date(log.endTime).toLocaleString() : "--"}
                              </td>
                              <td className="text-right py-2 px-2 font-mono">
                                {log.duration ? `${log.duration}m` : (isActive ? "Active" : "--")}
                              </td>
                              <td className="py-2 px-2">
                                <Badge variant={isActive ? "destructive" : "secondary"} className="text-xs">
                                  {isActive ? "Active" : "Resolved"}
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                        {downtimeLogs.length === 0 && (
                          <tr>
                            <td colSpan={7} className="py-4 text-center text-muted-foreground">
                              No downtime records found
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// New Production tab content appended below existing TabsContent blocks

