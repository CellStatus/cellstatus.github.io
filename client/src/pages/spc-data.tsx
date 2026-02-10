import { useMemo, useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { AuditFinding, Machine } from "@shared/schema";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

type HistogramBin = { from: number; to: number; count: number };

type RunPoint = { label: string; value: number };

interface ExportRecordRow {
  value: number | null;
  displayValue: string;
  createdAt: string;
  recordNote?: string;
  machineName?: string;
  machineCode?: string;
  partNumber?: string;
  partName?: string;
}

interface ExportGroup {
  id: string;
  title: string;
  subtitle?: string;
  lsl?: number | null;
  usl?: number | null;
  charKey?: string;
  charName?: string;
  machineName?: string;
  machineCode?: string;
  partNumbers?: string[];
  records: ExportRecordRow[];
}

function escapeHtml(value: string | undefined | null): string {
  if (value == null) return "";
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}

function toNumber(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return "—";
  const fixed = value.toFixed(digits);
  const asNumber = Number.parseFloat(fixed);
  if (Object.is(asNumber, -0)) return "0";
  return asNumber.toString();
}

function computeStats(values: number[]) {
  if (values.length === 0) {
    return { count: 0, mean: NaN, stdDev: NaN, min: NaN, max: NaN };
  }
  const count = values.length;
  const mean = values.reduce((sum, value) => sum + value, 0) / count;
  let variance = 0;
  if (count > 1) {
    variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / (count - 1);
  }
  const stdDev = count > 1 ? Math.sqrt(Math.max(variance, 0)) : 0;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { count, mean, stdDev, min, max };
}

function computeHistogram(values: number[], desiredBins = 8): HistogramBin[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    return [{ from: min, to: max, count: values.length }];
  }
  const bins = Math.max(1, desiredBins);
  const width = (max - min) / bins;
  const histogram = Array.from({ length: bins }, (_, index) => ({
    from: min + index * width,
    to: index === bins - 1 ? max : min + (index + 1) * width,
    count: 0,
  }));
  values.forEach((value) => {
    let idx = Math.floor((value - min) / width);
    if (idx >= bins) idx = bins - 1;
    if (idx < 0) idx = 0;
    histogram[idx].count += 1;
  });
  return histogram;
}

function buildHistogramSvg(values: number[], lsl?: number | null, usl?: number | null): string {
  const binCount = Math.min(12, Math.max(4, Math.round(Math.sqrt(values.length))));
  const bins = computeHistogram(values, binCount);
  if (!bins.length) {
    return '<div class="chart-empty">No numeric samples for histogram.</div>';
  }
  const width = 420;
  const height = 240;
  const paddingX = 48;
  const paddingY = 32;
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingY * 2;
  const maxCount = Math.max(...bins.map((bin) => bin.count), 1);
  const slotWidth = chartWidth / bins.length;
  const barWidth = Math.max(slotWidth * 0.7, 6);
  let bars = "";
  bins.forEach((bin, index) => {
    const barHeight = (bin.count / maxCount) * chartHeight;
    const x = paddingX + slotWidth * index + (slotWidth - barWidth) / 2;
    const y = paddingY + chartHeight - barHeight;
    bars += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${barHeight.toFixed(2)}" fill="#6366f1" rx="4" />`;
    const labelX = paddingX + slotWidth * index + slotWidth / 2;
    bars += `<text x="${labelX.toFixed(2)}" y="${height - 6}" text-anchor="middle" font-size="11" fill="#475569">${escapeHtml(formatNumber((bin.from + bin.to) / 2, 2))}</text>`;
  });
  const axis = `<line x1="${paddingX}" y1="${paddingY + chartHeight}" x2="${paddingX + chartWidth}" y2="${paddingY + chartHeight}" stroke="#94a3b8" stroke-width="1" />` +
    `<line x1="${paddingX}" y1="${paddingY}" x2="${paddingX}" y2="${paddingY + chartHeight}" stroke="#94a3b8" stroke-width="1" />`;
  const minValue = bins[0].from;
  const maxValue = bins[bins.length - 1].to;
  const range = maxValue - minValue || 1;
  let specLines = "";
  if (lsl != null && Number.isFinite(lsl)) {
    const x = paddingX + ((lsl - minValue) / range) * chartWidth;
    specLines += `<line x1="${x.toFixed(2)}" y1="${paddingY}" x2="${x.toFixed(2)}" y2="${paddingY + chartHeight}" stroke="#ef4444" stroke-width="2" stroke-dasharray="4 4" />`;
    specLines += `<text x="${x.toFixed(2)}" y="${paddingY - 8}" text-anchor="middle" font-size="11" fill="#b91c1c">LSL ${escapeHtml(formatNumber(lsl))}</text>`;
  }
  if (usl != null && Number.isFinite(usl)) {
    const x = paddingX + ((usl - minValue) / range) * chartWidth;
    specLines += `<line x1="${x.toFixed(2)}" y1="${paddingY}" x2="${x.toFixed(2)}" y2="${paddingY + chartHeight}" stroke="#10b981" stroke-width="2" stroke-dasharray="4 4" />`;
    specLines += `<text x="${x.toFixed(2)}" y="${paddingY - 8}" text-anchor="middle" font-size="11" fill="#047857">USL ${escapeHtml(formatNumber(usl))}</text>`;
  }
  const yLabels = [0, maxCount];
  let yLabelMarkup = "";
  yLabels.forEach((count) => {
    const y = paddingY + chartHeight - (count / maxCount) * chartHeight;
    yLabelMarkup += `<text x="${paddingX - 8}" y="${y.toFixed(2)}" text-anchor="end" font-size="11" fill="#475569">${count}</text>`;
  });
  return `<div class="chart-wrapper"><div class="chart-title">Histogram</div><svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Histogram visualization">${axis}${bars}${specLines}${yLabelMarkup}</svg></div>`;
}

