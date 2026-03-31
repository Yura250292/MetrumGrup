"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Mail, Phone } from "lucide-react";

type Client = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
};

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/admin/users?role=CLIENT")
      .then((r) => r.json())
      .then((d) => setClients(d.data || []));
  }, []);

  const filtered = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase())
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, role: "CLIENT" }),
      });
      if (res.ok) {
        const { data } = await res.json();
        setClients((prev) => [{ ...data, isActive: true, createdAt: new Date().toISOString(), phone: form.phone || null }, ...prev]);
        setShowForm(false);
        setForm({ name: "", email: "", phone: "", password: "" });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Клієнти</h1>
          <p className="mt-1 text-sm text-muted-foreground">{clients.length} клієнтів</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="w-full md:w-auto">
          <Plus className="h-4 w-4" />
          Додати клієнта
        </Button>
      </div>

      {/* Create form */}
      {showForm && (
        <Card className="mb-6 p-5">
          <h3 className="mb-4 font-semibold">Новий клієнт</h3>
          <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-2">
            <input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Ім'я"
              required
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <input
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              type="email"
              placeholder="Email"
              required
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <input
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              placeholder="Телефон"
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <input
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              type="password"
              placeholder="Пароль (за замовч. password123)"
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <div className="sm:col-span-2 flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                Скасувати
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Створення..." : "Створити"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Search */}
      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Пошук клієнтів..."
          className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm outline-none focus:border-primary"
        />
      </div>

      {/* List */}
      <div className="space-y-2">
        {filtered.map((client) => (
          <Card key={client.id} className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-medium">
                  {client.name.charAt(0)}
                </div>
                <div>
                  <p className="font-medium">{client.name}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Mail className="h-3 w-3" /> {client.email}
                    </span>
                    {client.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {client.phone}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <Badge variant={client.isActive ? "success" : "secondary"}>
                {client.isActive ? "Активний" : "Неактивний"}
              </Badge>
            </div>
          </Card>
        ))}
        {filtered.length === 0 && (
          <Card className="p-8 text-center">
            <p className="text-sm text-muted-foreground">Клієнтів не знайдено</p>
          </Card>
        )}
      </div>
    </div>
  );
}
