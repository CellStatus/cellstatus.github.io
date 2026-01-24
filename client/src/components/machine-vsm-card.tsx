import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { 
  Play, 
  Pause, 
  Wrench, 
  AlertTriangle, 
  Settings2,
  Clock,
  Zap,
  MoreVertical,
  Pencil,
  Trash2,
  MessageSquare,
  Package,
  Gauge,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Machine, MachineStatus } from "@shared/schema";

interface MachineVSMCardProps {
  machine: Machine;
  onStatusChange: (machineId: string, status: MachineStatus) => void;
  onUpdateMachine: (machine: Partial<Machine> & { id: string }) => void;
  onStatusNoteChange: (machineId: string, statusUpdate: string) => void;
  onDeleteMachine: (machineId: string) => void;
  isPending?: boolean;
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
    className: "bg-green-500/15 text-green-600 border-green-500/30",
    borderClass: "border-t-green-500",
  },
  idle: { 
    label: "Idle", 
    icon: Pause, 
    className: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
    borderClass: "border-t-yellow-500",
  },
  maintenance: { 
    label: "Maintenance", 
    icon: Wrench, 
    className: "bg-blue-500/15 text-blue-600 border-blue-500/30",
    borderClass: "border-t-blue-500",
  },
  down: { 
    label: "Down", 
    icon: AlertTriangle, 
    className: "bg-red-500/15 text-red-600 border-red-500/30",
    borderClass: "border-t-red-500",
  },
  setup: { 
    label: "Setup", 
    icon: Settings2, 
    className: "bg-purple-500/15 text-purple-600 border-purple-500/30",
    borderClass: "border-t-purple-500",
  },
};

