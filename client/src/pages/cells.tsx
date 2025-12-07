import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, TrendingUp, AlertCircle, Edit2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { Machine } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";

// Placeholder type for cells until backend is set up
interface Cell {
  id: string;
  name: string;
  description?: string;
  targetOee: number;
  createdAt: string;
  updatedAt: string;
}

interface CellMachine {
  id: string;
  cellId: string;
  machineId: string;
  createdAt: string;
}

export default function CellsPage() {
  const [selectedCell, setSelectedCell] = useState<string>("");
  const [newCellName, setNewCellName] = useState("");
  const [editingCell, setEditingCell] = useState<Cell | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editCellName, setEditCellName] = useState("");

  const { data: machines = [], isLoading: isLoadingMachines, error: machinesError } = useQuery<Machine[]>({
    queryKey: ["/api/machines"],
  });

  const { data: downtimeLogs = [] } = useQuery<any[]>({
    queryKey: ["/api/downtime"],
  });

  // Load cells and cellMachines from localStorage
  const [cells, setCells] = useState<Cell[]>(() => {
    try {
      const stored = localStorage.getItem("cells");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [cellMachines, setCellMachines] = useState<CellMachine[]>(() => {
    try {
      const stored = localStorage.getItem("cellMachines");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Persist cells to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("cells", JSON.stringify(cells));
  }, [cells]);

  // Persist cellMachines to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("cellMachines", JSON.stringify(cellMachines));
  }, [cellMachines]);

  const addCellMutation = useMutation({
    mutationFn: async () => {
      if (!newCellName.trim()) return;
      const newCell: Cell = {
        id: `cell-${Date.now()}`,
        name: newCellName,
        targetOee: 85,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setCells([...cells, newCell]);
      setNewCellName("");
    },
  });

  const removeMachineFromCell = (cellId: string, machineId: string) => {
    setCellMachines(cellMachines.filter((cm) => !(cm.cellId === cellId && cm.machineId === machineId)));
  };

  const deleteCell = (cellId: string) => {
    setCells(cells.filter((c) => c.id !== cellId));
    setCellMachines(cellMachines.filter((cm) => cm.cellId !== cellId));
  };

  const startEditCell = (cell: Cell) => {
    setEditingCell(cell);
    setEditCellName(cell.name);
    setEditDialogOpen(true);
  };

  const saveEditCell = () => {
    if (editingCell && editCellName.trim()) {
      setCells(cells.map((c) => c.id === editingCell.id ? { ...c, name: editCellName.trim() } : c));
      setEditDialogOpen(false);
      setEditingCell(null);
      setEditCellName("");
    }
  };

  const addMachineToCell = (cellId: string, machineId: string) => {
    if (!machineId) return;
    if (cellMachines.some((cm) => cm.cellId === cellId && cm.machineId === machineId)) return;

    const newCellMachine: CellMachine = {
      id: `cm-${Date.now()}`,
      cellId: cellId,
      machineId,
      createdAt: new Date().toISOString(),
    };
    setCellMachines([...cellMachines, newCellMachine]);
  };

  const calculateCellOee = (cellId: string) => {
    const machinesInCell = cellMachines
      .filter((cm) => cm.cellId === cellId)
      .map((cm) => machines.find((m) => m.id === cm.machineId))
      .filter(Boolean) as Machine[];

    if (machinesInCell.length === 0) return 0;

    // Aggregate totals across all machines in cell
    let totalGoodParts = 0;
    let totalBadParts = 0;
    let totalRuntime = 0;
    let bottleneckCycleTime = 0; // slowest cycle time
    let machinesWithData = 0;

    machinesInCell.forEach((m) => {
      // Calculate actual runtime: 420 minutes (shift) - downtime
      const machineDowntime = downtimeLogs
        .filter((log: any) => log.machineId === m.id)
        .reduce((sum: number, log: any) => sum + (log.duration || 0), 0);
      const actualRuntime = 420 - machineDowntime;

      if (m.idealCycleTime && actualRuntime > 0) {
        totalGoodParts += m.goodPartsRan || 0;
        totalBadParts += m.scrapParts || 0;
        totalRuntime += actualRuntime;
        // Track the maximum (slowest) cycle time as bottleneck
        if (m.idealCycleTime > bottleneckCycleTime) {
          bottleneckCycleTime = m.idealCycleTime;
        }
        machinesWithData++;
      }
    });

    if (machinesWithData === 0 || totalRuntime <= 0 || bottleneckCycleTime === 0) return 0;

    const totalParts = totalGoodParts + totalBadParts;
    if (totalParts === 0) return 0;

    // Calculate cell-level OEE using APQ (Availability × Performance × Quality)
    // Availability = Total Runtime / (Planned Runtime × Number of Machines)
    const plannedTotalRuntime = 420 * machinesWithData;
    const availability = totalRuntime / plannedTotalRuntime;

    // Performance = (Total Output × Bottleneck Cycle Time) / Total Runtime
    // Convert runtime to seconds to match cycle time units
    const totalRuntimeSeconds = totalRuntime * 60;
    const performance = (totalParts * bottleneckCycleTime) / totalRuntimeSeconds;

    // Quality = Good Parts / Total Parts
    const quality = totalGoodParts / totalParts;

    // OEE = Availability × Performance × Quality × 100
    const oee = availability * performance * quality * 100;
    return Math.round(oee * 10) / 10;
  };

  const calculateCellStats = (cellId: string) => {
    const machinesInCell = cellMachines
      .filter((cm) => cm.cellId === cellId)
      .map((cm) => machines.find((m) => m.id === cm.machineId))
      .filter(Boolean) as Machine[];

    // Calculate total downtime for all machines in cell
    const totalDowntime = machinesInCell.reduce((sum, m) => {
      const machineDowntime = downtimeLogs
        .filter((log: any) => log.machineId === m.id)
        .reduce((dSum: number, log: any) => dSum + (log.duration || 0), 0);
      return sum + machineDowntime;
    }, 0);

    // Calculate actual runtime: 420 minutes per machine - downtime
    const baseRuntime = 420 * machinesInCell.length;
    const actualRuntime = Math.max(0, baseRuntime - totalDowntime);

    return {
      totalMachines: machinesInCell.length,
      totalGoodParts: machinesInCell.reduce((sum, m) => sum + (m.goodPartsRan || 0), 0),
      totalScrapParts: machinesInCell.reduce((sum, m) => sum + (m.scrapParts || 0), 0),
      actualRuntime: actualRuntime,
    };
  };

  if (isLoadingMachines) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="p-4">
          <h1 className="text-2xl font-bold mb-1">Manufacturing Cells</h1>
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
          <h1 className="text-2xl font-bold">Manufacturing Cells</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Organize machines into cells and track combined production stats
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4">
          {/* Create Cell Section */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Create New Cell</CardTitle>
              <CardDescription className="text-xs">Add a new manufacturing cell</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Cell name (e.g., 'Cell A - Finishing')"
                  value={newCellName}
                  onChange={(e) => setNewCellName(e.target.value)}
                />
                <Button
                  onClick={() => addCellMutation.mutate()}
                  disabled={!newCellName.trim() || addCellMutation.isPending}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Create
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Cells Grid */}
          <div className="space-y-4">
            {/* Machines Status */}
            {machinesError ? (
              <Card className="bg-red-50 border-red-200">
                <CardContent className="pt-4 pb-4">
                  <p className="text-sm text-red-900">
                    <strong>Error loading machines:</strong> {machinesError.message}
                  </p>
                </CardContent>
              </Card>
            ) : isLoadingMachines ? (
              <Card className="bg-yellow-50 border-yellow-200">
                <CardContent className="pt-4 pb-4">
                  <p className="text-sm text-yellow-900">
                    <strong>Loading machines...</strong>
                  </p>
                </CardContent>
              </Card>
            ) : machines.length === 0 ? (
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="pt-4 pb-4">
                  <p className="text-sm text-blue-900">
                    <strong>No machines found.</strong> Go to <strong>Machines</strong> page to create or view your machines.
                  </p>
                </CardContent>
              </Card>
            ) : null}

            {cells.length === 0 ? (
              <Card>
                <CardContent className="pt-8 pb-8 text-center">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">No cells created yet. Create one to get started.</p>
                </CardContent>
              </Card>
            ) : (
              cells.map((cell) => {
                const stats = calculateCellStats(cell.id);
                const oee = calculateCellOee(cell.id);
                const machinesInCell = cellMachines.filter((cm) => cm.cellId === cell.id);
                const availableMachines = machines.filter(
                  (m) => !machinesInCell.some((cm) => cm.machineId === m.id)
                );

                return (
                  <Card key={cell.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg">{cell.name}</CardTitle>
                          {cell.description && (
                            <CardDescription className="text-xs">{cell.description}</CardDescription>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" />
                            OEE: {oee}%
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => startEditCell(cell)}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => deleteCell(cell.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Cell Stats */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div className="bg-muted/50 p-2 rounded">
                          <p className="text-xs text-muted-foreground">Machines</p>
                          <p className="text-lg font-bold">{stats.totalMachines}</p>
                        </div>
                        <div className="bg-muted/50 p-2 rounded">
                          <p className="text-xs text-muted-foreground">Good Parts</p>
                          <p className="text-lg font-bold">{stats.totalGoodParts}</p>
                        </div>
                        <div className="bg-muted/50 p-2 rounded">
                          <p className="text-xs text-muted-foreground">Scrap Parts</p>
                          <p className="text-lg font-bold">{stats.totalScrapParts}</p>
                        </div>
                        <div className="bg-muted/50 p-2 rounded">
                          <p className="text-xs text-muted-foreground">Run Time (hrs)</p>
                          <p className="text-lg font-bold">{(stats.actualRuntime / 60).toFixed(1)}</p>
                        </div>
                      </div>

                      {/* Machines in Cell */}
                      <div>
                        <h4 className="text-sm font-medium mb-2">Machines in Cell</h4>
                        {machinesInCell.length === 0 ? (
                          <p className="text-xs text-muted-foreground mb-2">No machines assigned yet</p>
                        ) : (
                          <div className="space-y-1">
                            {machinesInCell.map((cm) => {
                              const machine = machines.find((m) => m.id === cm.machineId);
                              if (!machine) return null;
                              return (
                                <div key={cm.id} className="flex items-center justify-between text-xs p-1 bg-muted/30 rounded">
                                  <span>{machine.name}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Edit Cell Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Manufacturing Cell</DialogTitle>
            <DialogDescription>Update the cell name and manage assigned machines</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Cell Name */}
            <div className="space-y-2">
              <Label htmlFor="cell-name">Cell Name</Label>
              <Input
                id="cell-name"
                value={editCellName}
                onChange={(e) => setEditCellName(e.target.value)}
                placeholder="Enter cell name..."
              />
            </div>

            {/* Machines in Cell */}
            {editingCell && (
              <div className="space-y-2">
                <Label>Machines in Cell</Label>
                {(() => {
                  const machinesInCell = cellMachines.filter((cm) => cm.cellId === editingCell.id);
                  return (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {machinesInCell.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No machines assigned</p>
                      ) : (
                        machinesInCell.map((cm) => {
                          const machine = machines.find((m) => m.id === cm.machineId);
                          if (!machine) return null;
                          return (
                            <div key={cm.id} className="flex items-center justify-between text-xs p-2 bg-muted/30 rounded">
                              <span>{machine.name}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-1"
                                onClick={() => removeMachineFromCell(editingCell.id, cm.machineId)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          );
                        })
                      )}
                      
                      {/* Add Machine to Cell */}
                      {(() => {
                        const machinesInCell = cellMachines.filter((cm) => cm.cellId === editingCell.id);
                        const availableMachines = machines.filter(
                          (m) => !machinesInCell.some((cm) => cm.machineId === m.id)
                        );
                        return (
                          availableMachines.length > 0 && (
                            <Select
                              onValueChange={(machineId) => {
                                addMachineToCell(editingCell.id, machineId);
                              }}
                              defaultValue=""
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Add machine..." />
                              </SelectTrigger>
                              <SelectContent>
                                {availableMachines.map((m) => (
                                  <SelectItem key={m.id} value={m.id}>
                                    {m.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )
                        );
                      })()}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveEditCell}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
