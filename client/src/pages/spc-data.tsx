import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { AuditFinding, Machine, SpcRecord } from "@shared/schema";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { exportSpcHtml } from "@/lib/spc-export";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

function escapeCsvField(value: string | undefined | null): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsvRow(fields: (string | undefined | null)[]): string {
  return fields.map(escapeCsvField).join(",");
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const parseRow = (line: string): string[] => {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          fields.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
    }
    fields.push(current.trim());
    return fields;
  };
  const headers = parseRow(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseRow(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || "";
    });
    rows.push(row);
  }
  return rows;
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
  const [opName, setOpName] = useState('');
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
      const key = ((f as any).charNumber || (f as any).charName || '').toString().toLowerCase();
      return key === s;
    });
    if (match) {
      const pn = ((match as any).partNumber || null);
      if (pn) setExpandedParts(new Set([pn]));
      const key = ((match as any).charNumber || (match as any).charName || '').toString();
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
      const name = (f as any).charName || '';
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
      const key = ((f as any).charNumber || (f as any).charName || '(unknown)').toString();
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
          const k = ((f as any).charNumber || (f as any).charName || '(unknown)').toString();
          if (!g[k]) g[k] = [];
          g[k].push(f);
        });
        return g;
      })()) : Object.keys(findingsByCharacteristic).filter(k => (findingsByPart[filterPartNumber] || []).some(f => {
        const key = ((f as any).charNumber || (f as any).charName || '(unknown)').toString();
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
            const k = ((f as any).charNumber || (f as any).charName || '(unknown)').toString();
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
  const [editOpName, setEditOpName] = useState('');
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
      const name = (f as any).charName || '';
      setCharac(name);
    } else {
      setUseCustomChar(true);
      setCharacSelect('__custom');
      const name = (f as any).charName || '';
      setCharac(name || '');
    }
    setMeasured(f.measuredValue);
    setCorrectiveAction((f as any).recordNote || "");
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

  const importCsvRef = useRef<HTMLInputElement>(null);

  const exportCsv = useCallback(() => {
    const records = Array.isArray(findings) ? findings : [];
    if (records.length === 0) {
      toast({ title: "Nothing to export", description: "No SPC records are available yet." });
      return;
    }
    const headers = ["MachineCode", "MachineName", "PartNumber", "PartName", "CharNumber", "CharName", "OpName", "CharMax", "CharMin", "MeasuredValue", "RecordNote", "Timestamp"];
    const rows = records.map((record) => {
      const machine = machineById[record.machineId];
      return buildCsvRow([
        machine?.machineId || record.machineId,
        machine?.name || "",
        (record as any).partNumber || "",
        (record as any).partName || "",
        (record as any).charNumber || "",
        (record as any).charName || "",
        (record as any).opName || "",
        (record as any).charMax || "",
        (record as any).charMin || "",
        record.measuredValue,
        (record as any).recordNote ?? "",
        record.createdAt,
      ]);
    });
    const csv = [headers.join(","), ...rows].join("\n");
    downloadCsv(`spc-export-${Date.now()}.csv`, csv);
    toast({ title: "Export ready", description: `Exported ${records.length} record${records.length === 1 ? "" : "s"} to CSV.` });
  }, [findings, machineById, toast]);

  const importCsv = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length === 0) {
        toast({ title: "Empty file", description: "The CSV file has no data rows.", variant: "destructive" });
        return;
      }
      // Build machine lookup by machineId code
      const machineByCode: Record<string, Machine> = {};
      (machines || []).forEach((m) => {
        if (m.machineId) machineByCode[m.machineId.toLowerCase()] = m;
      });
      const payloads: any[] = [];
      const errors: string[] = [];
      rows.forEach((row, idx) => {
        const machineCode = (row.MachineCode || "").trim();
        const machine = machineByCode[machineCode.toLowerCase()];
        if (!machine) {
          errors.push(`Row ${idx + 2}: Unknown MachineCode "${machineCode}"`);
          return;
        }
        const charName = (row.CharName || "").trim();
        const charNumber = (row.CharNumber || "").trim();
        if (!charName && !charNumber) {
          errors.push(`Row ${idx + 2}: CharName or CharNumber required`);
          return;
        }
        const measuredValue = (row.MeasuredValue || "").trim();
        if (!measuredValue) {
          errors.push(`Row ${idx + 2}: MeasuredValue required`);
          return;
        }
        payloads.push({
          machineId: machine.id,
          characteristic: charName || charNumber,
          charNumber: charNumber || undefined,
          charName: charName || undefined,
          charMax: (row.CharMax || "").trim() || undefined,
          charMin: (row.CharMin || "").trim() || undefined,
          opName: (row.OpName || "").trim() || undefined,
          partNumber: (row.PartNumber || "").trim() || undefined,
          partName: (row.PartName || "").trim() || undefined,
          measuredValue,
          correctiveAction: (row.RecordNote || "").trim() || undefined,
        });
      });
      if (errors.length > 0 && payloads.length === 0) {
        toast({ title: "Import failed", description: errors.slice(0, 3).join("; "), variant: "destructive" });
        return;
      }
      // Send bulk import
      await apiRequest("POST", "/api/bulk-findings", { findings: payloads });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-findings"] });
      const msg = errors.length > 0
        ? `Imported ${payloads.length} records. ${errors.length} row${errors.length === 1 ? "" : "s"} skipped.`
        : `Imported ${payloads.length} record${payloads.length === 1 ? "" : "s"}.`;
      toast({ title: "Import complete", description: msg });
    } catch (err) {
      toast({ title: "Import failed", description: "Failed to process CSV file.", variant: "destructive" });
    }
  }, [machines, toast]);

  return (
    <div className="p-6 h-full overflow-y-auto">
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
          <Button variant="outline" onClick={exportCsv}>Export CSV</Button>
          <Button variant="outline" onClick={() => importCsvRef.current?.click()}>Import CSV</Button>
          <input ref={importCsvRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { importCsv(f); e.target.value = ""; } }} />
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
              const key = ((f as any).charNumber || (f as any).charName || '(unknown)').toString();
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
                                    {(first as any).charName ? (
                                      <span className="text-sm text-muted-foreground mt-1">{(first as any).charName}</span>
                                    ) : null}
                                    {(first as any).opName ? (
                                      <span className="text-sm text-muted-foreground">Op: {(first as any).opName}</span>
                                    ) : null}
                                    <div className="flex items-center gap-4 text-sm text-muted-foreground mt-2">
                                      {!minIsZero && <span>Nominal: {nominal || '-'}</span>}
                                      <span>Max: {first.charMax ?? '-'}</span>
                                      {!minIsZero && <span>Min: {first.charMin ?? '-'}</span>}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button className="opacity-0 group-hover:opacity-100 transition-opacity" size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); exportSpcHtml({ charNumber: first.charNumber || charKey, charName: first.charName || '', partNumber: first.partNumber || partNumber || '', partName: first.partName || partName || '', opName: first.opName || '', records: items.map((r: any) => ({ machineId: r.machineId, machineName: machineById[r.machineId]?.name || machineById[r.machineId]?.machineId || r.machineId, measuredValue: r.measuredValue, charMax: r.charMax, charMin: r.charMin, createdAt: r.createdAt, recordNote: r.recordNote || '' })) }); }}>Print SPC</Button>
                                    <Button className="opacity-0 group-hover:opacity-100 transition-opacity" size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); const key = charKey; const first = items[0]; if (first) { setEditingCharacteristicKey(key); setEditCharNumber((first as any).charNumber || ''); setEditCharName((first as any).charName || ''); setEditPartNumber((first as any).partNumber || ''); setEditPartSelect((first as any).partNumber || '__custom'); setEditPartName((first as any).partName || ''); setEditCharMax((first as any).charMax || ''); setEditCharMin((first as any).charMin || ''); setEditOpName((first as any).opName || ''); setEditCharOpen(true); } }}>Edit Characteristic</Button>
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
                                            <td className="p-2">{(it as any).recordNote || '-'}</td>
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
              <div>
                <label className="text-xs text-muted-foreground">Op Name</label>
                <Input value={editOpName} onChange={(e) => setEditOpName(e.target.value)} />
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
                  const firstItem = items[0] as any;
                  if (!firstItem) return;
                  try {
                    // 3NF: update the single characteristic row
                    const charPayload: any = {};
                    if (editCharName) charPayload.charName = editCharName;
                    if (editCharNumber) charPayload.charNumber = editCharNumber;
                    if (editCharMax) charPayload.charMax = editCharMax;
                    if (editCharMin) charPayload.charMin = editCharMin;
                    if (editOpName !== undefined) charPayload.opName = editOpName || null;
                    if (firstItem.characteristicId) {
                      await apiRequest('PATCH', `/api/characteristics/${firstItem.characteristicId}`, charPayload);
                    }
                    // Update part if changed
                    if (firstItem.partId && (editPartNumber || editPartName)) {
                      const partPayload: any = {};
                      if (editPartNumber) partPayload.partNumber = editPartNumber;
                      if (editPartName) partPayload.partName = editPartName;
                      await apiRequest('PATCH', `/api/parts/${firstItem.partId}`, partPayload);
                    }
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
                <label className="text-xs text-muted-foreground">Op Name</label>
                <Input value={opName} onChange={(e) => setOpName(e.target.value)} placeholder="e.g. OP 10" />
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
                    const payload = { machineId: selMachine, characteristic: charac.trim(), charNumber: charNumber.trim() || undefined, charName: charac.trim() || undefined, charMax: charMax.trim() || undefined, charMin: charMin.trim() || undefined, partNumber: partNumber.trim() || undefined, partName: partName.trim() || undefined, measuredValue: measured.trim(), correctiveAction: correctiveAction.trim() || undefined, opName: opName.trim() || undefined, status };
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
