"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EQUIPMENT_STATUS_LABELS } from "@/lib/constants";
import { Plus, Truck, Search, X } from "lucide-react";

type Equipment = {
  id: string;
  name: string;
  type: string;
  serialNumber: string | null;
  status: string;
  currentLocation: string | null;
  currentProject: { title: string } | null;
  notes: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  AVAILABLE: "bg-green-100 text-green-700",
  IN_USE: "bg-blue-100 text-blue-700",
  MAINTENANCE: "bg-yellow-100 text-yellow-700",
  DECOMMISSIONED: "bg-gray-100 text-gray-500",
};

export default function EquipmentPage() {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", type: "", serialNumber: "", currentLocation: "" });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/admin/resources/equipment")
      .then((r) => r.json())
      .then((d) => setEquipment(d.data || []));
  }, []);

  const filtered = equipment.filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.type.toLowerCase().includes(search.toLowerCase())
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/admin/resources/equipment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const { data } = await res.json();
        setEquipment((prev) => [...prev, data]);
        setShowForm(false);
        setForm({ name: "", type: "", serialNumber: "", currentLocation: "" });
      }
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    const res = await fetch("/api/admin/resources/equipment", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) {
      setEquipment((prev) => prev.map((e) => (e.id === id ? { ...e, status } : e)));
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Техніка</h1>
          <p className="mt-1 text-sm text-muted-foreground">{equipment.length} одиниць</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4" />
          Додати
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6 p-5">
          <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-2">
            <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Назва *" required className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            <input value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))} placeholder="Тип *" required className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            <input value={form.serialNumber} onChange={(e) => setForm((p) => ({ ...p, serialNumber: e.target.value }))} placeholder="Серійний номер" className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            <input value={form.currentLocation} onChange={(e) => setForm((p) => ({ ...p, currentLocation: e.target.value }))} placeholder="Місцезнаходження" className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            <div className="sm:col-span-2 flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Скасувати</Button>
              <Button type="submit" disabled={loading}>{loading ? "Додавання..." : "Додати"}</Button>
            </div>
          </form>
        </Card>
      )}

      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Пошук техніки..." className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm outline-none focus:border-primary" />
      </div>

      <div className="space-y-2">
        {filtered.map((e) => (
          <Card key={e.id} className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2">
                  <Truck className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{e.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.type}
                    {e.serialNumber && ` • S/N: ${e.serialNumber}`}
                    {e.currentLocation && ` • ${e.currentLocation}`}
                    {e.currentProject && ` • ${e.currentProject.title}`}
                  </p>
                </div>
              </div>
              <select
                value={e.status}
                onChange={(ev) => updateStatus(e.id, ev.target.value)}
                className="rounded-lg border border-border bg-background px-2 py-1 text-xs outline-none"
              >
                {Object.entries(EQUIPMENT_STATUS_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </Card>
        ))}
        {filtered.length === 0 && (
          <Card className="p-8 text-center">
            <p className="text-sm text-muted-foreground">Техніки не знайдено</p>
          </Card>
        )}
      </div>
    </div>
  );
}
