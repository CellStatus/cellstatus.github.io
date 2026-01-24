import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MachineStatusCard } from "@/components/machine-status-card";
import { MachineDialog } from "@/components/machine-dialog";
import { MaintenanceDialog } from "@/components/maintenance-dialog";
import { AssignOperatorDialog } from "@/components/assign-operator-dialog";
import { DowntimeDialog } from "@/components/downtime-dialog";
import { ResolveDowntimeDialog } from "@/components/resolve-downtime-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TimeWheelPicker } from "@/components/ui/time-wheel-picker";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { 
  Plus, 
  Play, 
  Pause, 
  Wrench, 
  AlertTriangle, 
  Settings2,
  Search,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { Machine, Operator, MachineStatus, ProductionStat, DowntimeLog, VsmConfiguration } from "@shared/schema";
import { calculateOEEStats } from "@/lib/oeeUtils";
// Helper to get EST time
function getESTDate() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
}

// Shift schedule
const defaultShiftTimes = [
  { name: "Day", start: "06:30", end: "14:30" },
  { name: "Evening", start: "14:30", end: "22:30" },
  { name: "Night", start: "22:30", end: "06:30" },
];

const defaultBreaks = [
  { name: "Break", start: "10:30", end: "11:00" },
  { name: "Lunch", start: "12:30", end: "13:00" },
];

function getCurrentShift(estTime: Date, shiftTimes: { name: string; start: string; end: string }[]) {
  const hours = estTime.getHours();
  const minutes = estTime.getMinutes();
  const timeNum = hours * 60 + minutes;
  const dayStart = 6 * 60 + 30;
  const eveningStart = 14 * 60 + 30;
  const nightStart = 22 * 60 + 30;
  if (timeNum >= dayStart && timeNum < eveningStart) return shiftTimes[0];
  if (timeNum >= eveningStart && timeNum < nightStart) return shiftTimes[1];
  // Night shift wraps to next day
  return shiftTimes[2];
}

