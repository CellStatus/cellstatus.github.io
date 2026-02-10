/**
 * SimpleVSM — VSM Rendering Engine (TypeScript port)
 *
 * Takes JSON data and renders a full Value Stream Map
 * into a container element using DOM elements + SVG.
 */

import { calculateDetailedMetrics, type StepMetric, type VsmDetailedMetrics } from './vsm-sim';

export interface VsmRenderStation {
  id?: string;
  name: string;
  processStep: number;
  cycleTime: number;
  setupTime?: number;
  batchSize?: number;
  uptimePercent?: number;
  machineId?: string;
  machineIdDisplay?: string;
}

export interface VsmRenderData {
  stations: VsmRenderStation[];
  operationNames?: Record<string, string>;
  rawMaterialUPH?: number;
}

export interface VsmRenderMetrics {
  stations: number;
  totalCT: number;
  bottleneckName: string;
  bottleneckCT: number;
  rawMaterialUPH: number | null;
  taktTime: number | null;
  leadTime: number;
  vaRatio: string;
  waitingTime: number;
  cellBalancePercent: number;
  avgUtilizationPercent: number | null;
  systemThroughputUPH: number | null;
}

interface Position {
  x: number;
  y: number;
}

interface Config {
  processBoxW: number;
  processBoxH: number;
  dataBoxH: number;
  gapBetweenProcesses: number;
  entityW: number;
  entityH: number;
  canvasPadX: number;
  canvasPadTop: number;
  timelineOffsetY: number;
  timelineH: number;
  inventoryTriH: number;
  inventoryTriW: number;
  arrowHeadSize: number;
}

const DEFAULTS: Config = {
  processBoxW: 150,
  processBoxH: 54,
  dataBoxH: 90,
  gapBetweenProcesses: 70,
  entityW: 90,
  entityH: 70,
  canvasPadX: 60,
  canvasPadTop: 170,
  timelineOffsetY: 50,
  timelineH: 50,
  inventoryTriH: 26,
  inventoryTriW: 30,
  arrowHeadSize: 8,
};

export class VSMRenderer {
  private container: HTMLElement;
  private cfg: Config;
  private data: VsmRenderData | null = null;
  private sortedStations: VsmRenderStation[] = [];
  private bottleneckIdx = -1;
  private positions: Position[] = [];
  private totalCanvasW = 0;
  private totalCanvasH = 0;
  private detailedMetrics: VsmDetailedMetrics | null = null;
  private stepMetricsByStep: Map<number, StepMetric> = new Map();

  constructor(container: HTMLElement) {
    this.container = container;
    this.cfg = { ...DEFAULTS };
  }

  /* ══════════════════════ PUBLIC API ══════════════════════ */

  render(data: VsmRenderData): VsmRenderMetrics | { stations: 0 } {
    this.data = data;
    this.container.innerHTML = '';

    if (!data || !data.stations || data.stations.length === 0) {
      this.container.innerHTML =
        '<div class="vsm-empty"><h2>No stations found</h2><p>Check your JSON data.</p></div>';
      return { stations: 0 };
    }

    // 1) Sort stations by processStep
    this.sortedStations = [...data.stations].sort(
      (a, b) => a.processStep - b.processStep,
    );

    // 2) Find bottleneck (highest cycle time)
    this.bottleneckIdx = 0;
    let maxCT = 0;
    this.sortedStations.forEach((s, i) => {
      if (s.cycleTime > maxCT) {
        maxCT = s.cycleTime;
        this.bottleneckIdx = i;
      }
    });

    // 3) Compute positions
    this._computePositions();

    // 3.5) Compute detailed metrics for downstream rendering/summary
    this._computeDetailedMetrics();

    // 4) Draw all elements
    this._drawConnectorsSVG();
    this._drawSupplier();
    this._drawCustomer();
    this._drawProductionControl();
    this._drawInfoFlows();
    this._drawProcessBoxes();
    this._drawPushArrows();
    this._drawTimeline();

    // 5) Set canvas size
    this.container.style.width = this.totalCanvasW + 'px';
    this.container.style.height = this.totalCanvasH + 'px';

    // 6) Return metrics
    return this._computeMetrics();
  }

  /* ══════════════════════ POSITIONING ══════════════════════ */

