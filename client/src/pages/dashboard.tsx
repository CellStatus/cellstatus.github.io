import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import type { HTMLAttributes } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { MachineCard } from "@/components/machine-card";
import { MachineDialog, type MachineSubmitData } from "@/components/machine-dialog";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { exportDashboardStatusPdf } from "@/lib/dashboard-report";
import { 
  Search,
  Factory,
  Bell,
  Cog,
  ChevronDown,
  ChevronRight,
  FileDown,
} from "lucide-react";
import type { CellConfiguration, Characteristic, Machine, MachineStatus, Part, ScrapIncident } from "@shared/schema";

type CostliestIncident = {
  id: string;
  machineId: string;
  partId: string | null;
  machineName: string;
  cellName: string;
  characteristic: string;
  partNumber: string;
  quantity: number;
  incidentCost: number;
  dateCreated: string | null;
};

type CharScrapSummary = {
  characteristic: string;
  partNumber: string;
  totalCost: number;
  incidentCount: number;
  totalQuantity: number;
};

type CellScrapSummary = {
  cellName: string;
  incidentCount: number;
  totalCost: number;
  totalQuantity: number;
};

type MachineScrapSummary = {
  machineId: string;
  machineName: string;
  totalCost: number;
  incidentCount: number;
  totalQuantity: number;
};

type PartScrapSummary = {
  partId: string | null;
  partNumber: string;
  partName: string | null;
  totalCost: number;
  incidentCount: number;
  totalQuantity: number;
};

type TimeRangeMetrics = {
  incidentCount: number;
  totalCost: number;
  totalQuantity: number;
};

type TrendGranularity = "day" | "week" | "month";

