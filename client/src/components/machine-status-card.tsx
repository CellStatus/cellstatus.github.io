import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useState, useEffect } from "react";
import { 
  Play, 
  Pause, 
  Wrench, 
  AlertTriangle, 
  Settings2,
  Clock,
  Target,
  TrendingUp,
  UserCircle,
  MoreVertical,
  Send,
  Trash2,
  Timer,
  CheckCircle,
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
  onStatusChange: (machineId: string, status: MachineStatus) => void;
  onAssignOperator: (machineId: string) => void;
  onLogMaintenance: (machineId: string) => void;
  onLogDowntime: (machineId: string) => void;
  onEditMachine: (machine: Machine) => void;
  onSubmitStats: (machineId: string) => void;
  onDeleteStats: (machineId: string) => void;
  isSubmittedToday: boolean;
  isPendingSubmit: boolean;
  isPendingDelete: boolean;
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
  onStatusChange,
  onAssignOperator,
  onLogMaintenance,
  onLogDowntime,
  onEditMachine,
  onSubmitStats,
  onDeleteStats,
  isSubmittedToday,
  isPendingSubmit,
  isPendingDelete,
  activeDowntime,
  onResolveDowntime,
}: MachineStatusCardProps) {
  const status = statusConfig[machine.status];
  const StatusIcon = status.icon;
  const efficiency = machine.efficiency ?? 0;
  const progressPercent = machine.targetUnits > 0 
    ? Math.min(100, (machine.unitsProduced / machine.targetUnits) * 100) 
    : 0;

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
            <DropdownMenuItem onClick={() => onEditMachine(machine)} data-testid={`button-edit-machine-${machine.id}`}>
              <Settings2 className="mr-2 h-4 w-4" />
              Edit Machine
            </DropdownMenuItem>
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

        {/* Production Stats */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Target className="h-4 w-4" />
              <span>Production</span>
            </div>
            <span className="font-mono text-sm font-medium" data-testid={`text-production-${machine.id}`}>
              {machine.unitsProduced} / {machine.targetUnits}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div 
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
              data-testid={`progress-production-${machine.id}`}
            />
          </div>
        </div>

        {/* Metrics Row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md bg-muted/50 p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Clock className="h-3.5 w-3.5" />
              <span>Cycle Time</span>
            </div>
            <p className="font-mono text-xl font-bold" data-testid={`text-cycle-time-${machine.id}`}>
              {machine.cycleTime ? `${machine.cycleTime.toFixed(1)}s` : "--"}
            </p>
          </div>
          <div className="rounded-md bg-muted/50 p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <TrendingUp className="h-3.5 w-3.5" />
              <span>Efficiency</span>
            </div>
            <p className={`font-mono text-xl font-bold ${efficiency >= 90 ? 'text-machine-running' : efficiency >= 70 ? 'text-machine-maintenance' : 'text-machine-down'}`} data-testid={`text-efficiency-${machine.id}`}>
              {efficiency > 0 ? `${efficiency.toFixed(0)}%` : "--"}
            </p>
          </div>
        </div>

        {/* Quick Status Change Buttons */}
        <div className="flex gap-2">
          <Button
            variant={machine.status === "running" ? "default" : "outline"}
            size="sm"
            className="flex-1 gap-1.5"
            onClick={() => onStatusChange(machine.id, "running")}
            disabled={machine.status === "running"}
            data-testid={`button-status-running-${machine.id}`}
          >
            <Play className="h-3.5 w-3.5" />
            Run
          </Button>
          <Button
            variant={machine.status === "idle" ? "secondary" : "outline"}
            size="sm"
            className="flex-1 gap-1.5"
            onClick={() => onStatusChange(machine.id, "idle")}
            disabled={machine.status === "idle"}
            data-testid={`button-status-idle-${machine.id}`}
          >
            <Pause className="h-3.5 w-3.5" />
            Idle
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => onLogMaintenance(machine.id)}
            data-testid={`button-maintenance-${machine.id}`}
          >
            <Wrench className="h-3.5 w-3.5" />
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