  private _computePositions(): void {
    const c = this.cfg;
    const n = this.sortedStations.length;
    const startX = c.canvasPadX + c.entityW + 80;
    const y = c.canvasPadTop;

    this.positions = [];
    let x = startX;
    for (let i = 0; i < n; i++) {
      this.positions.push({ x, y });
      x += c.processBoxW + c.gapBetweenProcesses;
    }

    this.totalCanvasW = x + c.entityW + 120;
    this.totalCanvasH =
      y +
      c.processBoxH +
      c.dataBoxH +
      c.timelineOffsetY +
      c.timelineH +
      120;
  }

  private _computeDetailedMetrics(): void {
    const config = this.data?.rawMaterialUPH
      ? { rawMaterialUPH: this.data!.rawMaterialUPH }
      : undefined;

    const simStations = this.sortedStations.map((station, index) => ({
      id: station.id ?? `station-${index}`,
      name: station.name,
      processStep: station.processStep,
      cycleTime: station.cycleTime,
      setupTime: station.setupTime,
      batchSize: station.batchSize,
      uptimePercent: station.uptimePercent,
      machineId: station.machineId,
      machineIdDisplay: station.machineIdDisplay,
    }));

    try {
      const metrics = calculateDetailedMetrics(simStations, config);
      this.detailedMetrics = metrics;
      this.stepMetricsByStep = new Map(
        metrics.steps.map((step) => [step.step, step] as const),
      );
    } catch (_err) {
      this.detailedMetrics = null;
      this.stepMetricsByStep = new Map();
    }
  }

  /* ══════════════════════ SUPPLIER ══════════════════════ */

  private _drawSupplier(): void {
    const c = this.cfg;
    const el = document.createElement('div');
    el.className = 'vsm-entity vsm-supplier';
    el.style.left = c.canvasPadX + 'px';
    el.style.top = c.canvasPadTop - 10 + 'px';

    el.innerHTML = `
      <div class="vsm-entity-icon">
        <svg viewBox="0 0 100 80" fill="none">
          <rect x="5" y="20" width="90" height="55" rx="3" fill="#e2e8f0" stroke="#334155" stroke-width="2"/>
          <rect x="15" y="30" width="20" height="18" rx="1" fill="#fff" stroke="#64748b" stroke-width="1.5"/>
          <rect x="40" y="30" width="20" height="18" rx="1" fill="#fff" stroke="#64748b" stroke-width="1.5"/>
          <rect x="65" y="30" width="20" height="18" rx="1" fill="#fff" stroke="#64748b" stroke-width="1.5"/>
          <rect x="15" y="55" width="70" height="12" rx="1" fill="#fff" stroke="#64748b" stroke-width="1.5"/>
          <polygon points="50,2 95,20 5,20" fill="#94a3b8" stroke="#334155" stroke-width="2"/>
        </svg>
      </div>
      <div class="vsm-entity-label">Supplier</div>
      ${this.data!.rawMaterialUPH ? `<div class="vsm-entity-sublabel">${this.data!.rawMaterialUPH} UPH</div>` : ''}
    `;
    this.container.appendChild(el);
  }

  /* ══════════════════════ CUSTOMER ══════════════════════ */

  private _drawCustomer(): void {
    const c = this.cfg;
    const lastPos = this.positions[this.positions.length - 1];
    const cx = lastPos.x + c.processBoxW + 80;

    const el = document.createElement('div');
    el.className = 'vsm-entity vsm-customer';
    el.style.left = cx + 'px';
    el.style.top = c.canvasPadTop - 10 + 'px';

    el.innerHTML = `
      <div class="vsm-entity-icon">
        <svg viewBox="0 0 100 80" fill="none">
          <rect x="5" y="20" width="90" height="55" rx="3" fill="#dbeafe" stroke="#2563eb" stroke-width="2"/>
          <rect x="15" y="30" width="20" height="18" rx="1" fill="#fff" stroke="#3b82f6" stroke-width="1.5"/>
          <rect x="40" y="30" width="20" height="18" rx="1" fill="#fff" stroke="#3b82f6" stroke-width="1.5"/>
          <rect x="65" y="30" width="20" height="18" rx="1" fill="#fff" stroke="#3b82f6" stroke-width="1.5"/>
          <rect x="15" y="55" width="70" height="12" rx="1" fill="#fff" stroke="#3b82f6" stroke-width="1.5"/>
          <polygon points="50,2 95,20 5,20" fill="#93c5fd" stroke="#2563eb" stroke-width="2"/>
        </svg>
      </div>
      <div class="vsm-entity-label">Customer</div>
    `;
    this.container.appendChild(el);
  }

