/* ============================================================
   SimpleVSM — VSM Rendering Engine
   ============================================================
   Takes the JSON data and renders a full Value Stream Map
   into the #vsmCanvas container using DOM elements + SVG.
   ============================================================ */

class VSMRenderer {
  /* ────────────────────── Configuration ────────────────────── */
  static DEFAULTS = {
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

  constructor(container) {
    this.container = container;
    this.cfg = { ...VSMRenderer.DEFAULTS };
    this.data = null;
    this.sortedStations = [];
    this.bottleneckIdx = -1;
    this.positions = [];        // { x, y } for each process
    this.totalCanvasW = 0;
    this.totalCanvasH = 0;
  }

  /* ══════════════════════ PUBLIC API ══════════════════════ */

  render(data) {
    this.data = data;
    this.container.innerHTML = '';

    if (!data || !data.stations || data.stations.length === 0) {
      this.container.innerHTML = '<div id="emptyState"><h2>No stations found</h2><p>Check your JSON data.</p></div>';
      return { stations: 0 };
    }

    // 1) Sort stations by processStep
    this.sortedStations = [...data.stations].sort((a, b) => a.processStep - b.processStep);

    // 2) Find bottleneck (highest cycle time)
    this.bottleneckIdx = 0;
    let maxCT = 0;
    this.sortedStations.forEach((s, i) => {
      if (s.cycleTime > maxCT) { maxCT = s.cycleTime; this.bottleneckIdx = i; }
    });

    // 3) Compute positions
    this._computePositions();

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

  _computePositions() {
    const c = this.cfg;
    const n = this.sortedStations.length;
    const startX = c.canvasPadX + c.entityW + 80;  // after supplier
    const y = c.canvasPadTop;

    this.positions = [];
    let x = startX;
    for (let i = 0; i < n; i++) {
      this.positions.push({ x, y });
      x += c.processBoxW + c.gapBetweenProcesses;
    }

    this.totalCanvasW = x + c.entityW + 120;
    this.totalCanvasH = y + c.processBoxH + c.dataBoxH + c.timelineOffsetY + c.timelineH + 120;
  }

  /* ══════════════════════ SUPPLIER ══════════════════════ */

  _drawSupplier() {
    const c = this.cfg;
    const el = document.createElement('div');
    el.className = 'vsm-entity vsm-supplier';
    el.style.left = c.canvasPadX + 'px';
    el.style.top = (c.canvasPadTop - 10) + 'px';

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
      ${this.data.rawMaterialUPH ? `<div class="vsm-entity-sublabel">${this.data.rawMaterialUPH} UPH</div>` : ''}
    `;
    this.container.appendChild(el);
  }

  /* ══════════════════════ CUSTOMER ══════════════════════ */

  _drawCustomer() {
    const c = this.cfg;
    const lastPos = this.positions[this.positions.length - 1];
    const cx = lastPos.x + c.processBoxW + 80;

    const el = document.createElement('div');
    el.className = 'vsm-entity vsm-customer';
    el.style.left = cx + 'px';
    el.style.top = (c.canvasPadTop - 10) + 'px';

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

  _drawProductionControl() {
    const c = this.cfg;
    const midX = (this.positions[0].x + this.positions[this.positions.length - 1].x + c.processBoxW) / 2;

    const el = document.createElement('div');
    el.className = 'vsm-control';
    el.style.left = (midX - 80) + 'px';
    el.style.top = '30px';

    el.innerHTML = `
      <div class="vsm-control-box">
        <div class="vsm-control-label">Production Control</div>
      </div>
    `;
    this.container.appendChild(el);
  }

  /* ══════════════════════ INFO FLOWS ══════════════════════ */

  _drawInfoFlows() {
    const c = this.cfg;
    const midX = (this.positions[0].x + this.positions[this.positions.length - 1].x + c.processBoxW) / 2;
    const controlY = 30;
    const controlH = 40;
    const controlW = 160;

    // Info flow from Customer to Production Control
    const lastPos = this.positions[this.positions.length - 1];
    const custX = lastPos.x + c.processBoxW + 80 + 45; // center of customer
    this._drawDashedArrow(custX, c.canvasPadTop - 10, midX + controlW/2, controlY + controlH/2, 'left');

    // Info flow from Supplier to Production Control
    const suppX = c.canvasPadX + 45;
    this._drawDashedArrow(suppX, c.canvasPadTop - 10, midX - controlW/2, controlY + controlH/2, 'right');

    // Info flow from Production Control down to processes
    this.positions.forEach((pos, i) => {
      const px = pos.x + c.processBoxW / 2;
      this._drawVerticalDashedArrow(px, controlY + controlH, pos.y - 4);
    });
  }

  _drawDashedArrow(x1, y1, x2, y2, arrowSide) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const minX = Math.min(x1, x2) - 10;
    const minY = Math.min(y1, y2) - 10;
    const w = Math.abs(x2 - x1) + 20;
    const h = Math.abs(y2 - y1) + 20;

    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.style.position = 'absolute';
    svg.style.left = minX + 'px';
    svg.style.top = minY + 'px';
    svg.style.pointerEvents = 'none';
    svg.style.zIndex = '4';
    svg.style.overflow = 'visible';

    const lx1 = x1 - minX, ly1 = y1 - minY;
    const lx2 = x2 - minX, ly2 = y2 - minY;

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', lx1);
    line.setAttribute('y1', ly1);
    line.setAttribute('x2', lx2);
    line.setAttribute('y2', ly2);
    line.setAttribute('stroke', '#94a3b8');
    line.setAttribute('stroke-width', '1.5');
    line.setAttribute('stroke-dasharray', '6 3');
    svg.appendChild(line);

    // Arrowhead
    const angle = Math.atan2(ly2 - ly1, lx2 - lx1);
    const hs = 8;
    const ax = lx2, ay = ly2;
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

  _drawVerticalDashedArrow(x, y1, y2) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', (y2 - y1 + 10) + '');
    svg.style.position = 'absolute';
    svg.style.left = (x - 10) + 'px';
    svg.style.top = y1 + 'px';
    svg.style.pointerEvents = 'none';
    svg.style.zIndex = '4';
    svg.style.overflow = 'visible';

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', 10);
    line.setAttribute('y1', 0);
    line.setAttribute('x2', 10);
    line.setAttribute('y2', y2 - y1);
    line.setAttribute('stroke', '#94a3b8');
    line.setAttribute('stroke-width', '1.5');
    line.setAttribute('stroke-dasharray', '6 3');
    svg.appendChild(line);

    // Arrow head
    const hs = 6;
    const ay = y2 - y1;
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', `10,${ay} ${10-hs},${ay-hs} ${10+hs},${ay-hs}`);
    poly.setAttribute('fill', '#94a3b8');
    svg.appendChild(poly);

    this.container.appendChild(svg);
  }

  /* ══════════════════════ PROCESS BOXES ══════════════════════ */

  _drawProcessBoxes() {
    const c = this.cfg;
    this.sortedStations.forEach((station, i) => {
      const pos = this.positions[i];
      const isBottleneck = (i === this.bottleneckIdx);

      const el = document.createElement('div');
      el.className = 'vsm-process' + (isBottleneck ? ' bottleneck' : '');
      el.style.left = pos.x + 'px';
      el.style.top = pos.y + 'px';

      // Operation name override
      const stepKey = String(station.processStep);
      const opName = (this.data.operationNames && this.data.operationNames[stepKey])
        ? this.data.operationNames[stepKey]
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
      if (station.uptimePercent !== undefined) {
        html += this._dataRow('Uptime', station.uptimePercent + '%');
      }
      if (station.batchSize !== undefined) {
        html += this._dataRow('Batch', station.batchSize);
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

  _drawPushArrows() {
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
      const midX = (fromX + toX) / 2;

      // Push arrow
      this._drawPushArrowSVG(fromX + 2, arrowY, toX - 2, arrowY);
    }

    // Last process → Customer
    const lastPos = this.positions[n - 1];
    const fromX = lastPos.x + c.processBoxW;
    const custX = lastPos.x + c.processBoxW + 80;
    this._drawSolidArrow(fromX + 2, arrowY, custX - 5, arrowY);
  }

  _drawSolidArrow(x1, y1, x2, y2) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const minX = Math.min(x1, x2);
    const w = Math.abs(x2 - x1);
    svg.setAttribute('width', w);
    svg.setAttribute('height', '20');
    svg.style.position = 'absolute';
    svg.style.left = minX + 'px';
    svg.style.top = (y1 - 10) + 'px';
    svg.style.pointerEvents = 'none';
    svg.style.zIndex = '5';
    svg.style.overflow = 'visible';

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', 0);
    line.setAttribute('y1', 10);
    line.setAttribute('x2', w);
    line.setAttribute('y2', 10);
    line.setAttribute('stroke', '#334155');
    line.setAttribute('stroke-width', '2');
    svg.appendChild(line);

    const hs = 8;
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', `${w},10 ${w-hs},${10-hs/2} ${w-hs},${10+hs/2}`);
    poly.setAttribute('fill', '#334155');
    svg.appendChild(poly);

    this.container.appendChild(svg);
  }

  _drawPushArrowSVG(x1, y1, x2, y2) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const minX = Math.min(x1, x2);
    const w = Math.abs(x2 - x1);
    const h = 30;
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.style.position = 'absolute';
    svg.style.left = minX + 'px';
    svg.style.top = (y1 - h / 2) + 'px';
    svg.style.pointerEvents = 'none';
    svg.style.zIndex = '6';
    svg.style.overflow = 'visible';

    const midY = h / 2;
    const stripeW = 12;
    const stripeH = h - 6;

    // Draw push arrow (striped arrow)
    // Main line
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', 0);
    line.setAttribute('y1', midY);
    line.setAttribute('x2', w);
    line.setAttribute('y2', midY);
    line.setAttribute('stroke', '#334155');
    line.setAttribute('stroke-width', '2');
    svg.appendChild(line);

    // Stripes
    const numStripes = Math.floor(w / (stripeW + 8));
    const startOffset = (w - numStripes * (stripeW + 8)) / 2 + 4;
    for (let s = 0; s < numStripes; s++) {
      const sx = startOffset + s * (stripeW + 8);
      const stripe = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      stripe.setAttribute('x', sx);
      stripe.setAttribute('y', midY - stripeH / 2);
      stripe.setAttribute('width', stripeW);
      stripe.setAttribute('height', stripeH);
      stripe.setAttribute('fill', 'white');
      stripe.setAttribute('stroke', '#334155');
      stripe.setAttribute('stroke-width', '1');
      stripe.setAttribute('rx', '1');
      svg.appendChild(stripe);
    }

    // Arrow head
    const hs = 8;
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', `${w},${midY} ${w-hs},${midY-hs/2} ${w-hs},${midY+hs/2}`);
    poly.setAttribute('fill', '#334155');
    svg.appendChild(poly);

    this.container.appendChild(svg);
  }

  /* ══════════════════════ CONNECTORS SVG ══════════════════════ */

  _drawConnectorsSVG() {
    // Placeholder — connectors drawn individually as push arrows, info flows, etc.
  }

  /* ══════════════════════ TIMELINE ══════════════════════ */

  _drawTimeline() {
    const c = this.cfg;
    const n = this.sortedStations.length;
    const baseY = c.canvasPadTop + c.processBoxH + c.dataBoxH + c.timelineOffsetY;
    const segH = c.timelineH / 2;

    const totalProcessTime = this.sortedStations.reduce((s, st) => s + st.cycleTime, 0);

    for (let i = 0; i < n; i++) {
      const pos = this.positions[i];
      const station = this.sortedStations[i];

      // Wait time segment (top half — between processes, show a flat line)
      if (i > 0) {
        const prevEndX = this.positions[i-1].x + c.processBoxW;
        const waitW = pos.x - prevEndX;

        const waitSeg = document.createElement('div');
        waitSeg.className = 'vsm-timeline-segment wait';
        waitSeg.style.left = prevEndX + 'px';
        waitSeg.style.top = baseY + 'px';
        waitSeg.style.width = waitW + 'px';
        waitSeg.style.height = segH + 'px';
        this.container.appendChild(waitSeg);

        // Wait value label (0 since no WIP data)
        const waitLabel = document.createElement('div');
        waitLabel.className = 'vsm-timeline-value wait-value';
        waitLabel.style.left = (prevEndX + waitW / 2 - 10) + 'px';
        waitLabel.style.top = (baseY + 4) + 'px';
        waitLabel.textContent = '—';
        this.container.appendChild(waitLabel);
      }

      // Process time segment (bottom half)
      const procSeg = document.createElement('div');
      procSeg.className = 'vsm-timeline-segment process';
      procSeg.style.left = pos.x + 'px';
      procSeg.style.top = (baseY + segH) + 'px';
      procSeg.style.width = c.processBoxW + 'px';
      procSeg.style.height = segH + 'px';
      this.container.appendChild(procSeg);

      // Process time label
      const procLabel = document.createElement('div');
      procLabel.className = 'vsm-timeline-value process-value';
      procLabel.style.left = (pos.x + c.processBoxW / 2 - 15) + 'px';
      procLabel.style.top = (baseY + segH + 5) + 'px';
      procLabel.textContent = this._fmtTime(station.cycleTime);
      this.container.appendChild(procLabel);
    }

    // Supplier-to-first wait
    const suppEndX = c.canvasPadX + c.entityW + 5;
    const firstX = this.positions[0].x;
    const initWaitW = firstX - suppEndX;
    if (initWaitW > 5) {
      const waitSeg = document.createElement('div');
      waitSeg.className = 'vsm-timeline-segment wait';
      waitSeg.style.left = suppEndX + 'px';
      waitSeg.style.top = baseY + 'px';
      waitSeg.style.width = initWaitW + 'px';
      waitSeg.style.height = segH + 'px';
      this.container.appendChild(waitSeg);
    }

    // Last-to-customer wait
    const lastEndX = this.positions[n-1].x + c.processBoxW;
    const custX = this.positions[n-1].x + c.processBoxW + 80;
    const finalWaitW = custX - lastEndX;
    if (finalWaitW > 5) {
      const waitSeg = document.createElement('div');
      waitSeg.className = 'vsm-timeline-segment wait';
      waitSeg.style.left = lastEndX + 'px';
      waitSeg.style.top = baseY + 'px';
      waitSeg.style.width = finalWaitW + 'px';
      waitSeg.style.height = segH + 'px';
      this.container.appendChild(waitSeg);
    }

    // Timeline totals
    const totalsDiv = document.createElement('div');
    totalsDiv.className = 'vsm-timeline-totals';
    totalsDiv.style.left = (custX + 20) + 'px';
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

  _computeMetrics() {
    const stations = this.sortedStations;
    const n = stations.length;
    const totalCT = stations.reduce((s, st) => s + st.cycleTime, 0);
    const bottleneck = stations[this.bottleneckIdx];
    const bottleneckCT = bottleneck.cycleTime;

    // Takt: if rawMaterialUPH is given
    let taktTime = null;
    if (this.data.rawMaterialUPH && this.data.rawMaterialUPH > 0) {
      taktTime = 3600 / this.data.rawMaterialUPH; // seconds per unit
    }

    // VA ratio: processTime / leadTime — simplified since we don't have WIP
    // For now, lead time = total cycle time (no wait data)
    const leadTime = totalCT;
    const vaRatio = totalCT > 0 ? ((totalCT / leadTime) * 100).toFixed(1) : 0;

    return {
      stations: n,
      totalCT,
      bottleneckName: bottleneck.name + ' (Op ' + bottleneck.processStep + ')',
      bottleneckCT,
      rawMaterialUPH: this.data.rawMaterialUPH || null,
      taktTime,
      leadTime,
      vaRatio
    };
  }

  /* ══════════════════════ HELPERS ══════════════════════ */

  _dataRow(key, val) {
    return `<div class="vsm-data-row"><span class="vsm-data-key">${key}</span><span class="vsm-data-val">${val}</span></div>`;
  }

  _fmtTime(seconds) {
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

  _fmtTimeLong(seconds) {
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

  _esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
}