export function MachineVSMCard({
  machine,
  onStatusChange,
  onUpdateMachine,
  onStatusNoteChange,
  onDeleteMachine,
  isPending = false,
}: MachineVSMCardProps) {
  const status = statusConfig[machine.status];
  const StatusIcon = status.icon;
  
  const [isEditing, setIsEditing] = useState(false);
  const [editCycleTime, setEditCycleTime] = useState(machine.idealCycleTime?.toString() || "");
  const [editBatchSize, setEditBatchSize] = useState(machine.batchSize?.toString() || "");
  const [editUptimePercent, setEditUptimePercent] = useState(machine.uptimePercent?.toString() || "");
  const [editSetupTime, setEditSetupTime] = useState(machine.setupTime?.toString() || "");
  const [statusNote, setStatusNote] = useState(machine.statusUpdate || "");
  const [isEditingNote, setIsEditingNote] = useState(false);

  const handleSave = () => {
    const cycleTime = parseFloat(editCycleTime);
    const batchSize = parseInt(editBatchSize);
    const uptimePercent = parseFloat(editUptimePercent);
    const setupTime = parseFloat(editSetupTime);
    onUpdateMachine({
      id: machine.id,
      idealCycleTime: isNaN(cycleTime) ? undefined : cycleTime,
      batchSize: isNaN(batchSize) ? undefined : batchSize,
      uptimePercent: isNaN(uptimePercent) ? undefined : uptimePercent,
      setupTime: isNaN(setupTime) ? undefined : setupTime,
    });
    setIsEditing(false);
  };

  const handleSaveNote = () => {
    onStatusNoteChange(machine.id, statusNote);
    setIsEditingNote(false);
  };

  return (
    <Card className={`overflow-visible border-t-4 ${status.borderClass}`}>
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-semibold truncate">
              {machine.name}
            </h3>
          </div>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="font-mono text-xs">
              {machine.machineId}
            </Badge>
            <Badge className={`${status.className} border gap-1`}>
              <StatusIcon className="h-3 w-3" />
              {status.label}
            </Badge>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setIsEditing(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit VSM Data
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => onDeleteMachine(machine.id)}
              className="text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Machine
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* VSM Parameters */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Zap className="h-4 w-4" />
            VSM Parameters
          </div>
          
          {isEditing ? (
            <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
              <div>
                <Label className="text-xs">Cycle Time (seconds)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={editCycleTime}
                  onChange={(e) => setEditCycleTime(e.target.value)}
                  className="h-8 mt-1"
                  placeholder="e.g., 15"
                />
              </div>
              <div>
                <Label className="text-xs">Pcs/Setup (batch size)</Label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={editBatchSize}
                  onChange={(e) => setEditBatchSize(e.target.value)}
                  className="h-8 mt-1"
                  placeholder="e.g., 100"
                />
              </div>
              <div>
                <Label className="text-xs">Setup Time (seconds)</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={editSetupTime}
                  onChange={(e) => setEditSetupTime(e.target.value)}
                  className="h-8 mt-1"
                  placeholder="e.g., 300"
                />
              </div>
              <div>
                <Label className="text-xs">Reliability % (uptime)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={editUptimePercent}
                  onChange={(e) => setEditUptimePercent(e.target.value)}
                  className="h-8 mt-1"
                  placeholder="e.g., 95"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setIsEditing(false);
                    setEditCycleTime(machine.idealCycleTime?.toString() || "");
                    setEditBatchSize(machine.batchSize?.toString() || "");
                    setEditSetupTime(machine.setupTime?.toString() || "");
                    setEditUptimePercent(machine.uptimePercent?.toString() || "");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={handleSave}
                  disabled={isPending}
                >
                  {isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              <div 
                className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted/70 transition-colors group"
                onClick={() => setIsEditing(true)}
                title="Click to edit"
              >
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-500" />
                  <span className="text-sm">Cycle Time</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg">
                    {machine.idealCycleTime ? `${machine.idealCycleTime}s` : "—"}
                  </span>
                  <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
              <div 
                className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted/70 transition-colors group"
                onClick={() => setIsEditing(true)}
                title="Click to edit"
              >
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-purple-500" />
                  <span className="text-sm">Pcs/Setup</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg">
                    {machine.batchSize ? machine.batchSize : "—"}
                  </span>
                  <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
              <div 
                className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted/70 transition-colors group"
                onClick={() => setIsEditing(true)}
                title="Click to edit"
              >
                <div className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-orange-500" />
                  <span className="text-sm">Setup Time</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg">
                    {machine.setupTime ? `${machine.setupTime}s` : "—"}
                  </span>
                  <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
              <div 
                className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted/70 transition-colors group"
                onClick={() => setIsEditing(true)}
                title="Click to edit"
              >
                <div className="flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-green-500" />
                  <span className="text-sm">Reliability</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg">
                    {machine.uptimePercent ? `${machine.uptimePercent}%` : "—"}
                  </span>
                  <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Throughput Calculation */}
        {machine.idealCycleTime && machine.idealCycleTime > 0 ? (
          <div className="p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
            <div className="text-xs text-green-700 dark:text-green-400 mb-1">
              {(machine.uptimePercent && machine.uptimePercent < 100) || (machine.setupTime && machine.batchSize) ? "Effective Throughput" : "Theoretical Throughput"}
            </div>
            <div className="text-lg font-bold text-green-600 dark:text-green-400">
              {(() => {
                // Calculate effective cycle time including setup time per piece
                const setupTimePerPiece = (machine.setupTime && machine.batchSize) 
                  ? machine.setupTime / machine.batchSize 
                  : 0;
                const effectiveCycleTime = machine.idealCycleTime + setupTimePerPiece;
                const theoretical = 3600 / effectiveCycleTime;
                const reliability = machine.uptimePercent ? machine.uptimePercent / 100 : 1;
                return (theoretical * reliability).toFixed(0);
              })()} units/hour
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {(() => {
                const parts = [];
                parts.push(`${machine.idealCycleTime}s cycle`);
                if (machine.setupTime && machine.batchSize) {
                  const setupPerPiece = (machine.setupTime / machine.batchSize).toFixed(1);
                  parts.push(`${setupPerPiece}s setup/pc`);
                }
                if (machine.uptimePercent && machine.uptimePercent < 100) {
                  parts.push(`${machine.uptimePercent}% reliability`);
                }
                return parts.join(" × ");
              })()}
            </div>
          </div>
        ) : (
          <div 
            className="p-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-lg cursor-pointer hover:bg-orange-100 dark:hover:bg-orange-950/30 transition-colors"
            onClick={() => setIsEditing(true)}
          >
            <div className="text-xs text-orange-700 dark:text-orange-400 mb-1">Theoretical Throughput</div>
            <div className="text-sm font-medium text-orange-600 dark:text-orange-400">
              Data required
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Click to set cycle time
            </div>
          </div>
        )}

        {/* Machine Status */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <MessageSquare className="h-4 w-4" />
            Machine Status
          </div>
          {isEditingNote ? (
            <div className="space-y-2">
              <Textarea
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
                placeholder="Add notes about current status..."
                className="min-h-[60px] text-sm"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setIsEditingNote(false);
                    setStatusNote(machine.statusUpdate || "");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={handleSaveNote}
                  disabled={isPending}
                >
                  {isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          ) : (
            <div 
              className="p-2 bg-muted/50 rounded-lg min-h-[40px] cursor-pointer hover:bg-muted/70 transition-colors group"
              onClick={() => setIsEditingNote(true)}
              title="Click to edit"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-muted-foreground flex-1">
                  {machine.statusUpdate || "Click to add notes..."}
                </p>
                <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
              </div>
            </div>
          )}
        </div>

        {/* Status Change */}
        <div className="pt-2">
          <Select 
            value={machine.status} 
            onValueChange={(value) => onStatusChange(machine.id, value as MachineStatus)}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="running">
                <div className="flex items-center gap-2">
                  <Play className="h-3 w-3 text-green-500" />
                  Running
                </div>
              </SelectItem>
              <SelectItem value="idle">
                <div className="flex items-center gap-2">
                  <Pause className="h-3 w-3 text-yellow-500" />
                  Idle
                </div>
              </SelectItem>
              <SelectItem value="maintenance">
                <div className="flex items-center gap-2">
                  <Wrench className="h-3 w-3 text-blue-500" />
                  Maintenance
                </div>
              </SelectItem>
              <SelectItem value="down">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-3 w-3 text-red-500" />
                  Down
                </div>
              </SelectItem>
              <SelectItem value="setup">
                <div className="flex items-center gap-2">
                  <Settings2 className="h-3 w-3 text-purple-500" />
                  Setup
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