  /* ══════════════════════ PRODUCTION CONTROL ══════════════════════ */

  private _drawProductionControl(): void {
    const c = this.cfg;
    const midX =
      (this.positions[0].x +
        this.positions[this.positions.length - 1].x +
        c.processBoxW) /
      2;

    const el = document.createElement('div');
    el.className = 'vsm-control';
    el.style.left = midX - 80 + 'px';
    el.style.top = '30px';

    el.innerHTML = `
      <div class="vsm-control-box">
        <div class="vsm-control-label">Production Control</div>
      </div>
    `;
    this.container.appendChild(el);
  }

  /* ══════════════════════ INFO FLOWS ══════════════════════ */

  private _drawInfoFlows(): void {
    const c = this.cfg;
    const midX =
      (this.positions[0].x +
        this.positions[this.positions.length - 1].x +
        c.processBoxW) /
      2;
    const controlY = 30;
    const controlH = 40;
    const controlW = 160;

    // Info flow from Customer to Production Control
    const lastPos = this.positions[this.positions.length - 1];
    const custX = lastPos.x + c.processBoxW + 80 + 45;
    this._drawDashedArrow(
      custX,
      c.canvasPadTop - 10,
      midX + controlW / 2,
      controlY + controlH / 2,
    );

    // Info flow from Supplier to Production Control
    const suppX = c.canvasPadX + 45;
    this._drawDashedArrow(
      suppX,
      c.canvasPadTop - 10,
      midX - controlW / 2,
      controlY + controlH / 2,
    );

    // Info flow from Production Control down to processes
    this.positions.forEach((pos) => {
      const px = pos.x + c.processBoxW / 2;
      this._drawVerticalDashedArrow(px, controlY + controlH, pos.y - 4);
    });
  }

  private _drawDashedArrow(x1: number, y1: number, x2: number, y2: number): void {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const minX = Math.min(x1, x2) - 10;
    const minY = Math.min(y1, y2) - 10;
    const w = Math.abs(x2 - x1) + 20;
    const h = Math.abs(y2 - y1) + 20;

    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    svg.style.position = 'absolute';
    svg.style.left = minX + 'px';
    svg.style.top = minY + 'px';
    svg.style.pointerEvents = 'none';
    svg.style.zIndex = '4';
    svg.style.overflow = 'visible';

    const lx1 = x1 - minX;
    const ly1 = y1 - minY;
    const lx2 = x2 - minX;
    const ly2 = y2 - minY;

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(lx1));
    line.setAttribute('y1', String(ly1));
    line.setAttribute('x2', String(lx2));
    line.setAttribute('y2', String(ly2));
    line.setAttribute('stroke', '#94a3b8');
    line.setAttribute('stroke-width', '1.5');
    line.setAttribute('stroke-dasharray', '6 3');
    svg.appendChild(line);

    // Arrowhead
    const angle = Math.atan2(ly2 - ly1, lx2 - lx1);
    const hs = 8;
    const ax = lx2;
    const ay = ly2;
    const p1x = ax - hs * Math.cos(angle - 0.4);
    const p1y = ay - hs * Math.sin(angle - 0.4);
    const p2x = ax - hs * Math.cos(angle + 0.4);
    const p2y = ay - hs * Math.sin(angle + 0.4);
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', `${ax},${ay} ${p1x},${p1y} ${p2x},${p2y}`);
    poly.setAttribute('fill', '#94a3b8');
    svg.appendChild(poly);

