import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { VSMRenderer, type VsmRenderData, type VsmRenderMetrics } from '@/lib/vsm-renderer';
import { SAMPLE_VSM_DATA } from '@/lib/vsm-sample-data';
import '@/styles/simple-vsm.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Download,
  Upload,
  FileText,
  ZoomIn,
  ZoomOut,
  Maximize,
  Printer,
  Pencil,
  Database,
  Image,
} from 'lucide-react';

function fmtSec(s: number | undefined | null): string {
  if (typeof s !== 'number' || !Number.isFinite(s)) return '—';
  const value = Math.max(0, s);
  if (value >= 3600) return (value / 3600).toFixed(1) + 'h';
  if (value >= 60) return (value / 60).toFixed(1) + 'm';
  if (value >= 10) return Math.round(value) + 's';
  const rounded = parseFloat(value.toFixed(1));
  return (rounded % 1 === 0 ? Math.round(rounded) : rounded) + 's';
}

type VsmConfiguration = {
  id: string;
  name: string;
  description?: string;
  stationsJson: unknown;
};

export default function SimpleVSMPage() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<VSMRenderer | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentData, setCurrentData] = useState<VsmRenderData | null>(null);
  const [metrics, setMetrics] = useState<VsmRenderMetrics | null>(null);
  const [zoom, setZoomState] = useState(1);
  const [mapTitle, setMapTitle] = useState('Manufacturing Value Stream');
  const [jsonModalOpen, setJsonModalOpen] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [loadModalOpen, setLoadModalOpen] = useState(false);

  const { toast } = useToast();

  const MIN_ZOOM = 0.1;
  const MAX_ZOOM = 2.0;

  const formatRate = (rate?: number | null) =>
    typeof rate === 'number' && Number.isFinite(rate) ? `${rate.toFixed(1)} /hr` : '—';

  const formatPercent = (val?: number | null) => {
    if (typeof val !== 'number' || !Number.isFinite(val)) return '—';
    const decimals = val >= 100 ? 0 : 1;
    const str = val.toFixed(decimals);
    const trimmed = decimals === 0 ? str : str.replace(/\.0$/, '');
    return `${trimmed}%`;
  };

  // Fetch saved VSM configurations from server
  const { data: vsmConfigs } = useQuery<VsmConfiguration[]>({
    queryKey: ['/api/vsm-configurations'],
    queryFn: () => apiRequest('GET', '/api/vsm-configurations'),
  });

  // Initialize renderer
  useEffect(() => {
    if (canvasRef.current && !rendererRef.current) {
      rendererRef.current = new VSMRenderer(canvasRef.current);
    }
  }, []);

  // Render VSM data
  const renderVSM = useCallback((data: VsmRenderData) => {
    if (!rendererRef.current || !canvasRef.current) return;
    setCurrentData(data);
    const result = rendererRef.current.render(data);
    if ('totalCT' in result) {
      setMetrics(result);
    } else {
      setMetrics(null);
    }
    // Fit to view after render — double rAF to wait for layout
    requestAnimationFrame(() => {
      requestAnimationFrame(() => fitToView());
    });
  }, []);

  // Zoom helpers
  const setZoom = useCallback((z: number) => {
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
    setZoomState(clamped);
    if (canvasRef.current) {
      canvasRef.current.style.transform = `scale(${clamped})`;
    }
  }, []);

  const fitToView = useCallback(() => {
    if (!containerRef.current || !canvasRef.current) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    if (cw === 0 || ch === 0) return; // layout not ready yet
    const mapW = parseInt(canvasRef.current.style.width) || 2000;
    const mapH = parseInt(canvasRef.current.style.height) || 800;
    const zx = cw / mapW;
    const zy = ch / mapH;
    const newZoom = Math.min(zx, zy, 1) * 0.92;
    setZoom(newZoom);
    containerRef.current.scrollLeft = 0;
    containerRef.current.scrollTop = 0;
  }, [setZoom]);

  // Mouse-wheel zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handler = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.08 : 0.08;
        setZoom(zoom + delta);
      }
    };
    container.addEventListener('wheel', handler, { passive: false });
    return () => container.removeEventListener('wheel', handler);
  }, [zoom, setZoom]);

  // Middle-click / shift-click pan
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let isPanning = false;
    let panStartX = 0;
    let panStartY = 0;
    let scrollStartX = 0;
    let scrollStartY = 0;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
        isPanning = true;
        panStartX = e.clientX;
        panStartY = e.clientY;
        scrollStartX = container.scrollLeft;
        scrollStartY = container.scrollTop;
        e.preventDefault();
      }
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!isPanning) return;
      container.scrollLeft = scrollStartX - (e.clientX - panStartX);
      container.scrollTop = scrollStartY - (e.clientY - panStartY);
    };
    const onMouseUp = () => {
      isPanning = false;
    };

    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          setZoom(zoom + 0.1);
        }
        if (e.key === '-') {
          e.preventDefault();
          setZoom(zoom - 0.1);
        }
        if (e.key === '0') {
          e.preventDefault();
          fitToView();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [zoom, setZoom, fitToView]);

  // Window resize
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const handler = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (currentData) fitToView();
      }, 200);
    };
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('resize', handler);
      clearTimeout(timer);
    };
  }, [currentData, fitToView]);

  // Import JSON file
  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string) as VsmRenderData;
        renderVSM(data);
        toast({ title: 'JSON imported successfully' });
      } catch (err) {
        toast({
          title: 'Invalid JSON file',
          description: (err as Error).message,
          variant: 'destructive',
        });
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Edit JSON modal
  const openJsonEditor = () => {
    setJsonText(currentData ? JSON.stringify(currentData, null, 2) : '');
    setJsonError('');
    setJsonModalOpen(true);
  };

  const applyJson = () => {
    try {
      const data = JSON.parse(jsonText) as VsmRenderData;
      setJsonError('');
      setJsonModalOpen(false);
      renderVSM(data);
      toast({ title: 'JSON applied successfully' });
    } catch (err) {
      setJsonError('JSON Parse Error: ' + (err as Error).message);
    }
  };

  // Load from saved VSM configuration
  const loadFromConfig = (config: VsmConfiguration) => {
    try {
      const stationsJson = config.stationsJson as any;
      const data: VsmRenderData = {
        stations: Array.isArray(stationsJson)
          ? stationsJson
          : stationsJson?.stations || stationsJson?.stationsJson || [],
        operationNames: stationsJson?.operationNames || {},
        rawMaterialUPH: stationsJson?.rawMaterialUPH,
      };
      setMapTitle(config.name || 'Value Stream Map');
      renderVSM(data);
      setLoadModalOpen(false);
      toast({ title: `Loaded: ${config.name}` });
    } catch (err) {
      toast({
        title: 'Failed to load configuration',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
  };

  // Export PNG
  const exportPNG = async () => {
    const node = canvasRef.current;
    if (!node) return;
    const oldTransform = node.style.transform;
    node.style.transform = 'scale(1)';

    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(node, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
        cacheBust: true,
        style: { transform: 'scale(1)' },
      });
      const link = document.createElement('a');
      link.download = (mapTitle || 'vsm') + '.png';
      link.href = dataUrl;
      link.click();
      toast({ title: 'PNG exported' });
    } catch (err) {
      try {
        const html2canvas = (await import('html2canvas')).default;
        const canvas = await html2canvas(node, {
          backgroundColor: '#ffffff',
          scale: 2,
          useCORS: true,
        });
        const link = document.createElement('a');
        link.download = (mapTitle || 'vsm') + '.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
        toast({ title: 'PNG exported (fallback)' });
      } catch (fallbackErr) {
        toast({
          title: 'Export failed',
          description: 'Using print dialog instead.',
          variant: 'destructive',
        });
        window.print();
      }
    } finally {
      node.style.transform = oldTransform;
    }
  };

  return (
    <div className="simple-vsm-root flex flex-col h-full">
      {/* ─── Toolbar ─── */}
      <div className="simple-vsm-toolbar flex items-center justify-between h-[52px] px-4 bg-[#1a1a2e] text-slate-200 shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-2 font-bold text-base text-white mr-2">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"/>
            </svg>
            <span>SimpleVSM</span>
          </div>
          <div className="w-px h-7 bg-white/15 mx-1" />
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-200 hover:bg-white/10 hover:text-white gap-1.5 text-xs"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            Import JSON
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-200 hover:bg-white/10 hover:text-white gap-1.5 text-xs"
            onClick={() => renderVSM(SAMPLE_VSM_DATA)}
          >
            <FileText className="h-4 w-4" />
            Sample
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-200 hover:bg-white/10 hover:text-white gap-1.5 text-xs"
            onClick={openJsonEditor}
          >
            <Pencil className="h-4 w-4" />
            Edit JSON
          </Button>
          {vsmConfigs && vsmConfigs.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-slate-200 hover:bg-white/10 hover:text-white gap-1.5 text-xs"
              onClick={() => setLoadModalOpen(true)}
            >
              <Database className="h-4 w-4" />
              Load Config
            </Button>
          )}
        </div>

        <div className="flex-1 flex justify-center">
          <Input
            value={mapTitle}
            onChange={(e) => setMapTitle(e.target.value)}
            className="bg-white/10 border-white/15 text-white text-sm font-semibold text-center w-[340px] placeholder:text-slate-400 focus:border-blue-500"
            placeholder="Value Stream Map Title"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="text-slate-200 hover:bg-white/10 hover:text-white h-8 w-8"
            onClick={() => setZoom(zoom + 0.15)}
            title="Zoom In"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-slate-200 hover:bg-white/10 hover:text-white h-8 w-8"
            onClick={() => setZoom(zoom - 0.15)}
            title="Zoom Out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-slate-200 hover:bg-white/10 hover:text-white h-8 w-8"
            onClick={fitToView}
            title="Fit to View"
          >
            <Maximize className="h-4 w-4" />
          </Button>
          <div className="w-px h-7 bg-white/15 mx-1" />
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-200 hover:bg-white/10 hover:text-white gap-1.5 text-xs"
            onClick={exportPNG}
          >
            <Image className="h-4 w-4" />
            Export PNG
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-200 hover:bg-white/10 hover:text-white gap-1.5 text-xs"
            onClick={() => window.print()}
          >
            <Printer className="h-4 w-4" />
            Print
          </Button>
        </div>
      </div>

      {/* ─── Metrics Bar ─── */}
      {(() => {
        const avgUtil = metrics?.avgUtilizationPercent ?? null;
        const cellBalance = metrics?.cellBalancePercent ?? null;
        const showAvgUtil =
          avgUtil != null &&
          Number.isFinite(avgUtil) &&
          (cellBalance == null ||
            !Number.isFinite(cellBalance) ||
            Math.abs(avgUtil - cellBalance) > 0.5);

        const items = [
          {
            label: 'Stations',
            value: metrics?.stations != null ? String(metrics.stations) : '0',
          },
          {
            label: 'Throughput',
            value: formatRate(metrics?.systemThroughputUPH),
          },
          {
            label: 'Bottleneck',
            value: metrics?.bottleneckName ?? '—',
          },
          {
            label: 'Bottleneck CT',
            value: metrics ? fmtSec(metrics.bottleneckCT) : '—',
          },
          {
            label: 'Raw Material UPH',
            value: formatRate(metrics?.rawMaterialUPH),
          },
          {
            label: 'Takt Time',
            value: fmtSec(metrics?.taktTime ?? null),
          },
          {
            label: 'Value-Add Time',
            value: metrics ? fmtSec(metrics.totalCT) : '—',
          },
          {
            label: 'Waiting Time',
            value: metrics ? fmtSec(metrics.waitingTime) : '—',
          },
          {
            label: 'Lead Time',
            value: metrics ? fmtSec(metrics.leadTime) : '—',
          },
          {
            label: 'Cell Balance',
            value: metrics ? `${metrics.vaRatio}%` : '—',
          },
        ];

        if (showAvgUtil) {
          items.push({
            label: 'Avg Utilization',
            value: formatPercent(metrics?.avgUtilizationPercent ?? null),
          });
        }

        return (
          <div className="simple-vsm-metrics flex items-center h-[54px] px-5 bg-background border-b overflow-x-auto shrink-0">
            {items.map((item, idx) => (
              <MetricItem
                key={item.label}
                label={item.label}
                value={item.value}
                last={idx === items.length - 1}
              />
            ))}
          </div>
        );
      })()}

      {/* ─── Canvas Area ─── */}
      <div
        ref={containerRef}
        className="simple-vsm-canvas-container relative flex-1 overflow-auto cursor-grab active:cursor-grabbing"
        style={{
          background: 'radial-gradient(circle, hsl(var(--border)) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      >
        {/* Empty state when no data loaded — must be outside canvasRef since renderer wipes innerHTML */}
        {!currentData && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center text-muted-foreground z-10">
            <svg
              width="80"
              height="80"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              className="mx-auto opacity-40"
            >
              <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />
            </svg>
            <h2 className="mt-4 text-xl font-semibold text-foreground">
              No Value Stream Map Loaded
            </h2>
            <p className="mt-1 text-sm mb-5">
              Import your JSON data, load a saved config, or try the sample.
            </p>
            <div className="flex justify-center gap-3">
              <Button onClick={() => fileInputRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" />
                Import JSON
              </Button>
              <Button variant="outline" onClick={() => renderVSM(SAMPLE_VSM_DATA)}>
                <FileText className="mr-2 h-4 w-4" />
                Load Sample
              </Button>
            </div>
          </div>
        )}
        <div
          ref={canvasRef}
          className="simple-vsm-canvas relative min-w-full min-h-full"
          style={{ transformOrigin: '0 0', transition: 'transform 0.1s ease-out' }}
        />
      </div>

      {/* ─── Hidden file input ─── */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileImport}
      />

      {/* ─── JSON Editor Dialog ─── */}
      <Dialog open={jsonModalOpen} onOpenChange={setJsonModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit VSM JSON Data</DialogTitle>
            <DialogDescription>
              Paste or edit the JSON data for the value stream map.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              spellCheck={false}
              placeholder="Paste your VSM JSON here..."
              className="w-full h-[400px] font-mono text-xs leading-relaxed border rounded-lg p-3 resize-y bg-muted/50 focus:border-primary focus:outline-none"
            />
            {jsonError && (
              <div className="p-2 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-xs">
                {jsonError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setJsonModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={applyJson}>Apply &amp; Render</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Load Config Dialog ─── */}
      <Dialog open={loadModalOpen} onOpenChange={setLoadModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Load VSM Configuration</DialogTitle>
            <DialogDescription>
              Select a saved VSM configuration to visualize.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-2 pr-4">
              {vsmConfigs?.map((config) => (
                <button
                  key={config.id}
                  onClick={() => loadFromConfig(config)}
                  className="w-full text-left p-3 rounded-lg border hover:bg-accent transition-colors"
                >
                  <div className="font-medium text-sm">{config.name}</div>
                  {config.description && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {config.description}
                    </div>
                  )}
                </button>
              ))}
              {(!vsmConfigs || vsmConfigs.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No saved configurations found.
                </p>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetricItem({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      className={`flex flex-col py-1.5 px-5 min-w-[110px] ${
        last ? '' : 'border-r'
      }`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="text-[15px] font-bold text-foreground mt-0.5">{value}</span>
    </div>
  );
}
