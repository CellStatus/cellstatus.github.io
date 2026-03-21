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
};

const formatCurrency = (value: number) =>
  `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const safeText = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
};

const truncateText = (value: string | null | undefined, max = 80) => {
  if (!value) return "-";
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
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
    names: operations
      .map((operation) => operation?.name?.trim())
      .filter(Boolean)
      .join(", "),
  };
};

export function exportDashboardStatusPdf(data: DashboardReportData) {
  const { machines, cells, parts, characteristics, scrapIncidents } = data;
  const generatedAt = new Date();
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 36;

  const partById = new Map(parts.map((part) => [part.id, part]));
  const machineById = new Map(machines.map((machine) => [machine.id, machine]));
  const statusCounts = getMachineStatusCounts(machines);
  const openIncidents = scrapIncidents.filter((incident) => incident.status !== "closed");
  const totalIncidentCost = scrapIncidents.reduce((sum, incident) => sum + Number(incident.estimatedCost || 0), 0);
  const openIncidentCost = openIncidents.reduce((sum, incident) => sum + Number(incident.estimatedCost || 0), 0);
  const machinesWithCycleTime = machines.filter((machine) => (machine.idealCycleTime || 0) > 0).length;

  const topOpenIncidents = [...openIncidents]
    .sort((left, right) => Number(right.estimatedCost || 0) - Number(left.estimatedCost || 0))
    .slice(0, 10);

  const cellMachineSummary = cells.map((cell) => {
    const cellMachines = machines.filter((machine) => machine.cell === cell.name);
    const operationSummary = getCellOperationSummary(cell);
    return {
      name: cell.name,
      cellNumber: safeText(cell.status),
      description: truncateText(cell.description, 60),
      operationCount: operationSummary.count,
      operationNames: operationSummary.names || "-",
      machineCount: cellMachines.length,
      runningCount: cellMachines.filter((machine) => machine.status === "running").length,
      downCount: cellMachines.filter((machine) => machine.status === "down").length,
      throughputUph: cell.throughputUph ?? null,
      totalWip: cell.totalWip ?? null,
      notes: truncateText(cell.notes, 80),
    };
  });

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 82, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("CellStatus Operations Report", marginX, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Generated ${generatedAt.toLocaleString()}`, marginX, 60);
  doc.text("Includes dashboard status, master data, and scrap history.", marginX, 74);

  const summaryCards = [
    { label: "Machines", value: String(machines.length) },
    { label: "Configured Cells", value: String(cells.length) },
    { label: "Parts", value: String(parts.length) },
    { label: "Characteristics", value: String(characteristics.length) },
    { label: "Open Scrap Incidents", value: String(openIncidents.length) },
    { label: "Recorded Scrap Incidents", value: String(scrapIncidents.length) },
    { label: "Open Scrap Cost", value: formatCurrency(openIncidentCost) },
    { label: "Total Scrap Cost", value: formatCurrency(totalIncidentCost) },
  ];

  let cardX = marginX;
  let cardY = 108;
  const cardWidth = (pageWidth - marginX * 2 - 24) / 4;
  const cardHeight = 68;

  summaryCards.forEach((card, index) => {
    if (index === 4) {
      cardX = marginX;
      cardY += cardHeight + 12;
    }

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(cardX, cardY, cardWidth, cardHeight, 8, 8, "FD");
    doc.setTextColor(71, 85, 105);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(card.label.toUpperCase(), cardX + 14, cardY + 20);
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(card.value, cardX + 14, cardY + 47);
    cardX += cardWidth + 8;
  });

  autoTable(doc, {
    startY: 274,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 6, overflow: "linebreak" },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    margin: { left: marginX, right: marginX },
    head: [["Status Snapshot", "Count"]],
    body: [
      ["Running", statusCounts.running],
      ["Idle", statusCounts.idle],
      ["Setup", statusCounts.setup],
      ["Maintenance", statusCounts.maintenance],
      ["Down", statusCounts.down],
      ["Machines with Cycle Time", machinesWithCycleTime],
    ],
    tableWidth: 260,
  });

  autoTable(doc, {
    startY: 274,
    theme: "striped",
    styles: { fontSize: 8, cellPadding: 5, overflow: "linebreak" },
    headStyles: { fillColor: [190, 24, 93], textColor: 255 },
    margin: { left: 330, right: marginX },
    head: [["Top Open Scrap Incidents", "Machine", "Part", "Characteristic", "Qty", "Cost"]],
    body: topOpenIncidents.length > 0
      ? topOpenIncidents.map((incident) => {
          const machine = machineById.get(incident.machineId);
          const part = incident.partId ? partById.get(incident.partId) : undefined;
          return [
            incident.id,
            machine?.machineId || machine?.name || incident.machineId,
            part?.partNumber || "-",
            incident.characteristic,
            safeText(incident.quantity),
            formatCurrency(Number(incident.estimatedCost || 0)),
          ];
        })
      : [["-", "-", "-", "No open incidents", "-", "-"]],
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
    head: [["Cell", "Cell Number", "Description", "Operations", "Operation Names", "Machines", "Running", "Down", "UPH", "WIP", "Notes"]],
    body: cellMachineSummary.length > 0
      ? cellMachineSummary.map((cell) => [
          cell.name,
          cell.cellNumber,
          cell.description,
          safeText(cell.operationCount),
          cell.operationNames,
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
          truncateText(machine.statusUpdate, 100),
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
    head: [["Part Number", "Part Name", "Material", "Raw Material Cost", "Notes"]],
    body: parts.length > 0
      ? parts.map((part) => [
          part.partNumber,
          safeText(part.partName),
          safeText(part.material),
          part.rawMaterialCost != null ? formatCurrency(part.rawMaterialCost) : "-",
          truncateText(part.notes, 120),
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
            truncateText(incident.note, 110),
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
    doc.text("CellStatus Operations Report", marginX, pageHeight - 18);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - marginX, pageHeight - 18, { align: "right" });
  }

  const dateStamp = generatedAt.toISOString().slice(0, 10);
  doc.save(`cellstatus-operations-report-${dateStamp}.pdf`);
}