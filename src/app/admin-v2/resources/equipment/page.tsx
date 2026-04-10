"use client";

import { useState, useEffect } from "react";
import { Plus, Truck, Search, X, Loader2 } from "lucide-react";
import { EQUIPMENT_STATUS_LABELS } from "@/lib/constants";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

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

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  AVAILABLE: { bg: T.successSoft, fg: T.success },
  IN_USE: { bg: T.accentPrimarySoft, fg: T.accentPrimary },
  MAINTENANCE: { bg: T.warningSoft, fg: T.warning },
  DECOMMISSIONED: { bg: T.panelElevated, fg: T.textMuted },
};

export default function AdminV2EquipmentPage() {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", type: "", serialNumber: "", currentLocation: "" });
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/resources/equipment")
      .then((r) => r.json())
      .then((d) => setEquipment(d.data || []))
      .catch(() => setError("Не вдалось завантажити техніку"))
      .finally(() => setFetching(false));
  }, []);

  const filtered = equipment.filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.type.toLowerCase().includes(search.toLowerCase())
  );

  const availableCount = equipment.filter((e) => e.status === "AVAILABLE").length;
  const inUseCount = equipment.filter((e) => e.status === "IN_USE").length;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/resources/equipment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Помилка створення");
      const { data } = await res.json();
      setEquipment((prev) => [...prev, data]);
      setShowForm(false);
      setForm({ name: "", type: "", serialNumber: "", currentLocation: "" });
    } catch (err: any) {
      setError(err?.message || "Помилка");
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
    <div className="flex flex-col gap-8">
      {/* Hero */}
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
            РЕСУРСИ
          </span>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight" style={{ color: T.textPrimary }}>
            Техніка
          </h1>
          <p className="text-[15px]" style={{ color: T.textSecondary }}>
            {equipment.length} одиниць · {availableCount} доступних · {inUseCount} в роботі
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white transition hover:brightness-110"
          style={{ backgroundColor: T.accentPrimary }}
        >
          <Plus size={16} /> Додати техніку
        </button>
      </section>

      {showForm && (
        <div
          className="rounded-2xl p-6"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderAccent}` }}
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-bold" style={{ color: T.textPrimary }}>
              Нова техніка
            </h3>
            <button onClick={() => setShowForm(false)}>
              <X size={16} style={{ color: T.textMuted }} />
            </button>
          </div>
          <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-2">
            <FormInput label="Назва" required value={form.name} onChange={(v) => setForm((p) => ({ ...p, name: v }))} />
            <FormInput label="Тип" required value={form.type} onChange={(v) => setForm((p) => ({ ...p, type: v }))} />
            <FormInput
              label="Серійний номер"
              value={form.serialNumber}
              onChange={(v) => setForm((p) => ({ ...p, serialNumber: v }))}
            />
            <FormInput
              label="Місцезнаходження"
              value={form.currentLocation}
              onChange={(v) => setForm((p) => ({ ...p, currentLocation: v }))}
            />
            {error && (
              <div
                className="sm:col-span-2 rounded-xl px-3 py-2.5 text-xs"
                style={{ backgroundColor: T.dangerSoft, color: T.danger, border: `1px solid ${T.danger}` }}
              >
                {error}
              </div>
            )}
            <div className="sm:col-span-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-xl px-4 py-2.5 text-sm font-medium"
                style={{ color: T.textSecondary }}
              >
                Скасувати
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                style={{ backgroundColor: T.accentPrimary }}
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Додати
              </button>
            </div>
          </form>
        </div>
      )}

      <div
        className="flex items-center gap-2 rounded-xl px-4 py-3"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <Search size={16} style={{ color: T.textMuted }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Пошук техніки…"
          className="flex-1 bg-transparent text-sm outline-none"
          style={{ color: T.textPrimary }}
        />
      </div>

      <section className="flex flex-col gap-2">
        {fetching ? (
          <div
            className="flex items-center justify-center gap-2 rounded-2xl py-12 text-sm"
            style={{ backgroundColor: T.panel, color: T.textMuted, border: `1px solid ${T.borderSoft}` }}
          >
            <Loader2 size={16} className="animate-spin" /> Завантажуємо…
          </div>
        ) : filtered.length === 0 ? (
          <div
            className="flex flex-col items-center gap-3 rounded-2xl py-12 text-center"
            style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
          >
            <Truck size={28} style={{ color: T.accentPrimary }} />
            <span className="text-[14px] font-semibold" style={{ color: T.textPrimary }}>
              {search ? "Нічого не знайдено" : "Техніки немає"}
            </span>
          </div>
        ) : (
          filtered.map((e) => {
            const colors = STATUS_COLORS[e.status] || STATUS_COLORS.AVAILABLE;
            return (
              <div
                key={e.id}
                className="flex items-center justify-between gap-3 rounded-2xl p-4"
                style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
                    style={{ backgroundColor: T.accentPrimarySoft }}
                  >
                    <Truck size={18} style={{ color: T.accentPrimary }} />
                  </div>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-[14px] font-semibold truncate" style={{ color: T.textPrimary }}>
                      {e.name}
                    </span>
                    <span className="text-[11px]" style={{ color: T.textMuted }}>
                      {e.type}
                      {e.serialNumber && ` · S/N: ${e.serialNumber}`}
                      {e.currentLocation && ` · ${e.currentLocation}`}
                      {e.currentProject && ` · ${e.currentProject.title}`}
                    </span>
                  </div>
                </div>
                <select
                  value={e.status}
                  onChange={(ev) => updateStatus(e.id, ev.target.value)}
                  className="rounded-lg px-2 py-1 text-[11px] font-bold outline-none"
                  style={{
                    backgroundColor: colors.bg,
                    border: `1px solid ${colors.fg}`,
                    color: colors.fg,
                  }}
                >
                  {Object.entries(EQUIPMENT_STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}

function FormInput({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
        {label.toUpperCase()}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="rounded-xl px-3.5 py-3 text-sm outline-none"
        style={{
          backgroundColor: T.panelSoft,
          border: `1px solid ${T.borderStrong}`,
          color: T.textPrimary,
        }}
      />
    </label>
  );
}
