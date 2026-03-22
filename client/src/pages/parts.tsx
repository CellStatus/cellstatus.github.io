import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-react";
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
  const [newPartOpen, setNewPartOpen] = useState(false);
  const [editingPartId, setEditingPartId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingPart, setDeletingPart] = useState<Part | null>(null);

  const { data: parts = [], isLoading } = useQuery<Part[]>({
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

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: PartForm }) =>
      apiRequest("PATCH", `/api/parts/${id}`, {
        partNumber: payload.partNumber.trim(),
        partName: payload.partName.trim() || null,
        material: payload.material.trim() || null,
        rawMaterialCost: payload.rawMaterialCost.trim() ? Number(payload.rawMaterialCost) : null,
        notes: payload.notes.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parts"] });
      setForm(emptyForm);
      setEditingPartId(null);
      toast({ title: "Part updated" });
    },
    onError: () => toast({ title: "Failed to update part", variant: "destructive" }),
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

  const startEdit = (part: Part) => {
    setEditingPartId(part.id);
    setNewPartOpen(true);
    setForm({
      partNumber: part.partNumber,
      partName: part.partName || "",
      material: part.material || "",
      rawMaterialCost: part.rawMaterialCost != null ? String(part.rawMaterialCost) : "",
      notes: part.notes || "",
    });
  };

  const onSubmit = () => {
    if (!form.partNumber.trim()) {
      toast({ title: "Part Number is required", variant: "destructive" });
      return;
    }
    if (form.rawMaterialCost.trim() && Number(form.rawMaterialCost) < 0) {
      toast({ title: "Raw Material Cost must be non-negative", variant: "destructive" });
      return;
    }
    if (editingPartId) {
      updateMutation.mutate({ id: editingPartId, payload: form });
    } else {
      createMutation.mutate(form);
    }
  };

  return (
    <div className="p-6 h-full overflow-y-auto space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Parts</h2>
        <p className="text-sm text-muted-foreground">Manage part master data for characteristics and scrap reporting.</p>
      </div>

      <Card>
        <CardHeader
          className="cursor-pointer select-none"
          onClick={() => {
            if (!editingPartId) setNewPartOpen((open) => !open);
          }}
        >
          <div className="flex items-center justify-between">
            <CardTitle>{editingPartId ? "Edit Part" : "New Part"}</CardTitle>
            {!editingPartId && (newPartOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
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

          <div className="flex items-center gap-2">
            <Button
              onClick={onSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {editingPartId ? "Save Changes" : <><Plus className="h-4 w-4 mr-1" /> Add Part</>}
            </Button>
            {editingPartId && (
              <Button
                variant="outline"
                onClick={() => {
                  setEditingPartId(null);
                  setForm(emptyForm);
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Part Master</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : parts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Plus className="h-10 w-10 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">No parts added yet. Click "New Part" to get started.</p>
            </div>
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
                        <div className="inline-flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => startEdit(part)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setDeletingPart(part);
                              setDeleteConfirmOpen(true);
                            }}
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
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Part</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete part "{deletingPart?.partNumber}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingPart) deleteMutation.mutate(deletingPart.id);
                setDeleteConfirmOpen(false);
                setDeletingPart(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
