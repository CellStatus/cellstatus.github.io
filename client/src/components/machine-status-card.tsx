import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useEffect } from "react";
import { 
  Play, 
  Pause, 
  Wrench, 
  AlertTriangle, 
  Settings2,
  Target,
  UserCircle,
  MoreVertical,
  Send,
  Trash2,
  Timer,
  CheckCircle,
  FileText,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Machine, MachineStatus, Operator, DowntimeLog } from "@shared/schema";
import { downtimeReasonCodes } from "@shared/schema";

interface MachineStatusCardProps {
  machine: Machine;
  operator?: Operator;
  downtimeLogs?: DowntimeLog[];
  onStatusChange: (machineId: string, status: MachineStatus) => void;
  onAssignOperator: (machineId: string) => void;
  onLogMaintenance: (machineId: string) => void;
  onLogDowntime: (machineId: string) => void;
  onEditMachine: (machine: Machine) => void;
  onSubmitStats: (machineId: string) => void;
  onDeleteStats: (machineId: string) => void;
  onUpdateStatusUpdate: (machineId: string, statusUpdate: string) => void;
  isSubmittedToday: boolean;
  isPendingSubmit: boolean;
  isPendingDelete: boolean;
  isPendingStatusUpdate: boolean;
  activeDowntime?: DowntimeLog;
  onResolveDowntime: (downtimeLog: DowntimeLog) => void;
}

const statusConfig: Record<MachineStatus, { 
  label: string; 
  icon: typeof Play; 
  className: string;
  borderClass: string;
}> = {
  running: { 
    label: "Running", 
    icon: Play, 
    className: "bg-machine-running/15 text-machine-running border-machine-running/30",
    borderClass: "border-t-machine-running",
  },
  idle: { 
    label: "Idle", 
    icon: Pause, 
    className: "bg-machine-idle/15 text-machine-idle border-machine-idle/30",
    borderClass: "border-t-machine-idle",
  },
  maintenance: { 
    label: "Maintenance", 
    icon: Wrench, 
    className: "bg-machine-maintenance/15 text-machine-maintenance border-machine-maintenance/30",
    borderClass: "border-t-machine-maintenance",
  },
  down: { 
    label: "Down", 
    icon: AlertTriangle, 
    className: "bg-machine-down/15 text-machine-down border-machine-down/30",
    borderClass: "border-t-machine-down",
  },
  setup: { 
    label: "Setup", 
    icon: Settings2, 
    className: "bg-machine-setup/15 text-machine-setup border-machine-setup/30",
    borderClass: "border-t-machine-setup",
  },
};

