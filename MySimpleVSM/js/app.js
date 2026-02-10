/* ============================================================
   SimpleVSM — Application Controller
   ============================================================
   Wires up toolbar, modals, zoom/pan, import/export, etc.
   ============================================================ */

(function () {
  'use strict';

  /* ─── DOM refs ─── */
  const canvas       = document.getElementById('vsmCanvas');
  const container    = document.getElementById('canvasContainer');
  const emptyState   = document.getElementById('emptyState');
  const fileInput    = document.getElementById('fileInput');
  const jsonModal    = document.getElementById('jsonModal');
  const jsonEditor   = document.getElementById('jsonEditor');
  const jsonError    = document.getElementById('jsonError');
  const mapTitleEl   = document.getElementById('mapTitle');

  /* ─── Metric DOM refs ─── */
  const metricEls = {
    stations:     document.getElementById('metricStations'),
    totalCT:      document.getElementById('metricTotalCT'),
    bottleneck:   document.getElementById('metricBottleneck'),
    bottleneckCT: document.getElementById('metricBottleneckCT'),
    uph:          document.getElementById('metricUPH'),
    takt:         document.getElementById('metricTakt'),
    leadTime:     document.getElementById('metricLeadTime'),
    vaRatio:      document.getElementById('metricVARatio'),
  };

  /* ─── State ─── */
  let currentData = null;
  let zoom = 1;
  const MIN_ZOOM = 0.3;
  const MAX_ZOOM = 2.0;

  const renderer = new VSMRenderer(canvas);

  /* ══════════════════════ RENDER ══════════════════════ */

  function renderVSM(data) {
    currentData = data;

    // Hide empty state
    if (emptyState) emptyState.style.display = 'none';

    const metrics = renderer.render(data);
    updateMetrics(metrics);
    fitToView();
  }

  function updateMetrics(m) {
    metricEls.stations.textContent     = m.stations;
    metricEls.totalCT.textContent      = fmtSec(m.totalCT);
    metricEls.bottleneck.textContent   = m.bottleneckName || '—';
    metricEls.bottleneckCT.textContent = fmtSec(m.bottleneckCT);
    metricEls.uph.textContent          = m.rawMaterialUPH ? m.rawMaterialUPH + ' /hr' : '—';
    metricEls.takt.textContent         = m.taktTime ? fmtSec(Math.round(m.taktTime)) : '—';
    metricEls.leadTime.textContent     = fmtSec(m.leadTime);
    metricEls.vaRatio.textContent      = m.vaRatio + '%';
  }

  function fmtSec(s) {
    if (s === undefined || s === null) return '—';
    if (s >= 3600) return (s / 3600).toFixed(1) + 'h';
    if (s >= 60) return (s / 60).toFixed(1) + 'm';
    return s + 's';
  }

  /* ══════════════════════ ZOOM / PAN ══════════════════════ */

  function setZoom(z) {
    zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
    canvas.style.transform = `scale(${zoom})`;
  }

  function fitToView() {
    if (!currentData) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const mapW = parseInt(canvas.style.width) || 2000;
    const mapH = parseInt(canvas.style.height) || 800;
    const zx = cw / mapW;
    const zy = ch / mapH;
    setZoom(Math.min(zx, zy, 1) * 0.95);
    container.scrollLeft = 0;
    container.scrollTop = 0;
  }

  /* Mouse-wheel zoom */
  container.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.08 : 0.08;
      setZoom(zoom + delta);
    }
  }, { passive: false });

  /* Middle-click / shift-click pan */
  let isPanning = false, panStartX = 0, panStartY = 0, scrollStartX = 0, scrollStartY = 0;
  container.addEventListener('mousedown', (e) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      isPanning = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      scrollStartX = container.scrollLeft;
      scrollStartY = container.scrollTop;
      e.preventDefault();
    }
  });
  window.addEventListener('mousemove', (e) => {
    if (!isPanning) return;
    container.scrollLeft = scrollStartX - (e.clientX - panStartX);
    container.scrollTop  = scrollStartY - (e.clientY - panStartY);
  });
  window.addEventListener('mouseup', () => { isPanning = false; });

  /* ══════════════════════ TOOLBAR BUTTONS ══════════════════════ */

  // Import JSON
  document.getElementById('btnImport').addEventListener('click', () => fileInput.click());
  if (document.getElementById('btnEmptyImport')) {
    document.getElementById('btnEmptyImport').addEventListener('click', () => fileInput.click());
  }

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        renderVSM(data);
      } catch (err) {
        alert('Invalid JSON file: ' + err.message);
      }
    };
    reader.readAsText(file);
    fileInput.value = '';
  });

  // Load sample
  document.getElementById('btnSample').addEventListener('click', () => renderVSM(SAMPLE_VSM_DATA));
  if (document.getElementById('btnEmptySample')) {
    document.getElementById('btnEmptySample').addEventListener('click', () => renderVSM(SAMPLE_VSM_DATA));
  }

  // Edit JSON
  document.getElementById('btnEditJson').addEventListener('click', () => {
    jsonEditor.value = currentData ? JSON.stringify(currentData, null, 2) : '';
    jsonError.classList.add('hidden');
    jsonModal.classList.remove('hidden');
    jsonEditor.focus();
  });

  document.getElementById('btnCloseModal').addEventListener('click', () => jsonModal.classList.add('hidden'));
  document.getElementById('btnJsonCancel').addEventListener('click', () => jsonModal.classList.add('hidden'));
  document.querySelector('.modal-backdrop').addEventListener('click', () => jsonModal.classList.add('hidden'));

  document.getElementById('btnJsonApply').addEventListener('click', () => {
    try {
      const data = JSON.parse(jsonEditor.value);
      jsonError.classList.add('hidden');
      jsonModal.classList.add('hidden');
      renderVSM(data);
    } catch (err) {
      jsonError.textContent = 'JSON Parse Error: ' + err.message;
      jsonError.classList.remove('hidden');
    }
  });

  // Zoom buttons
  document.getElementById('btnZoomIn').addEventListener('click', () => setZoom(zoom + 0.15));
  document.getElementById('btnZoomOut').addEventListener('click', () => setZoom(zoom - 0.15));
  document.getElementById('btnFitView').addEventListener('click', fitToView);

  // Print
  document.getElementById('btnPrint').addEventListener('click', () => window.print());

  // Export PNG
  document.getElementById('btnExportPNG').addEventListener('click', exportPNG);

  async function exportPNG() {
    // Use html2canvas if available, otherwise a simple approach
    if (typeof html2canvas !== 'undefined') {
      const oldTransform = canvas.style.transform;
      canvas.style.transform = 'scale(1)';
      try {
        const c2 = await html2canvas(canvas, {
          backgroundColor: '#ffffff',
          scale: 2,
          useCORS: true,
        });
        canvas.style.transform = oldTransform;
        const link = document.createElement('a');
        link.download = (mapTitleEl.value || 'vsm') + '.png';
        link.href = c2.toDataURL('image/png');
        link.click();
      } catch (err) {
        canvas.style.transform = oldTransform;
        alert('Export failed: ' + err.message);
      }
    } else {
      // Fallback: open print dialog
      alert('For PNG export, include the html2canvas library.\nUsing Print dialog instead.');
      window.print();
    }
  }

  /* ══════════════════════ KEYBOARD SHORTCUTS ══════════════════════ */

  window.addEventListener('keydown', (e) => {
    // Ctrl+= zoom in, Ctrl+- zoom out, Ctrl+0 fit
    if (e.ctrlKey || e.metaKey) {
      if (e.key === '=' || e.key === '+') { e.preventDefault(); setZoom(zoom + 0.1); }
      if (e.key === '-')                  { e.preventDefault(); setZoom(zoom - 0.1); }
      if (e.key === '0')                  { e.preventDefault(); fitToView(); }
    }
    // Escape closes modal
    if (e.key === 'Escape') {
      jsonModal.classList.add('hidden');
    }
  });

  /* ══════════════════════ WINDOW RESIZE ══════════════════════ */
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (currentData) fitToView();
    }, 200);
  });

})();
