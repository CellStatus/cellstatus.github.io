import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-react";
import type { Characteristic, Part } from "@shared/schema";

type CharacteristicForm = {
  partId: string;
  charNumber: string;
  charName: string;
  isAttributeCheck: boolean;
  nominalValue: string;
  toleranceMode: "bilateral" | "unilateral";
  toleranceValue: string;
  unilateralDirection: "upper" | "lower";
  operation: string;
};

const emptyForm: CharacteristicForm = {
  partId: "",
  charNumber: "",
  charName: "",
  isAttributeCheck: false,
  nominalValue: "",
  toleranceMode: "bilateral",
  toleranceValue: "",
  unilateralDirection: "upper",
  operation: "",
};

const formatNumber = (value: number) => {
  if (!Number.isFinite(value)) return "";
  return Number(value.toFixed(6)).toString();
};

const isAttributeCharacteristic = (char: Characteristic) =>
  Boolean(char.isAttributeCheck)
  || (!char.nominalValue && !char.charMin && !char.charMax && !char.tolerance);

export default function CharacteristicsPage() {
  const { toast } = useToast();
  const [form, setForm] = useState<CharacteristicForm>(emptyForm);
  const [newCharacteristicOpen, setNewCharacteristicOpen] = useState(false);
  const [editingCharacteristicId, setEditingCharacteristicId] = useState<string | null>(null);

  const { data: parts = [] } = useQuery<Part[]>({
    queryKey: ["/api/parts"],
    queryFn: () => apiRequest("GET", "/api/parts"),
  });

  const { data: characteristics = [] } = useQuery<Characteristic[]>({
    queryKey: ["/api/characteristics"],
    queryFn: () => apiRequest("GET", "/api/characteristics"),
  });

  const computedLimits = useMemo(() => {
    const nominal = Number(form.nominalValue);
    const tolerance = Number(form.toleranceValue);
    if (!Number.isFinite(nominal) || !Number.isFinite(tolerance) || tolerance < 0) {
      return { min: "", max: "", toleranceText: "" };
    }

    if (form.toleranceMode === "bilateral") {
      return {
        min: formatNumber(nominal - tolerance),
        max: formatNumber(nominal + tolerance),
        toleranceText: `±${formatNumber(tolerance)}`,
      };
    }

    if (form.unilateralDirection === "upper") {
      return {
        min: formatNumber(nominal),
        max: formatNumber(nominal + tolerance),
        toleranceText: `+${formatNumber(tolerance)}/-0`,
      };
    }

    return {
      min: formatNumber(nominal - tolerance),
      max: formatNumber(nominal),
      toleranceText: `+0/-${formatNumber(tolerance)}`,
    };
  }, [form.nominalValue, form.toleranceMode, form.toleranceValue, form.unilateralDirection]);

  const createMutation = useMutation({
    mutationFn: (payload: CharacteristicForm) =>
      apiRequest("POST", "/api/characteristics", {
        partId: payload.partId,
        charNumber: payload.charNumber.trim(),
        charName: payload.charName.trim() || undefined,
        isAttributeCheck: payload.isAttributeCheck,
        nominalValue: payload.isAttributeCheck ? null : payload.nominalValue.trim(),
        charMin: payload.isAttributeCheck ? null : (computedLimits.min || undefined),
        charMax: payload.isAttributeCheck ? null : (computedLimits.max || undefined),
        tolerance: payload.isAttributeCheck ? null : (computedLimits.toleranceText || undefined),
        opName: payload.operation.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/characteristics"] });
      setForm(emptyForm);
      toast({ title: "Characteristic added" });
    },
    onError: () => toast({ title: "Failed to add characteristic", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: CharacteristicForm }) =>
      apiRequest("PATCH", `/api/characteristics/${id}`, {
        partId: payload.partId,
        charNumber: payload.charNumber.trim(),
        charName: payload.charName.trim() || undefined,
        isAttributeCheck: payload.isAttributeCheck,
        nominalValue: payload.isAttributeCheck ? null : payload.nominalValue.trim(),
        charMin: payload.isAttributeCheck ? null : (computedLimits.min || undefined),
        charMax: payload.isAttributeCheck ? null : (computedLimits.max || undefined),
        tolerance: payload.isAttributeCheck ? null : (computedLimits.toleranceText || undefined),
        opName: payload.operation.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/characteristics"] });
      setForm(emptyForm);
      setEditingCharacteristicId(null);
      toast({ title: "Characteristic updated" });
    },
    onError: () => toast({ title: "Failed to update characteristic", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/characteristics/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/characteristics"] });
      toast({ title: "Characteristic deleted" });
    },
    onError: () => toast({ title: "Failed to delete characteristic", variant: "destructive" }),
  });

  const partById = new Map(parts.map((part) => [part.id, part]));

  const startEdit = (char: Characteristic) => {
    let toleranceMode: "bilateral" | "unilateral" = "bilateral";
    let unilateralDirection: "upper" | "lower" = "upper";
    let toleranceValue = "";

    const nominal = Number(char.nominalValue);
    const min = Number(char.charMin);
    const max = Number(char.charMax);
    const hasNumeric = Number.isFinite(nominal) && Number.isFinite(min) && Number.isFinite(max);

    if (hasNumeric) {
      const upper = max - nominal;
      const lower = nominal - min;
      if (Math.abs(upper - lower) < 1e-9) {
        toleranceMode = "bilateral";
        toleranceValue = formatNumber(upper);
      } else if (Math.abs(min - nominal) < 1e-9) {
        toleranceMode = "unilateral";
        unilateralDirection = "upper";
        toleranceValue = formatNumber(upper);
      } else if (Math.abs(max - nominal) < 1e-9) {
        toleranceMode = "unilateral";
        unilateralDirection = "lower";
        toleranceValue = formatNumber(lower);
      }
    } else {
      const rawTol = (char.tolerance || "").trim();
      if (rawTol.startsWith("±")) {
        toleranceMode = "bilateral";
        toleranceValue = rawTol.slice(1).trim();
      } else if (rawTol.startsWith("+") && rawTol.includes("/-0")) {
        toleranceMode = "unilateral";
        unilateralDirection = "upper";
        toleranceValue = rawTol.split("/")[0].replace("+", "").trim();
      } else if (rawTol.startsWith("+0/-")) {
        toleranceMode = "unilateral";
        unilateralDirection = "lower";
        toleranceValue = rawTol.replace("+0/-", "").trim();
      }
    }

    const attributeCheck = isAttributeCharacteristic(char);

    setEditingCharacteristicId(char.id);
    setNewCharacteristicOpen(true);
    setForm({
      partId: char.partId || "",
      charNumber: char.charNumber,
      charName: char.charName || "",
      isAttributeCheck: attributeCheck,
      nominalValue: char.nominalValue || "",
      toleranceMode,
      toleranceValue,
      unilateralDirection,
      operation: char.opName || "",
    });
  };

  return (
    <div className="p-6 h-full overflow-y-auto space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Characteristics</h2>
        <p className="text-sm text-muted-foreground">Manage measurable characteristics linked to part numbers.</p>
      </div>

      <Card>
        <CardHeader
          className="cursor-pointer select-none"
          onClick={() => {
            if (!editingCharacteristicId) setNewCharacteristicOpen((open) => !open);
          }}
        >
          <div className="flex items-center justify-between">
            <CardTitle>{editingCharacteristicId ? "Edit Characteristic" : "New Characteristic"}</CardTitle>
            {!editingCharacteristicId && (newCharacteristicOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
          </div>
        </CardHeader>
        {newCharacteristicOpen && (
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="mb-1 block">Part Number *</Label>
              <Select value={form.partId} onValueChange={(value) => setForm((prev) => ({ ...prev, partId: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select part" />
                </SelectTrigger>
                <SelectContent>
                  {parts.map((part) => (
                    <SelectItem key={part.id} value={part.id}>{part.partNumber}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block">Char Number *</Label>
              <Input
                placeholder="e.g. CH-001"
                value={form.charNumber}
                onChange={(event) => setForm((prev) => ({ ...prev, charNumber: event.target.value }))}
              />
            </div>
            <div>
              <Label className="mb-1 block">Char Name</Label>
              <Input
                placeholder="e.g. Bore Diameter"
                value={form.charName}
                onChange={(event) => setForm((prev) => ({ ...prev, charName: event.target.value }))}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="attribute-check"
              checked={form.isAttributeCheck}
              onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isAttributeCheck: checked === true }))}
            />
            <Label htmlFor="attribute-check">Attribute Check (non-dimensional)</Label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Label className="mb-1 block">Nominal Value *</Label>
              <Input
                type="number"
                step="0.0001"
                placeholder="e.g. 10.000"
                value={form.nominalValue}
                onChange={(event) => setForm((prev) => ({ ...prev, nominalValue: event.target.value }))}
                disabled={form.isAttributeCheck}
              />
            </div>
            <div>
              <Label className="mb-1 block">Tolerance Type *</Label>
              <Select
                value={form.toleranceMode}
                onValueChange={(value: "bilateral" | "unilateral") => setForm((prev) => ({ ...prev, toleranceMode: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bilateral">Bilateral (±)</SelectItem>
                  <SelectItem value="unilateral">Unilateral</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block">Tolerance Value *</Label>
              <Input
                type="number"
                min={0}
                step="0.0001"
                placeholder="e.g. 0.050"
                value={form.toleranceValue}
                onChange={(event) => setForm((prev) => ({ ...prev, toleranceValue: event.target.value }))}
                disabled={form.isAttributeCheck}
              />
            </div>
            <div>
              <Label className="mb-1 block">Operation</Label>
              <Input
                placeholder="e.g. Op 20 Turning"
                value={form.operation}
                onChange={(event) => setForm((prev) => ({ ...prev, operation: event.target.value }))}
              />
            </div>
          </div>

          {form.toleranceMode === "unilateral" && !form.isAttributeCheck && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <Label className="mb-1 block">Unilateral Direction *</Label>
                <Select
                  value={form.unilateralDirection}
                  onValueChange={(value: "upper" | "lower") => setForm((prev) => ({ ...prev, unilateralDirection: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="upper">Upper (+tol / -0)</SelectItem>
                    <SelectItem value="lower">Lower (+0 / -tol)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="mb-1 block">Calculated Min</Label>
              <Input value={computedLimits.min} readOnly />
            </div>
            <div>
              <Label className="mb-1 block">Calculated Max</Label>
              <Input value={computedLimits.max} readOnly />
            </div>
            <div>
              <Label className="mb-1 block">Tolerance (Stored)</Label>
              <Input value={computedLimits.toleranceText} readOnly />
            </div>
          </div>

          <Button
            onClick={() => {
              if (!form.partId) {
                toast({ title: "Part Number is required", variant: "destructive" });
                return;
              }
              if (!form.charNumber.trim()) {
                toast({ title: "Char Number is required", variant: "destructive" });
                return;
              }
              if (!form.isAttributeCheck) {
                if (!form.nominalValue.trim() || !Number.isFinite(Number(form.nominalValue))) {
                  toast({ title: "Valid Nominal Value is required", variant: "destructive" });
                  return;
                }
                if (!form.toleranceValue.trim() || !Number.isFinite(Number(form.toleranceValue)) || Number(form.toleranceValue) < 0) {
                  toast({ title: "Valid Tolerance Value is required", variant: "destructive" });
                  return;
                }
              }
              if (editingCharacteristicId) {
                updateMutation.mutate({ id: editingCharacteristicId, payload: form });
              } else {
                createMutation.mutate(form);
              }
            }}
            disabled={createMutation.isPending || updateMutation.isPending || !form.partId}
          >
            {editingCharacteristicId ? "Save Changes" : <><Plus className="h-4 w-4 mr-1" /> Add Characteristic</>}
          </Button>
          {editingCharacteristicId && (
            <Button
              variant="outline"
              onClick={() => {
                setEditingCharacteristicId(null);
                setForm(emptyForm);
              }}
            >
              Cancel
            </Button>
          )}
        </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Characteristic Master</CardTitle>
        </CardHeader>
        <CardContent>
          {characteristics.length === 0 ? (
            <p className="text-sm text-muted-foreground">No characteristics defined yet.</p>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="text-left p-2">Part Number</th>
                    <th className="text-left p-2">Char Number</th>
                    <th className="text-left p-2">Char Name</th>
                    <th className="text-left p-2">Type</th>
                    <th className="text-left p-2">Nominal</th>
                    <th className="text-left p-2">Min</th>
                    <th className="text-left p-2">Max</th>
                    <th className="text-left p-2">Tolerance</th>
                    <th className="text-left p-2">Operation</th>
                    <th className="text-right p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {characteristics.map((char) => (
                    <tr key={char.id} className="border-t">
                      <td className="p-2">{char.partId ? (partById.get(char.partId)?.partNumber || <span className="text-muted-foreground">-</span>) : <span className="text-muted-foreground">-</span>}</td>
                      <td className="p-2">{char.charNumber}</td>
                      <td className="p-2">{char.charName || <span className="text-muted-foreground">-</span>}</td>
                      <td className="p-2">{isAttributeCharacteristic(char) ? "Attribute Check" : "Variable"}</td>
                      <td className="p-2">{char.nominalValue || <span className="text-muted-foreground">-</span>}</td>
                      <td className="p-2">{char.charMin || <span className="text-muted-foreground">-</span>}</td>
                      <td className="p-2">{char.charMax || <span className="text-muted-foreground">-</span>}</td>
                      <td className="p-2">{char.tolerance || <span className="text-muted-foreground">-</span>}</td>
                      <td className="p-2">{char.opName || <span className="text-muted-foreground">-</span>}</td>
                      <td className="p-2 text-right">
                        <div className="inline-flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => startEdit(char)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteMutation.mutate(char.id)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
