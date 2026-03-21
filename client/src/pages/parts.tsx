import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import type { Part } from "@shared/schema";

type PartForm = {
  partNumber: string;
  partName: string;
  material: string;
  rawMaterialCost: string;
  notes: string;
};

const emptyForm: PartForm = {
  partNumber: "",
  partName: "",
  material: "",
  rawMaterialCost: "",
  notes: "",
};

export default function PartsPage() {
  const { toast } = useToast();
  const [form, setForm] = useState<PartForm>(emptyForm);
  const [newPartOpen, setNewPartOpen] = useState(true);

  const { data: parts = [] } = useQuery<Part[]>({
    queryKey: ["/api/parts"],
    queryFn: () => apiRequest("GET", "/api/parts"),
  });

  const createMutation = useMutation({
    mutationFn: (payload: PartForm) =>
      apiRequest("POST", "/api/parts", {
        partNumber: payload.partNumber.trim(),
        partName: payload.partName.trim() || null,
        material: payload.material.trim() || null,
        rawMaterialCost: payload.rawMaterialCost.trim() ? Number(payload.rawMaterialCost) : null,
        notes: payload.notes.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parts"] });
      setForm(emptyForm);
      toast({ title: "Part added" });
    },
    onError: () => toast({ title: "Failed to add part", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/parts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/characteristics"] });
      toast({ title: "Part deleted" });
    },
    onError: () => toast({ title: "Failed to delete part", variant: "destructive" }),
  });

  return (
    <div className="p-6 h-full overflow-y-auto space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Parts</h2>
        <p className="text-sm text-muted-foreground">Manage part master data for characteristics and scrap reporting.</p>
      </div>

      <Card>
        <CardHeader className="cursor-pointer select-none" onClick={() => setNewPartOpen((open) => !open)}>
          <div className="flex items-center justify-between">
            <CardTitle>New Part</CardTitle>
            {newPartOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </CardHeader>
        {newPartOpen && (
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="mb-1 block">Part Number *</Label>
              <Input
                placeholder="e.g. PN-1001"
                value={form.partNumber}
                onChange={(event) => setForm((prev) => ({ ...prev, partNumber: event.target.value }))}
              />
            </div>
            <div>
              <Label className="mb-1 block">Part Name</Label>
              <Input
                placeholder="e.g. Valve Body"
                value={form.partName}
                onChange={(event) => setForm((prev) => ({ ...prev, partName: event.target.value }))}
              />
            </div>
            <div>
              <Label className="mb-1 block">Material</Label>
              <Input
                placeholder="e.g. 6061 Aluminum"
                value={form.material}
                onChange={(event) => setForm((prev) => ({ ...prev, material: event.target.value }))}
              />
            </div>
            <div>
              <Label className="mb-1 block">Raw Material Cost</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder="e.g. 12.50"
                value={form.rawMaterialCost}
                onChange={(event) => setForm((prev) => ({ ...prev, rawMaterialCost: event.target.value }))}
              />
            </div>
          </div>

          <div>
            <Label className="mb-1 block">Notes</Label>
            <Textarea
              rows={2}
              placeholder="Optional details"
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
            />
          </div>

          <Button
            onClick={() => {
              if (!form.partNumber.trim()) {
                toast({ title: "Part Number is required", variant: "destructive" });
                return;
              }
              if (form.rawMaterialCost.trim() && Number(form.rawMaterialCost) < 0) {
                toast({ title: "Raw Material Cost must be non-negative", variant: "destructive" });
                return;
              }
              createMutation.mutate(form);
            }}
            disabled={createMutation.isPending}
          >
            <Plus className="h-4 w-4 mr-1" /> Add Part
          </Button>
        </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Part Master</CardTitle>
        </CardHeader>
        <CardContent>
          {parts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No parts added yet.</p>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="text-left p-2">Part Number</th>
                    <th className="text-left p-2">Name</th>
                    <th className="text-left p-2">Material</th>
                    <th className="text-left p-2">Raw Material Cost</th>
                    <th className="text-left p-2">Notes</th>
                    <th className="text-right p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {parts.map((part) => (
                    <tr key={part.id} className="border-t">
                      <td className="p-2">{part.partNumber}</td>
                      <td className="p-2">{part.partName || <span className="text-muted-foreground">-</span>}</td>
                      <td className="p-2">{part.material || <span className="text-muted-foreground">-</span>}</td>
                      <td className="p-2">
                        {typeof part.rawMaterialCost === "number"
                          ? `$${part.rawMaterialCost.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                          : <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="p-2">{part.notes || <span className="text-muted-foreground">-</span>}</td>
                      <td className="p-2 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(part.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
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