function buildRunChartSvg(points: RunPoint[], lsl?: number | null, usl?: number | null): string {
  if (!points.length) {
    return '<div class="chart-empty">No numeric samples for run chart.</div>';
  }
  const width = 420;
  const height = 240;
  const paddingX = 48;
  const paddingY = 32;
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingY * 2;
  const values = points.map((point) => point.value);
  const maxValue = Math.max(...values);
  const minValue = Math.min(...values);
  const range = maxValue - minValue || 1;
  const step = points.length > 1 ? chartWidth / (points.length - 1) : 0;
  let path = "";
  let circles = "";
  points.forEach((point, index) => {
    const x = paddingX + step * index;
    const y = paddingY + (maxValue - point.value) / range * chartHeight;
    path += index === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
    circles += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="3.5" fill="#2563eb" />`;
    const label = escapeHtml(point.label);
    circles += `<text x="${x.toFixed(2)}" y="${height - 6}" text-anchor="middle" font-size="11" fill="#475569" transform="rotate(15 ${x.toFixed(2)} ${height - 6})">${label}</text>`;
  });
  const axis = `<line x1="${paddingX}" y1="${paddingY + chartHeight}" x2="${paddingX + chartWidth}" y2="${paddingY + chartHeight}" stroke="#94a3b8" stroke-width="1" />` +
    `<line x1="${paddingX}" y1="${paddingY}" x2="${paddingX}" y2="${paddingY + chartHeight}" stroke="#94a3b8" stroke-width="1" />`;
  const yLabels = [maxValue, minValue];
  let yLabelMarkup = "";
  yLabels.forEach((value) => {
    const y = paddingY + (maxValue - value) / range * chartHeight;
    yLabelMarkup += `<text x="${paddingX - 8}" y="${y.toFixed(2)}" text-anchor="end" font-size="11" fill="#475569">${escapeHtml(formatNumber(value))}</text>`;
  });
  const buildSpec = (value: number | null | undefined, label: string, color: string) => {
    if (value == null || !Number.isFinite(value)) return "";
    const y = paddingY + (maxValue - value) / range * chartHeight;
    return `<line x1="${paddingX}" y1="${y.toFixed(2)}" x2="${paddingX + chartWidth}" y2="${y.toFixed(2)}" stroke="${color}" stroke-width="2" stroke-dasharray="4 4" />` +
      `<text x="${paddingX + chartWidth - 4}" y="${(y - 6).toFixed(2)}" text-anchor="end" font-size="11" fill="${color}">${label} ${escapeHtml(formatNumber(value))}</text>`;
  };
  const specLines = `${buildSpec(lsl ?? null, "LSL", "#ef4444")}${buildSpec(usl ?? null, "USL", "#10b981")}`;
  return `<div class="chart-wrapper"><div class="chart-title">Run Chart</div><svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Run chart">${axis}<path d="${path}" fill="none" stroke="#1d4ed8" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />${circles}${specLines}${yLabelMarkup}</svg></div>`;
}

function buildGroupSection(group: ExportGroup): string {
  const numericValues = group.records
    .map((record) => record.value)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const stats = computeStats(numericValues);
  const cp = group.lsl != null && group.usl != null && numericValues.length > 1 && stats.stdDev > 0
    ? (group.usl - group.lsl) / (6 * stats.stdDev)
    : null;
  let cpk: number | null = null;
  if (numericValues.length > 1 && stats.stdDev > 0) {
    const cpu = group.usl != null && Number.isFinite(group.usl)
      ? (group.usl - stats.mean) / (3 * stats.stdDev)
      : null;
    const cpl = group.lsl != null && Number.isFinite(group.lsl)
      ? (stats.mean - group.lsl) / (3 * stats.stdDev)
      : null;
    if (cpu != null && cpl != null) {
      cpk = Math.min(cpu, cpl);
    } else if (cpu != null) {
      cpk = cpu;
    } else if (cpl != null) {
      cpk = cpl;
    }
  }
  const histogramMarkup = numericValues.length >= 2
    ? buildHistogramSvg(numericValues, group.lsl, group.usl)
    : '<div class="chart-empty">Not enough numeric samples for histogram.</div>';
  const runChartPoints: RunPoint[] = group.records
    .filter((record) => record.value != null && Number.isFinite(record.value))
    .map((record) => ({ label: record.createdAt, value: record.value as number }));
  const runChartMarkup = runChartPoints.length >= 2
    ? buildRunChartSvg(runChartPoints, group.lsl, group.usl)
    : '<div class="chart-empty">Not enough numeric samples for run chart.</div>';
  const metricItems: Array<{ label: string; value: string }> = [
    { label: "Samples", value: String(numericValues.length) },
    { label: "Mean", value: numericValues.length > 0 ? formatNumber(stats.mean) : "—" },
    { label: "Std Dev", value: numericValues.length > 1 ? formatNumber(stats.stdDev) : "—" },
    { label: "Min", value: numericValues.length > 0 ? formatNumber(stats.min) : "—" },
    { label: "Max", value: numericValues.length > 0 ? formatNumber(stats.max) : "—" },
    { label: "Cp", value: cp != null && Number.isFinite(cp) ? formatNumber(cp, 2) : "—" },
    { label: "Cpk", value: cpk != null && Number.isFinite(cpk) ? formatNumber(cpk, 2) : "—" },
  ];
  const metaItems: Array<{ label: string; value: string }> = [];
  if (group.machineName || group.machineCode) {
    const machineLabel = group.machineName ?? group.machineCode ?? "";
    const machineCode = group.machineCode && group.machineCode !== group.machineName ? ` (${group.machineCode})` : "";
    metaItems.push({ label: "Machine", value: `${machineLabel}${machineCode}`.trim() });
  }
  if (group.partNumbers && group.partNumbers.length > 0) {
    const unique = Array.from(new Set(group.partNumbers)).sort((a, b) => a.localeCompare(b));
    metaItems.push({ label: unique.length > 1 ? "Parts" : "Part", value: unique.join(", ") });
  }
  if (group.charKey) {
    metaItems.push({ label: "Char #", value: group.charKey });
  }
  if (group.charName) {
    metaItems.push({ label: "Characteristic", value: group.charName });
  }
  if (group.lsl != null && Number.isFinite(group.lsl)) {
    metaItems.push({ label: "Lower Spec", value: formatNumber(group.lsl) });
  }
  if (group.usl != null && Number.isFinite(group.usl)) {
    metaItems.push({ label: "Upper Spec", value: formatNumber(group.usl) });
  }
  const metricsMarkup = metricItems
    .map((item) => `<div class="metric-item"><span class="metric-label">${escapeHtml(item.label)}</span><span class="metric-value">${escapeHtml(item.value)}</span></div>`)
    .join("");
  const metaMarkup = metaItems.length > 0
    ? `<div class="section-meta">${metaItems.map((item) => `<span><strong>${escapeHtml(item.label)}:</strong> ${escapeHtml(item.value)}</span>`).join("")}</div>`
    : "";
  const rows = group.records.map((record) => {
    const machineDisplay = record.machineName
      ? `${record.machineName}${record.machineCode && record.machineCode !== record.machineName ? ` (${record.machineCode})` : ""}`
      : record.machineCode ?? "";
    return `<tr><td>${escapeHtml(record.createdAt)}</td><td>${escapeHtml(record.displayValue)}</td><td>${escapeHtml(machineDisplay)}</td><td>${escapeHtml(record.partNumber ?? "")}</td><td>${escapeHtml(record.partName ?? "")}</td><td>${escapeHtml(record.recordNote ?? "")}</td></tr>`;
  }).join("");
  const tableMarkup = `<div class="table-wrapper"><table class="data-table"><thead><tr><th>Timestamp</th><th>Measured</th><th>Machine</th><th>Part #</th><th>Part Name</th><th>Record Note</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  return `<section class="report-section"><h2>${escapeHtml(group.title)}</h2>${group.subtitle ? `<p class="section-subtitle">${escapeHtml(group.subtitle)}</p>` : ""}${metaMarkup}<div class="metrics-grid">${metricsMarkup}</div><div class="chart-grid">${histogramMarkup}${runChartMarkup}</div>${tableMarkup}</section>`;
}

function generateSpcHtmlReport(title: string, subtitle: string, sections: string[]): string {
  const generated = new Date().toLocaleString();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; }
    body { font-family: 'Inter', 'Segoe UI', Tahoma, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 24px; }
    .report-container { max-width: 1280px; margin: 0 auto; }
    .report-header { margin-bottom: 24px; }
    .report-header h1 { font-size: 28px; margin: 0 0 8px; }
    .report-subtitle { margin: 0 0 4px; color: #475569; }
    .report-generated { margin: 0; font-size: 13px; color: #64748b; }
    .report-section { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin-bottom: 24px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); }
    .report-section h2 { margin: 0; font-size: 22px; }
    .section-subtitle { margin: 6px 0 0; font-size: 14px; color: #475569; }
    .section-meta { display: flex; flex-wrap: wrap; gap: 8px 16px; margin-top: 16px; font-size: 13px; }
    .section-meta span { background: #f1f5f9; padding: 6px 10px; border-radius: 999px; border: 1px solid #e2e8f0; }
    .metrics-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); margin-top: 20px; }
    .metric-item { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; }
    .metric-label { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; }
    .metric-value { display: block; margin-top: 6px; font-size: 18px; font-weight: 600; color: #0f172a; }
    .chart-grid { display: grid; gap: 16px; margin: 24px 0; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
    .chart-wrapper { background: linear-gradient(135deg, #eef2ff 0%, #f8fafc 100%); border-radius: 14px; padding: 16px; border: 1px solid rgba(99, 102, 241, 0.15); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4); }
    .chart-title { font-size: 14px; font-weight: 600; margin-bottom: 8px; color: #3730a3; letter-spacing: 0.02em; }
    .chart-empty { font-size: 14px; color: #64748b; padding: 20px; background: #f8fafc; border: 1px dashed #cbd5f5; border-radius: 12px; text-align: center; }
    .table-wrapper { overflow-x: auto; margin-top: 20px; border-radius: 12px; border: 1px solid #e2e8f0; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 14px; }
    .data-table thead { background: #f8fafc; }
    .data-table th, .data-table td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; text-align: left; }
    .data-table tbody tr:nth-child(even) { background: #f9fafb; }
    @media print {
      body { background: #ffffff; padding: 0; }
      .report-section { box-shadow: none; }
      .chart-wrapper { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <main class="report-container">
    <header class="report-header">
      <h1>${escapeHtml(title)}</h1>
      <p class="report-subtitle">${escapeHtml(subtitle)}</p>
      <p class="report-generated">Generated ${escapeHtml(generated)}</p>
    </header>
    ${sections.join("")}
  </main>
</body>
</html>`;
}

function downloadHtmlReport(filename: string, html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function SpcData() {
  const { toast } = useToast();
  const [openNew, setOpenNew] = useState(false);
  const [selMachine, setSelMachine] = useState<string | null>(null);
  const [machineSearch, setMachineSearch] = useState('');
  const [charac, setCharac] = useState('');
  const [nominal, setNominal] = useState('');
  const [plusMinus, setPlusMinus] = useState('');
  const [measured, setMeasured] = useState('');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [search, setSearch] = useState('');
  const [filterMachineId, setFilterMachineId] = useState<string | null>(null);
  const [useCustomChar, setUseCustomChar] = useState(true);
  const [characSelect, setCharacSelect] = useState<string | undefined>(undefined);
  const [charNumber, setCharNumber] = useState('');
  const [charMax, setCharMax] = useState('');
  const [charMin, setCharMin] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [partSelect, setPartSelect] = useState<string | undefined>(undefined);
  const [partName, setPartName] = useState('');
  const [status, setStatus] = useState<'open' | 'closed'>('open');
  const [filterStatus, setFilterStatus] = useState<'open' | 'closed' | undefined>(undefined);
  const [filterPartNumber, setFilterPartNumber] = useState<string | null>(null);
  const [location, setLocation] = useLocation();
  const [expandedParts, setExpandedParts] = useState<Set<string>>(new Set());
  const [expandedChars, setExpandedChars] = useState<Set<string>>(new Set());

  // Read query params when the route changes so the dashboard (or other places)
  // can link to `/spc-data?machineId=...` or `/spc-data?char=...`.
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      const mid = u.searchParams.get('machineId');
      const char = u.searchParams.get('char');
      const pn = u.searchParams.get('partNumber');
      const statusParam = u.searchParams.get('status');
      const openNewParam = u.searchParams.get('openNew');
      if (mid) setFilterMachineId(mid);
      if (char) setSearch(char);
      if (pn) setFilterPartNumber(pn);
      if (statusParam === 'open' || statusParam === 'closed') setFilterStatus(statusParam as 'open' | 'closed');
      if (openNewParam) setOpenNew(true);
    } catch (e) {
      // ignore
    }
  }, [location]);

  

  const clearFilters = () => {
    setFilterMachineId(null);
    setSearch('');
    setFilterStatus(undefined);
    setExpandedParts(new Set());
    setExpandedChars(new Set());
    setFilterPartNumber(null);
    try {
      window.history.replaceState({}, '', '/spc-data');
    } catch (e) {
      // fallback to router navigation
      setLocation('/spc-data');
    }
  };

  const machinesQuery = useQuery({ queryKey: ['/api/machines'], queryFn: () => apiRequest('GET', '/api/machines') });
  const findingsQuery = useQuery({ queryKey: ['/api/audit-findings'], queryFn: () => apiRequest('GET', '/api/audit-findings') });
  const machines: Machine[] = (machinesQuery.data as any) || [];
  const findings: AuditFinding[] = (findingsQuery.data as any) || [];

  const filterPartName = useMemo(() => {
    if (!filterPartNumber) return null;
    const found = (findings || []).find(f => (((f as any).partNumber || '') === filterPartNumber));
    return found ? ((found as any).partName || '') : '';
  }, [findings, filterPartNumber]);

  // When a `search` corresponds to a characteristic key (charNumber or name),
  // expand the relevant part and characteristic so the table is visible immediately.
  useEffect(() => {
    if (!search) return;
    const s = search.toString().toLowerCase();
    const match = (findings || []).find(f => {
      const key = ((f as any).charNumber || (f as any).charName || f.characteristic || '').toString().toLowerCase();
      return key === s;
    });
    if (match) {
      const pn = ((match as any).partNumber || null);
      if (pn) setExpandedParts(new Set([pn]));
      const key = ((match as any).charNumber || (match as any).charName || match.characteristic || '').toString();
      if (key) setExpandedChars(new Set([key]));
    }
  }, [search, findings]);

  const machineById = useMemo(() => {
    const m: Record<string, Machine> = {};
    (machines || []).forEach((mm: any) => { m[mm.id] = mm; });
    return m;
  }, [machines]);

  const filteredFindings = useMemo(() => {
    return (findings || []).filter(f => {
      if (filterMachineId && f.machineId !== filterMachineId) return false;
      if (filterPartNumber && ((f as any).partNumber || '') !== filterPartNumber) return false;
      if (filterStatus && (f as any).status && (f as any).status !== filterStatus) return false;
      if (!search) return true;
      const s = search.toLowerCase();
      const pn = ((f as any).partNumber || '').toString().toLowerCase();
      const cn = ((f as any).charNumber || '').toString().toLowerCase();
      const mid = (machineById[f.machineId]?.machineId || f.machineId || '').toString().toLowerCase();
      return pn.includes(s) || cn.includes(s) || mid.includes(s);
    });
  }, [findings, filterMachineId, search, machineById, filterStatus]);

  const uniqueCharacteristics = useMemo(() => {
    const map = new Map<string, any>();
    (findings || []).forEach(f => {
      const num = ((f as any).charNumber || '').toString();
      const name = (f as any).charName || f.characteristic || '';
      const key = num || name || '(unknown)';
      if (!map.has(key)) {
        map.set(key, { charNumber: num || '', charName: name || '', charMax: (f as any).charMax || '', charMin: (f as any).charMin || '', partNumber: (f as any).partNumber || '', partName: (f as any).partName || '' });
      }
    });
    const arr = Array.from(map.entries()).map(([k, v]) => ({ key: k, ...v }));
    // sort by numeric charNumber when available, otherwise by key
    arr.sort((a, b) => {
      const na = parseFloat(a.charNumber);
      const nb = parseFloat(b.charNumber);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.key.localeCompare(b.key);
    });
    return arr;
  }, [findings]);

  const uniquePartNumbers = useMemo(() => {
    const s = new Set<string>();
    (findings || []).forEach(f => { const v = ((f as any).partNumber || '').toString(); if (v) s.add(v); });
    return Array.from(s).sort();
  }, [findings]);

  const findingsByCharacteristic = useMemo(() => {
    const byChar: Record<string, AuditFinding[]> = {};
    (filteredFindings || []).forEach(f => {
      const key = ((f as any).charNumber || (f as any).charName || f.characteristic || '(unknown)').toString();
      if (!byChar[key]) byChar[key] = [];
      byChar[key].push(f);
    });
    return byChar;
  }, [filteredFindings]);

  const findingsByPart = useMemo(() => {
    const byPart: Record<string, AuditFinding[]> = {};
    (filteredFindings || []).forEach(f => {
      const key = ((f as any).partNumber || '(no-part)').toString();
      if (!byPart[key]) byPart[key] = [];
      byPart[key].push(f);
    });
    return byPart;
  }, [filteredFindings]);

  // Auto-expand logic: when linking from dashboard by part or machine, expand
  // the relevant part and first characteristic so the user sees the table.
  useEffect(() => {
    if (filterPartNumber) {
      setExpandedParts(new Set([filterPartNumber]));
      const chars = Object.keys(findingsByPart[filterPartNumber] || {}).length ? Object.keys((() => {
        const g: Record<string, AuditFinding[]> = {};
        (findingsByPart[filterPartNumber] || []).forEach(f => {
          const k = ((f as any).charNumber || (f as any).charName || f.characteristic || '(unknown)').toString();
          if (!g[k]) g[k] = [];
          g[k].push(f);
        });
        return g;
      })()) : Object.keys(findingsByCharacteristic).filter(k => (findingsByPart[filterPartNumber] || []).some(f => {
        const key = ((f as any).charNumber || (f as any).charName || f.characteristic || '(unknown)').toString();
        return key === k;
      }));
      if (chars && chars.length > 0) setExpandedChars(new Set(chars));
      return;
    }
    if (filterMachineId) {
      // find first part that has findings for this machine
      const parts = Object.entries(findingsByPart).filter(([pn, items]) => items.some(it => it.machineId === filterMachineId)).map(([pn]) => pn);
      if (parts.length > 0) {
        setExpandedParts(new Set(parts));
        // pick first characteristic within that part for the machine
        const items = parts.flatMap(pn => findingsByPart[pn] || []);
        const chars = Object.keys((() => {
          const g: Record<string, AuditFinding[]> = {};
          (items || []).forEach(f => {
            const k = ((f as any).charNumber || (f as any).charName || f.characteristic || '(unknown)').toString();
            if (!g[k]) g[k] = [];
            g[k].push(f);
          });
          return g;
        })()).filter(k => (items || []).some(f => f.machineId === filterMachineId));
        if (chars && chars.length > 0) setExpandedChars(new Set(chars));
      }
    }
  }, [filterPartNumber, filterMachineId, findingsByPart, findingsByCharacteristic]);

  const createFindingMutation = useMutation({
    mutationFn: (payload: any) => apiRequest('POST', `/api/machines/${payload.machineId}/findings`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/audit-findings'] });
      setOpenNew(false);
      setCharac("");
      setNominal("");
      setPlusMinus("");
      setMeasured("");
      setCorrectiveAction("");
      toast({ title: 'SPC record created' });
    },
    onError: () => toast({ title: 'Failed to create SPC record', variant: 'destructive' }),
  });

  // Edit / Delete mutations
  const updateFindingMutation = useMutation({
    mutationFn: (payload: any) => apiRequest('PATCH', `/api/findings/${payload.id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/audit-findings'] });
      setOpenNew(false);
      setCharac("");
      setNominal("");
      setPlusMinus("");
      setMeasured("");
      setCorrectiveAction("");
      toast({ title: 'SPC record updated' });
    },
    onError: () => toast({ title: 'Failed to update SPC record', variant: 'destructive' }),
  });

  const deleteFindingMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/findings/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/audit-findings'] });
      toast({ title: 'SPC record deleted' });
    },
    onError: () => toast({ title: 'Failed to delete SPC record', variant: 'destructive' }),
  });

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [editingFinding, setEditingFinding] = useState<AuditFinding | null>(null);
  const [editCharOpen, setEditCharOpen] = useState(false);
  const [editingCharacteristicKey, setEditingCharacteristicKey] = useState<string | null>(null);
  const [editCharNumber, setEditCharNumber] = useState('');
  const [editCharName, setEditCharName] = useState('');
  const [editPartNumber, setEditPartNumber] = useState('');
  const [editPartName, setEditPartName] = useState('');
  const [editPartSelect, setEditPartSelect] = useState<string | undefined>(undefined);
  const [editCharMax, setEditCharMax] = useState('');
  const [editCharMin, setEditCharMin] = useState('');
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const startEdit = (f: AuditFinding) => {
    setEditingFinding(f);
    setSelMachine(f.machineId);
    const charNum = (f as any).charNumber || '';
    const exists = uniqueCharacteristics.some(c => (c.charNumber || '') === charNum);
    if (exists && charNum) {
      setUseCustomChar(false);
      setCharacSelect(charNum);
      setCharNumber(charNum);
      const name = (f as any).charName || f.characteristic || '';
      setCharac(name);
    } else {
      setUseCustomChar(true);
      setCharacSelect('__custom');
      const name = (f as any).charName || f.characteristic || '';
      setCharac(name || '');
    }
    setMeasured(f.measuredValue);
    setCorrectiveAction(f.correctiveAction || "");
    setStatus((f as any).status === 'closed' ? 'closed' : 'open');
    setPartNumber((f as any).partNumber || "");
    setPartName((f as any).partName || "");
    setPartSelect((f as any).partNumber || undefined);
    setCharNumber((f as any).charNumber || "");
    setCharMax((f as any).charMax || "");
    setCharMin((f as any).charMin || "");
    // derive nominal and plusMinus if numeric
    const maxN = parseFloat((f as any).charMax);
    const minN = parseFloat((f as any).charMin);
    if (!isNaN(maxN) && !isNaN(minN)) {
      const n = (maxN + minN) / 2;
      const pm = (maxN - minN) / 2;
      setNominal(String(n));
      setPlusMinus(String(pm));
    } else {
      setNominal("");
      setPlusMinus("");
    }
    setOpenNew(true);
  };

  const openNewFor = (machineId?: string) => {
    setSelMachine(machineId ?? machines?.[0]?.id ?? null);
    setMachineSearch('');
    setStatus('open');
    setPartNumber('');
    setPartName('');
    setPartSelect(undefined);
    setCharac('');
    setCharNumber('');
    setCharMax('');
    setCharMin('');
    setNominal('');
    setPlusMinus('');
    setUseCustomChar(true);
    setCharacSelect(undefined);
    setOpenNew(true);
  };

  const entriesToShow: [string, AuditFinding[]][] = (() => {
    if (!findingsByPart || Object.keys(findingsByPart).length === 0) return [];
    if (filterPartNumber) {
      const items = findingsByPart[filterPartNumber];
      return items ? [[filterPartNumber, items]] as [string, AuditFinding[]][] : [];
    }
    return Object.entries(findingsByPart) as [string, AuditFinding[]][];
  })();

  const exportByCharacteristic = useCallback(() => {
    const records = Array.isArray(findings) ? findings : [];
    if (records.length === 0) {
      toast({ title: "Nothing to export", description: "No SPC records are available yet." });
      return;
    }
    const groups = new Map<string, ExportGroup>();
    records.forEach((record) => {
      const partNumber = ((record as any).partNumber || "").toString();
      const partName = ((record as any).partName || "").toString();
      const charKey = ((record as any).charNumber || (record as any).charName || record.characteristic || "(unknown)").toString();
      const charName = ((record as any).charName || record.characteristic || "").toString();
      const groupKey = `${partNumber || "(no-part)"}::${charKey}`;
      let group = groups.get(groupKey);
      if (!group) {
        const descriptor = [charName, partName].filter(Boolean).join(" • ");
        group = {
          id: groupKey,
          title: `${partNumber || "Unspecified Part"} • Char ${charKey}`,
          subtitle: descriptor || undefined,
          lsl: toNumber((record as any).charMin),
          usl: toNumber((record as any).charMax),
          charKey,
          charName,
          partNumbers: partNumber ? [partNumber] : [],
          records: [],
        };
        groups.set(groupKey, group);
      }
      if (partNumber) {
        group.partNumbers = group.partNumbers || [];
        if (!group.partNumbers.includes(partNumber)) {
          group.partNumbers.push(partNumber);
        }
      }
      if (group.lsl == null) {
        const maybeLsl = toNumber((record as any).charMin);
        if (maybeLsl != null) group.lsl = maybeLsl;
      }
      if (group.usl == null) {
        const maybeUsl = toNumber((record as any).charMax);
        if (maybeUsl != null) group.usl = maybeUsl;
      }
      const numericValue = toNumber(record.measuredValue);
      const machine = machineById[record.machineId];
      group.records.push({
        value: numericValue,
        displayValue: record.measuredValue,
        createdAt: new Date(record.createdAt).toLocaleString(),
        recordNote: (record as any).recordNote ?? record.correctiveAction ?? "",
        machineName: machine?.name || "",
        machineCode: machine?.machineId || record.machineId,
        partNumber,
        partName,
      });
    });
    if (groups.size === 0) {
      toast({ title: "Nothing to export", description: "SPC records are missing numeric measurements." });
      return;
    }
    const sections = Array.from(groups.values())
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((group) => buildGroupSection(group));
    const html = generateSpcHtmlReport(
      "SPC Export — Characteristics",
      `Grouped by part and characteristic. Total groups: ${groups.size}.`,
      sections
    );
    downloadHtmlReport(`spc-characteristics-${Date.now()}.html`, html);
    toast({
      title: "Export ready",
      description: `Saved ${groups.size} characteristic group${groups.size === 1 ? "" : "s"}.`,
    });
  }, [findings, machineById, toast]);

  const exportByOperation = useCallback(() => {
    const records = Array.isArray(findings) ? findings : [];
    if (records.length === 0) {
      toast({ title: "Nothing to export", description: "No SPC records are available yet." });
      return;
    }
    const groups = new Map<string, ExportGroup>();
    records.forEach((record) => {
      const machine = machineById[record.machineId];
      const machineName = machine?.name || record.machineId;
      const machineCode = machine?.machineId || record.machineId;
      const charKey = ((record as any).charNumber || (record as any).charName || record.characteristic || "(unknown)").toString();
      const charName = ((record as any).charName || record.characteristic || "").toString();
      const partNumber = ((record as any).partNumber || "").toString();
      const partName = ((record as any).partName || "").toString();
      const groupKey = `${record.machineId}::${charKey}`;
      let group = groups.get(groupKey);
      if (!group) {
        group = {
          id: groupKey,
          title: `${machineName} — Char ${charKey}`,
          subtitle: charName || undefined,
          lsl: toNumber((record as any).charMin),
          usl: toNumber((record as any).charMax),
          charKey,
          charName,
          machineName,
          machineCode,
          partNumbers: partNumber ? [partNumber] : [],
          records: [],
        };
        groups.set(groupKey, group);
      }
      if (partNumber) {
        group.partNumbers = group.partNumbers || [];
        if (!group.partNumbers.includes(partNumber)) {
          group.partNumbers.push(partNumber);
        }
      }
      if (group.lsl == null) {
        const maybeLsl = toNumber((record as any).charMin);
        if (maybeLsl != null) group.lsl = maybeLsl;
      }
      if (group.usl == null) {
        const maybeUsl = toNumber((record as any).charMax);
        if (maybeUsl != null) group.usl = maybeUsl;
      }
      const numericValue = toNumber(record.measuredValue);
      group.records.push({
        value: numericValue,
        displayValue: record.measuredValue,
        createdAt: new Date(record.createdAt).toLocaleString(),
        recordNote: (record as any).recordNote ?? record.correctiveAction ?? "",
        machineName,
        machineCode,
        partNumber,
        partName,
      });
    });
    if (groups.size === 0) {
      toast({ title: "Nothing to export", description: "SPC records are missing numeric measurements." });
      return;
    }
    const sections = Array.from(groups.values())
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((group) => buildGroupSection(group));
    const html = generateSpcHtmlReport(
      "SPC Export — Operations",
      `Grouped by machine and characteristic. Total groups: ${groups.size}.`,
      sections
    );
    downloadHtmlReport(`spc-operations-${Date.now()}.html`, html);
    toast({
      title: "Export ready",
      description: `Saved ${groups.size} machine group${groups.size === 1 ? "" : "s"}.`,
    });
  }, [findings, machineById, toast]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">SPC Data</h2>
          {filterMachineId && (
            <div className="text-sm text-muted-foreground">Showing SPC data for: {machineById[filterMachineId]?.name || filterMachineId} <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button></div>
          )}
          {!filterMachineId && filterPartNumber && (
            <div className="text-sm text-muted-foreground">Showing SPC data for part: {filterPartNumber}{filterPartName ? ` — ${filterPartName}` : ''} <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button></div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportByCharacteristic}>Export by Characteristic</Button>
          <Button variant="outline" onClick={exportByOperation}>Export by Operation</Button>
          <Button onClick={() => openNewFor()}>New SPC Record</Button>
        </div>
      </div>
      <div className="mb-4">
        <Input placeholder="Search by Machine ID, Char #, or Part #" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="grid gap-4 grid-cols-1">
        {entriesToShow.length === 0 ? (
          <Card>
            <CardContent>No SPC data recorded.</CardContent>
          </Card>
        ) : (
          entriesToShow.map(([partNumber, partItems]) => {
            const partName = partItems.find(p => (p as any).partName)?.partName;
            // group by characteristic/charNumber within this part
            const charGroups: Record<string, AuditFinding[]> = {};
            partItems.forEach(f => {
              const key = ((f as any).charNumber || (f as any).charName || f.characteristic || '(unknown)').toString();
              if (!charGroups[key]) charGroups[key] = [];
              charGroups[key].push(f);
            });
            const totalFindings = partItems.length;
            const charCount = Object.keys(charGroups).length;
            return (
              <div key={partNumber}>
                <Collapsible open={expandedParts.has(partNumber)} onOpenChange={(open) => setExpandedParts(prev => {
                  const n = new Set(prev);
                  if (open) n.add(partNumber); else n.delete(partNumber);
                  return n;
                })}>
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between mb-2 cursor-pointer">
                      <h3 className="text-lg font-semibold">{partNumber}{partName ? ` — ${partName}` : ''}</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">{charCount} chars • {totalFindings} records</span>
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="space-y-4">
                      {Object.entries(charGroups).map(([charKey, items]) => {
                        const first = (items[0] as any) || {};
                        const maxN = parseFloat(first.charMax);
                        const minN = parseFloat(first.charMin);
                        const minIsZero = !isNaN(minN) && minN === 0;
                        const nominal = (!isNaN(maxN) && !isNaN(minN) && !minIsZero) ? ((maxN + minN) / 2).toFixed(3) : '';
                        return (
                        <Card key={charKey}>
                          <CardHeader>
                            <Collapsible open={expandedChars.has(charKey)} onOpenChange={(open) => setExpandedChars(prev => {
                              const n = new Set(prev);
                              if (open) n.add(charKey); else n.delete(charKey);
                              return n;
                            })}>
                              <CollapsibleTrigger asChild>
                                <div className="flex items-center justify-between w-full cursor-pointer group">
                                  <div className="flex flex-col">
                                    <span className="text-base font-semibold">Char #: {charKey}</span>
                                    {((first as any).charName || first.characteristic) ? (
                                      <span className="text-sm text-muted-foreground mt-1">{(first as any).charName || first.characteristic}</span>
                                    ) : null}
                                    <div className="flex items-center gap-4 text-sm text-muted-foreground mt-2">
                                      {!minIsZero && <span>Nominal: {nominal || '-'}</span>}
                                      <span>Max: {first.charMax ?? '-'}</span>
                                      {!minIsZero && <span>Min: {first.charMin ?? '-'}</span>}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button className="opacity-0 group-hover:opacity-100 transition-opacity" size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); const key = charKey; const first = items[0]; if (first) { setEditingCharacteristicKey(key); setEditCharNumber((first as any).charNumber || ''); setEditCharName((first as any).charName || first.characteristic || ''); setEditPartNumber((first as any).partNumber || ''); setEditPartSelect((first as any).partNumber || '__custom'); setEditPartName((first as any).partName || ''); setEditCharMax((first as any).charMax || ''); setEditCharMin((first as any).charMin || ''); setEditCharOpen(true); } }}>Edit Characteristic</Button>
                                    <Badge variant="outline">{items.length}</Badge>
                                  </div>
                                </div>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <CardContent className="p-0">
                                  <div className="overflow-auto hide-scrollbar">
                                    <table className="w-full text-sm">
                                      <thead>
                                        <tr className="text-xs text-muted-foreground">
                                          <th className="text-left p-2">Machine_ID</th>
                                          <th className="text-left p-2">When</th>
                                          <th className="text-left p-2">Measured</th>
                                          <th className="text-left p-2">Char Max</th>
                                          <th className="text-left p-2">Char Min</th>
                                          <th className="text-left p-2">Deviation</th>
                                          <th className="text-left p-2">Out of Tol</th>
                                          <th className="text-left p-2">Record Note</th>
                                          <th className="text-right p-2"> </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {items.map((it) => {
                                          const measuredN = parseFloat(it.measuredValue as any);
                                          const minVal = parseFloat((it as any).charMin);
                                          const maxVal = parseFloat((it as any).charMax);
                                          let deviationDisplay: React.ReactNode = <span className="text-sm text-muted-foreground">-</span>;
                                          let outOfTolDisplay: React.ReactNode = <span className="text-sm text-muted-foreground">-</span>;
                                          const minIsZeroRow = !isNaN(minVal) && minVal === 0;
                                          if (!isNaN(measuredN) && !isNaN(maxVal)) {
                                            // compute out-of-tolerance regardless
                                            const out = (!isNaN(minVal) && measuredN < minVal) ? (minVal - measuredN) : measuredN > maxVal ? (measuredN - maxVal) : 0;
                                            outOfTolDisplay = out > 0 ? <span className="text-sm text-rose-600">{out.toFixed(3)}</span> : <span className="text-sm text-muted-foreground">-</span>;
                                            // only show deviation when min is not zero and min/max are valid
                                            if (!minIsZeroRow && !isNaN(minVal)) {
                                              const nom = (minVal + maxVal) / 2;
                                              const deviation = measuredN - nom;
                                              deviationDisplay = <span className="text-sm">{Number.isFinite(deviation) ? deviation.toFixed(3) : String(deviation)}</span>;
                                            }
                                          }
                                          return (
                                          <tr key={it.id} className="border-t" onMouseEnter={() => setHoveredRowId(it.id)} onMouseLeave={() => setHoveredRowId(null)}>
                                            <td className="p-2">
                                              <div className="flex items-center gap-2">
                                                <span>{machineById[it.machineId]?.machineId || it.machineId}</span>
                                              </div>
                                            </td>
                                            <td className="p-2">{new Date(it.createdAt).toLocaleString()}</td>
                                            <td className="p-2">{it.measuredValue}</td>
                                            <td className="p-2 text-xs text-muted-foreground">{(it as any).charMax ?? '-'}</td>
                                            <td className="p-2 text-xs text-muted-foreground">{(it as any).charMin ?? '-'}</td>
                                            <td className="p-2">{deviationDisplay}</td>
                                            <td className="p-2">{outOfTolDisplay}</td>
                                            <td className="p-2">{(it as any).recordNote || it.correctiveAction || '-'}</td>
                                            <td className="p-2 text-right">
                                              <div className="inline-flex gap-2 items-center">
                                                <button
                                                  aria-label="Edit SPC record"
                                                  title="Edit"
                                                  onClick={() => startEdit(it)}
                                                  className={`${hoveredRowId === it.id ? 'opacity-100' : 'opacity-0 pointer-events-none'} transition-opacity h-6 w-6 flex items-center justify-center rounded`}
                                                >
                                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21v-3a4 4 0 0 1 4-4h3"/><path d="M20.7 7.3a1 1 0 0 0 0-1.4l-2.6-2.6a1 1 0 0 0-1.4 0L7 12v3h3L20.7 7.3z"/></svg>
                                                </button>
                                                <button
                                                  aria-label="Delete SPC record"
                                                  title="Delete"
                                                  onClick={() => { setConfirmDeleteId(it.id); setConfirmOpen(true); }}
                                                  className={`${hoveredRowId === it.id ? 'opacity-100' : 'opacity-0 pointer-events-none'} transition-opacity h-6 w-6 flex items-center justify-center rounded`}
                                                >
                                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m5 0V4a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v2"/></svg>
                                                </button>
                                              </div>
                                            </td>
                                          </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </CardContent>
                              </CollapsibleContent>
                            </Collapsible>
                          </CardHeader>
                        </Card>
                        );
                      })}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            );
          })
        )}
      </div>

      {/* Edit Characteristic Modal */}
      {editCharOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background p-4 sm:p-6 rounded shadow-lg w-full max-w-full sm:max-w-md mx-3 sm:mx-0 max-h-[85vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-2">Edit Characteristic</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Char Number</label>
                <Input value={editCharNumber} onChange={(e) => setEditCharNumber(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Characteristic Name</label>
                <Input value={editCharName} onChange={(e) => setEditCharName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Char Max</label>
                  <Input value={editCharMax} onChange={(e) => setEditCharMax(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Char Min</label>
                  <Input value={editCharMin} onChange={(e) => setEditCharMin(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Part Number</label>
                <Select onValueChange={(v) => {
                  if (v === '__custom') {
                    setEditPartSelect(v);
                    setEditPartNumber('');
                  } else {
                    setEditPartSelect(v);
                    setEditPartNumber(v);
                    // populate part name from findings if available
                    const found = (findings || []).find(ff => (((ff as any).partNumber || '').toString() === v));
                    if (found) setEditPartName((found as any).partName || '');
                  }
                }} value={editPartSelect ?? (editPartNumber || undefined)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select existing part or enter new..." />
                  </SelectTrigger>
                  <SelectContent>
                    {uniquePartNumbers.map(pn => (
                      <SelectItem key={pn} value={pn}>{pn}</SelectItem>
                    ))}
                    <SelectItem value="__custom">Enter new part number</SelectItem>
                  </SelectContent>
                </Select>
                {editPartSelect === '__custom' && (
                  <Input className="mt-2" value={editPartNumber} onChange={(e) => setEditPartNumber(e.target.value)} placeholder="Enter part number" />
                )}
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Part Name</label>
                <Input value={editPartName} onChange={(e) => setEditPartName(e.target.value)} disabled={editPartSelect !== '__custom'} readOnly={editPartSelect !== '__custom'} />
              </div>
              
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => setEditCharOpen(false)}>Cancel</Button>
                <Button onClick={async () => {
                  if (!editingCharacteristicKey) return;
                  const items = findingsByCharacteristic[editingCharacteristicKey] || [];
                  try {
                    await Promise.all(items.map(it => {
                      const payload: any = {};
                      if (editCharName) payload.charName = editCharName;
                      if (editCharNumber) payload.charNumber = editCharNumber;
                      if (editCharMax) payload.charMax = editCharMax;
                      if (editCharMin) payload.charMin = editCharMin;
                      if (editPartNumber) payload.partNumber = editPartNumber;
                      if (editPartName) payload.partName = editPartName;
                      return apiRequest('PATCH', `/api/findings/${it.id}`, payload);
                    }));
                    queryClient.invalidateQueries({ queryKey: ['/api/audit-findings'] });
                    setEditCharOpen(false);
                    setEditingCharacteristicKey(null);
                    toast({ title: 'Characteristic updated' });
                  } catch (e) {
                    toast({ title: 'Failed to update characteristic', variant: 'destructive' });
                  }
                }}>Save</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New SPC Record Modal */}
      {openNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background p-4 sm:p-6 rounded shadow-lg w-full max-w-full sm:max-w-md mx-3 sm:mx-0 max-h-[85vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-2">New SPC Record</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-1">
                <label className="text-xs text-muted-foreground">Machine</label>
                <Input className="mb-2" placeholder="Search by name or last 3 digits" value={machineSearch} onChange={(e) => setMachineSearch(e.target.value)} />
                <Select onValueChange={(v) => setSelMachine(v)} value={selMachine ?? undefined}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select machine" />
                  </SelectTrigger>
                  <SelectContent>
                    {(machines || []).filter(m => {
                      const q = machineSearch.trim().toLowerCase();
                      if (!q) return true;
                      const name = (m.name || '').toString().toLowerCase();
                      const mid = (m.machineId || '').toString().toLowerCase();
                      const suffix3 = mid.slice(-3);
                      return name.includes(q) || mid.includes(q) || suffix3.includes(q);
                    }).map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.name} {m.machineId ? `(...${String(m.machineId).slice(-3)})` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-1">
                <label className="text-xs text-muted-foreground">Char Number</label>
                <Select
                  onValueChange={(v) => {
                    if (v === '__custom') {
                      setUseCustomChar(true);
                      setCharac('');
                      setCharacSelect(v);
                      setCharNumber('');
                    } else {
                      setUseCustomChar(false);
                      setCharacSelect(v);
                      // lookup in uniqueCharacteristics
                      const found = (uniqueCharacteristics || []).find(cc => cc.key === v || cc.charNumber === v);
                      if (found) {
                        setCharNumber(found.charNumber || '');
                        setCharac(found.charName || '');
                        setCharMax(found.charMax || '');
                        setCharMin(found.charMin || '');
                        setPartNumber(found.partNumber || '');
                        setPartName(found.partName || '');
                        setPartSelect(found.partNumber || undefined);
                        const maxN = parseFloat(found.charMax);
                        const minN = parseFloat(found.charMin);
                        if (!isNaN(maxN) && !isNaN(minN)) {
                          const n = (maxN + minN) / 2;
                          const pm = (maxN - minN) / 2;
                          setNominal(String(n));
                          setPlusMinus(String(pm));
                        } else {
                          setNominal('');
                          setPlusMinus('');
                        }
                      } else {
                        // fallback
                        setCharNumber(v);
                      }
                    }
                  }}
                  value={useCustomChar ? '__custom' : characSelect}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select characteristic (number — name) or enter new" />
                  </SelectTrigger>
                  <SelectContent>
                    {uniqueCharacteristics
                      .filter((c) => !partSelect || (c.partNumber || '') === partSelect)
                      .map((c) => {
                      const last4 = (c.partNumber || '').toString().slice(-4);
                      const partSuffix = last4 ? ` (Part ...${last4})` : '';
                      const label = c.charNumber ? `${c.charNumber} — ${c.charName || c.key}${partSuffix}` : `${c.charName || c.key}${partSuffix}`;
                      return <SelectItem key={c.key} value={c.key}>{label}</SelectItem>;
                    })}
                    <SelectItem value="__custom">Enter characteristic number</SelectItem>
                  </SelectContent>
                </Select>
                {useCustomChar && (
                  <Input value={charNumber} onChange={(e) => setCharNumber(e.target.value)} className="mt-2" placeholder="Enter characteristic number" />
                )}
              </div>

 

              <div>
                <label className="text-xs text-muted-foreground">Char Number</label>
                <Input value={charNumber} onChange={(e) => setCharNumber(e.target.value)} disabled={!useCustomChar} readOnly={!useCustomChar} />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Char Name</label>
                <Input value={charac} onChange={(e) => setCharac(e.target.value)} disabled={!useCustomChar} readOnly={!useCustomChar} />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Nominal</label>
                <Input value={nominal} onChange={(e) => {
                  const v = e.target.value;
                  setNominal(v);
                  const n = parseFloat(v);
                  const pm = parseFloat(plusMinus);
                  if (!isNaN(n) && !isNaN(pm)) {
                    setCharMax(String(n + pm));
                    setCharMin(String(n - pm));
                  }
                }} placeholder="e.g. 10.0" disabled={!useCustomChar} readOnly={!useCustomChar} />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Plus / Minus</label>
                <Input value={plusMinus} onChange={(e) => {
                  const v = e.target.value;
                  setPlusMinus(v);
                  const pm = parseFloat(v);
                  const n = parseFloat(nominal);
                  if (!isNaN(n) && !isNaN(pm)) {
                    setCharMax(String(n + pm));
                    setCharMin(String(n - pm));
                  }
                }} placeholder="e.g. 0.05" disabled={!useCustomChar} readOnly={!useCustomChar} />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Char Max</label>
                <Input value={charMax} onChange={(e) => {
                  const v = e.target.value;
                  setCharMax(v);
                  const maxN = parseFloat(v);
                  const minN = parseFloat(charMin);
                  if (!isNaN(maxN) && !isNaN(minN)) {
                    const n = (maxN + minN) / 2;
                    const pm = (maxN - minN) / 2;
                    setNominal(String(n));
                    setPlusMinus(String(pm));
                  }
                }} disabled={!useCustomChar} readOnly={!useCustomChar} />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Char Min</label>
                <Input value={charMin} onChange={(e) => {
                  const v = e.target.value;
                  setCharMin(v);
                  const minN = parseFloat(v);
                  const maxN = parseFloat(charMax);
                  if (!isNaN(maxN) && !isNaN(minN)) {
                    const n = (maxN + minN) / 2;
                    const pm = (maxN - minN) / 2;
                    setNominal(String(n));
                    setPlusMinus(String(pm));
                  }
                }} disabled={!useCustomChar} readOnly={!useCustomChar} />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Measured Value</label>
                <Input value={measured} onChange={(e) => setMeasured(e.target.value)} />
              </div>

              

              <div>
                <label className="text-xs text-muted-foreground">Part Number</label>
                <Select
                  onValueChange={(v) => {
                    if (v === '__custom') {
                      setPartSelect(v);
                      setPartNumber('');
                    } else {
                      setPartSelect(v);
                      setPartNumber(v);
                      // populate part name from first matching finding
                      const found = (findings || []).find(ff => (((ff as any).partNumber || '').toString() === v));
                      if (found) setPartName((found as any).partName || '');
                    }
                  }}
                  value={partSelect}
                  // disable part selection when an existing characteristic is chosen
                  disabled={!useCustomChar}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select existing part or enter new..." />
                  </SelectTrigger>
                  <SelectContent>
                    {uniquePartNumbers.map(pn => (
                      <SelectItem key={pn} value={pn}>{pn}</SelectItem>
                    ))}
                    <SelectItem value="__custom">Enter new part number</SelectItem>
                  </SelectContent>
                </Select>
                {partSelect === '__custom' && (
                  <Input className="mt-2" value={partNumber} onChange={(e) => setPartNumber(e.target.value)} placeholder="Enter part number" disabled={!useCustomChar} readOnly={!useCustomChar} />
                )}
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Part Name</label>
                <Input value={partName} onChange={(e) => setPartName(e.target.value)} disabled={!useCustomChar} readOnly={!useCustomChar} />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs text-muted-foreground">Record Note</label>
                <Input value={correctiveAction} onChange={(e) => setCorrectiveAction(e.target.value)} />
              </div>

              <div className="flex items-center gap-3 md:col-span-2">
                <label className="text-xs text-muted-foreground">Status</label>
                <div className="flex gap-2 mt-1">
                  <Button size="sm" variant={status === 'open' ? 'secondary' : 'outline'} onClick={() => setStatus('open')}>Open</Button>
                  <Button size="sm" variant={status === 'closed' ? 'secondary' : 'outline'} onClick={() => setStatus('closed')}>Closed</Button>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-2 md:col-span-2">
                <Button variant="outline" onClick={() => setOpenNew(false)}>Cancel</Button>
                <Button
                  disabled={(createFindingMutation as any).isLoading || (updateFindingMutation as any).isLoading}
                  onClick={() => {
                    if (!selMachine) return toast({ title: 'Select a machine', variant: 'destructive' });
                    if (!charac || !charac.trim()) return toast({ title: 'Characteristic is required', variant: 'destructive' });
                    if (!measured || !measured.trim()) return toast({ title: 'Measured value is required', variant: 'destructive' });
                    const payload = { machineId: selMachine, characteristic: charac.trim(), charNumber: charNumber.trim() || undefined, charName: charac.trim() || undefined, charMax: charMax.trim() || undefined, charMin: charMin.trim() || undefined, partNumber: partNumber.trim() || undefined, partName: partName.trim() || undefined, measuredValue: measured.trim(), correctiveAction: correctiveAction.trim() || undefined, status };
                    if (editingFinding) {
                      updateFindingMutation.mutate({ id: editingFinding.id, ...payload });
                      setEditingFinding(null);
                    } else {
                      createFindingMutation.mutate(payload);
                    }
                  }}
                >Save</Button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Delete confirmation dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={(v) => { if (!v) { setConfirmDeleteId(null); } setConfirmOpen(v); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete SPC record</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete this SPC record? This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <AlertDialogCancel onClick={() => setConfirmOpen(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDeleteId) {
                  deleteFindingMutation.mutate(confirmDeleteId);
                }
                setConfirmOpen(false);
                setConfirmDeleteId(null);
              }}
              className="bg-destructive"
            >
              Delete
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