export default function Dashboard() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [machineDialogOpen, setMachineDialogOpen] = useState(false);
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingMachineId, setDeletingMachineId] = useState<string | null>(null);
  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set());
  const [isExportingReport, setIsExportingReport] = useState(false);
  const [trendGranularity, setTrendGranularity] = useState<TrendGranularity>("day");

  // Fetch machines
  const { data: machines = [], isLoading: machinesLoading } = useQuery<Machine[]>({
    queryKey: ["/api/machines"],
  });

  const { data: cells = [], isLoading: cellsLoading } = useQuery<CellConfiguration[]>({
    queryKey: ["/api/cells"],
    queryFn: async () => apiRequest("GET", "/api/cells"),
  });

  const goToSpcData = useCallback((params?: Record<string, string | number | undefined>) => {
    let target = "/spc-data";
    if (params) {
      const search = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          search.set(key, String(value));
        }
      });
      let hasEntries = false;
      search.forEach(() => {
        hasEntries = true;
      });
      if (hasEntries) {
        target = `${target}?${search.toString()}`;
      }
    }
    setLocation(target);
  }, [setLocation]);

  const clickableCardProps = useCallback(
    (handler: () => void): HTMLAttributes<HTMLDivElement> => ({
      onClick: handler,
      onKeyDown: (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handler();
        }
      },
      role: "button",
      tabIndex: 0,
      className: "cursor-pointer transition hover:-translate-y-[1px] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
    }),
    []
  );

  

  // Mutations
  const createMachineMutation = useMutation({
    mutationFn: (data: Partial<Machine>) => apiRequest("POST", "/api/machines", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
      setMachineDialogOpen(false);
      toast({ title: "Machine added successfully" });
    },
    onError: () => {
      toast({ title: "Failed to add machine", variant: "destructive" });
    },
  });

  const updateMachineMutation = useMutation({
    mutationFn: (data: Partial<Machine> & { id: string }) => 
      apiRequest("PATCH", `/api/machines/${data.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
      toast({ title: "Machine updated" });
    },
    onError: () => {
      toast({ title: "Failed to update machine", variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: MachineStatus }) =>
      apiRequest("PATCH", `/api/machines/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
    },
  });

  const updateStatusNoteMutation = useMutation({
    mutationFn: ({ id, statusUpdate }: { id: string; statusUpdate: string }) =>
      apiRequest("PATCH", `/api/machines/${id}/status-update`, { statusUpdate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
      toast({ title: "Status note updated" });
    },
    onError: () => {
      toast({ title: "Failed to update status note", variant: "destructive" });
    },
  });

  const deleteMachineMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/machines/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
      setDeleteConfirmOpen(false);
      setDeletingMachineId(null);
      toast({ title: "Machine deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete machine", variant: "destructive" });
    },
  });

  // Filter machines
  const filteredMachines = machines.filter(machine => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      machine.name.toLowerCase().includes(query) ||
      machine.machineId.toLowerCase().includes(query) ||
      (machine.cell && machine.cell.toLowerCase().includes(query))
    );
  });

  // Group machines by cell
  const machinesByCell = useMemo(() => {
    const grouped: Record<string, Machine[]> = {};
    const cellNumberByName = new Map<string, number | null>();

    (cells || []).forEach((cell) => {
      const parsedNumber = Number(cell.status);
      cellNumberByName.set(
        cell.name,
        Number.isFinite(parsedNumber) ? parsedNumber : null,
      );
    });

    filteredMachines.forEach(machine => {
      const cellName = machine.cell || "Unassigned";
      if (!grouped[cellName]) {
        grouped[cellName] = [];
      }
      grouped[cellName].push(machine);
    });

    Object.keys(grouped).forEach((cellName) => {
      grouped[cellName].sort((left, right) =>
        left.machineId.localeCompare(right.machineId, undefined, {
          numeric: true,
          sensitivity: "base",
        })
      );
    });

    const extractFirstNumber = (label: string): number | null => {
      const match = label.match(/\d+(?:\.\d+)?/);
      if (!match) return null;
      const parsed = Number(match[0]);
      return Number.isFinite(parsed) ? parsed : null;
    };

    // Sort cells: numeric first, then alphabetic (Unassigned always last)
    const sortedKeys = Object.keys(grouped).sort((a, b) => {
      if (a === "Unassigned") return 1;
      if (b === "Unassigned") return -1;

      const aCellNumber = (cellNumberByName.get(a) ?? null) ?? extractFirstNumber(a);
      const bCellNumber = (cellNumberByName.get(b) ?? null) ?? extractFirstNumber(b);

      if (aCellNumber !== null && bCellNumber !== null && aCellNumber !== bCellNumber) {
        return aCellNumber - bCellNumber;
      }

      if (aCellNumber !== null && bCellNumber === null) return -1;
      if (aCellNumber === null && bCellNumber !== null) return 1;

      return a.localeCompare(b, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });
    return { grouped, sortedKeys };
  }, [filteredMachines, cells]);

  // Fetch scrap incidents and group by machine
  const { data: scrapIncidents = [], isLoading: incidentsLoading } = useQuery<ScrapIncident[]>({
    queryKey: ['/api/scrap-incidents'],
    queryFn: async () => apiRequest('GET', '/api/scrap-incidents'),
  });

  const { data: parts = [], isLoading: partsLoading } = useQuery<Part[]>({
    queryKey: ['/api/parts'],
    queryFn: async () => apiRequest('GET', '/api/parts'),
  });

  const { data: characteristics = [], isLoading: characteristicsLoading } = useQuery<Characteristic[]>({
    queryKey: ["/api/characteristics"],
    queryFn: async () => apiRequest("GET", "/api/characteristics"),
  });

  const dashboardIncidents = useMemo(() => {
    return scrapIncidents || [];
  }, [scrapIncidents]);

  const incidentsByMachine = useMemo(() => {
    const map: Record<string, ScrapIncident[]> = {};
    (dashboardIncidents || []).forEach((incident) => {
      if (!map[incident.machineId]) map[incident.machineId] = [];
      map[incident.machineId].push(incident);
    });
    return map;
  }, [dashboardIncidents]);

  const partById = useMemo(() => {
    const map = new Map<string, Part>();
    (parts || []).forEach((part) => map.set(part.id, part));
    return map;
  }, [parts]);

  const incidentsWithCost = useMemo<CostliestIncident[]>(() => {
    return (dashboardIncidents || [])
      .map((incident) => {
        const machine = machines.find((item) => item.id === incident.machineId);
        const part = incident.partId ? partById.get(incident.partId) : null;
        return {
          id: incident.id,
          machineId: incident.machineId,
          partId: incident.partId,
          machineName: machine?.name || incident.machineId || "Unknown Machine",
          cellName: machine?.cell || "Unassigned",
          characteristic: incident.characteristic || "(unknown)",
          partNumber: part?.partNumber || "Unknown",
          quantity: incident.quantity,
          incidentCost: Number(incident.estimatedCost || 0),
          dateCreated: incident.dateCreated || incident.createdAt || null,
        };
      })
      .filter((incident) => incident.incidentCost >= 0);
  }, [machines, dashboardIncidents, partById]);

  const costliestIncidents = useMemo<CostliestIncident[]>(() => {
    return [...incidentsWithCost]
      .filter((incident) => incident.incidentCost > 0)
      .sort((left, right) => right.incidentCost - left.incidentCost)
      .slice(0, 5);
  }, [incidentsWithCost]);

  const cellScrapSummary = useMemo<CellScrapSummary[]>(() => {
    const map = new Map<string, CellScrapSummary>();
    incidentsWithCost.forEach((incident) => {
      const existing = map.get(incident.cellName);
      if (existing) {
        existing.incidentCount += 1;
        existing.totalCost += incident.incidentCost;
        existing.totalQuantity += incident.quantity;
      } else {
        map.set(incident.cellName, {
          cellName: incident.cellName,
          incidentCount: 1,
          totalCost: incident.incidentCost,
          totalQuantity: incident.quantity,
        });
      }
    });
    return Array.from(map.values()).sort((left, right) => right.totalCost - left.totalCost);
  }, [incidentsWithCost]);

  const machineScrapSummary = useMemo<MachineScrapSummary[]>(() => {
    const map = new Map<string, MachineScrapSummary>();
    incidentsWithCost.forEach((incident) => {
      const existing = map.get(incident.machineId);
      if (existing) {
        existing.totalCost += incident.incidentCost;
        existing.incidentCount += 1;
        existing.totalQuantity += incident.quantity;
      } else {
        map.set(incident.machineId, {
          machineId: incident.machineId,
          machineName: incident.machineName,
          totalCost: incident.incidentCost,
          incidentCount: 1,
          totalQuantity: incident.quantity,
        });
      }
    });
    return Array.from(map.values()).sort((left, right) => right.totalCost - left.totalCost);
  }, [incidentsWithCost]);

  const highestScrapMachine = machineScrapSummary[0];
  const highestScrapCell = cellScrapSummary[0];

  const charScrapSummary = useMemo<CharScrapSummary[]>(() => {
    const map = new Map<string, CharScrapSummary>();
    incidentsWithCost.forEach((incident) => {
      const partNumber = incident.partId ? (partById.get(incident.partId)?.partNumber || "Unknown Part") : "Unassigned";
      const key = `${partNumber}::${incident.characteristic}`;
      const existing = map.get(key);
      if (existing) {
        existing.totalCost += incident.incidentCost;
        existing.incidentCount += 1;
        existing.totalQuantity += incident.quantity;
      } else {
        map.set(key, {
          characteristic: incident.characteristic,
          partNumber,
          totalCost: incident.incidentCost,
          incidentCount: 1,
          totalQuantity: incident.quantity,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.totalCost - a.totalCost);
  }, [incidentsWithCost, partById]);

  const partScrapSummary = useMemo<PartScrapSummary[]>(() => {
    const map = new Map<string, PartScrapSummary>();
    incidentsWithCost.forEach((incident) => {
      const partId = incident.partId;
      const key = partId || "unassigned";
      const partNumber = partId ? (partById.get(partId)?.partNumber || "Unknown Part") : "Unassigned";
      const partName = partId ? (partById.get(partId)?.partName || null) : null;
      const existing = map.get(key);
      if (existing) {
        existing.totalCost += incident.incidentCost;
        existing.incidentCount += 1;
        existing.totalQuantity += incident.quantity;
      } else {
        map.set(key, {
          partId,
          partNumber,
          partName,
          totalCost: incident.incidentCost,
          incidentCount: 1,
          totalQuantity: incident.quantity,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.totalCost - a.totalCost);
  }, [incidentsWithCost, partById]);

  const timeRangeMetrics = useMemo(() => {
    const now = new Date();

    const startOfWeek = new Date(now);
    const dayOffset = (startOfWeek.getDay() + 6) % 7;
    startOfWeek.setDate(startOfWeek.getDate() - dayOffset);
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const metrics: {
      week: TimeRangeMetrics;
      month: TimeRangeMetrics;
      year: TimeRangeMetrics;
    } = {
      week: { incidentCount: 0, totalCost: 0, totalQuantity: 0 },
      month: { incidentCount: 0, totalCost: 0, totalQuantity: 0 },
      year: { incidentCount: 0, totalCost: 0, totalQuantity: 0 },
    };

    const resolveIncidentDate = (incident: ScrapIncident) => {
      const rawDate = incident.dateCreated || incident.createdAt || incident.updatedAt;
      if (!rawDate) return null;
      const parsed = new Date(rawDate);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    dashboardIncidents.forEach((incident) => {
      const incidentDate = resolveIncidentDate(incident);
      if (!incidentDate) return;

      const incidentCost = Number(incident.estimatedCost || 0);
      const quantity = Number(incident.quantity || 0);

      if (incidentDate >= startOfYear) {
        metrics.year.incidentCount += 1;
        metrics.year.totalCost += incidentCost;
        metrics.year.totalQuantity += quantity;
      }

      if (incidentDate >= startOfMonth) {
        metrics.month.incidentCount += 1;
        metrics.month.totalCost += incidentCost;
        metrics.month.totalQuantity += quantity;
      }

      if (incidentDate >= startOfWeek) {
        metrics.week.incidentCount += 1;
        metrics.week.totalCost += incidentCost;
        metrics.week.totalQuantity += quantity;
      }
    });

    return metrics;
  }, [dashboardIncidents]);

  const scrapCostTrendChart = useMemo(() => {
    const now = new Date();
    const startOfDay = (date: Date) =>
      new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const startOfWeek = (date: Date) => {
      const day = (date.getDay() + 6) % 7;
      const monday = new Date(date);
      monday.setDate(date.getDate() - day);
      return startOfDay(monday);
    };
    const startOfMonth = (date: Date) =>
      new Date(date.getFullYear(), date.getMonth(), 1);
    const toIsoDate = (date: Date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    };
    const getPeriodStart = (date: Date) => {
      if (trendGranularity === "day") return startOfDay(date);
      if (trendGranularity === "week") return startOfWeek(date);
      return startOfMonth(date);
    };
    const formatPeriodLabel = (date: Date) => {
      if (trendGranularity === "day") {
        return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      }
      if (trendGranularity === "week") {
        return `Wk ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
      }
      return date.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
    };

    const bucketCount = trendGranularity === "day" ? 14 : 12;
    const periods = Array.from({ length: bucketCount }, (_, index) => {
      const stepsBack = bucketCount - 1 - index;
      const anchor = new Date(now);
      if (trendGranularity === "day") {
        anchor.setDate(anchor.getDate() - stepsBack);
      } else if (trendGranularity === "week") {
        anchor.setDate(anchor.getDate() - stepsBack * 7);
      } else {
        anchor.setMonth(anchor.getMonth() - stepsBack, 1);
      }
      const start = getPeriodStart(anchor);
      return {
        key: toIsoDate(start),
        label: formatPeriodLabel(start),
      };
    });

    const periodSet = new Set(periods.map((period) => period.key));
    const firstPeriodKey = periods.length > 0 ? periods[0].key : "";
    const periodPartTotals = new Map<string, Map<string, number>>();
    const partTotals = new Map<string, number>();
    const prePeriodTotals = new Map<string, number>();

    const resolveIncidentDate = (incident: ScrapIncident) => {
      const rawDate = incident.dateCreated || incident.createdAt || incident.updatedAt;
      if (!rawDate) return null;
      const parsed = new Date(rawDate);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    dashboardIncidents.forEach((incident) => {
      const incidentDate = resolveIncidentDate(incident);
      if (!incidentDate) return;

      const periodKey = toIsoDate(getPeriodStart(incidentDate));
      const partNumber = incident.partId ? (partById.get(incident.partId)?.partNumber || "Unknown Part") : "Unassigned";
      const incidentCost = Number(incident.estimatedCost || 0);

      partTotals.set(partNumber, (partTotals.get(partNumber) || 0) + incidentCost);

      if (!periodSet.has(periodKey)) {
        // Accumulate costs from before the visible period range
        if (periodKey < firstPeriodKey) {
          prePeriodTotals.set(partNumber, (prePeriodTotals.get(partNumber) || 0) + incidentCost);
        }
        return;
      }

      if (!periodPartTotals.has(periodKey)) {
        periodPartTotals.set(periodKey, new Map());
      }
      const partCostMap = periodPartTotals.get(periodKey)!;
      partCostMap.set(partNumber, (partCostMap.get(partNumber) || 0) + incidentCost);
    });

    const topPartNumbers = Array.from(partTotals.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([partNumber]) => partNumber);

    const partKeyByNumber = new Map<string, string>();
    const cumulativeKeyByNumber = new Map<string, string>();
    topPartNumbers.forEach((partNumber, index) => {
      partKeyByNumber.set(partNumber, `part${index + 1}`);
      cumulativeKeyByNumber.set(partNumber, `part${index + 1}Cumulative`);
    });

    // Seed cumulative totals with costs from before the visible range
    const cumulativeRunningTotals = new Map<string, number>();
    topPartNumbers.forEach((partNumber) => {
      const preCost = prePeriodTotals.get(partNumber) || 0;
      if (preCost > 0) cumulativeRunningTotals.set(partNumber, preCost);
    });

    const chartData = periods.map((period) => {
      const row: Record<string, string | number> = {
        period: period.label,
        other: 0,
      };

      topPartNumbers.forEach((partNumber, index) => {
        row[`part${index + 1}`] = 0;
        row[`part${index + 1}Cumulative`] = null as unknown as number;
      });

      const partCostMap = periodPartTotals.get(period.key);
      if (partCostMap) {
        partCostMap.forEach((cost, partNumber) => {
          const partKey = partKeyByNumber.get(partNumber);
          if (partKey) {
            row[partKey] = cost;
          } else {
            row.other = Number(row.other || 0) + cost;
          }
        });
      }

      topPartNumbers.forEach((partNumber) => {
        const monthlyKey = partKeyByNumber.get(partNumber);
        const cumulativeKey = cumulativeKeyByNumber.get(partNumber);
        if (!monthlyKey || !cumulativeKey) return;

        const nextValue = (cumulativeRunningTotals.get(partNumber) || 0) + Number(row[monthlyKey] || 0);
        cumulativeRunningTotals.set(partNumber, nextValue);
        row[cumulativeKey] = nextValue;
      });

      return row;
    });

    const palette = [
      "hsl(var(--chart-1))",
      "hsl(var(--chart-2))",
      "hsl(var(--chart-3))",
      "hsl(var(--chart-4))",
      "hsl(var(--chart-5))",
    ];
    const periodLabel = trendGranularity === "day" ? "Daily" : trendGranularity === "week" ? "Weekly" : "Monthly";

    const chartConfig: ChartConfig = {};
    topPartNumbers.forEach((partNumber, index) => {
      chartConfig[`part${index + 1}`] = {
        label: `${partNumber} ${periodLabel}`,
        color: palette[index % palette.length],
      };
      chartConfig[`part${index + 1}Cumulative`] = {
        label: `${partNumber} Accumulated`,
        color: palette[index % palette.length],
      };
    });
    chartConfig.other = {
      label: `Other Parts ${periodLabel}`,
      color: "hsl(var(--muted-foreground))",
    };

    const hasOther = chartData.some((row) => Number(row.other || 0) > 0);
    const legendItems = [
      ...topPartNumbers.map((partNumber, index) => ({
        label: partNumber,
        color: palette[index % palette.length],
      })),
      ...(hasOther
        ? [{ label: "Other Parts", color: "hsl(var(--muted-foreground))" }]
        : []),
    ];

    return {
      chartConfig,
      chartData,
      cumulativeKeyByNumber,
      topPartNumbers,
      hasOther,
      legendItems,
      periodLabel,
    };
  }, [dashboardIncidents, partById, trendGranularity]);

  const totalScrapCost = useMemo(() => {
    return costliestIncidents.reduce((sum, incident) => sum + incident.incidentCost, 0);
  }, [costliestIncidents]);

  const cellMetrics = useMemo(() => {
    const configuredCells = cells.length;
    return { configuredCells };
  }, [cells]);

  const toggleCell = (cellName: string) => {
    setExpandedCells(prev => {
      const newSet = new Set(prev);
      if (newSet.has(cellName)) {
        newSet.delete(cellName);
      } else {
        newSet.add(cellName);
      }
      return newSet;
    });
  };

  const handleStatusChange = (machineId: string, status: MachineStatus) => {
    updateStatusMutation.mutate({ id: machineId, status });
  };

  const handleStatusNoteChange = (machineId: string, statusUpdate: string) => {
    updateStatusNoteMutation.mutate({ id: machineId, statusUpdate });
  };

  const handleDeleteMachine = (machineId: string) => {
    setDeletingMachineId(machineId);
    setDeleteConfirmOpen(true);
  };

  const handleExportReport = async () => {
    try {
      setIsExportingReport(true);
      exportDashboardStatusPdf({
        machines,
        cells,
        parts,
        characteristics,
        scrapIncidents,
        chartGranularity: trendGranularity,
      });
      toast({ title: "PDF report generated" });
    } catch (error) {
      console.error("Failed to generate dashboard PDF report", error);
      toast({
        title: "Failed to generate PDF report",
        variant: "destructive",
      });
    } finally {
      setIsExportingReport(false);
    }
  };

  // Calculate summary stats
  const runningMachines = machines.filter(m => m.status === "running").length;
  const machinesWithCycleTime = machines.filter(m => m.idealCycleTime && m.idealCycleTime > 0).length;
  const reportLoading = machinesLoading || cellsLoading || incidentsLoading || partsLoading || characteristicsLoading;

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="border-b bg-card/50 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Factory className="h-10 w-10 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">
                Production & Scrap Cost Analysis
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Monitor production efficiency and analyze scrap cost trends
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 space-y-6">
        {reportLoading ? (
          <div className="space-y-6">
            <div className="grid gap-4 grid-cols-1 md:grid-cols-5">
              {[1, 2, 3, 4, 5].map((i) => (
                <Card key={i}>
                  <CardHeader className="pb-2"><Skeleton className="h-4 w-32" /></CardHeader>
                  <CardContent><Skeleton className="h-8 w-24" /></CardContent>
                </Card>
              ))}
            </div>
            <Card>
              <CardHeader><Skeleton className="h-4 w-48" /></CardHeader>
              <CardContent><Skeleton className="h-[320px] w-full" /></CardContent>
            </Card>
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <Card key={i}>
                  <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
                  <CardContent><Skeleton className="h-24 w-full" /></CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : (
        <>
        {/* Summary Cards */}
        <div className="grid gap-4 grid-cols-1 md:grid-cols-5">
          <Card {...clickableCardProps(() => goToSpcData())}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Costliest Scrap Incidents
              </CardTitle>
            </CardHeader>
            <CardContent>
              {costliestIncidents.length === 0 ? (
                <div className="text-sm text-muted-foreground">No incident cost data found</div>
              ) : (
                <div className="space-y-1.5">
                  {costliestIncidents.slice(0, 3).map((incident) => (
                    <button
                      key={incident.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        setLocation(`/spc-data?machineId=${encodeURIComponent(incident.machineId)}&char=${encodeURIComponent(incident.characteristic)}`);
                      }}
                      className="w-full flex items-center justify-between text-left"
                    >
                      <div className="min-w-0">
                        <div className="text-sm truncate">{incident.machineName}</div>
                        <div className="text-xs text-muted-foreground truncate">{incident.characteristic}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-lg">${incident.incidentCost.toLocaleString()}</div>
                          <div className="text-xs text-muted-foreground">{incident.quantity} pc{incident.quantity !== 1 ? "s" : ""} scrapped</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <Card {...clickableCardProps(() => goToSpcData())}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Cost of Scrap Incidents
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-rose-600">${totalScrapCost.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mb-2">
                top {costliestIncidents.length} costliest incidents
              </p>
              {costliestIncidents.length > 0 && (
                <div className="space-y-0.5">
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 text-[10px] font-medium text-muted-foreground border-b pb-0.5">
                    <span>Part</span>
                    <span className="text-right">Qty</span>
                    <span className="text-right">Cost</span>
                    <span className="text-right">Date</span>
                  </div>
                  {costliestIncidents.map((incident) => (
                    <div key={`${incident.id}-summary`} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 text-[10px] text-muted-foreground">
                      <span className="truncate">{incident.partNumber}</span>
                      <span className="text-right">{incident.quantity}</span>
                      <span className="text-right">${incident.incidentCost.toLocaleString()}</span>
                      <span className="text-right">{incident.dateCreated ? new Date(incident.dateCreated).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <Card {...clickableCardProps(() => setLocation('/cells'))}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Configured Cells</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-sky-600">{cellMetrics.configuredCells}</div>
            </CardContent>
          </Card>
          <Card {...clickableCardProps(() => highestScrapMachine && setLocation(`/spc-data?machineId=${encodeURIComponent(highestScrapMachine.machineId)}`))}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Highest Scrap Machine</CardTitle>
            </CardHeader>
            <CardContent>
              {highestScrapMachine ? (
                <>
                  <div className="text-base font-semibold truncate">{highestScrapMachine.machineName}</div>
                  <div className="text-2xl font-bold text-rose-600">${highestScrapMachine.totalCost.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground">{highestScrapMachine.incidentCount} incidents</p>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">No incident data</div>
              )}
            </CardContent>
          </Card>
          <Card {...clickableCardProps(() => highestScrapCell && goToSpcData({ cell: highestScrapCell.cellName }))}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Highest Scrap Cell</CardTitle>
            </CardHeader>
            <CardContent>
              {highestScrapCell ? (
                <>
                  <div className="text-base font-semibold truncate">{highestScrapCell.cellName}</div>
                  <div className="text-2xl font-bold text-rose-600">${highestScrapCell.totalCost.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground">{highestScrapCell.incidentCount} incidents</p>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">No incident data</div>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-4">Weekly / Monthly / Yearly Scrap Metrics</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">This Week</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-rose-600">${timeRangeMetrics.week.totalCost.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">{timeRangeMetrics.week.incidentCount} incidents</p>
                <p className="text-xs text-muted-foreground">{timeRangeMetrics.week.totalQuantity} pcs scrapped</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">This Month</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-rose-600">${timeRangeMetrics.month.totalCost.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">{timeRangeMetrics.month.incidentCount} incidents</p>
                <p className="text-xs text-muted-foreground">{timeRangeMetrics.month.totalQuantity} pcs scrapped</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">This Year</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-rose-600">${timeRangeMetrics.year.totalCost.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">{timeRangeMetrics.year.incidentCount} incidents</p>
                <p className="text-xs text-muted-foreground">{timeRangeMetrics.year.totalQuantity} pcs scrapped</p>
              </CardContent>
            </Card>
          </div>
        </div>

        <div>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Scrap Cost by Part Over Time</h2>
            <div className="inline-flex rounded-md border p-1">
              {([
                ["day", "Daily"],
                ["week", "Weekly"],
                ["month", "Monthly"],
              ] as const).map(([value, label]) => (
                <Button
                  key={value}
                  size="sm"
                  variant={trendGranularity === value ? "default" : "ghost"}
                  onClick={() => setTrendGranularity(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                {trendGranularity === "day"
                  ? "Daily (Last 14 Days)"
                  : trendGranularity === "week"
                    ? "Weekly (Last 12 Weeks)"
                    : "Monthly (Last 12 Months)"}
                {" "}
                with Current-Year Accumulated Trendlines
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={scrapCostTrendChart.chartConfig} className="w-full h-[320px] aspect-auto">
                <ComposedChart data={scrapCostTrendChart.chartData} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="period"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={20}
                  />
                  <YAxis
                    yAxisId="monthly"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `$${Number(value).toLocaleString()}`}
                    width={72}
                  />
                  <YAxis
                    yAxisId="cumulative"
                    orientation="right"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `$${Number(value).toLocaleString()}`}
                    width={72}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value, name) => (
                          <>
                            <span>{String(name)}</span>
                            <span className="ml-auto font-mono">${Number(value).toLocaleString()}</span>
                          </>
                        )}
                      />
                    }
                  />
                  {scrapCostTrendChart.topPartNumbers.map((partNumber, index) => (
                    <Bar
                      key={`part${index + 1}`}
                      dataKey={`part${index + 1}`}
                      name={`${partNumber} ${scrapCostTrendChart.periodLabel}`}
                      fill={`var(--color-part${index + 1})`}
                      yAxisId="monthly"
                      radius={[4, 4, 0, 0]}
                    />
                  ))}
                  {scrapCostTrendChart.hasOther ? <Bar dataKey="other" name={`Other Parts ${scrapCostTrendChart.periodLabel}`} fill="var(--color-other)" yAxisId="monthly" radius={[4, 4, 0, 0]} /> : null}
                  {scrapCostTrendChart.topPartNumbers.map((partNumber, index) => {
                    const cumulativeKey = scrapCostTrendChart.cumulativeKeyByNumber.get(partNumber);
                    if (!cumulativeKey) return null;
                    return (
                      <Line
                        key={cumulativeKey}
                        type="monotone"
                        dataKey={cumulativeKey}
                        name={`${partNumber} Accumulated`}
                        yAxisId="cumulative"
                        stroke={`var(--color-part${index + 1})`}
                        strokeWidth={2.25}
                        dot={{ r: 2 }}
                        activeDot={{ r: 4 }}
                        connectNulls={false}
                      />
                    );
                  })}
                </ComposedChart>
              </ChartContainer>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                {scrapCostTrendChart.legendItems.map((item) => (
                  <div key={item.label} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
                    <span className="h-0.5 w-5" style={{ backgroundColor: item.color }} />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Bars show {trendGranularity} scrap cost by part number (side by side). Lines show current-year accumulated scrap cost on the right axis.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Scrap Incidents by Cell */}
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Factory className="h-5 w-5" />
            Scrap Incidents by Cell
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {cellScrapSummary.length === 0 ? (
              <Card>
                <CardContent>
                  <div className="text-sm text-muted-foreground">No scrap incidents by cell</div>
                </CardContent>
              </Card>
            ) : (
              cellScrapSummary.map((cell) => (
                <Card key={cell.cellName} {...clickableCardProps(() => setLocation(`/cells?cell=${encodeURIComponent(cell.cellName)}`))}>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">{cell.cellName}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs text-muted-foreground">Incidents</div>
                        <div className="text-2xl font-bold">{cell.incidentCount}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Scrap Cost</div>
                        <div className="text-2xl font-bold text-rose-600">${cell.totalCost.toLocaleString()}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>

        {/* Scrap Cost Leaderboard */}
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Scrap Cost Leaderboard
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Scrap by Machine</CardTitle>
              </CardHeader>
              <CardContent>
                {machineScrapSummary.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No machine scrap data available</div>
                ) : (
                  <div className="space-y-2">
                    {machineScrapSummary.slice(0, 5).map((machine, idx) => (
                      <div
                        key={machine.machineId}
                        className="flex items-center justify-between"
                      >
                        <div className="min-w-0">
                          <div className="text-xs text-muted-foreground">#{idx + 1}</div>
                          <div className="text-sm truncate">{machine.machineName}</div>
                          <div className="text-xs text-muted-foreground">{machine.totalQuantity} pc{machine.totalQuantity !== 1 ? "s" : ""} scrapped</div>
                        </div>
                        <div className="font-semibold text-rose-600">${machine.totalCost.toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Scrap by Cell</CardTitle>
              </CardHeader>
              <CardContent>
                {cellScrapSummary.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No cell scrap data available</div>
                ) : (
                  <div className="space-y-2">
                    {cellScrapSummary.slice(0, 5).map((cell, idx) => (
                      <button
                        key={cell.cellName}
                        type="button"
                        onClick={() => goToSpcData({ cell: cell.cellName })}
                        className="flex w-full items-center justify-between text-left"
                      >
                        <div className="min-w-0">
                          <div className="text-xs text-muted-foreground">#{idx + 1}</div>
                          <div className="text-sm truncate">{cell.cellName}</div>
                          <div className="text-xs text-muted-foreground">{cell.totalQuantity} pc{cell.totalQuantity !== 1 ? "s" : ""} scrapped</div>
                        </div>
                        <div className="font-semibold text-rose-600">${cell.totalCost.toLocaleString()}</div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Scrap by Characteristic</CardTitle>
              </CardHeader>
              <CardContent>
                {charScrapSummary.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No characteristic scrap data available</div>
                ) : (
                  <div className="space-y-2">
                    {charScrapSummary.slice(0, 5).map((char, idx) => (
                      <div key={`${char.partNumber}-${char.characteristic}`} className="flex items-center justify-between">
                        <div className="min-w-0">
                          <div className="text-xs text-muted-foreground">#{idx + 1}</div>
                          <div className="text-sm truncate">Char # {char.characteristic}</div>
                          <div className="text-xs text-muted-foreground truncate">Part: {char.partNumber}</div>
                          <div className="text-xs text-muted-foreground">{char.totalQuantity} pc{char.totalQuantity !== 1 ? "s" : ""} scrapped</div>
                        </div>
                        <div className="font-semibold text-rose-600">${char.totalCost.toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Scrap by Part Number</CardTitle>
              </CardHeader>
              <CardContent>
                {partScrapSummary.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No part scrap data available</div>
                ) : (
                  <div className="space-y-2">
                    {partScrapSummary.slice(0, 5).map((part, idx) => (
                      <div key={`${part.partId || "unassigned"}-${idx}`} className="flex items-center justify-between">
                        <div className="min-w-0">
                          <div className="text-xs text-muted-foreground">#{idx + 1}</div>
                          <div className="text-sm truncate">{part.partName ? `${part.partNumber} - ${part.partName}` : part.partNumber}</div>
                          <div className="text-xs text-muted-foreground">{part.totalQuantity} pc{part.totalQuantity !== 1 ? "s" : ""} scrapped</div>
                        </div>
                        <div className="font-semibold text-rose-600">${part.totalCost.toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Machines Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Cog className="h-5 w-5" />
                Machines
              </h2>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-green-500" />Running</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-yellow-500" />Idle</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" />Setup</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-orange-500" />Maintenance</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-500" />Down</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search machines or cells..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-64"
                />
              </div>
            </div>
          </div>

          {machinesLoading ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-48" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-24 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredMachines.length === 0 ? (
            <div className="text-center py-12">
              <Cog className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                {searchQuery ? "No machines found" : "No machines yet"}
              </h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery 
                  ? "Try a different search term" 
                  : "Add machines from the Machines page to get started"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {machinesByCell.sortedKeys.map((cellName) => {
                const cellMachines = machinesByCell.grouped[cellName];
                const isExpanded = expandedCells.has(cellName);
                const runningCount = cellMachines.filter(m => m.status === "running").length;
                const downCount = cellMachines.filter(m => m.status === "down").length;
                
                return (
                  <Collapsible key={cellName} open={isExpanded} onOpenChange={() => toggleCell(cellName)}>
                    <Card className="overflow-hidden">
                      <CollapsibleTrigger asChild>
                        <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {isExpanded ? (
                                <ChevronDown className="h-5 w-5 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-5 w-5 text-muted-foreground" />
                              )}
                              <CardTitle className="text-lg flex items-center gap-2">
                                {cellName === "Unassigned" ? (
                                  <span className="text-muted-foreground italic">{cellName}</span>
                                ) : (
                                  cellName
                                )}
                              </CardTitle>
                              <Badge variant="secondary" className="ml-2">
                                {cellMachines.length} machine{cellMachines.length !== 1 ? 's' : ''}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              {runningCount > 0 && (
                                <Badge variant="default" className="bg-green-500 hover:bg-green-600">
                                  {runningCount} running
                                </Badge>
                              )}
                              {downCount > 0 && (
                                <Badge variant="destructive">
                                  {downCount} down
                                </Badge>
                              )}
                            </div>
                          </div>
                        </CardHeader>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <CardContent className="pt-0 pb-4">
                          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {cellMachines.map((machine) => (
                              <MachineCard
                                key={machine.id}
                                machine={machine}
                                onStatusChange={handleStatusChange}
                                onUpdateMachine={(data: { id: string } & Partial<Machine>) => updateMachineMutation.mutate(data)}
                                onStatusNoteChange={handleStatusNoteChange}
                                onDeleteMachine={handleDeleteMachine}
                                onOpenScrapIncidents={(machineId) => setLocation(`/spc-data?machineId=${encodeURIComponent(machineId)}`)}
                                isPending={updateMachineMutation.isPending || updateStatusNoteMutation.isPending}
                                scrapIncidentsCount={(incidentsByMachine[machine.id] || []).length}
                              />
                            ))}
                          </div>
                        </CardContent>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button
            variant="outline"
            onClick={handleExportReport}
            disabled={reportLoading || isExportingReport}
          >
            <FileDown className="mr-2 h-4 w-4" />
            {isExportingReport ? "Generating PDF..." : "Export PDF Report"}
          </Button>
        </div>
        </>
        )}
      </div>

      {/* Machine Dialog */}
      <MachineDialog
        open={machineDialogOpen}
        onOpenChange={setMachineDialogOpen}
        machine={editingMachine}
        onSubmit={(data: MachineSubmitData) => {
          if (editingMachine) {
            updateMachineMutation.mutate({ id: editingMachine.id, ...data });
          } else {
            createMachineMutation.mutate(data);
          }
        }}
        isPending={createMachineMutation.isPending || updateMachineMutation.isPending}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Machine?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the machine
              and remove it from active cell workflows.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingMachineId && deleteMachineMutation.mutate(deletingMachineId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
