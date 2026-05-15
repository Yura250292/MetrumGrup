"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  ChevronRight,
  Loader2,
  Plus,
  Search,
  Users,
  UsersRound,
  X,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { DepartmentDetail } from "./department-detail";

export type DepartmentRow = {
  id: string;
  name: string;
  description: string | null;
  head: { id: string; name: string } | null;
  _count: { employees: number; teams: number };
};

export function DepartmentsPanel({ canEdit }: { canEdit: boolean }) {
  const [items, setItems] = useState<DepartmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [savingNew, setSavingNew] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/hr/departments", { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error ?? `HTTP ${res.status}`);
        setItems([]);
        return;
      }
      setItems(j.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (d) =>
        d.name.toLowerCase().includes(needle) ||
        (d.head?.name.toLowerCase().includes(needle) ?? false) ||
        (d.description?.toLowerCase().includes(needle) ?? false),
    );
  }, [items, search]);

  async function createDepartment() {
    const name = newName.trim();
    if (!name) return;
    setSavingNew(true);
    try {
      const res = await fetch("/api/admin/hr/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error ?? "Не вдалось створити підрозділ");
        return;
      }
      setNewName("");
      setCreating(false);
      await load();
      if (j.data?.id) setOpenId(j.data.id);
    } finally {
      setSavingNew(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div
        className="flex flex-wrap items-center gap-2 rounded-2xl p-3"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <div className="relative flex-1 min-w-[220px]">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: T.textMuted }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Пошук — назва / керівник…"
            className="w-full rounded-xl pl-9 pr-3 py-2 text-sm outline-none"
            style={{
              backgroundColor: T.panelSoft,
              border: `1px solid ${T.borderSoft}`,
              color: T.textPrimary,
            }}
          />
        </div>
        {canEdit && !creating && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold"
            style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
          >
            <Plus size={13} /> Додати підрозділ
          </button>
        )}
      </div>

      {creating && (
        <div
          className="flex items-center gap-2 rounded-2xl p-3"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
        >
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void createDepartment();
              if (e.key === "Escape") {
                setCreating(false);
                setNewName("");
              }
            }}
            placeholder="Назва нового підрозділу…"
            className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
            style={{
              backgroundColor: T.panelSoft,
              border: `1px solid ${T.borderStrong}`,
              color: T.textPrimary,
            }}
          />
          <button
            onClick={() => void createDepartment()}
            disabled={savingNew || !newName.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: T.accentPrimary }}
          >
            {savingNew ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Створити
          </button>
          <button
            onClick={() => {
              setCreating(false);
              setNewName("");
            }}
            className="rounded-lg p-2 hover:bg-black/5"
            aria-label="Скасувати"
          >
            <X size={15} style={{ color: T.textMuted }} />
          </button>
        </div>
      )}

      {error && (
        <div
          className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
          style={{
            backgroundColor: T.dangerSoft,
            color: T.danger,
            border: `1px solid ${T.danger}40`,
          }}
        >
          ⚠ {error}
          <button
            onClick={() => void load()}
            className="ml-auto rounded-md px-2 py-1 text-[11px] font-semibold"
            style={{ backgroundColor: T.danger, color: "#fff" }}
          >
            Спробувати ще
          </button>
        </div>
      )}

      {loading && (
        <div
          className="flex items-center justify-center gap-2 py-12 text-sm"
          style={{ color: T.textMuted }}
        >
          <Loader2 size={16} className="animate-spin" /> Завантажуємо…
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div
          className="rounded-2xl px-4 py-12 text-center text-sm"
          style={{
            backgroundColor: T.panel,
            border: `1px solid ${T.borderStrong}`,
            color: T.textMuted,
          }}
        >
          {search.trim()
            ? "Нічого не знайдено за пошуком."
            : "Підрозділів ще немає. Додайте перший через кнопку «Додати підрозділ»."}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div
          className="overflow-hidden rounded-2xl"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
        >
          {filtered.map((d, i) => (
            <button
              key={d.id}
              onClick={() => setOpenId(d.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-black/[0.02]"
              style={{ borderTop: i === 0 ? "none" : `1px solid ${T.borderSoft}` }}
            >
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: T.panelSoft }}
              >
                <Building2 size={16} style={{ color: T.accentPrimary }} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold" style={{ color: T.textPrimary }}>
                  {d.name}
                </div>
                <div className="truncate text-[11px]" style={{ color: T.textMuted }}>
                  {d.head ? `Керівник: ${d.head.name}` : "Керівник не призначений"}
                </div>
              </div>
              <span
                className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold"
                style={{ backgroundColor: T.panelSoft, color: T.textSecondary }}
              >
                <Users size={11} /> {d._count.employees}
              </span>
              <span
                className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold"
                style={{ backgroundColor: T.panelSoft, color: T.textSecondary }}
              >
                <UsersRound size={11} /> {d._count.teams}
              </span>
              <ChevronRight size={16} style={{ color: T.textMuted }} />
            </button>
          ))}
        </div>
      )}

      {openId && (
        <DepartmentDetail
          departmentId={openId}
          canEdit={canEdit}
          onClose={() => setOpenId(null)}
          onChanged={() => void load()}
        />
      )}
    </div>
  );
}
