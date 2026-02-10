/**
 * Export a printable HTML file with SPC charts and metrics for a single characteristic.
 */

export interface SpcExportRecord {
  machineId: string;
  machineName?: string;
  measuredValue: string;
  charMax?: string;
  charMin?: string;
  createdAt: string;
  recordNote?: string;
}

export interface SpcExportOptions {
  charNumber: string;
  charName: string;
  partNumber: string;
  partName: string;
  opName: string;
  records: SpcExportRecord[];
}

/* ─── stats helpers ─── */

function computeSpcStats(values: number[], usl: number | null, lsl: number | null) {
  const n = values.length;
  if (n === 0) return null;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1 || 1);
  const stdDev = Math.sqrt(variance);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const outOfTol = values.filter(v => (usl !== null && v > usl) || (lsl !== null && v < lsl)).length;

  let cp: number | null = null;
  let cpk: number | null = null;
  let pp: number | null = null;
  let ppk: number | null = null;
  let nominal: number | null = null;

  if (usl !== null && lsl !== null && stdDev > 0) {
    nominal = (usl + lsl) / 2;
    cp = (usl - lsl) / (6 * stdDev);
    const cpuVal = (usl - mean) / (3 * stdDev);
    const cplVal = (mean - lsl) / (3 * stdDev);
    cpk = Math.min(cpuVal, cplVal);

    // Pp/Ppk use overall std dev (same for single subgroup)
    const overallStdDev = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / n);
    if (overallStdDev > 0) {
      pp = (usl - lsl) / (6 * overallStdDev);
      const ppuVal = (usl - mean) / (3 * overallStdDev);
      const pplVal = (mean - lsl) / (3 * overallStdDev);
      ppk = Math.min(ppuVal, pplVal);
    }
  } else if (usl !== null && stdDev > 0) {
    // One-sided (attribute style): only USL given (lsl is 0 or missing)
    const cpuVal = (usl - mean) / (3 * stdDev);
    cpk = cpuVal;
  }

  return { n, mean, stdDev, min, max, range, cp, cpk, pp, ppk, nominal, usl, lsl, outOfTol };
}

/* ─── SVG builders ─── */

