import { useMemo, useState, useEffect } from "react";
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
export default function AuditFindings() {
  const { toast } = useToast();
  const [openNew, setOpenNew] = useState(false);
  const [selMachine, setSelMachine] = useState<string | null>(null);
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
  // can link to `/audit-findings?machineId=...` or `/audit-findings?char=...`.
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      const mid = u.searchParams.get('machineId');
      const char = u.searchParams.get('char');
      const pn = u.searchParams.get('partNumber');
      const statusParam = u.searchParams.get('status');
      if (mid) setFilterMachineId(mid);
      if (char) setSearch(char);
      if (pn) setFilterPartNumber(pn);
      if (statusParam === 'open' || statusParam === 'closed') setFilterStatus(statusParam as 'open' | 'closed');
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
      window.history.replaceState({}, '', '/audit-findings');
    } catch (e) {
      // fallback to router navigation
      setLocation('/audit-findings');
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
      toast({ title: 'Audit finding created' });
    },
    onError: () => toast({ title: 'Failed to create finding', variant: 'destructive' }),
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
      toast({ title: 'Audit finding updated' });
    },
    onError: () => toast({ title: 'Failed to update finding', variant: 'destructive' }),
  });

  const deleteFindingMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/findings/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/audit-findings'] });
      toast({ title: 'Audit finding deleted' });
    },
    onError: () => toast({ title: 'Failed to delete finding', variant: 'destructive' }),
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

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Audit Findings</h2>
          {filterMachineId && (
            <div className="text-sm text-muted-foreground">Showing findings for: {machineById[filterMachineId]?.name || filterMachineId} <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button></div>
          )}
          {!filterMachineId && filterPartNumber && (
            <div className="text-sm text-muted-foreground">Showing findings for part: {filterPartNumber}{filterPartName ? ` — ${filterPartName}` : ''} <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button></div>
          )}
        </div>
        <div>
          <Button onClick={() => openNewFor()}>New Finding</Button>
        </div>
      </div>
      <div className="mb-4">
        <Input placeholder="Search by Machine ID, Char #, or Part #" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="grid gap-4 grid-cols-1">
        {entriesToShow.length === 0 ? (
          <Card>
            <CardContent>No audit findings recorded.</CardContent>
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
                        <span className="text-sm text-muted-foreground">{charCount} chars • {totalFindings} findings</span>
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
                                          <th className="text-left p-2">Corrective Action</th>
                                          <th className="text-left p-2">Status</th>
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
                                            <td className="p-2">{it.correctiveAction || '-'}</td>
                                            <td className="p-2"><Badge variant={it.status === 'closed' ? 'secondary' : undefined}>{it.status ?? 'open'}</Badge></td>
                                            <td className="p-2 text-right">
                                              <div className="inline-flex gap-2 items-center">
                                                <button
                                                  aria-label="Edit finding"
                                                  title="Edit"
                                                  onClick={() => startEdit(it)}
                                                  className={`${hoveredRowId === it.id ? 'opacity-100' : 'opacity-0 pointer-events-none'} transition-opacity h-6 w-6 flex items-center justify-center rounded`}
                                                >
                                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21v-3a4 4 0 0 1 4-4h3"/><path d="M20.7 7.3a1 1 0 0 0 0-1.4l-2.6-2.6a1 1 0 0 0-1.4 0L7 12v3h3L20.7 7.3z"/></svg>
                                                </button>
                                                <button
                                                  aria-label="Delete finding"
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
          <div className="bg-background p-6 rounded shadow-lg w-full max-w-md">
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

      {/* New Finding Modal */}
      {openNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background p-6 rounded shadow-lg w-full max-w-md">
            <h3 className="text-lg font-semibold mb-2">New Audit Finding</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-1">
                <label className="text-xs text-muted-foreground">Machine</label>
                <Select onValueChange={(v) => setSelMachine(v)} value={selMachine ?? undefined}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select machine" />
                  </SelectTrigger>
                  <SelectContent>
                    {machines.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.name} {m.machineId ? `(${String(m.machineId).slice(-3)})` : ''}</SelectItem>
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
                <label className="text-xs text-muted-foreground">Corrective Action</label>
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
            <AlertDialogTitle>Delete audit finding</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete this audit finding? This action cannot be undone.</AlertDialogDescription>
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
