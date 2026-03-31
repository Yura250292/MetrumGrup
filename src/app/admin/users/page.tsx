"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Shield, Users as UsersIcon, User, Wrench, Calculator, Edit2 } from "lucide-react";

type UserRecord = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
  _count?: {
    createdEstimates: number;
    engineerReviews: number;
    financeReviews: number;
    clientProjects: number;
  };
};

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Адміністратор",
  MANAGER: "Менеджер",
  ENGINEER: "Інженер",
  FINANCIER: "Фінансист",
  USER: "Користувач",
  CLIENT: "Клієнт",
};

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: "bg-purple-100 text-purple-700",
  MANAGER: "bg-blue-100 text-blue-700",
  ENGINEER: "bg-green-100 text-green-700",
  FINANCIER: "bg-orange-100 text-orange-700",
  USER: "bg-slate-100 text-slate-700",
  CLIENT: "bg-gray-100 text-gray-700",
};

const ROLE_ICONS: Record<string, typeof Shield> = {
  SUPER_ADMIN: Shield,
  MANAGER: UsersIcon,
  ENGINEER: Wrench,
  FINANCIER: Calculator,
  USER: User,
  CLIENT: User,
};

export default function UsersPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", role: "MANAGER" });
  const [loading, setLoading] = useState(false);
  const [editingRole, setEditingRole] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((d) => setUsers(d.data || []));
  }, []);

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const { data } = await res.json();
        setUsers((prev) => [{ ...data, isActive: true, createdAt: new Date().toISOString(), phone: form.phone || null }, ...prev]);
        setShowForm(false);
        setForm({ name: "", email: "", phone: "", password: "", role: "MANAGER" });
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleRoleChange(userId: string, newRole: string) {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });

      if (res.ok) {
        const { data } = await res.json();
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, role: data.role } : u))
        );
        setEditingRole(null);
      } else {
        const error = await res.json();
        alert(error.error || "Помилка зміни ролі");
      }
    } catch (error) {
      console.error("Error changing role:", error);
      alert("Помилка зміни ролі");
    }
  }

  async function toggleUserStatus(userId: string, currentStatus: boolean) {
    const newStatus = !currentStatus;
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: newStatus }),
      });

      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, isActive: newStatus } : u))
        );
      }
    } catch (error) {
      console.error("Error toggling status:", error);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Користувачі</h1>
          <p className="mt-1 text-sm text-muted-foreground">{users.length} користувачів</p>
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
            <input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} type="email" placeholder="Email *" required className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            <input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="Телефон" className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            <input value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} type="password" placeholder="Пароль" className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            <select value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))} className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary">
              <option value="SUPER_ADMIN">Адміністратор</option>
              <option value="MANAGER">Менеджер</option>
              <option value="ENGINEER">Інженер</option>
              <option value="FINANCIER">Фінансист</option>
              <option value="USER">Користувач</option>
              <option value="CLIENT">Клієнт</option>
            </select>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Скасувати</Button>
              <Button type="submit" disabled={loading}>{loading ? "Створення..." : "Створити"}</Button>
            </div>
          </form>
        </Card>
      )}

      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Пошук..." className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm outline-none focus:border-primary" />
      </div>

      <div className="space-y-2">
        {filtered.map((u) => {
          const Icon = ROLE_ICONS[u.role] || User;
          const isEditingThisRole = editingRole === u.id;
          return (
            <Card key={u.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary flex-shrink-0">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">{u.name}</p>
                    <p className="text-xs text-muted-foreground">{u.email}{u.phone && ` • ${u.phone}`}</p>
                    {u._count && (
                      <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                        {u._count.createdEstimates > 0 && (
                          <span>📝 {u._count.createdEstimates} створено</span>
                        )}
                        {u._count.engineerReviews > 0 && (
                          <span>✅ {u._count.engineerReviews} перевірено (інженер)</span>
                        )}
                        {u._count.financeReviews > 0 && (
                          <span>💰 {u._count.financeReviews} перевірено (фінансист)</span>
                        )}
                        {u._count.clientProjects > 0 && (
                          <span>🏗️ {u._count.clientProjects} проєктів</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isEditingThisRole ? (
                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      onBlur={() => setEditingRole(null)}
                      autoFocus
                      className="rounded-lg border border-primary bg-background px-2 py-1 text-xs font-medium"
                    >
                      <option value="SUPER_ADMIN">Адміністратор</option>
                      <option value="MANAGER">Менеджер</option>
                      <option value="ENGINEER">Інженер</option>
                      <option value="FINANCIER">Фінансист</option>
                      <option value="USER">Користувач</option>
                      <option value="CLIENT">Клієнт</option>
                    </select>
                  ) : (
                    <button
                      onClick={() => setEditingRole(u.id)}
                      className="group relative"
                    >
                      <Badge className={ROLE_COLORS[u.role]}>
                        {ROLE_LABELS[u.role]}
                      </Badge>
                      <Edit2 className="absolute -right-1 -top-1 h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded-full p-0.5" />
                    </button>
                  )}
                  <button
                    onClick={() => toggleUserStatus(u.id, u.isActive)}
                    className="cursor-pointer"
                  >
                    <Badge variant={u.isActive ? "success" : "secondary"}>
                      {u.isActive ? "Активний" : "Неактивний"}
                    </Badge>
                  </button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
