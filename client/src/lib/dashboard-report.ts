import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type {
  CellConfiguration,
  Characteristic,
  Machine,
  Part,
  ScrapIncident,
} from "@shared/schema";

type DashboardReportData = {
  machines: Machine[];
  cells: CellConfiguration[];
  parts: Part[];
  characteristics: Characteristic[];
  scrapIncidents: ScrapIncident[];
  chartGranularity?: "day" | "week" | "month";
};

const formatCurrency = (value: number) =>
  `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const safeText = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
};

type TimeRangeMetrics = {
  incidentCount: number;
  totalCost: number;
  totalQuantity: number;
};

type TrendPoint = {
  period: string;
  periodValues: Record<string, number>;
  cumulativeValues: Record<string, number | null>;
  maxPeriodValue: number;
};

const parseIncidentDate = (incident: ScrapIncident) => {
  const rawDate = incident.dateCreated || incident.createdAt || incident.updatedAt;
  if (!rawDate) return null;
  const parsed = new Date(rawDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getTimeRangeMetrics = (scrapIncidents: ScrapIncident[]) => {
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

  scrapIncidents.forEach((incident) => {
    const incidentDate = parseIncidentDate(incident);
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
};

const getPartTrendByGranularity = (
  scrapIncidents: ScrapIncident[],
  partById: Map<string, Part>,
  granularity: "day" | "week" | "month",
) => {
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
  const getPeriodStart = (date: Date) => {
    if (granularity === "day") return startOfDay(date);
    if (granularity === "week") return startOfWeek(date);
    return startOfMonth(date);
  };
  const toIsoDate = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };
  const formatPeriodLabel = (date: Date) => {
    if (granularity === "day") {
      return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    }
    if (granularity === "week") {
      return `Wk ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
    }
    return date.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  };

  const bucketCount = granularity === "day" ? 14 : 12;
  const periods = Array.from({ length: bucketCount }, (_, index) => {
    const stepsBack = bucketCount - 1 - index;
    const anchor = new Date(now);
    if (granularity === "day") {
      anchor.setDate(anchor.getDate() - stepsBack);
    } else if (granularity === "week") {
      anchor.setDate(anchor.getDate() - stepsBack * 7);
    } else {
      anchor.setMonth(anchor.getMonth() - stepsBack, 1);
    }
    const start = getPeriodStart(anchor);
    return {
      key: toIsoDate(start),
      label: formatPeriodLabel(start),
      year: start.getFullYear(),
    };
  });

  const periodSet = new Set(periods.map((period) => period.key));
  const firstPeriodKey = periods.length > 0 ? periods[0].key : "";
  const periodPartTotals = new Map<string, Map<string, number>>();
  const partTotals = new Map<string, number>();
  const prePeriodTotals = new Map<string, number>();

  scrapIncidents.forEach((incident) => {
    const incidentDate = parseIncidentDate(incident);
    if (!incidentDate) return;

    const periodKey = toIsoDate(getPeriodStart(incidentDate));
    const partNumber = incident.partId ? (partById.get(incident.partId)?.partNumber || "Unknown Part") : "Unassigned";
    const incidentCost = Number(incident.estimatedCost || 0);

    partTotals.set(partNumber, (partTotals.get(partNumber) || 0) + incidentCost);

    if (!periodSet.has(periodKey)) {
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

  const hasOther = Array.from(periodPartTotals.values()).some((partCostMap) =>
    Array.from(partCostMap.keys()).some((partNumber) => !topPartNumbers.includes(partNumber)),
  );
  const categoryKeys = hasOther ? [...topPartNumbers, "Other Parts"] : [...topPartNumbers];
  const cumulativeRunningTotals = new Map<string, number>();

  topPartNumbers.forEach((partNumber) => {
    const preCost = prePeriodTotals.get(partNumber) || 0;
    if (preCost > 0) cumulativeRunningTotals.set(partNumber, preCost);
  });

  const points: TrendPoint[] = periods.map((period) => {
    const periodValues: Record<string, number> = {};
    const cumulativeValues: Record<string, number | null> = {};
    categoryKeys.forEach((key) => {
      periodValues[key] = 0;
    });
    topPartNumbers.forEach((partNumber) => {
      cumulativeValues[partNumber] = null;
    });

    const partCostMap = periodPartTotals.get(period.key);
    if (partCostMap) {
      partCostMap.forEach((cost, partNumber) => {
        if (topPartNumbers.includes(partNumber)) {
          periodValues[partNumber] = cost;
        } else {
          periodValues["Other Parts"] += cost;
        }
      });
    }

    topPartNumbers.forEach((partNumber) => {
      const nextValue = (cumulativeRunningTotals.get(partNumber) || 0) + Number(periodValues[partNumber] || 0);
      cumulativeRunningTotals.set(partNumber, nextValue);
      cumulativeValues[partNumber] = nextValue;
    });

    const maxPeriodValue = categoryKeys.reduce((max, key) => Math.max(max, Number(periodValues[key] || 0)), 0);

    return {
      period: period.label,
      periodValues,
      cumulativeValues,
      maxPeriodValue,
    };
  });

  return {
    points,
    categories: categoryKeys,
    lineCategories: topPartNumbers,
  };
};

const drawStackedBarChart = (
  doc: jsPDF,
  options: {
    x: number;
    y: number;
    width: number;
    height: number;
    points: TrendPoint[];
    categories: string[];
    lineCategories: string[];
  },
) => {
  const { x, y, width, height, points, categories, lineCategories } = options;
  const axisLeft = x + 46;
  const axisRight = x + width - 44;
  const axisTop = y + 14;
  const axisBottom = y + height - 78;
  const plotWidth = Math.max(axisRight - axisLeft, 1);
  const plotHeight = Math.max(axisBottom - axisTop, 1);

  const maxPeriodValue = Math.max(1, ...points.map((point) => point.maxPeriodValue));
  const maxCumulativeTotal = Math.max(
    1,
    ...points.flatMap((point) =>
      lineCategories.map((category) => Number(point.cumulativeValues[category] || 0))
    ),
  );
  const tickCount = 4;

  doc.setDrawColor(226, 232, 240);
  for (let tick = 0; tick <= tickCount; tick += 1) {
    const ratio = tick / tickCount;
    const yPos = axisBottom - ratio * plotHeight;
    doc.line(axisLeft, yPos, axisRight, yPos);

    const monthlyTickValue = maxPeriodValue * ratio;
    const cumulativeTickValue = maxCumulativeTotal * ratio;
    doc.setTextColor(100, 116, 139);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(formatCurrency(monthlyTickValue), axisLeft - 6, yPos + 3, { align: "right" });
    doc.text(formatCurrency(cumulativeTickValue), axisRight + 6, yPos + 3, { align: "left" });
  }

  doc.setDrawColor(148, 163, 184);
  doc.line(axisLeft, axisTop, axisLeft, axisBottom);
  doc.line(axisLeft, axisBottom, axisRight, axisBottom);
  doc.line(axisRight, axisTop, axisRight, axisBottom);

  const palette: Array<[number, number, number]> = [
    [190, 24, 93],
    [14, 116, 144],
    [22, 163, 74],
    [124, 58, 237],
    [202, 138, 4],
    [100, 116, 139],
  ];

  const categoryColorByName = new Map<string, [number, number, number]>();
  categories.forEach((category, index) => {
    categoryColorByName.set(category, palette[index % palette.length]);
  });

  const slotWidth = plotWidth / Math.max(points.length, 1);
  const groupedWidth = Math.max(slotWidth * 0.8, 1);
  const groupGap = 2;
  const barWidth = Math.max(
    2,
    Math.min(16, (groupedWidth - groupGap * (categories.length - 1)) / Math.max(categories.length, 1)),
  );

  points.forEach((point, pointIndex) => {
    const groupStartX = axisLeft + slotWidth * pointIndex + (slotWidth - groupedWidth) / 2;

    categories.forEach((category, categoryIndex) => {
      const value = Number(point.periodValues[category] || 0);
      if (value <= 0) return;
      const segmentHeight = (value / maxPeriodValue) * plotHeight;
      const color = categoryColorByName.get(category) || [100, 116, 139];
      doc.setFillColor(color[0], color[1], color[2]);
      const barX = groupStartX + categoryIndex * (barWidth + groupGap);
      doc.rect(barX, axisBottom - segmentHeight, barWidth, segmentHeight, "F");
    });

    doc.setTextColor(71, 85, 105);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(point.period, groupStartX + groupedWidth / 2, axisBottom + 12, { align: "center" });
  });

  lineCategories.forEach((category) => {
    const color = categoryColorByName.get(category) || [100, 116, 139];
    const linePoints = points
      .map((point, pointIndex) => {
        const value = point.cumulativeValues[category];
        if (value === null || value === undefined || value <= 0) return null;
        const xPos = axisLeft + slotWidth * pointIndex + slotWidth / 2;
        const yPos = axisBottom - (Number(value) / maxCumulativeTotal) * plotHeight;
        return { x: xPos, y: yPos };
      });

    doc.setDrawColor(color[0], color[1], color[2]);
    doc.setLineWidth(1.75);

    let previousPoint: { x: number; y: number } | null = null;
    linePoints.forEach((point) => {
      if (!point) {
        previousPoint = null;
        return;
      }

      if (previousPoint) {
        doc.line(previousPoint.x, previousPoint.y, point.x, point.y);
      }

      doc.setFillColor(color[0], color[1], color[2]);
      doc.circle(point.x, point.y, 2.4, "F");
      previousPoint = point;
    });
  });

  const legendStartY = axisBottom + 24;
  let legendX = axisLeft;
  let legendY = legendStartY;

  categories.forEach((category) => {
    const color = categoryColorByName.get(category) || [100, 116, 139];

    if (legendX > axisRight - 140) {
      legendX = axisLeft;
      legendY += 14;
    }

    doc.setFillColor(color[0], color[1], color[2]);
    doc.rect(legendX, legendY - 7, 10, 10, "F");
    doc.setDrawColor(color[0], color[1], color[2]);
    doc.setLineWidth(1.5);
    doc.line(legendX + 14, legendY - 2, legendX + 28, legendY - 2);
    doc.setFillColor(color[0], color[1], color[2]);
    doc.circle(legendX + 21, legendY - 2, 1.6, "F");
    doc.setTextColor(51, 65, 85);
    doc.setFontSize(8);
    doc.text(category, legendX + 32, legendY + 1);
    legendX += 32 + Math.min(doc.getTextWidth(category), 120) + 18;
  });

  doc.setTextColor(100, 116, 139);
  doc.setFontSize(8);
  doc.text("Bars = selected-period scrap cost (grouped side by side), lines = current-year accumulated scrap cost. Legend shown below the graph.", axisLeft, axisBottom + 54);
};

const getMachineStatusCounts = (machines: Machine[]) => {
  const counts = {
    running: 0,
    idle: 0,
    setup: 0,
    maintenance: 0,
    down: 0,
  };

  machines.forEach((machine) => {
    counts[machine.status] += 1;
  });

  return counts;
};

const getCellOperationSummary = (cell: CellConfiguration) => {
  const operations = Array.isArray(cell.operationsJson) ? cell.operationsJson as Array<{ name?: string }> : [];
  return {
    count: operations.length,
  };
};

const getOperationCycleTimeSec = (
  operation: { machineIds?: string[] },
  machineById: Map<string, Machine>,
) => {
  const machineIds = operation.machineIds || [];
  const cycleTimes = machineIds
    .map((machineId) => machineById.get(machineId)?.idealCycleTime)
    .filter((value): value is number => typeof value === "number" && value > 0);

  if (cycleTimes.length === 0) return null;

  const combinedRate = cycleTimes.reduce((sum, cycleTime) => sum + 1 / cycleTime, 0);
  if (combinedRate <= 0) return null;

  return 1 / combinedRate;
};

const getCellBottleneckSummary = (cell: CellConfiguration, machineById: Map<string, Machine>) => {
  const operations = Array.isArray(cell.operationsJson)
    ? cell.operationsJson as Array<{ name?: string; machineIds?: string[] }>
    : [];

  let bottleneckName: string | null = null;
  let bottleneckCycleTime: number | null = null;

  operations.forEach((operation, index) => {
    const cycleTime = getOperationCycleTimeSec(operation, machineById);
    if (cycleTime === null) return;
    if (bottleneckCycleTime === null || cycleTime > bottleneckCycleTime) {
      bottleneckCycleTime = cycleTime;
      bottleneckName = operation.name?.trim() || `Operation ${index + 1}`;
    }
  });

  if (bottleneckCycleTime === null) return "-";
  const cycleTimeSec = Number(bottleneckCycleTime);
  return `${bottleneckName} (${cycleTimeSec.toFixed(1)}s)`;
};

export function exportDashboardStatusPdf(data: DashboardReportData) {
  const {
    machines,
    cells,
    parts,
    characteristics,
    scrapIncidents,
    chartGranularity = "day",
  } = data;
  const generatedAt = new Date();
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 36;

  const partById = new Map(parts.map((part) => [part.id, part]));
  const machineById = new Map(machines.map((machine) => [machine.id, machine]));
  const timeRangeMetrics = getTimeRangeMetrics(scrapIncidents);
  const trend = getPartTrendByGranularity(scrapIncidents, partById, chartGranularity);
  const statusCounts = getMachineStatusCounts(machines);
  const openIncidents = scrapIncidents.filter((incident) => incident.status !== "closed");
  const totalIncidentCost = scrapIncidents.reduce((sum, incident) => sum + Number(incident.estimatedCost || 0), 0);
  const openIncidentCost = openIncidents.reduce((sum, incident) => sum + Number(incident.estimatedCost || 0), 0);
  const totalScrapQuantity = scrapIncidents.reduce((sum, incident) => sum + Number(incident.quantity || 0), 0);
  const openScrapQuantity = openIncidents.reduce((sum, incident) => sum + Number(incident.quantity || 0), 0);
  const machinesWithCycleTime = machines.filter((machine) => (machine.idealCycleTime || 0) > 0).length;

  const topIncidents = [...scrapIncidents]
    .filter((incident) => Number(incident.estimatedCost || 0) > 0)
    .sort((left, right) => Number(right.estimatedCost || 0) - Number(left.estimatedCost || 0))
    .slice(0, 10);

  const cellMachineSummary = cells.map((cell) => {
    const cellMachines = machines.filter((machine) => machine.cell === cell.name);
    const operationSummary = getCellOperationSummary(cell);
    const bottleneck = getCellBottleneckSummary(cell, machineById);
    return {
      name: cell.name,
      cellNumber: safeText(cell.status),
      description: safeText(cell.description),
      operationCount: operationSummary.count,
      bottleneck,
      machineCount: cellMachines.length,
      runningCount: cellMachines.filter((machine) => machine.status === "running").length,
      downCount: cellMachines.filter((machine) => machine.status === "down").length,
      throughputUph: cell.throughputUph ?? null,
      totalWip: cell.totalWip ?? null,
      notes: safeText(cell.notes),
    };
  });

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 82, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("Scrap Cost Analysis", marginX, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Generated ${generatedAt.toLocaleString()}`, marginX, 60);
  doc.text("Includes dashboard status, master data, and scrap history.", marginX, 74);

  // Two-column layout: Metrics + Totals on left, Machine Status + Top Incidents on right
  const colStartY = 94;
  const leftColWidth = 340;
  const rightColX = marginX + leftColWidth + 16;

  // === LEFT COLUMN ===
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("Scrap Trend Metrics", marginX, colStartY);

  autoTable(doc, {
    startY: colStartY + 8,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 5, overflow: "linebreak" },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    margin: { left: marginX, right: pageWidth - marginX - leftColWidth },
    tableWidth: leftColWidth,
    head: [["Period", "Incidents", "Scrap Qty", "Scrap Cost"]],
    body: [
      ["This Week", safeText(timeRangeMetrics.week.incidentCount), safeText(timeRangeMetrics.week.totalQuantity), formatCurrency(timeRangeMetrics.week.totalCost)],
      ["This Month", safeText(timeRangeMetrics.month.incidentCount), safeText(timeRangeMetrics.month.totalQuantity), formatCurrency(timeRangeMetrics.month.totalCost)],
      ["This Year", safeText(timeRangeMetrics.year.incidentCount), safeText(timeRangeMetrics.year.totalQuantity), formatCurrency(timeRangeMetrics.year.totalCost)],
    ],
  });

  const metricsTableBottom = (doc as any).lastAutoTable?.finalY ?? (colStartY + 8);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("Totals", marginX, metricsTableBottom + 14);

  autoTable(doc, {
    startY: metricsTableBottom + 22,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 5, overflow: "linebreak" },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    margin: { left: marginX, right: pageWidth - marginX - leftColWidth },
    tableWidth: leftColWidth,
    head: [["Metric", "Value"]],
    body: [
      ["Machines", safeText(machines.length)],
      ["Configured Cells", safeText(cells.length)],
      ["Parts", safeText(parts.length)],
      ["Characteristics", safeText(characteristics.length)],
      ["Recorded Scrap Incidents", safeText(scrapIncidents.length)],
      ["Open Scrap Incidents", safeText(openIncidents.length)],
      ["Total Scrap Quantity", safeText(totalScrapQuantity)],
      ["Open Scrap Quantity", safeText(openScrapQuantity)],
      ["Total Scrap Cost", formatCurrency(totalIncidentCost)],
      ["Open Scrap Cost", formatCurrency(openIncidentCost)],
    ],
  });

  // === RIGHT COLUMN ===
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("Machine Status", rightColX, colStartY);

  autoTable(doc, {
    startY: colStartY + 8,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 5, overflow: "linebreak" },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    margin: { left: rightColX, right: marginX },
    head: [["Status", "Count"]],
    body: [
      ["Running", statusCounts.running],
      ["Idle", statusCounts.idle],
      ["Setup", statusCounts.setup],
      ["Maintenance", statusCounts.maintenance],
      ["Down", statusCounts.down],
      ["With Cycle Time", machinesWithCycleTime],
    ],
  });

  const statusTableBottom = (doc as any).lastAutoTable?.finalY ?? (colStartY + 8);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("Top Scrap Incidents", rightColX, statusTableBottom + 14);

  autoTable(doc, {
    startY: statusTableBottom + 22,
    theme: "striped",
    styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: [190, 24, 93], textColor: 255 },
    margin: { left: rightColX, right: marginX },
    head: [["#", "Machine", "Part", "Characteristic", "Qty", "Cost"]],
    columnStyles: {
      0: { cellWidth: 22 },
      4: { cellWidth: 32 },
      5: { cellWidth: 62 },
    },
    body: topIncidents.length > 0
      ? topIncidents.map((incident, index) => {
          const machine = machineById.get(incident.machineId);
          const part = incident.partId ? partById.get(incident.partId) : undefined;
          return [
            `#${index + 1}`,
            machine?.machineId || machine?.name || incident.machineId,
            part?.partNumber || "-",
            incident.characteristic,
            safeText(incident.quantity),
            formatCurrency(Number(incident.estimatedCost || 0)),
          ];
        })
      : [["-", "-", "-", "No incidents", "-", "-"]],
  });

  doc.addPage();
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(16);
  doc.text("Scrap Cost Trend Graph", marginX, 40);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `${chartGranularity === "day" ? "Daily (Last 14 Days)" : chartGranularity === "week" ? "Weekly (Last 12 Weeks)" : "Monthly (Last 12 Months)"} Scrap Cost by Part with Current-Year Accumulated Trendlines`,
    marginX,
    74,
  );

  drawStackedBarChart(doc, {
    x: marginX,
    y: 84,
    width: pageWidth - marginX * 2,
    height: pageHeight - 104,
    points: trend.points,
    categories: trend.categories,
    lineCategories: trend.lineCategories,
  });

  doc.addPage();
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(16);
  doc.text("Configured Cells", marginX, 40);

  autoTable(doc, {
    startY: 56,
    theme: "striped",
    styles: { fontSize: 8, cellPadding: 5, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: [14, 116, 144], textColor: 255 },
    margin: { left: marginX, right: marginX },
    tableWidth: "auto",
    head: [["Cell", "Cell Number", "Description", "Operations", "Bottleneck", "Machines", "Running", "Down", "UPH", "WIP", "Notes"]],
    body: cellMachineSummary.length > 0
      ? cellMachineSummary.map((cell) => [
          cell.name,
          cell.cellNumber,
          cell.description,
          safeText(cell.operationCount),
          cell.bottleneck,
          safeText(cell.machineCount),
          safeText(cell.runningCount),
          safeText(cell.downCount),
          safeText(cell.throughputUph),
          safeText(cell.totalWip),
          cell.notes,
        ])
      : [["No configured cells", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-"]],
  });

  doc.addPage();
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(16);
  doc.text("Machines", marginX, 40);

  autoTable(doc, {
    startY: 56,
    theme: "striped",
    styles: { fontSize: 8, cellPadding: 5, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: [22, 163, 74], textColor: 255 },
    margin: { left: marginX, right: marginX },
    tableWidth: "auto",
    head: [["Machine ID", "Name", "Cell", "Status", "Cycle Time (s)", "Uptime %", "Batch Size", "Setup Time", "Status Note"]],
    body: machines.length > 0
      ? machines.map((machine) => [
          machine.machineId,
          machine.name,
          safeText(machine.cell),
          machine.status,
          safeText(machine.idealCycleTime),
          safeText(machine.uptimePercent),
          safeText(machine.batchSize),
          safeText(machine.setupTime),
          safeText(machine.statusUpdate),
        ])
      : [["No machines", "-", "-", "-", "-", "-", "-", "-", "-"]],
  });

  doc.addPage();
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(16);
  doc.text("Parts", marginX, 40);

  autoTable(doc, {
    startY: 56,
    theme: "striped",
    styles: { fontSize: 8, cellPadding: 5, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: [202, 138, 4], textColor: 255 },
    margin: { left: marginX, right: marginX },
    tableWidth: "auto",
    head: [["Part Number", "Part Name", "Material", "Raw Material Cost", "Notes"]],
    body: parts.length > 0
      ? parts.map((part) => [
          part.partNumber,
          safeText(part.partName),
          safeText(part.material),
          part.rawMaterialCost != null ? formatCurrency(part.rawMaterialCost) : "-",
          safeText(part.notes),
        ])
      : [["No parts", "-", "-", "-", "-"]],
  });

  doc.addPage();
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(16);
  doc.text("Characteristics", marginX, 40);

  autoTable(doc, {
    startY: 56,
    theme: "striped",
    styles: { fontSize: 8, cellPadding: 5, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: [124, 58, 237], textColor: 255 },
    margin: { left: marginX, right: marginX },
    tableWidth: "auto",
    head: [["Part Number", "Characteristic No.", "Name", "Nominal", "Min", "Max", "Tolerance", "Operation"]],
    body: characteristics.length > 0
      ? characteristics.map((characteristic) => [
          characteristic.partId ? (partById.get(characteristic.partId)?.partNumber || "-") : "-",
          characteristic.charNumber,
          safeText(characteristic.charName),
          safeText(characteristic.nominalValue),
          safeText(characteristic.charMin),
          safeText(characteristic.charMax),
          safeText(characteristic.tolerance),
          safeText(characteristic.opName),
        ])
      : [["No characteristics", "-", "-", "-", "-", "-", "-", "-"]],
  });

  doc.addPage();
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(16);
  doc.text("Scrap Incidents", marginX, 40);

  autoTable(doc, {
    startY: 56,
    theme: "striped",
    styles: { fontSize: 7, cellPadding: 4, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: [190, 24, 93], textColor: 255 },
    margin: { left: marginX, right: marginX },
    tableWidth: "auto",
    head: [["Status", "Machine", "Cell", "Part", "Characteristic", "Qty", "Cost", "Created", "Closed", "Note"]],
    body: scrapIncidents.length > 0
      ? scrapIncidents.map((incident) => {
          const machine = machineById.get(incident.machineId);
          const part = incident.partId ? partById.get(incident.partId) : undefined;
          return [
            incident.status,
            machine?.machineId || machine?.name || incident.machineId,
            safeText(machine?.cell),
            part?.partNumber || "-",
            incident.characteristic,
            safeText(incident.quantity),
            formatCurrency(Number(incident.estimatedCost || 0)),
            safeText(incident.dateCreated),
            safeText(incident.dateClosed),
            safeText(incident.note),
          ];
        })
      : [["No incidents", "-", "-", "-", "-", "-", "-", "-", "-", "-"]],
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text("Scrap Cost Analysis", marginX, pageHeight - 18);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - marginX, pageHeight - 18, { align: "right" });
  }

  doc.save("Scrap Cost Analysis.pdf");
}