    this.container.appendChild(svg);
  }

  private _drawVerticalDashedArrow(x: number, y1: number, y2: number): void {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', String(y2 - y1 + 10));
    svg.style.position = 'absolute';
    svg.style.left = x - 10 + 'px';
    svg.style.top = y1 + 'px';
    svg.style.pointerEvents = 'none';
    svg.style.zIndex = '4';
    svg.style.overflow = 'visible';

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '10');
    line.setAttribute('y1', '0');
    line.setAttribute('x2', '10');
    line.setAttribute('y2', String(y2 - y1));
    line.setAttribute('stroke', '#94a3b8');
    line.setAttribute('stroke-width', '1.5');
    line.setAttribute('stroke-dasharray', '6 3');
    svg.appendChild(line);

    const hs = 6;
    const ay = y2 - y1;
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute(
      'points',
      `10,${ay} ${10 - hs},${ay - hs} ${10 + hs},${ay - hs}`,
    );
    poly.setAttribute('fill', '#94a3b8');
    svg.appendChild(poly);

    this.container.appendChild(svg);
  }

  /* ══════════════════════ PROCESS BOXES ══════════════════════ */

  private _drawProcessBoxes(): void {
    const c = this.cfg;
    this.sortedStations.forEach((station, i) => {
      const pos = this.positions[i];
      const isBottleneck = i === this.bottleneckIdx;
      const stepMetrics = this.stepMetricsByStep.get(station.processStep);

      const el = document.createElement('div');
      el.className = 'vsm-process' + (isBottleneck ? ' bottleneck' : '');
      el.style.left = pos.x + 'px';
      el.style.top = pos.y + 'px';

      // Operation name override
      const stepKey = String(station.processStep);
      const opName =
        this.data!.operationNames && this.data!.operationNames[stepKey]
          ? this.data!.operationNames[stepKey]
          : null;

      let html = `
        <div class="vsm-process-box">
          ${isBottleneck ? '<div class="vsm-bottleneck-badge">Bottleneck</div>' : ''}
          <div class="vsm-process-name">${this._esc(station.name)}</div>
          <div class="vsm-process-step">Op ${station.processStep}${opName ? ' — ' + this._esc(opName) : ''}</div>
        </div>
        <div class="vsm-data-box">
      `;

      // Data rows
      html += this._dataRow('C/T', this._fmtTime(station.cycleTime));
      if (station.setupTime !== undefined && station.setupTime !== null) {
        html += this._dataRow('Setup', this._fmtTime(station.setupTime));
      }
      if (station.uptimePercent !== undefined && station.uptimePercent !== null) {
        const uptimeDisplay = this._fmtPercent(station.uptimePercent);
        if (uptimeDisplay !== '—') {
          html += this._dataRow('Uptime', uptimeDisplay);
        }
      }
      if (stepMetrics) {
        const utilDisplay = this._fmtPercent(stepMetrics.avgUtilPercent);
        if (utilDisplay !== '—') {
          html += this._dataRow('Utilization', utilDisplay);
        }
      }
      if (station.batchSize !== undefined) {
        html += this._dataRow('Batch', String(station.batchSize));
      }
      if (station.machineIdDisplay) {
        html += this._dataRow('Machine', '#' + station.machineIdDisplay);
      }

      html += '</div>';
      el.innerHTML = html;
      this.container.appendChild(el);
    });
  }

  /* ══════════════════════ PUSH ARROWS ══════════════════════ */

  private _drawPushArrows(): void {
    const c = this.cfg;
    const n = this.sortedStations.length;

    // Supplier → first process
    const suppX = c.canvasPadX + c.entityW;
    const firstX = this.positions[0].x;
    const arrowY = c.canvasPadTop + c.processBoxH / 2;
    this._drawSolidArrow(suppX + 5, arrowY, firstX - 5, arrowY);

    // Between processes
    for (let i = 0; i < n - 1; i++) {
      const fromX = this.positions[i].x + c.processBoxW;
      const toX = this.positions[i + 1].x;
      this._drawPushArrowSVG(fromX + 2, arrowY, toX - 2, arrowY);
    }

    // Last process → Customer
    const lastPos = this.positions[n - 1];
    const fromX = lastPos.x + c.processBoxW;
    const custX = lastPos.x + c.processBoxW + 80;
    this._drawSolidArrow(fromX + 2, arrowY, custX - 5, arrowY);
  }

  private _drawSolidArrow(
    x1: number,
    y1: number,
    x2: number,
    _y2: number,
  ): void {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const minX = Math.min(x1, x2);
    const w = Math.abs(x2 - x1);
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', '20');
    svg.style.position = 'absolute';
    svg.style.left = minX + 'px';
    svg.style.top = y1 - 10 + 'px';
    svg.style.pointerEvents = 'none';
    svg.style.zIndex = '5';
    svg.style.overflow = 'visible';

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '0');
    line.setAttribute('y1', '10');
    line.setAttribute('x2', String(w));
    line.setAttribute('y2', '10');
    line.setAttribute('stroke', '#334155');
    line.setAttribute('stroke-width', '2');
    svg.appendChild(line);

    const hs = 8;
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute(
      'points',
      `${w},10 ${w - hs},${10 - hs / 2} ${w - hs},${10 + hs / 2}`,
    );
    poly.setAttribute('fill', '#334155');
    svg.appendChild(poly);

    this.container.appendChild(svg);
  }

  private _drawPushArrowSVG(
    x1: number,
    y1: number,
    x2: number,
    _y2: number,
  ): void {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const minX = Math.min(x1, x2);
    const w = Math.abs(x2 - x1);
    const h = 30;
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    svg.style.position = 'absolute';
    svg.style.left = minX + 'px';
    svg.style.top = y1 - h / 2 + 'px';
    svg.style.pointerEvents = 'none';
    svg.style.zIndex = '6';
    svg.style.overflow = 'visible';

    const midY = h / 2;
    const stripeW = 12;
    const stripeH = h - 6;

    // Main line
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '0');
    line.setAttribute('y1', String(midY));
    line.setAttribute('x2', String(w));
    line.setAttribute('y2', String(midY));
    line.setAttribute('stroke', '#334155');
    line.setAttribute('stroke-width', '2');
    svg.appendChild(line);

    // Stripes
    const numStripes = Math.floor(w / (stripeW + 8));
    const startOffset = (w - numStripes * (stripeW + 8)) / 2 + 4;
    for (let s = 0; s < numStripes; s++) {
      const sx = startOffset + s * (stripeW + 8);
      const stripe = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'rect',
      );
      stripe.setAttribute('x', String(sx));
      stripe.setAttribute('y', String(midY - stripeH / 2));
      stripe.setAttribute('width', String(stripeW));
      stripe.setAttribute('height', String(stripeH));
      stripe.setAttribute('fill', 'white');
      stripe.setAttribute('stroke', '#334155');
      stripe.setAttribute('stroke-width', '1');
      stripe.setAttribute('rx', '1');
      svg.appendChild(stripe);
    }

    // Arrow head
    const hs = 8;
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute(
      'points',
      `${w},${midY} ${w - hs},${midY - hs / 2} ${w - hs},${midY + hs / 2}`,
    );
    poly.setAttribute('fill', '#334155');
    svg.appendChild(poly);

    this.container.appendChild(svg);
  }

  /* ══════════════════════ CONNECTORS SVG ══════════════════════ */

  private _drawConnectorsSVG(): void {
    // Placeholder — connectors drawn individually
  }

  /* ══════════════════════ TIMELINE ══════════════════════ */

  private _drawTimeline(): void {
    const c = this.cfg;
    const n = this.sortedStations.length;
    const baseY = c.canvasPadTop + c.processBoxH + c.dataBoxH + c.timelineOffsetY;
    const segH = c.timelineH / 2;

    const totalProcessTime = this.sortedStations.reduce(
      (s, st) => s + st.cycleTime,
      0,
    );

    // Build timeline as a single SVG for a smooth continuous stepped line
    const suppEndX = c.canvasPadX + c.entityW + 5;
    const custX = this.positions[n - 1].x + c.processBoxW + 80;
    const svgW = custX - suppEndX + 40;
    const svgH = segH * 2 + 10;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', String(svgW));
    svg.setAttribute('height', String(svgH));
    svg.style.position = 'absolute';
    svg.style.left = suppEndX + 'px';
    svg.style.top = baseY + 'px';
    svg.style.pointerEvents = 'none';
    svg.style.zIndex = '8';
    svg.style.overflow = 'visible';

    // Build the stepped path relative to SVG origin (suppEndX, baseY)
    // Top line = wait segments (y=0), Bottom line = process segments (y=segH*2)
    // The midline is at y=segH
    let pathD = `M 0 ${segH}`; // start at midline

    const firstX = this.positions[0].x;
    // Initial wait: supplier to first process (stay at top = 0)
    pathD += ` L 0 0`; // go up
    pathD += ` L ${firstX - suppEndX} 0`; // across top
    pathD += ` L ${firstX - suppEndX} ${segH * 2}`; // drop to bottom (process)

    for (let i = 0; i < n; i++) {
      const pos = this.positions[i];
      const procEndX = pos.x + c.processBoxW;

      // Process segment (bottom)
      pathD += ` L ${procEndX - suppEndX} ${segH * 2}`;

      // Wait segment to next (top) or final
      if (i < n - 1) {
        const nextX = this.positions[i + 1].x;
        pathD += ` L ${procEndX - suppEndX} 0`; // go up
        pathD += ` L ${nextX - suppEndX} 0`; // across top
        pathD += ` L ${nextX - suppEndX} ${segH * 2}`; // drop to bottom
      } else {
        // Last process to customer
        pathD += ` L ${procEndX - suppEndX} 0`; // go up
        pathD += ` L ${custX - suppEndX} 0`; // across top to customer
        pathD += ` L ${custX - suppEndX} ${segH}`; // back to midline
      }
    }

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathD);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#64748b');
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('stroke-linejoin', 'miter');
    svg.appendChild(path);

    // Add shaded fills for process segments (bottom half)
    for (let i = 0; i < n; i++) {
      const pos = this.positions[i];
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', String(pos.x - suppEndX));
      rect.setAttribute('y', String(segH));
      rect.setAttribute('width', String(c.processBoxW));
      rect.setAttribute('height', String(segH));
      rect.setAttribute('fill', '#dbeafe');
      rect.setAttribute('opacity', '0.5');
      svg.appendChild(rect);
    }

    // Add shaded fills for wait segments (top half)
    // Initial wait
    if (firstX - suppEndX > 2) {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', '0');
      rect.setAttribute('y', '0');
      rect.setAttribute('width', String(firstX - suppEndX));
      rect.setAttribute('height', String(segH));
      rect.setAttribute('fill', '#f1f5f9');
      rect.setAttribute('opacity', '0.5');
      svg.appendChild(rect);
    }
    for (let i = 0; i < n - 1; i++) {
      const fromX = this.positions[i].x + c.processBoxW;
      const toX = this.positions[i + 1].x;
      const w = toX - fromX;
      if (w > 2) {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', String(fromX - suppEndX));
        rect.setAttribute('y', '0');
        rect.setAttribute('width', String(w));
        rect.setAttribute('height', String(segH));
        rect.setAttribute('fill', '#f1f5f9');
        rect.setAttribute('opacity', '0.5');
        svg.appendChild(rect);
      }
    }
    // Final wait
    const lastEndX = this.positions[n - 1].x + c.processBoxW;
    const finalW = custX - lastEndX;
    if (finalW > 2) {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', String(lastEndX - suppEndX));
      rect.setAttribute('y', '0');
      rect.setAttribute('width', String(finalW));
      rect.setAttribute('height', String(segH));
      rect.setAttribute('fill', '#f1f5f9');
      rect.setAttribute('opacity', '0.5');
      svg.appendChild(rect);
    }

    this.container.appendChild(svg);

    // Process time labels (positioned as DOM elements for clarity)
    for (let i = 0; i < n; i++) {
      const pos = this.positions[i];
      const station = this.sortedStations[i];
      const procLabel = document.createElement('div');
      procLabel.className = 'vsm-timeline-value process-value';
      procLabel.style.left = pos.x + c.processBoxW / 2 - 15 + 'px';
      procLabel.style.top = baseY + segH + 5 + 'px';
      procLabel.textContent = this._fmtTime(station.cycleTime);
      this.container.appendChild(procLabel);
    }

    // Timeline totals
    const totalsDiv = document.createElement('div');
    totalsDiv.className = 'vsm-timeline-totals';
    totalsDiv.style.left = custX + 20 + 'px';
    totalsDiv.style.top = baseY + 'px';
    totalsDiv.innerHTML = `
      <div class="vsm-timeline-total">
        <span class="label">Process Time: </span>
        <span class="value">${this._fmtTimeLong(totalProcessTime)}</span>
      </div>
    `;
    this.container.appendChild(totalsDiv);
  }

  /* ══════════════════════ METRICS ══════════════════════ */

  private _computeMetrics(): VsmRenderMetrics {
    const stations = this.sortedStations;
    const totalCT = stations.reduce((s, st) => s + (st.cycleTime ?? 0), 0);
    const detailed = this.detailedMetrics;

    const leadTime = detailed && Number.isFinite(detailed.totalLeadTimeSec)
      ? detailed.totalLeadTimeSec
      : totalCT;
    const waitingTimeBase = detailed && Number.isFinite(detailed.totalWaitingTimeSec)
      ? detailed.totalWaitingTimeSec
      : Math.max(0, leadTime - totalCT);
    const waitingTime = Math.max(0, waitingTimeBase);
    const processEfficiency = detailed && Number.isFinite(detailed.processEfficiencyPercent)
      ? detailed.processEfficiencyPercent
      : leadTime > 0
        ? (totalCT / leadTime) * 100
        : 0;
    const avgUtilization = detailed && Number.isFinite(detailed.avgUtilizationPercent)
      ? detailed.avgUtilizationPercent
      : null;
    const systemThroughput = detailed && Number.isFinite(detailed.systemThroughputUPH)
      ? detailed.systemThroughputUPH
      : null;

    let bottleneckName = '—';
    let bottleneckCT = 0;

    if (detailed?.isRawMaterialBottleneck && detailed.rawMaterialUPH) {
      bottleneckName = 'Raw Material Input';
      bottleneckCT = detailed.rawMaterialUPH > 0 ? 3600 / detailed.rawMaterialUPH : 0;
    } else if (detailed?.bottleneckStep) {
      const step = detailed.bottleneckStep;
      const station = stations.find((st) => st.processStep === step.step);
      if (station) {
        bottleneckName = `${station.name} (Op ${station.processStep})`;
        bottleneckCT = station.cycleTime ?? step.effectiveCTsec;
      } else {
        bottleneckName = `Op ${step.step}`;
        bottleneckCT = step.effectiveCTsec;
      }
    } else if (stations.length > 0) {
      const fallback = stations[this.bottleneckIdx];
      bottleneckName = `${fallback.name} (Op ${fallback.processStep})`;
      bottleneckCT = fallback.cycleTime;
    }

    const rawMaterialUPH = this.data?.rawMaterialUPH ?? null;
    let taktTime: number | null = null;
    if (rawMaterialUPH && rawMaterialUPH > 0) {
      taktTime = 3600 / rawMaterialUPH;
    }

    return {
      stations: stations.length,
      totalCT,
      bottleneckName,
      bottleneckCT,
      rawMaterialUPH,
      taktTime,
      leadTime,
      vaRatio: processEfficiency.toFixed(1),
      waitingTime,
      cellBalancePercent: processEfficiency,
      avgUtilizationPercent: avgUtilization,
      systemThroughputUPH: systemThroughput,
    };
  }

  /* ══════════════════════ HELPERS ══════════════════════ */

  private _dataRow(key: string, val: string): string {
    return `<div class="vsm-data-row"><span class="vsm-data-key">${key}</span><span class="vsm-data-val">${val}</span></div>`;
  }

  private _fmtTime(seconds: number | undefined | null): string {
    if (seconds === undefined || seconds === null) return '—';
    if (seconds >= 3600) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = seconds % 60;
      return h + 'h ' + (m > 0 ? m + 'm ' : '') + (s > 0 ? s + 's' : '');
    }
    if (seconds >= 60) {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return m + 'm ' + (s > 0 ? s + 's' : '');
    }
    return seconds + 's';
  }

  private _fmtPercent(value: number | undefined | null): string {
    if (value === undefined || value === null || !Number.isFinite(value)) {
      return '—';
    }
    const clamped = Math.max(0, Math.min(1000, value));
    const decimals = clamped >= 100 ? 0 : 1;
    const str = clamped.toFixed(decimals);
    const trimmed = decimals === 0 ? str : str.replace(/\.0$/, '');
    return trimmed + '%';
  }

  private _fmtTimeLong(seconds: number): string {
    if (seconds >= 3600) {
      const h = (seconds / 3600).toFixed(1);
      return h + ' hrs (' + seconds + 's)';
    }
    if (seconds >= 60) {
      const m = (seconds / 60).toFixed(1);
      return m + ' min (' + seconds + 's)';
    }
    return seconds + ' sec';
  }

  private _esc(str: string): string {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
}