export function MachineStatusCard({
  machine,
  operator,
  downtimeLogs = [],
  onStatusChange,
  onAssignOperator,
  onLogMaintenance,
  onLogDowntime,
  onEditMachine,
  onSubmitStats,
  onDeleteStats,
  onUpdateStatusUpdate,
  isSubmittedToday,
  isPendingSubmit,
  isPendingDelete,
  isPendingStatusUpdate,
  activeDowntime,
  onResolveDowntime,
}: MachineStatusCardProps) {
  const status = statusConfig[machine.status];
  const StatusIcon = status.icon;
  
  // Calculate OEE with downtime-based runtime using APQ
  const machineDowntime = downtimeLogs
    .filter((log) => log.machineId === machine.id)
    .reduce((sum, log) => sum + (log.duration || 0), 0);
  const actualRuntime = 420 - machineDowntime;
  
  let oee: number | null = null;
  // Calculate OEE metrics with proper unit conversion
  if (machine.idealCycleTime && actualRuntime > 0) {
    const totalParts = (machine.goodPartsRan || 0) + (machine.scrapParts || 0);
    
    // Availability = Actual Runtime / Planned Runtime (420 min)
    const availability = actualRuntime / 420;
    
    // Performance = (Actual Output × Ideal Cycle Time) / Actual Runtime
    // Convert runtime to seconds to match cycle time units
    const actualRuntimeSeconds = actualRuntime * 60;
    const performance = totalParts > 0 
      ? ((totalParts * machine.idealCycleTime) / actualRuntimeSeconds) 
      : 0;
    
    // Quality = Good Parts / Total Parts
    const quality = totalParts > 0 
      ? (machine.goodPartsRan || 0) / totalParts 
      : 0;
    
    // OEE = Availability × Performance × Quality × 100
    oee = availability * performance * quality * 100;
  }
  
  const [statusUpdate, setStatusUpdate] = useState(machine.statusUpdate || "");
  const [isEditingStatus, setIsEditingStatus] = useState(false);
  const [editingOeeMetrics, setEditingOeeMetrics] = useState(false);
  const [editGoodParts, setEditGoodParts] = useState(machine.goodPartsRan?.toString() || "0");
  const [editScrapParts, setEditScrapParts] = useState(machine.scrapParts?.toString() || "0");
  const [editCycleTime, setEditCycleTime] = useState(machine.idealCycleTime?.toString() || "");
  
  useEffect(() => {
    setStatusUpdate(machine.statusUpdate || "");
  }, [machine.statusUpdate]);

  useEffect(() => {
    setEditGoodParts(machine.goodPartsRan?.toString() || "0");
    setEditScrapParts(machine.scrapParts?.toString() || "0");
    setEditCycleTime(machine.idealCycleTime?.toString() || "");
  }, [machine]);

  // Live downtime counter
  const [downtimeDuration, setDowntimeDuration] = useState<string>("");
  
  useEffect(() => {
    if (!activeDowntime) {
      setDowntimeDuration("");
      return;
    }

    const updateDuration = () => {
      const start = new Date(activeDowntime.startTime).getTime();
      const now = Date.now();
      const diffMs = now - start;
      const minutes = Math.floor(diffMs / 60000);
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      
      if (hours > 0) {
        setDowntimeDuration(`${hours}h ${remainingMinutes}m`);
      } else {
        setDowntimeDuration(`${minutes}m`);
      }
    };

    updateDuration();
    const interval = setInterval(updateDuration, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [activeDowntime]);

  const reasonCodeInfo = activeDowntime 
    ? downtimeReasonCodes[activeDowntime.reasonCode as keyof typeof downtimeReasonCodes]
    : null;

  return (
    <Card 
      className={`overflow-visible border-t-4 ${status.borderClass} ${isSubmittedToday ? 'opacity-60' : ''}`}
      data-testid={`card-machine-${machine.id}`}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className={`text-lg font-semibold truncate ${isSubmittedToday ? 'opacity-70' : ''}`} data-testid={`text-machine-name-${machine.id}`}>
              {machine.name}
            </h3>
            <Badge variant="outline" className="font-mono text-xs shrink-0">
              {machine.machineId}
            </Badge>
          </div>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <Badge className={`${status.className} border gap-1`}>
              <StatusIcon className="h-3 w-3" />
              {status.label}
              {machine.status === "running" && (
                <span className="ml-1 h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
              )}
            </Badge>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" data-testid={`button-machine-menu-${machine.id}`}>
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onAssignOperator(machine.id)} data-testid={`button-assign-operator-${machine.id}`}>
              <UserCircle className="mr-2 h-4 w-4" />
              Assign Operator
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onLogMaintenance(machine.id)} data-testid={`button-log-maintenance-${machine.id}`}>
              <Wrench className="mr-2 h-4 w-4" />
              Log Maintenance
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onLogDowntime(machine.id)} data-testid={`button-log-downtime-${machine.id}`}>
              <AlertTriangle className="mr-2 h-4 w-4" />
              Log Downtime
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Active Downtime Indicator */}
        {activeDowntime && (
          <div className="rounded-md bg-machine-down/10 border border-machine-down/30 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Timer className="h-4 w-4 text-machine-down animate-pulse" />
                <span className="text-sm font-medium text-machine-down">Active Downtime</span>
              </div>
              <span className="font-mono text-sm font-bold text-machine-down">{downtimeDuration}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {reasonCodeInfo?.label || activeDowntime.reasonCode}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-2 gap-1.5 text-machine-running border-machine-running/30 hover:bg-machine-running/10"
              onClick={() => onResolveDowntime(activeDowntime)}
              data-testid={`button-resolve-downtime-${machine.id}`}
            >
              <CheckCircle className="h-3.5 w-3.5" />
              Resolve Downtime
            </Button>
          </div>
        )}

        {/* Operator Section */}
        <div className="flex items-center gap-3">
          {operator ? (
            <>
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs font-medium bg-primary/10 text-primary">
                  {operator.initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" data-testid={`text-operator-name-${machine.id}`}>
                  {operator.name}
                </p>
                <p className="text-xs text-muted-foreground">{operator.shift} Shift</p>
              </div>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={() => onAssignOperator(machine.id)}
              data-testid={`button-assign-operator-empty-${machine.id}`}
            >
              <UserCircle className="h-4 w-4" />
              Assign Operator
            </Button>
          )}
        </div>

        {/* OEE Metrics */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Target className="h-4 w-4" />
              <span>OEE Metrics</span>
            </div>
            {!editingOeeMetrics && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setEditingOeeMetrics(true)}
              >
                Edit
              </Button>
            )}
          </div>
          
          {editingOeeMetrics ? (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="space-y-1">
                  <label className="text-muted-foreground text-xs">Good Parts</label>
                  <input
                    type="number"
                    min="0"
                    value={editGoodParts}
                    onChange={(e) => setEditGoodParts(e.target.value)}
                    className="w-full px-2 py-1 text-sm border rounded bg-background"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-muted-foreground text-xs">Scrap Parts</label>
                  <input
                    type="number"
                    min="0"
                    value={editScrapParts}
                    onChange={(e) => setEditScrapParts(e.target.value)}
                    className="w-full px-2 py-1 text-sm border rounded bg-background"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-muted-foreground text-xs">Cycle Time (sec)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={editCycleTime}
                    onChange={(e) => setEditCycleTime(e.target.value)}
                    className="w-full px-2 py-1 text-sm border rounded bg-background"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-8 text-xs"
                  onClick={() => {
                    setEditingOeeMetrics(false);
                    setEditGoodParts(machine.goodPartsRan?.toString() || "0");
                    setEditScrapParts(machine.scrapParts?.toString() || "0");
                    setEditCycleTime(machine.idealCycleTime?.toString() || "");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="flex-1 h-8 text-xs gap-1.5"
                  onClick={() => {
                    const goodParts = parseInt(editGoodParts);
                    const scrapParts = parseInt(editScrapParts);
                    const cycleTime = parseFloat(editCycleTime);
                    
                    onEditMachine({
                      ...machine,
                      goodPartsRan: isNaN(goodParts) ? 0 : goodParts,
                      scrapParts: isNaN(scrapParts) ? 0 : scrapParts,
                      idealCycleTime: isNaN(cycleTime) ? 0 : cycleTime,
                    });
                    setEditingOeeMetrics(false);
                  }}
                  disabled={isPendingSubmit}
                >
                  <Send className="h-3.5 w-3.5" />
                  {isPendingSubmit ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="bg-muted/50 p-3 rounded">
                <p className="text-muted-foreground text-xs">Good Parts</p>
                <p className="font-bold text-lg">{machine.goodPartsRan || 0}</p>
              </div>
              <div className="bg-muted/50 p-3 rounded">
                <p className="text-muted-foreground text-xs">Scrap Parts</p>
                <p className="font-bold text-lg">{machine.scrapParts || 0}</p>
              </div>
              <div className="bg-muted/50 p-3 rounded">
                <p className="text-muted-foreground text-xs">Cycle Time (sec)</p>
                <p className="font-bold text-lg">{machine.idealCycleTime || "—"}</p>
              </div>
            </div>
          )}

          {/* APQ Breakdown */}
          <div className="space-y-2 pt-2 border-t">
            <div className="grid grid-cols-4 gap-2">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Availability</p>
                <Badge variant="outline" className="w-full justify-center text-xs font-semibold">
                  {actualRuntime >= 0 ? ((actualRuntime / 420) * 100).toFixed(1) : "—"}%
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Performance</p>
                <Badge variant="outline" className="w-full justify-center text-xs font-semibold">
                  {machine.idealCycleTime && actualRuntime > 0
                    ? ((((machine.goodPartsRan || 0) + (machine.scrapParts || 0)) * machine.idealCycleTime) / (actualRuntime * 60) * 100).toFixed(1)
                    : "—"}%
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Quality</p>
                <Badge variant="outline" className="w-full justify-center text-xs font-semibold">
                  {((machine.goodPartsRan || 0) + (machine.scrapParts || 0) > 0
                    ? (((machine.goodPartsRan || 0) / ((machine.goodPartsRan || 0) + (machine.scrapParts || 0))) * 100)
                    : 0).toFixed(1)}%
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">OEE</p>
                <Badge className="w-full justify-center text-xs font-semibold" variant={oee !== null ? "default" : "secondary"}>
                  {oee !== null ? oee.toFixed(1) : "—"}%
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Status Update Section */}
        <div className="rounded-md bg-muted/50 p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
            <FileText className="h-3.5 w-3.5" />
            <span>Status Update</span>
          </div>
          <Textarea
            value={statusUpdate}
            onChange={(e) => {
              setStatusUpdate(e.target.value);
              setIsEditingStatus(true);
            }}
            placeholder="Add a status update or notes about this machine..."
            className="min-h-[80px] text-sm resize-none"
            data-testid={`textarea-status-update-${machine.id}`}
            disabled={isPendingStatusUpdate}
          />
          {isEditingStatus && statusUpdate !== (machine.statusUpdate || "") && (
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-2 gap-1.5"
              onClick={() => {
                onUpdateStatusUpdate(machine.id, statusUpdate);
                setIsEditingStatus(false);
              }}
              disabled={isPendingStatusUpdate}
              data-testid={`button-save-status-update-${machine.id}`}
            >
              <Send className="h-3.5 w-3.5" />
              {isPendingStatusUpdate ? "Saving..." : "Save Update"}
            </Button>
          )}
        </div>

        {/* Quick Status Change Dropdown */}
        <div className="flex gap-2">
          <div className="flex-1">
            <Select value={machine.status} onValueChange={(value) => onStatusChange(machine.id, value as MachineStatus)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="running">
                  <div className="flex items-center gap-2">
                    <Play className="h-3 w-3" />
                    Running
                  </div>
                </SelectItem>
                <SelectItem value="idle">
                  <div className="flex items-center gap-2">
                    <Pause className="h-3 w-3" />
                    Idle
                  </div>
                </SelectItem>
                <SelectItem value="maintenance">
                  <div className="flex items-center gap-2">
                    <Wrench className="h-3 w-3" />
                    Maintenance
                  </div>
                </SelectItem>
                <SelectItem value="down">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-3 w-3" />
                    Down
                  </div>
                </SelectItem>
                <SelectItem value="setup">
                  <div className="flex items-center gap-2">
                    <Settings2 className="h-3 w-3" />
                    Setup
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 mr-2"
            onClick={() => onLogMaintenance(machine.id)}
            data-testid={`button-maintenance-${machine.id}`}
          >
            <Wrench className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => onLogDowntime(machine.id)}
            data-testid={`button-downtime-${machine.id}`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Submit Stats Button */}
        {isSubmittedToday ? (
          <Button
            variant="secondary"
            size="sm"
            className="w-full gap-2"
            onClick={() => onDeleteStats(machine.id)}
            disabled={isPendingDelete || isPendingSubmit}
            data-testid={`button-undo-stats-${machine.id}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Stats Submitted for Shift - Undo
          </Button>
        ) : (
          <Button
            variant="default"
            size="sm"
            className="w-full gap-2"
            onClick={() => onSubmitStats(machine.id)}
            disabled={isPendingSubmit || isPendingDelete}
            data-testid={`button-submit-stats-${machine.id}`}
          >
            <Send className="h-3.5 w-3.5" />
            Submit Production Stats
          </Button>
        )}

        {/* Last Updated */}
        {machine.lastUpdated && (
          <p className="text-xs text-muted-foreground text-center" data-testid={`text-last-updated-${machine.id}`}>
            Updated {machine.lastUpdated}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
