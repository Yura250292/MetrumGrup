"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Search, Eye, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "SUPER_ADMIN", label: "Адмін" },
  { value: "MANAGER", label: "Менеджер" },
  { value: "ENGINEER", label: "Інженер" },
  { value: "FINANCIER", label: "Фінансист" },
  { value: "HR", label: "HR" },
  { value: "USER", label: "Користувач" },
  { value: "CLIENT", label: "Клієнт" },
];

type PickerUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string | null;
};

type Config = { roles: string[]; userIds: string[] };

export function ChatOversightSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [roles, setRoles] = useState<string[]>([]);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [users, setUsers] = useState<PickerUser[] | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setLoading(true);
    Promise.all([
      fetch("/api/admin/chat/oversight").then((r) => r.json()),
      fetch("/api/admin/users").then((r) => r.json()),
    ])
      .then(([cfgRes, usersRes]) => {
        const cfg: Config = cfgRes.config ?? { roles: [], userIds: [] };
        setRoles(cfg.roles);
        setUserIds(cfg.userIds);
        setUsers(
          (usersRes.data ?? []).map((u: PickerUser & { isActive?: boolean }) => u)
            .filter((u: PickerUser & { isActive?: boolean }) => u.isActive !== false),
        );
      })
      .catch(() => setError("Не вдалося завантажити налаштування"))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onOpenChange]);

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    const q = query.trim().toLowerCase();
    const list = q
      ? users.filter(
          (u) =>
            u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
        )
      : users;
    return [...list].sort((a, b) => {
      const aPicked = userIds.includes(a.id) ? 0 : 1;
      const bPicked = userIds.includes(b.id) ? 0 : 1;
      if (aPicked !== bPicked) return aPicked - bPicked;
      return a.name.localeCompare(b.name);
    });
  }, [users, query, userIds]);

  const toggleRole = (role: string) => {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  };

  const toggleUser = (id: string) => {
    setUserIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/chat/oversight", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roles, userIds }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Не вдалося зберегти");
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-lg rounded-xl shadow-xl flex flex-col max-h-[90vh]"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between border-b px-4 py-3 flex-shrink-0"
          style={{ borderColor: T.borderSoft }}
        >
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4" style={{ color: T.accentPrimary }} />
            <h3 className="text-sm font-bold" style={{ color: T.textPrimary }}>
              Доступ до всіх чатів
            </h3>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-lg p-1 transition active:scale-95"
            style={{ color: T.textMuted }}
            aria-label="Закрити"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto scrollbar-thin flex-1">
          <p className="px-4 pt-3 pb-1 text-xs" style={{ color: T.textMuted }}>
            Користувачі з оглядовим доступом бачать усі розмови — навіть ті, де вони не учасники.
          </p>

          <div className="px-4 pt-3">
            <p className="text-[10px] font-bold tracking-wider mb-2" style={{ color: T.textMuted }}>
              ДОСТУП ЗА РОЛЛЮ
            </p>
            <div className="flex flex-wrap gap-1.5">
              {ROLE_OPTIONS.map((opt) => {
                const active = roles.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    onClick={() => toggleRole(opt.value)}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition"
                    style={{
                      backgroundColor: active ? T.accentPrimarySoft : T.panelElevated,
                      color: active ? T.accentPrimary : T.textSecondary,
                      border: `1px solid ${active ? T.accentPrimary : T.borderSoft}`,
                    }}
                  >
                    {active && <Check className="h-3 w-3" />}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="px-4 pt-4 pb-3">
            <p className="text-[10px] font-bold tracking-wider mb-2" style={{ color: T.textMuted }}>
              ДОСТУП КОНКРЕТНИМ КОРИСТУВАЧАМ
            </p>
            <div
              className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 mb-2"
              style={{ backgroundColor: T.panelElevated, border: `1px solid ${T.borderSoft}` }}
            >
              <Search className="h-4 w-4 flex-shrink-0" style={{ color: T.textMuted }} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Пошук імені або email"
                className="w-full bg-transparent text-sm outline-none"
                style={{ color: T.textPrimary }}
              />
            </div>

            {loading && (
              <p className="py-3 text-sm" style={{ color: T.textMuted }}>
                Завантаження…
              </p>
            )}

            {!loading && filteredUsers.length === 0 && (
              <p className="py-3 text-sm" style={{ color: T.textMuted }}>
                Нікого не знайдено
              </p>
            )}

            {!loading && filteredUsers.length > 0 && (
              <ul className="space-y-1">
                {filteredUsers.map((u) => {
                  const active = userIds.includes(u.id);
                  return (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => toggleUser(u.id)}
                        className="w-full flex items-center gap-3 rounded-lg px-2 py-2 text-left transition"
                        style={{
                          backgroundColor: active ? T.accentPrimarySoft : "transparent",
                          border: `1px solid ${active ? T.accentPrimary : "transparent"}`,
                        }}
                      >
                        <UserAvatar src={u.avatar ?? null} name={u.name} size={32} nonInteractive />
                        <div className="min-w-0 flex-1">
                          <p
                            className="truncate text-sm font-medium"
                            style={{ color: T.textPrimary }}
                          >
                            {u.name}
                          </p>
                          <p className="truncate text-xs" style={{ color: T.textMuted }}>
                            {u.email} · {u.role}
                          </p>
                        </div>
                        {active && <Check className="h-4 w-4" style={{ color: T.accentPrimary }} />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {error && (
          <div
            className="mx-4 mb-2 rounded-lg px-3 py-2 text-xs"
            style={{
              backgroundColor: T.dangerSoft,
              color: T.danger,
              border: `1px solid ${T.danger}`,
            }}
          >
            {error}
          </div>
        )}

        <div
          className="flex justify-end gap-2 border-t px-4 py-3 flex-shrink-0"
          style={{ borderColor: T.borderSoft }}
        >
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Скасувати
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? "Зберігаємо…" : "Зберегти"}
          </Button>
        </div>
      </div>
    </div>
  );
}
