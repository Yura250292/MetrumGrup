"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { Plus, HardHat, Search, Phone } from "lucide-react";

type Worker = {
  id: string;
  name: string;
  phone: string | null;
  specialty: string;
  dailyRate: number;
  isActive: boolean;
  crewAssignments: Array<{ project: { title: string } }>;
};

export default function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", specialty: "", dailyRate: "" });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/admin/resources/workers")
      .then((r) => r.json())
      .then((d) => setWorkers(d.data || []));
  }, []);

  const filtered = workers.filter(
    (w) =>
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      w.specialty.toLowerCase().includes(search.toLowerCase())
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/admin/resources/workers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          dailyRate: parseFloat(form.dailyRate) || 0,
          phone: form.phone || null,
        }),
      });
      if (res.ok) {
        const { data } = await res.json();
        setWorkers((prev) => [...prev, { ...data, crewAssignments: [] }]);
        setShowForm(false);
        setForm({ name: "", phone: "", specialty: "", dailyRate: "" });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Бригади та працівники</h1>
          <p className="mt-1 text-sm text-muted-foreground">{workers.length} працівників</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="w-full md:w-auto">
          <Plus className="h-4 w-4" />
          Додати
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6 p-5">
          <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-2">
            <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Ім'я *" required className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            <input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="Телефон" className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            <input value={form.specialty} onChange={(e) => setForm((p) => ({ ...p, specialty: e.target.value }))} placeholder="Спеціальність *" required className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            <input type="number" step="0.01" value={form.dailyRate} onChange={(e) => setForm((p) => ({ ...p, dailyRate: e.target.value }))} placeholder="Денна ставка, ₴ *" required className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            <div className="sm:col-span-2 flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Скасувати</Button>
              <Button type="submit" disabled={loading}>{loading ? "Додавання..." : "Додати"}</Button>
            </div>
          </form>
        </Card>
      )}

      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Пошук працівників..." className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm outline-none focus:border-primary" />
      </div>

      <div className="space-y-2">
        {filtered.map((w) => {
          const currentProject = w.crewAssignments[0]?.project;
          return (
            <Card key={w.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <HardHat className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{w.name}</p>
                      <Badge variant="secondary">{w.specialty}</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {w.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {w.phone}
                        </span>
                      )}
                      <span>{formatCurrency(Number(w.dailyRate))}/день</span>
                      {currentProject && (
                        <span className="text-primary">{currentProject.title}</span>
                      )}
                    </div>
                  </div>
                </div>
                <Badge variant={w.isActive ? "success" : "secondary"}>
                  {w.isActive ? (currentProject ? "На об'єкті" : "Вільний") : "Неактивний"}
                </Badge>
              </div>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <Card className="p-8 text-center">
            <p className="text-sm text-muted-foreground">Працівників не знайдено</p>
          </Card>
        )}
      </div>
    </div>
  );
}
