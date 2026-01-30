import { Play, Pause, Wrench, AlertTriangle, Settings, MoreVertical, Pencil, Trash2, Check, X, FileText } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

import type { Machine, MachineStatus } from "@shared/schema";

interface MachineVSMCardProps {
  machine: Machine;
  onStatusChange: (machineId: string, status: MachineStatus) => void;
  onUpdateMachine: (data: { id: string } & Partial<Machine>) => void;
  onStatusNoteChange: (machineId: string, note: string) => void;
  onDeleteMachine: (machineId: string) => void;
  isPending?: boolean;
  findingsCount?: number;
  openFindingsCount?: number;
  onOpenAudit?: (machineId: string) => void;
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
    icon: Settings, 
    className: "bg-machine-setup/15 text-machine-setup border-machine-setup/30",
    borderClass: "border-t-machine-setup",
  },
};

export function MachineVSMCard({
  machine,
  onStatusChange,
  onUpdateMachine,
  onStatusNoteChange,
  onDeleteMachine,
  isPending = false,
  findingsCount = 0,
  openFindingsCount = 0,
  onOpenAudit,
}: MachineVSMCardProps) {
  const [editingNote, setEditingNote] = useState(false);
  const [noteValue, setNoteValue] = useState(machine.statusUpdate || "");

  // optional props are received via parameter destructuring above

  const config = statusConfig[machine.status];
  const StatusIcon = config.icon;

  const [, setLocation] = useLocation();

  const handleSaveNote = () => {
    onStatusNoteChange(machine.id, noteValue);
    setEditingNote(false);
  };

  const handleCancelNote = () => {
    setNoteValue(machine.statusUpdate || "");
    setEditingNote(false);
  };

  return (
    <Card className={`relative border-t-4 ${config.borderClass}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold">{machine.name}</CardTitle>
            <p className="text-xs text-muted-foreground">{machine.machineId}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onOpenAudit && onOpenAudit(machine.id)}>
                {typeof openFindingsCount === 'number' && openFindingsCount > 0 ? (
                  <Badge variant="secondary" className="mr-2">{openFindingsCount}</Badge>
                ) : typeof findingsCount === 'number' && findingsCount > 0 ? (
                  <Badge variant="secondary" className="mr-2">{findingsCount}</Badge>
                ) : null}
                Open Findings
              </DropdownMenuItem>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <DropdownMenuItem onClick={() => setLocation(`/audit-findings?machineId=${encodeURIComponent(machine.id)}&status=open`)}>
                      <FileText className="mr-2 h-4 w-4" />
                      View Open Findings
                    </DropdownMenuItem>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {typeof openFindingsCount === 'number' && openFindingsCount > 0 ? `${openFindingsCount} open` : 'No open findings'}
                </TooltipContent>
              </Tooltip>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setEditingNote(true)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit Note
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => onDeleteMachine(machine.id)}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Status Badge */}
        <Badge className={config.className}>
          <StatusIcon className="mr-1 h-3 w-3" />
          {config.label}
        </Badge>

        {/* VSM Info */}
        {machine.idealCycleTime && (
          <div className="text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cycle Time:</span>
              <span>{machine.idealCycleTime}s</span>
            </div>
            {machine.uptimePercent && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Uptime:</span>
                <span>{machine.uptimePercent}%</span>
              </div>
            )}
            {machine.batchSize && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Batch Size:</span>
                <span>{machine.batchSize} pcs</span>
              </div>
            )}
          </div>
        )}

        {/* Status Note */}
        {editingNote ? (
          <div className="space-y-2">
            <Input
              value={noteValue}
              onChange={(e) => setNoteValue(e.target.value)}
              placeholder="Add status note..."
              className="text-xs h-8"
            />
            <div className="flex gap-1">
              <Button 
                size="sm" 
                onClick={handleSaveNote}
                disabled={isPending}
                className="h-7 text-xs"
              >
                <Check className="mr-1 h-3 w-3" />
                Save
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={handleCancelNote}
                className="h-7 text-xs"
              >
                <X className="mr-1 h-3 w-3" />
                Cancel
              </Button>
            </div>
          </div>
        ) : machine.statusUpdate ? (
          <p className="text-xs text-muted-foreground italic">
            "{machine.statusUpdate}"
          </p>
        ) : null}

        {/* Status Change Buttons */}
        <div className="flex flex-wrap gap-1 pt-2 border-t">
          {(["running", "idle", "setup", "maintenance", "down"] as MachineStatus[]).map((status) => {
            const cfg = statusConfig[status];
            return (
              <Button
                key={status}
                variant={machine.status === status ? "secondary" : "outline"}
                size="sm"
                className="h-7 text-xs px-2"
                disabled={machine.status === status || isPending}
                onClick={() => onStatusChange(machine.id, status)}
              >
                {cfg.label}
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