function buildRunChartSvg(
  values: number[],
  dates: string[],
  usl: number | null,
  lsl: number | null,
  mean: number,
  stdDev: number
): string {
  const W = 720, H = 300, pad = { top: 30, right: 30, bottom: 90, left: 60 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const n = values.length;
  if (n === 0) return '';

  // Y-axis range: include all data, spec limits, and ±3σ
  const candidates = [...values, mean + 3 * stdDev, mean - 3 * stdDev];
  if (usl !== null) candidates.push(usl);
  if (lsl !== null) candidates.push(lsl);
  let yMin = Math.min(...candidates);
  let yMax = Math.max(...candidates);
  const yMargin = (yMax - yMin) * 0.08 || 0.1;
  yMin -= yMargin;
  yMax += yMargin;

  const xScale = (i: number) => pad.left + (i / Math.max(n - 1, 1)) * plotW;
  const yScale = (v: number) => pad.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;font-family:system-ui,sans-serif;font-size:11px">`);

  // Grid lines
  const yTicks = 6;
  for (let i = 0; i <= yTicks; i++) {
    const v = yMin + (yMax - yMin) * (i / yTicks);
    const y = yScale(v);
    parts.push(`<line x1="${pad.left}" y1="${y}" x2="${W - pad.right}" y2="${y}" stroke="#e5e7eb" stroke-width="0.5"/>`);
    parts.push(`<text x="${pad.left - 6}" y="${y + 3}" text-anchor="end" fill="#666" font-size="10">${v.toFixed(3)}</text>`);
  }

  // Spec limit lines
  if (usl !== null) {
    const y = yScale(usl);
    parts.push(`<line x1="${pad.left}" y1="${y}" x2="${W - pad.right}" y2="${y}" stroke="#ef4444" stroke-dasharray="6,3" stroke-width="1.5"/>`);
    parts.push(`<text x="${W - pad.right + 4}" y="${y + 3}" fill="#ef4444" font-size="10">USL ${usl}</text>`);
  }
  if (lsl !== null) {
    const y = yScale(lsl);
    parts.push(`<line x1="${pad.left}" y1="${y}" x2="${W - pad.right}" y2="${y}" stroke="#ef4444" stroke-dasharray="6,3" stroke-width="1.5"/>`);
    parts.push(`<text x="${W - pad.right + 4}" y="${y + 3}" fill="#ef4444" font-size="10">LSL ${lsl}</text>`);
  }

  // Mean line
  {
    const y = yScale(mean);
    parts.push(`<line x1="${pad.left}" y1="${y}" x2="${W - pad.right}" y2="${y}" stroke="#3b82f6" stroke-width="1"/>`);
    parts.push(`<text x="${W - pad.right + 4}" y="${y + 3}" fill="#3b82f6" font-size="10">X̄ ${mean.toFixed(3)}</text>`);
  }

  // ±3σ lines
  if (stdDev > 0) {
    const ucl = mean + 3 * stdDev;
    const lcl = mean - 3 * stdDev;
    const yU = yScale(ucl);
    const yL = yScale(lcl);
    parts.push(`<line x1="${pad.left}" y1="${yU}" x2="${W - pad.right}" y2="${yU}" stroke="#f59e0b" stroke-dasharray="4,4" stroke-width="1"/>`);
    parts.push(`<text x="${W - pad.right + 4}" y="${yU + 3}" fill="#f59e0b" font-size="9">+3σ</text>`);
    parts.push(`<line x1="${pad.left}" y1="${yL}" x2="${W - pad.right}" y2="${yL}" stroke="#f59e0b" stroke-dasharray="4,4" stroke-width="1"/>`);
    parts.push(`<text x="${W - pad.right + 4}" y="${yL + 3}" fill="#f59e0b" font-size="9">−3σ</text>`);
  }

  // Data polyline
  const linePoints = values.map((v, i) => `${xScale(i)},${yScale(v)}`).join(' ');
  parts.push(`<polyline points="${linePoints}" fill="none" stroke="#2563eb" stroke-width="1.5"/>`);

  // Data dots (color-coded: green in-spec, red out)
  values.forEach((v, i) => {
    const oot = (usl !== null && v > usl) || (lsl !== null && v < lsl);
    const color = oot ? '#ef4444' : '#22c55e';
    parts.push(`<circle cx="${xScale(i)}" cy="${yScale(v)}" r="3.5" fill="${color}" stroke="white" stroke-width="1"/>`);
  });

  // X-axis date labels (show a subset so they don't overlap)
  const maxLabels = 12;
  const step = Math.max(1, Math.floor(n / maxLabels));
  for (let i = 0; i < n; i += step) {
    const x = xScale(i);
    const label = new Date(dates[i]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    parts.push(`<text x="${x}" y="${H - pad.bottom + 18}" text-anchor="middle" fill="#666" font-size="9" transform="rotate(-45,${x},${H - pad.bottom + 18})">${label}</text>`);
  }

  // Title
  parts.push(`<text x="${W / 2}" y="16" text-anchor="middle" fill="#111" font-size="13" font-weight="600">Run Chart (Individuals)</text>`);

  parts.push('</svg>');
  return parts.join('\n');
}

function buildHistogramSvg(
  values: number[],
  usl: number | null,
  lsl: number | null,
  mean: number,
  stdDev: number
): string {
  const W = 720, H = 280, pad = { top: 30, right: 30, bottom: 50, left: 60 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const n = values.length;
  if (n === 0) return '';

  // Bin count (Sturges rule)
  const binCount = Math.max(5, Math.ceil(1 + 3.322 * Math.log10(n)));
  const vMin = Math.min(...values);
  const vMax = Math.max(...values);
  const range = vMax - vMin || 1;
  const binWidth = range / binCount;

  // Build bins
  const bins: { lo: number; hi: number; count: number }[] = [];
  for (let i = 0; i < binCount; i++) {
    bins.push({ lo: vMin + i * binWidth, hi: vMin + (i + 1) * binWidth, count: 0 });
  }
  values.forEach(v => {
    let idx = Math.floor((v - vMin) / binWidth);
    if (idx >= binCount) idx = binCount - 1;
    if (idx < 0) idx = 0;
    bins[idx].count++;
  });

  const maxCount = Math.max(...bins.map(b => b.count), 1);
  const xScale = (v: number) => pad.left + ((v - vMin) / range) * plotW;
  const yScale = (c: number) => pad.top + plotH - (c / maxCount) * plotH;

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;font-family:system-ui,sans-serif;font-size:11px">`);

  // bars
  bins.forEach(b => {
    const x1 = xScale(b.lo);
    const x2 = xScale(b.hi);
    const y = yScale(b.count);
    const barH = plotH - (y - pad.top);
    // color: if bin overlaps with out-of-spec range, make it red-ish
    let color = '#3b82f6';
    if ((usl !== null && b.lo >= usl) || (lsl !== null && b.hi <= lsl)) {
      color = '#ef4444';
    } else if ((usl !== null && b.hi > usl) || (lsl !== null && b.lo < lsl)) {
      color = '#f97316';
    }
    parts.push(`<rect x="${x1}" y="${y}" width="${Math.max(x2 - x1 - 1, 1)}" height="${barH}" fill="${color}" opacity="0.8" rx="1"/>`);
    if (b.count > 0) {
      parts.push(`<text x="${(x1 + x2) / 2}" y="${y - 3}" text-anchor="middle" fill="#333" font-size="9">${b.count}</text>`);
    }
  });

  // Normal curve overlay
  if (stdDev > 0 && n > 2) {
    const curvePoints: string[] = [];
    const steps = 100;
    const totalArea = n * binWidth; // scale factor for histogram counts
    for (let i = 0; i <= steps; i++) {
      const x = vMin + (range * i) / steps;
      const z = (x - mean) / stdDev;
      const pdf = (1 / (stdDev * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * z * z);
      const scaledY = pdf * totalArea;
      curvePoints.push(`${xScale(x)},${yScale(scaledY)}`);
    }
    parts.push(`<polyline points="${curvePoints.join(' ')}" fill="none" stroke="#7c3aed" stroke-width="1.5" stroke-dasharray="4,2"/>`);
  }

  // Spec limit lines
  if (usl !== null) {
    const x = xScale(usl);
    parts.push(`<line x1="${x}" y1="${pad.top}" x2="${x}" y2="${pad.top + plotH}" stroke="#ef4444" stroke-dasharray="6,3" stroke-width="1.5"/>`);
    parts.push(`<text x="${x}" y="${pad.top - 5}" text-anchor="middle" fill="#ef4444" font-size="10">USL ${usl}</text>`);
  }
  if (lsl !== null) {
    const x = xScale(lsl);
    parts.push(`<line x1="${x}" y1="${pad.top}" x2="${x}" y2="${pad.top + plotH}" stroke="#ef4444" stroke-dasharray="6,3" stroke-width="1.5"/>`);
    parts.push(`<text x="${x}" y="${pad.top - 5}" text-anchor="middle" fill="#ef4444" font-size="10">LSL ${lsl}</text>`);
  }

  // Mean line
  {
    const x = xScale(mean);
    parts.push(`<line x1="${x}" y1="${pad.top}" x2="${x}" y2="${pad.top + plotH}" stroke="#3b82f6" stroke-width="1.5"/>`);
    parts.push(`<text x="${x}" y="${H - pad.bottom + 16}" text-anchor="middle" fill="#3b82f6" font-size="10">X̄</text>`);
  }

  // X-axis labels
  const xTicks = 6;
  for (let i = 0; i <= xTicks; i++) {
    const v = vMin + range * (i / xTicks);
    const x = xScale(v);
    parts.push(`<text x="${x}" y="${H - pad.bottom + 16}" text-anchor="middle" fill="#666" font-size="9">${v.toFixed(3)}</text>`);
  }

  // Y-axis labels
  const yTicks = 5;
  for (let i = 0; i <= yTicks; i++) {
    const c = (maxCount * i) / yTicks;
    const y = yScale(c);
    parts.push(`<line x1="${pad.left}" y1="${y}" x2="${W - pad.right}" y2="${y}" stroke="#e5e7eb" stroke-width="0.5"/>`);
    parts.push(`<text x="${pad.left - 6}" y="${y + 3}" text-anchor="end" fill="#666" font-size="9">${Math.round(c)}</text>`);
  }

  // Title
  parts.push(`<text x="${W / 2}" y="16" text-anchor="middle" fill="#111" font-size="13" font-weight="600">Histogram</text>`);

  parts.push('</svg>');
  return parts.join('\n');
}

/* ─── main export ─── */

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtNum(v: number | null, digits = 3): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return v.toFixed(digits);
}

function cpkColor(cpk: number | null): string {
  if (cpk === null) return '#666';
  if (cpk >= 1.33) return '#16a34a';
  if (cpk >= 1.0) return '#f59e0b';
  return '#ef4444';
}

export function exportSpcHtml(opts: SpcExportOptions): void {
  const { charNumber, charName, partNumber, partName, opName, records } = opts;

  // Parse numeric values and sort by date
  const sorted = [...records].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const values = sorted.map(r => parseFloat(r.measuredValue)).filter(v => !isNaN(v));
  const dates = sorted.filter(r => !isNaN(parseFloat(r.measuredValue))).map(r => r.createdAt);

  if (values.length === 0) {
    alert('No numeric measured values to chart.');
    return;
  }

  const first = records[0];
  const rawMax = parseFloat(first?.charMax || '');
  const rawMin = parseFloat(first?.charMin || '');
  const usl = !isNaN(rawMax) ? rawMax : null;
  const lslRaw = !isNaN(rawMin) ? rawMin : null;
  // Treat min=0 as "no lower spec" (attribute style)
  const lsl = (lslRaw !== null && lslRaw !== 0) ? lslRaw : null;

  const stats = computeSpcStats(values, usl, lsl);
  if (!stats) return;

  const runChartSvg = buildRunChartSvg(values, dates, usl, lsl, stats.mean, stats.stdDev);
  const histogramSvg = buildHistogramSvg(values, usl, lsl, stats.mean, stats.stdDev);

  const title = `SPC Report — Char #${esc(charNumber)}${charName ? ' — ' + esc(charName) : ''}`;
  const nominal = (usl !== null && lsl !== null) ? (usl + lsl) / 2 : null;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, sans-serif; color: #111; background: #fff; padding: 24px; max-width: 820px; margin: 0 auto; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .subtitle { font-size: 13px; color: #555; margin-bottom: 20px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px 24px; margin-bottom: 20px; font-size: 13px; }
  .info-grid dt { color: #666; }
  .info-grid dd { font-weight: 600; margin: 0 0 6px 0; }
  .section { margin-bottom: 24px; }
  .section-title { font-size: 15px; font-weight: 600; margin-bottom: 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
  .metrics-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
  .metric-card { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 12px; text-align: center; }
  .metric-card .label { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
  .metric-card .value { font-size: 20px; font-weight: 700; margin-top: 2px; }
  .chart-container { margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; padding: 6px 8px; background: #f9fafb; border-bottom: 2px solid #e5e7eb; font-weight: 600; color: #555; }
  td { padding: 6px 8px; border-bottom: 1px solid #f3f4f6; }
  tr:nth-child(even) td { background: #fafbfc; }
  .oot { color: #ef4444; font-weight: 600; }
  .footer { margin-top: 24px; text-align: center; font-size: 11px; color: #aaa; }
  @media print {
    body { padding: 12px; }
    .no-print { display: none; }
    @page { margin: 0.5in; }
  }
</style>
</head>
<body>
<h1>${title}</h1>
<div class="subtitle">
  Part: ${esc(partNumber)}${partName ? ' — ' + esc(partName) : ''}${opName ? ' &nbsp;|&nbsp; Op: ' + esc(opName) : ''}
  &nbsp;|&nbsp; Generated: ${new Date().toLocaleString()}
</div>

<div class="info-grid">
  <div><dt>Samples (n)</dt><dd>${stats.n}</dd></div>
  <div><dt>USL</dt><dd>${usl !== null ? fmtNum(usl) : '—'}</dd></div>
  <div><dt>LSL</dt><dd>${lsl !== null ? fmtNum(lsl) : '—'}</dd></div>
  <div><dt>Nominal</dt><dd>${nominal !== null ? fmtNum(nominal) : '—'}</dd></div>
  <div><dt>Mean (X̄)</dt><dd>${fmtNum(stats.mean)}</dd></div>
  <div><dt>Std Dev (σ)</dt><dd>${fmtNum(stats.stdDev, 4)}</dd></div>
  <div><dt>Min</dt><dd>${fmtNum(stats.min)}</dd></div>
  <div><dt>Max</dt><dd>${fmtNum(stats.max)}</dd></div>
  <div><dt>Range</dt><dd>${fmtNum(stats.range)}</dd></div>
</div>

<div class="metrics-grid">
  <div class="metric-card">
    <div class="label">Cp</div>
    <div class="value" style="color:${cpkColor(stats.cp)}">${fmtNum(stats.cp, 2)}</div>
  </div>
  <div class="metric-card">
    <div class="label">Cpk</div>
    <div class="value" style="color:${cpkColor(stats.cpk)}">${fmtNum(stats.cpk, 2)}</div>
  </div>
  <div class="metric-card">
    <div class="label">Pp</div>
    <div class="value" style="color:${cpkColor(stats.pp)}">${fmtNum(stats.pp, 2)}</div>
  </div>
  <div class="metric-card">
    <div class="label">Ppk</div>
    <div class="value" style="color:${cpkColor(stats.ppk)}">${fmtNum(stats.ppk, 2)}</div>
  </div>
</div>

<div class="section">
  <div class="section-title">Run Chart</div>
  <div class="chart-container">${runChartSvg}</div>
</div>

<div class="section">
  <div class="section-title">Histogram</div>
  <div class="chart-container">${histogramSvg}</div>
</div>

<div class="section">
  <div class="section-title">Data Table (${stats.n} records, ${stats.outOfTol} out of tolerance)</div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Date</th>
        <th>Machine</th>
        <th>Measured</th>
        <th>Deviation</th>
        <th>Out of Tol</th>
        <th>Note</th>
      </tr>
    </thead>
    <tbody>
      ${sorted.filter(r => !isNaN(parseFloat(r.measuredValue))).map((r, i) => {
        const v = parseFloat(r.measuredValue);
        const oot = (usl !== null && v > usl) || (lsl !== null && v < lsl);
        const outAmt = oot
          ? ((usl !== null && v > usl) ? (v - usl) : (lsl !== null && v < lsl) ? (lsl - v) : 0)
          : 0;
        const dev = nominal !== null ? (v - nominal) : null;
        const label = r.machineName || r.machineId;
        return `<tr>
          <td>${i + 1}</td>
          <td>${new Date(r.createdAt).toLocaleString()}</td>
          <td>${esc(label)}</td>
          <td class="${oot ? 'oot' : ''}">${fmtNum(v)}</td>
          <td>${dev !== null ? fmtNum(dev) : '—'}</td>
          <td class="${oot ? 'oot' : ''}">${oot ? fmtNum(outAmt) : '—'}</td>
          <td>${esc(r.recordNote || '')}</td>
        </tr>`;
      }).join('\n      ')}
    </tbody>
  </table>
</div>

<div class="footer">CellStatus SPC Report</div>

<script>
  // Auto-trigger print dialog when opened
  // window.print();
</script>
</body>
</html>`;

  // Download HTML file
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `SPC_Char${charNumber || 'export'}_${partNumber || 'report'}.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
