"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

type ClientOption = { id: string; name: string; email: string };
type ManagerOption = { id: string; name: string };

export default function NewProjectPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    address: "",
    clientId: "",
    managerId: "",
    totalBudget: "",
    startDate: "",
    expectedEndDate: "",
  });

  useEffect(() => {
    async function loadUsers() {
      try {
        setLoadingUsers(true);
        setError(null);

        const [clientsRes, managersRes] = await Promise.all([
          fetch("/api/admin/users?role=CLIENT"),
          fetch("/api/admin/users?role=MANAGER,SUPER_ADMIN"),
        ]);

        if (!clientsRes.ok || !managersRes.ok) {
          throw new Error("Не вдалося завантажити список користувачів");
        }

        const clientsData = await clientsRes.json();
        const managersData = await managersRes.json();

        setClients(clientsData.data || []);
        setManagers(managersData.data || []);
      } catch (err) {
        console.error("Error loading users:", err);
        setError(err instanceof Error ? err.message : "Помилка завантаження");
      } finally {
        setLoadingUsers(false);
      }
    }

    loadUsers();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/admin/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          totalBudget: form.totalBudget ? parseFloat(form.totalBudget) : 0,
        }),
      });

      if (res.ok) {
        const { data } = await res.json();
        router.push(`/admin/projects/${data.id}`);
      }
    } finally {
      setLoading(false);
    }
  }

  function updateField(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="max-w-2xl">
      <Link
        href="/admin/projects"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Назад до проєктів
      </Link>

      <h1 className="mb-6 text-2xl font-bold">Новий проєкт</h1>

      {error && (
        <div className="mb-4 rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {loadingUsers && (
        <div className="mb-4 rounded-lg bg-muted p-4 text-sm text-muted-foreground">
          Завантаження списку користувачів...
        </div>
      )}

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Назва проєкту <span className="text-destructive">*</span>
            </label>
            <input
              value={form.title}
              onChange={(e) => updateField("title", e.target.value)}
              required
              placeholder="Будинок на Липовій, 15"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Опис</label>
            <textarea
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
              rows={3}
              placeholder="Детальний опис проєкту..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Адреса</label>
            <input
              value={form.address}
              onChange={(e) => updateField("address", e.target.value)}
              placeholder="м. Київ, вул. Липова, 15"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Клієнт <span className="text-destructive">*</span>
              </label>
              <select
                value={form.clientId}
                onChange={(e) => updateField("clientId", e.target.value)}
                required
                disabled={loadingUsers}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">
                  {loadingUsers ? "Завантаження..." : clients.length === 0 ? "Немає клієнтів" : "Оберіть клієнта"}
                </option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.email})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Менеджер</label>
              <select
                value={form.managerId}
                onChange={(e) => updateField("managerId", e.target.value)}
                disabled={loadingUsers}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">
                  {loadingUsers ? "Завантаження..." : managers.length === 0 ? "Немає менеджерів" : "Оберіть менеджера"}
                </option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Бюджет (₴)</label>
            <input
              type="number"
              value={form.totalBudget}
              onChange={(e) => updateField("totalBudget", e.target.value)}
              placeholder="0"
              min="0"
              step="0.01"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Дата початку</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => updateField("startDate", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Планове завершення
              </label>
              <input
                type="date"
                value={form.expectedEndDate}
                onChange={(e) => updateField("expectedEndDate", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Link href="/admin/projects">
              <Button type="button" variant="outline">
                Скасувати
              </Button>
            </Link>
            <Button type="submit" disabled={loading}>
              {loading ? "Створення..." : "Створити проєкт"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
