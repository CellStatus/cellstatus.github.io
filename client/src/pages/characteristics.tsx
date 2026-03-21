import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import type { Characteristic, Part } from "@shared/schema";

type CharacteristicForm = {
  partId: string;
  charNumber: string;
  charName: string;
};

const emptyForm: CharacteristicForm = {
  partId: "",
  charNumber: "",
  charName: "",
};

export default function CharacteristicsPage() {
  const { toast } = useToast();
  const [form, setForm] = useState<CharacteristicForm>(emptyForm);
  const [newCharacteristicOpen, setNewCharacteristicOpen] = useState(true);

  const { data: parts = [] } = useQuery<Part[]>({
    queryKey: ["/api/parts"],
    queryFn: () => apiRequest("GET", "/api/parts"),
  });

  const { data: characteristics = [] } = useQuery<Characteristic[]>({
    queryKey: ["/api/characteristics"],
    queryFn: () => apiRequest("GET", "/api/characteristics"),
  });

  const createMutation = useMutation({
    mutationFn: (payload: CharacteristicForm) =>
      apiRequest("POST", "/api/characteristics", {
        partId: payload.partId,
        charNumber: payload.charNumber.trim(),
        charName: payload.charName.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/characteristics"] });
      setForm(emptyForm);
      toast({ title: "Characteristic added" });
    },
    onError: () => toast({ title: "Failed to add characteristic", variant: "destructive" }),
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

  return (
    <div className="p-6 h-full overflow-y-auto space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Characteristics</h2>
        <p className="text-sm text-muted-foreground">Manage measurable characteristics linked to part numbers.</p>
      </div>

      <Card>
        <CardHeader className="cursor-pointer select-none" onClick={() => setNewCharacteristicOpen((open) => !open)}>
          <div className="flex items-center justify-between">
            <CardTitle>New Characteristic</CardTitle>
            {newCharacteristicOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
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
              createMutation.mutate(form);
            }}
            disabled={createMutation.isPending || !form.partId}
          >
            <Plus className="h-4 w-4 mr-1" /> Add Characteristic
          </Button>
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
                    <th className="text-right p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {characteristics.map((char) => (
                    <tr key={char.id} className="border-t">
                      <td className="p-2">{char.partId ? (partById.get(char.partId)?.partNumber || <span className="text-muted-foreground">-</span>) : <span className="text-muted-foreground">-</span>}</td>
                      <td className="p-2">{char.charNumber}</td>
                      <td className="p-2">{char.charName || <span className="text-muted-foreground">-</span>}</td>
                      <td className="p-2 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(char.id)}
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