export default function Dashboard() {
    // ...existing code...
    const { data: machines = [], isLoading: machinesLoading } = useQuery<Machine[]>({
      queryKey: ["/api/machines"],
    });

    // Debug: log machines data to console
    useEffect(() => {
      console.log('Dashboard machines:', machines);
    }, [machines]);
  // Collapsible top pane state
  const [showTopPane, setShowTopPane] = useState(true);
  // Mutations
  const updateMachineMutation = useMutation({
    mutationFn: async (data: Partial<Machine> & { id: string }) => {
      return apiRequest("PATCH", `/api/machines/${data.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
      setMachineDialogOpen(false);
      setEditingMachine(null);
      toast({ title: "Machine updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update machine", variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: MachineStatus }) => {
      return apiRequest("PATCH", `/api/machines/${id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
    },
    onError: () => {
      toast({ title: "Failed to update status", variant: "destructive" });
    },
  });

  const submitProductionStatMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      return apiRequest("POST", "/api/production-stats", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/production-stats"] });
      toast({ title: "Production stats submitted" });
    },
    onError: () => {
      toast({ title: "Failed to submit production stats", variant: "destructive" });
    },
  });

  const createMachineMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      return apiRequest("POST", "/api/machines", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
      setMachineDialogOpen(false);
      setEditingMachine(null);
      toast({ title: "Machine created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create machine", variant: "destructive" });
    },
  });

  const assignOperatorMutation = useMutation({
    mutationFn: async ({ machineId, operatorId }: { machineId: string; operatorId: string | null }) => {
      return apiRequest("PATCH", `/api/machines/${machineId}/operator`, { operatorId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
      setAssignDialogOpen(false);
      setAssigningMachine(null);
      toast({ title: "Operator assigned successfully" });
    },
    onError: () => {
      toast({ title: "Failed to assign operator", variant: "destructive" });
    },
  });

  const updateStatusUpdateMutation = useMutation({
    mutationFn: async ({ id, statusUpdate }: { id: string; statusUpdate: string }) => {
      console.log("Sending status update mutation", { id, statusUpdate });
      return apiRequest("PATCH", `/api/machines/${id}/status-update`, { statusUpdate });
    },
    onSuccess: (data) => {
      console.log("Status update mutation success, returned machine:", data);
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
      toast({ title: "Status update saved" });
    },
    onError: (error) => {
      console.error("Status update mutation error:", error);
      toast({ title: "Failed to update status", variant: "destructive" });
    },
  });
        // Query all downtime logs for stats and reporting
        const { data: downtimeLogs = [] } = useQuery<DowntimeLog[]>({
          queryKey: ["/api/downtime"],
        });

      // Fetch VSM configurations
      const { data: vsmConfigurations = [], isLoading: vsmLoading } = useQuery<VsmConfiguration[]>({
        queryKey: ["/api/vsm-configurations"],
      });

      const [showScheduleSettings, setShowScheduleSettings] = useState(false);
    // Editable shift and break times
    const [shiftTimes, setShiftTimes] = useState(() => JSON.parse(localStorage.getItem("shiftTimes") || "null") || defaultShiftTimes);
    const [breaks, setBreaks] = useState(() => JSON.parse(localStorage.getItem("breaks") || "null") || defaultBreaks);

    // Save to localStorage on change
    useEffect(() => { localStorage.setItem("shiftTimes", JSON.stringify(shiftTimes)); }, [shiftTimes]);
    useEffect(() => { localStorage.setItem("breaks", JSON.stringify(breaks)); }, [breaks]);
  const { toast } = useToast();
  const [machineDialogOpen, setMachineDialogOpen] = useState(false);
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null);
  const [maintenanceDialogOpen, setMaintenanceDialogOpen] = useState(false);
  const [maintenanceMachineId, setMaintenanceMachineId] = useState<string | undefined>();
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assigningMachine, setAssigningMachine] = useState<Machine | null>(null);
  const [selectedShift, setSelectedShift] = useState<string>("Day");
  const [downtimeDialogOpen, setDowntimeDialogOpen] = useState(false);
  const [downtimeMachineId, setDowntimeMachineId] = useState<string | undefined>();
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [resolvingDowntime, setResolvingDowntime] = useState<DowntimeLog | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");



  const { data: operators = [] } = useQuery<Operator[]>({
    queryKey: ["/api/operators"],
  });

  const { data: productionStats = [] } = useQuery<ProductionStat[]>({
    queryKey: ["/api/production-stats"],
  });

  // Add useQuery for active downtime logs
  const { data: activeDowntime = [] } = useQuery<DowntimeLog[]>({
    queryKey: ["/api/downtime/active"],
  });



  const deleteProductionStatsMutation = useMutation({
    mutationFn: async ({ machineId, date, shift }: { machineId: string; date: string; shift?: string }) => {
      // Single bulk delete request to avoid rate limits
      const url = `/api/production-stats/by-date?machineId=${encodeURIComponent(machineId)}&date=${encodeURIComponent(date)}${shift ? `&shift=${encodeURIComponent(shift)}` : ""}`;
      await apiRequest("DELETE", url);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/production-stats"] });
      // Ensure reports reflect deletion immediately
      queryClient.invalidateQueries({ queryKey: ["/api/reports/efficiency"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/machine-history"] });
      toast({ title: "Production stats deleted successfully" });
    },
    onError: (error) => {
      console.error("Delete stats error:", error);
      toast({ title: "Failed to delete production stats", variant: "destructive" });
    },
  });

  // Fallback: delete by specific stat id if bulk delete fails on some setups
  const deleteProductionStatById = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/production-stats/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/production-stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/efficiency"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/machine-history"] });
      toast({ title: "Production stat deleted" });
    },
    onError: (error) => {
      console.error("Delete stat by id error:", error);
      toast({ title: "Failed to delete production stat", variant: "destructive" });
    },
  });

  const createMaintenanceMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/maintenance", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
      setMaintenanceDialogOpen(false);
      setMaintenanceMachineId(undefined);
      toast({ title: "Maintenance logged successfully" });
    },
    onError: () => {
      toast({ title: "Failed to log maintenance", variant: "destructive" });
    },
  });

  const createDowntimeMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/downtime", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/downtime/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/downtime"] });
      setDowntimeDialogOpen(false);
      setDowntimeMachineId(undefined);
      toast({ title: "Downtime logged successfully" });
    },
    onError: () => {
      toast({ title: "Failed to log downtime", variant: "destructive" });
    },
  });

  const resolveDowntimeMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => 
      apiRequest("PATCH", `/api/downtime/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/downtime/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/downtime"] });
      setResolveDialogOpen(false);
      setResolvingDowntime(null);
      toast({ title: "Downtime resolved successfully" });
    },
    onError: () => {
      toast({ title: "Failed to resolve downtime", variant: "destructive" });
    },
  });

  const handleAddMachine = () => {
    setEditingMachine(null);
    setMachineDialogOpen(true);
  };

  const handleEditMachine = (machine: Machine & { runtime?: number }) => {
    // Extract only the OEE metrics to update, ignore runtime
    const { id, goodPartsRan, scrapParts, idealCycleTime } = machine;
    const updateData = { id, goodPartsRan, scrapParts, idealCycleTime };
    console.log("Updating machine with:", updateData);
    updateMachineMutation.mutate(updateData);
  };

  const handleStatusChange = (machineId: string, status: MachineStatus) => {
    updateStatusMutation.mutate({ id: machineId, status });
  };

  const handleAssignOperator = (machineId: string) => {
    const machine = machines.find((m) => m.id === machineId);
    if (machine) {
      setAssigningMachine(machine);
      setAssignDialogOpen(true);
    }
  };

  const handleLogMaintenance = (machineId: string) => {
    setMaintenanceMachineId(machineId);
    setMaintenanceDialogOpen(true);
  };

  const handleLogDowntime = (machineId: string) => {
    setDowntimeMachineId(machineId);
    setDowntimeDialogOpen(true);
  };

  const handleResolveDowntime = (downtimeLog: DowntimeLog) => {
    setResolvingDowntime(downtimeLog);
    setResolveDialogOpen(true);
  };

  const handleSubmitStats = (machineId: string) => {
    const machine = machines.find((m) => m.id === machineId);
    if (!machine) return;
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    // Aggregate downtime for selected machine, date, and shift
    const relevantDowntimeLogs = downtimeLogs.filter((log) => {
      // If downtime logs have a date/shift field, use it; else fallback to startTime
      if ((log as any).date && (log as any).shift) {
        return log.machineId === machineId && (log as any).date === today && (log as any).shift === selectedShift;
      }
      // Fallback: match by startTime date
      return log.machineId === machineId && log.startTime.startsWith(today);
    });
    const aggregatedDowntime = relevantDowntimeLogs.reduce((sum, log) => sum + (log.duration || 0), 0);
    // Calculate OEE metrics using shared logic
    const plannedProductionTime = 420;
    const goodPartsRan = machine.goodPartsRan || 0;
    const scrapParts = machine.scrapParts || 0;
    const idealCycleTime = machine.idealCycleTime || 0;
    const oeeStats = calculateOEEStats({
      plannedProductionTime,
      downtime: aggregatedDowntime,
      goodPartsRan,
      scrapParts,
      idealCycleTime,
    });
    submitProductionStatMutation.mutate({
      machineId: machine.id,
      shift: selectedShift,
      date: today,
      goodPartsRan,
      scrapParts,
      idealCycleTime,
      downtime: aggregatedDowntime,
      oee: oeeStats.oee,
      availability: oeeStats.availability,
      performance: oeeStats.performance,
      quality: oeeStats.quality,
    });
  };

  const handleDeleteStats = (machineId: string) => {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    // Try to find today's stat(s) and delete by id as a robust fallback
    const todaysStats = productionStats.filter(s => s.machineId === machineId && s.date === today);
    if (todaysStats.length > 0) {
      // Delete the most recent one first
      deleteProductionStatById.mutate(todaysStats[0].id);
    } else {
      // Fallback to bulk delete by date
      deleteProductionStatsMutation.mutate({ machineId, date: today });
    }
  };

  const handleMachineSubmit = (data: Record<string, unknown>) => {
    if (editingMachine) {
      updateMachineMutation.mutate({ id: editingMachine.id, ...data });
    } else {
      createMachineMutation.mutate(data);
    }
  };

  const handleOperatorAssign = (machineId: string, operatorId: string | null) => {
    assignOperatorMutation.mutate({ machineId, operatorId });
  };

  const getOperatorById = (id: string | null) => {
    if (!id) return undefined;
    return operators.find((o) => o.id === id);
  };

  // Filter machines based on search query
  const filteredMachines = machines.filter(machine => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      machine.name.toLowerCase().includes(query) ||
      machine.machineId.toLowerCase().includes(query) ||
      machine.status.toLowerCase().includes(query) ||
      (getOperatorById(machine.operatorId)?.name.toLowerCase().includes(query))
    );
  });

  // Calculate summary stats from filtered machines
  const runningCount = filteredMachines.filter((m) => m.status === "running").length;
  const idleCount = filteredMachines.filter((m) => m.status === "idle").length;
  const maintenanceCount = filteredMachines.filter((m) => m.status === "maintenance").length;
  const downCount = filteredMachines.filter((m) => m.status === "down").length;
  const setupCount = filteredMachines.filter((m) => m.status === "setup").length;

  // Calculate active downtime duration
  const getActiveDowntimeForMachine = (machineId: string) => {
    return activeDowntime.find(d => d.machineId === machineId);
  };

  // Calculate total active downtime duration in minutes
  const totalActiveDowntimeMinutes = activeDowntime.reduce((sum, d) => {
    const start = new Date(d.startTime).getTime();
    const now = Date.now();
    return sum + Math.round((now - start) / 60000);
  }, 0);

  const formatDowntimeDuration = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${remainingMinutes}m`;
    }
    return `${minutes}m`;
  };

  // Get latest production stat date for each machine
  const getLatestStatDate = (machineId: string): string | null => {
    const machineStats = productionStats
      .filter(s => s.machineId === machineId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return machineStats.length > 0 ? machineStats[0].date : null;
  };

  // Live EST clock
  const [estTime, setEstTime] = useState(getESTDate());
  useEffect(() => {
    const interval = setInterval(() => setEstTime(getESTDate()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Planned runtime calculation for current shift
  function getCurrentShiftWithCustom(estTime: Date) {
    const hours = estTime.getHours();
    const minutes = estTime.getMinutes();
    const timeNum = hours * 60 + minutes;
    for (const shift of shiftTimes) {
      const [sh, sm] = shift.start.split(":").map(Number);
      const [eh, em] = shift.end.split(":").map(Number);
      const startNum = sh * 60 + sm;
      let endNum = eh * 60 + em;
      if (endNum <= startNum) endNum += 24 * 60; // wrap overnight
      if (timeNum >= startNum && timeNum < endNum) return shift;
    }
    return shiftTimes[0];
  }
  const currentShift = getCurrentShiftWithCustom(estTime);
  // Get today's date string in EST
  const todayStr = estTime.toISOString().slice(0, 10);
  // Get shift start datetime
  let shiftStartDate = new Date(todayStr + 'T' + currentShift.start + ':00-05:00');
  if (currentShift.name === "Night" && estTime.getHours() < 6) {
    const yesterday = new Date(estTime);
    yesterday.setDate(estTime.getDate() - 1);
    const ystr = yesterday.toISOString().slice(0, 10);
    shiftStartDate = new Date(ystr + 'T' + currentShift.start + ':00-05:00');
  }
  let plannedRuntimeMinutes = Math.floor((estTime.getTime() - shiftStartDate.getTime()) / 60000);
  // Subtract break minutes if shift has started
  let breakMinutes = 0;
  for (const brk of breaks) {
    const [bh, bm] = brk.start.split(":").map(Number);
    const [eh, em] = brk.end.split(":").map(Number);
    let bStart = new Date(shiftStartDate);
    bStart.setHours(bh, bm, 0, 0);
    let bEnd = new Date(shiftStartDate);
    bEnd.setHours(eh, em, 0, 0);
    if (bEnd <= bStart) bEnd.setDate(bEnd.getDate() + 1);
    if (bEnd > shiftStartDate && bStart < estTime) {
      // Only count break time that has elapsed so far in shift
      const overlapStart = bStart < shiftStartDate ? shiftStartDate : bStart;
      const overlapEnd = bEnd > estTime ? estTime : bEnd;
      if (overlapEnd > overlapStart) {
        breakMinutes += Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / 60000);
      }
    }
  }
  if (plannedRuntimeMinutes > 0) {
    plannedRuntimeMinutes -= breakMinutes;
    if (plannedRuntimeMinutes < 0) plannedRuntimeMinutes = 0;
  } else {
    plannedRuntimeMinutes = 0;
  }

  // Determine if currently in break or runtime
  let isBreak = false;
  for (const brk of breaks) {
    const [bh, bm] = brk.start.split(":").map(Number);
    const [eh, em] = brk.end.split(":").map(Number);
    let bStart = new Date(shiftStartDate);
    bStart.setHours(bh, bm, 0, 0);
    let bEnd = new Date(shiftStartDate);
    bEnd.setHours(eh, em, 0, 0);
    if (bEnd <= bStart) bEnd.setDate(bEnd.getDate() + 1);
    if (estTime >= bStart && estTime < bEnd) {
      isBreak = true;
      break;
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Collapsible Top Pane */}
      <div className="border-b bg-card/50">
        <div className="flex items-center justify-between px-6 py-2">
          <div className="flex items-center gap-2">
            <button
              className="rounded p-1 hover:bg-muted transition"
              onClick={() => setShowTopPane(v => !v)}
              aria-label={showTopPane ? 'Collapse top pane' : 'Expand top pane'}
              data-testid="button-toggle-top-pane"
            >
              {showTopPane ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </button>
            <h1 className="text-2xl font-semibold" data-testid="text-dashboard-title">Cell Dashboard</h1>
          </div>
          <span className="text-sm text-muted-foreground">Real-time manufacturing cell status</span>
        </div>
        {showTopPane && (
          <>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between px-6">
              <div className="flex flex-wrap gap-3 items-center">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search machines..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-7 w-44"
                    data-testid="input-search-machines"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Shift</span>
                  <Select value={selectedShift} onValueChange={(v) => setSelectedShift(v)}>
                    <SelectTrigger className="w-[110px]" data-testid="select-shift-picker">
                      <SelectValue placeholder="Shift" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Day">Day</SelectItem>
                      <SelectItem value="Afternoon">Afternoon</SelectItem>
                      <SelectItem value="Midnight">Midnight</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleAddMachine} className="gap-2" data-testid="button-add-machine">
                  <Plus className="h-4 w-4" />
                  Add Machine
                </Button>
                <Button variant="ghost" size="sm" className="gap-1 ml-2" onClick={() => setShowScheduleSettings(v => !v)}>
                  <Settings2 className="h-4 w-4" />
                  <span>Schedule</span>
                  {showScheduleSettings ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            {/* Summary Stats */}
            <div className="mt-3 grid grid-cols-4 gap-3 px-6">
              <div className="flex items-center gap-2 rounded-md bg-background p-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-machine-running/10">
                  <Play className="h-4 w-4 text-machine-running" />
                </div>
                <div>
                  <p className="text-lg font-mono font-bold" data-testid="stat-running">{runningCount}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">Running</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-md bg-background p-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-machine-idle/10">
                  <Pause className="h-4 w-4 text-machine-idle" />
                </div>
                <div>
                  <p className="text-lg font-mono font-bold" data-testid="stat-idle">{idleCount}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">Idle</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-md bg-background p-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-machine-maintenance/10">
                  <Wrench className="h-4 w-4 text-machine-maintenance" />
                </div>
                <div>
                  <p className="text-lg font-mono font-bold" data-testid="stat-maintenance">{maintenanceCount + setupCount}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">Maint</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-md bg-background p-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-machine-down/10">
                  <AlertTriangle className="h-4 w-4 text-machine-down" />
                </div>
                <div>
                  <p className="text-lg font-mono font-bold" data-testid="stat-down">{downCount}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    Down
                    {activeDowntime.length > 0 && (
                      <span className="text-machine-down ml-0.5 text-[9px]">
                        ({formatDowntimeDuration(totalActiveDowntimeMinutes)})
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>
            {/* EST Clock and Planned Runtime */}
            <div className="flex items-center gap-8 p-4 border-b bg-muted/10">
              <div className="flex items-center gap-4">
                <span className="font-semibold text-lg">Current Time (EST):</span>
                <span className="font-mono text-lg" data-testid="clock-est">
                  {estTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true })}
                </span>
                <span className="font-semibold text-lg ml-6">Planned Runtime Elapsed:</span>
                <span className="font-mono text-lg" data-testid="planned-runtime">{plannedRuntimeMinutes} min</span>
                <Badge variant={isBreak ? "destructive" : "default"} className="ml-4">
                  {isBreak ? "Breaktime" : "Runtime"}
                </Badge>
              </div>
            </div>
          </>
        )}
      </div>
      {showScheduleSettings && (
        <div className="p-4 border-b bg-muted/20 max-h-[70vh] overflow-auto sm:max-h-none">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3 w-full">
              <span className="font-semibold mb-1">Edit Shifts:</span>
              <div className="flex flex-col gap-4 w-full">
                {shiftTimes.map((shift: { name: string; start: string; end: string }, idx: number) => (
                  <div key={shift.name} className="flex flex-col sm:flex-row items-center gap-2 w-full border rounded p-3 bg-background">
                    <span className="text-xs font-medium w-full sm:w-20 text-center mb-1 sm:mb-0">{shift.name}</span>
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto justify-center items-center">
                      <TimeWheelPicker
                        value={shift.start}
                        onChange={val => {
                          const newShifts = [...shiftTimes];
                          newShifts[idx] = { ...shift, start: val };
                          setShiftTimes(newShifts);
                        }}
                        label="Start"
                      />
                      <TimeWheelPicker
                        value={shift.end}
                        onChange={val => {
                          const newShifts = [...shiftTimes];
                          newShifts[idx] = { ...shift, end: val };
                          setShiftTimes(newShifts);
                        }}
                        label="End"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-3 w-full mt-4">
              <div className="flex flex-col sm:flex-row gap-2 items-center w-full">
                <span className="font-semibold">Edit Breaks:</span>
                <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => {
                  setBreaks([...breaks, { name: `Break ${breaks.length + 1}`, start: "10:00", end: "10:15" }]);
                }}>Add Break</Button>
              </div>
              <div className="flex flex-col gap-4 w-full">
                {breaks.map((brk: { name: string; start: string; end: string }, idx: number) => (
                  <div key={idx} className="flex flex-col sm:flex-row items-center gap-2 border rounded p-3 bg-background relative w-full">
                    <Button size="sm" variant="ghost" className="absolute top-1 right-1 px-1 py-0.5 text-xs" onClick={() => {
                      setBreaks(breaks.filter((_: any, i: number) => i !== idx));
                    }}>Remove</Button>
                    <input
                      type="text"
                      value={brk.name}
                      onChange={e => {
                        const newBreaks = [...breaks];
                        newBreaks[idx] = { ...brk, name: e.target.value };
                        setBreaks(newBreaks);
                      }}
                      className="border rounded px-2 py-2 w-full sm:w-32 text-base text-center mb-1 bg-white text-black placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="Break name"
                    />
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto justify-center items-center">
                      <TimeWheelPicker
                        value={brk.start}
                        onChange={val => {
                          const newBreaks = [...breaks];
                          newBreaks[idx] = { ...brk, start: val };
                          setBreaks(newBreaks);
                        }}
                        label="Start"
                      />
                      <TimeWheelPicker
                        value={brk.end}
                        onChange={val => {
                          const newBreaks = [...breaks];
                          newBreaks[idx] = { ...brk, end: val };
                          setBreaks(newBreaks);
                        }}
                        label="End"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Machine Grid */}
      <div className="flex-1 overflow-auto p-6">
          {machinesLoading ? (
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="rounded-lg border p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-6 w-16" />
                  </div>
                  <Skeleton className="h-8 w-24" />
                  <Skeleton className="h-10 w-full" />
                  <div className="grid grid-cols-2 gap-3">
                    <Skeleton className="h-20" />
                    <Skeleton className="h-20" />
                  </div>
                  <div className="flex gap-2">
                    <Skeleton className="h-9 flex-1" />
                    <Skeleton className="h-9 flex-1" />
                    <Skeleton className="h-9 w-9" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredMachines.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted mb-4">
                {searchQuery ? (
                  <Search className="h-10 w-10 text-muted-foreground" />
                ) : (
                  <Settings2 className="h-10 w-10 text-muted-foreground" />
                )}
              </div>
              <h2 className="text-xl font-semibold mb-2">
                {searchQuery ? "No Machines Found" : "No Machines Yet"}
              </h2>
              <p className="text-muted-foreground mb-6 max-w-md">
                {searchQuery 
                  ? `No machines match "${searchQuery}". Try a different search term.`
                  : "Add your first machine to start tracking production status and metrics"
                }
              </p>
              {!searchQuery && (
                <Button onClick={handleAddMachine} className="gap-2" data-testid="button-add-first-machine">
                  <Plus className="h-4 w-4" />
                  Add Your First Machine
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredMachines.map((machine) => {
                // Calculate total downtime for this machine in current shift
                const machineDowntimeMinutes = downtimeLogs
                  .filter(log => log.machineId === machine.id)
                  .reduce((sum, log) => sum + (log.duration || 0), 0);
                // Strictly sanitize runtime: always number or undefined, never null
                let runtimeMinutes: number | undefined = Math.max(plannedRuntimeMinutes - machineDowntimeMinutes, 0);
                if (runtimeMinutes === null || isNaN(runtimeMinutes)) runtimeMinutes = undefined;
                // Calculate if production stats have been submitted today for this machine and shift
                const today = estTime.toISOString().slice(0, 10);
                const isSubmittedToday = productionStats.some(
                  s => s.machineId === machine.id && s.date === today && s.shift === selectedShift
                );
                const machineDowntime = getActiveDowntimeForMachine(machine.id);
                const machineWithRuntime = { ...machine, runtime: runtimeMinutes };
                return (
                  <MachineStatusCard
                    key={machine.id}
                    machine={machineWithRuntime}
                    operator={getOperatorById(machine.operatorId)}
                    downtimeLogs={downtimeLogs}
                    plannedRuntimeMinutes={runtimeMinutes}
                    onStatusChange={handleStatusChange}
                    onAssignOperator={handleAssignOperator}
                    onRemoveOperator={machineId => handleOperatorAssign(machineId, null)}
                    onLogMaintenance={handleLogMaintenance}
                    onLogDowntime={handleLogDowntime}
                    onEditMachine={m => {
                      // Remove runtime if null or undefined for type compatibility
                      const mCopy = { ...m };
                      if (mCopy.runtime === null || mCopy.runtime === undefined) {
                        delete mCopy.runtime;
                      }
                      handleEditMachine(mCopy as Machine);
                    }}
                    onSubmitStats={handleSubmitStats}
                    onDeleteStats={handleDeleteStats}
                    onUpdateStatusUpdate={(machineId, statusUpdate) => 
                      updateStatusUpdateMutation.mutate({ id: machineId, statusUpdate })
                    }
                    isSubmittedToday={isSubmittedToday}
                    isPendingSubmit={submitProductionStatMutation.isPending}
                    isPendingDelete={deleteProductionStatsMutation.isPending}
                    isPendingStatusUpdate={updateStatusUpdateMutation.isPending}
                    activeDowntime={machineDowntime}
                    onResolveDowntime={handleResolveDowntime}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Value Stream Configurations Section */}
        {vsmConfigurations.length > 0 && (
          <div className="px-6 py-6 border-t">
            <h2 className="text-xl font-semibold mb-4">Value Stream Maps</h2>
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {vsmConfigurations.map((vsm) => (
                <Card key={vsm.id} className="hover:shadow-lg transition">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{vsm.name}</CardTitle>
                    {vsm.description && (
                      <p className="text-sm text-muted-foreground">{vsm.description}</p>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {vsm.bottleneckRate && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Throughput:</span>
                        <span className="font-semibold">{vsm.bottleneckRate.toFixed(3)} units/sec</span>
                      </div>
                    )}
                    {vsm.processEfficiency && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Efficiency:</span>
                        <span className="font-semibold text-green-600">{vsm.processEfficiency.toFixed(0)}%</span>
                      </div>
                    )}
                    {vsm.stationsJson && Array.isArray(vsm.stationsJson) && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Stations:</span>
                        <p className="mt-1">{(vsm.stationsJson as any[]).length} process steps</p>
                      </div>
                    )}
                    <div className="pt-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          // Could navigate to view/edit the VSM
                          console.log('View VSM:', vsm.id);
                        }}
                      >
                        View Details
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

      {/* Dialogs - move outside the grid rendering */}
      <MaintenanceDialog
        open={maintenanceDialogOpen}
        onOpenChange={setMaintenanceDialogOpen}
        machines={machines}
        preselectedMachineId={maintenanceMachineId}
        onSubmit={(data) => createMaintenanceMutation.mutate(data)}
        isPending={createMaintenanceMutation.isPending}
      />
      <AssignOperatorDialog
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        machine={assigningMachine}
        operators={operators}
        onAssign={handleOperatorAssign}
        isPending={assignOperatorMutation.isPending}
      />
      <DowntimeDialog
        open={downtimeDialogOpen}
        onOpenChange={setDowntimeDialogOpen}
        machines={machines}
        preselectedMachineId={downtimeMachineId}
        onSubmit={(data) => createDowntimeMutation.mutate(data)}
        isPending={createDowntimeMutation.isPending}
      />
      <ResolveDowntimeDialog
        open={resolveDialogOpen}
        onOpenChange={setResolveDialogOpen}
        downtimeLog={resolvingDowntime}
        machineName={resolvingDowntime ? machines.find(m => m.id === resolvingDowntime.machineId)?.name : undefined}
        onSubmit={(id, data) => resolveDowntimeMutation.mutate({ id, data })}
        isPending={resolveDowntimeMutation.isPending}
      />
    </div>
  );
}
