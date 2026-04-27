"use client";

import { useState, useEffect } from "react";
import { Plus, HardHat, Search, Phone, Loader2, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type Worker = {
  id: string;
  name: string;
  phone: string | null;
  specialty: string;
  dailyRate: number;
  isActive: boolean;
  crewAssignments: Array<{ project: { title: string } }>;
};

export default function AdminV2WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", specialty: "", dailyRate: "" });
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/resources/workers")
      .then((r) => r.json())
      .then((d) => setWorkers(d.data || []))
      .catch(() => setError("Не вдалось завантажити"))
      .finally(() => setFetching(false));
  }, []);

  const filtered = workers.filter(
    (w) =>
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      w.specialty.toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = workers.filter((w) => w.isActive).length;
  const onProjectCount = workers.filter((w) => w.crewAssignments.length > 0).length;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
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
      if (!res.ok) throw new Error("Помилка створення");
      const { data } = await res.json();
      setWorkers((prev) => [...prev, { ...data, crewAssignments: [] }]);
      setShowForm(false);
      setForm({ name: "", phone: "", specialty: "", dailyRate: "" });
    } catch (err: any) {
      setError(err?.message || "Помилка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
            РЕСУРСИ
          </span>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight" style={{ color: T.textPrimary }}>
            Бригади
          </h1>
          <p className="text-[15px]" style={{ color: T.textSecondary }}>
            {workers.length} працівників · {activeCount} активних · {onProjectCount} на обʼєкті
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white transition hover:brightness-95"
          style={{ backgroundColor: T.accentPrimary }}
        >
          <Plus size={16} /> Додати працівника
        </button>
      </section>

      {showForm && (
        <div
          className="rounded-2xl p-6"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderAccent}` }}
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-bold" style={{ color: T.textPrimary }}>
              Новий працівник
            </h3>
            <button onClick={() => setShowForm(false)}>
              <X size={16} style={{ color: T.textMuted }} />
            </button>
          </div>
          <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-2">
            <FormInput label="Імʼя" required value={form.name} onChange={(v) => setForm((p) => ({ ...p, name: v }))} />
            <FormInput label="Телефон" value={form.phone} onChange={(v) => setForm((p) => ({ ...p, phone: v }))} />
            <FormInput
              label="Спеціальність"
              required
              value={form.specialty}
              onChange={(v) => setForm((p) => ({ ...p, specialty: v }))}
            />
            <FormInput
              label="Денна ставка, ₴"
              type="number"
              required
              value={form.dailyRate}
              onChange={(v) => setForm((p) => ({ ...p, dailyRate: v }))}
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
          placeholder="Пошук працівників…"
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
            <HardHat size={28} style={{ color: T.accentPrimary }} />
            <span className="text-[14px] font-semibold" style={{ color: T.textPrimary }}>
              {search ? "Нічого не знайдено" : "Працівників немає"}
            </span>
          </div>
        ) : (
          filtered.map((w, idx) => {
            const currentProject = w.crewAssignments[0]?.project;
            return (
              <div
                key={w.id}
                className={`premium-card flex items-start justify-between gap-3 rounded-2xl p-4 ${idx < 20 ? "data-table-row-enter" : ""}`}
                style={{
                  backgroundColor: T.panel,
                  border: `1px solid ${T.borderSoft}`,
                  ...(idx < 20 ? { animationDelay: `${idx * 30}ms` } : {}),
                }}
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
                    style={{ backgroundColor: T.accentPrimarySoft }}
                  >
                    <HardHat size={18} style={{ color: T.accentPrimary }} />
                  </div>
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[14px] font-semibold truncate" style={{ color: T.textPrimary }}>
                        {w.name}
                      </span>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
                      >
                        {w.specialty}
                      </span>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{
                          backgroundColor: w.isActive ? T.successSoft : T.panelElevated,
                          color: w.isActive ? T.success : T.textMuted,
                        }}
                      >
                        {w.isActive ? "Активний" : "Неактивний"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px]" style={{ color: T.textMuted }}>
                      {w.phone && (
                        <span className="flex items-center gap-1">
                          <Phone size={11} /> {w.phone}
                        </span>
                      )}
                      {currentProject && (
                        <span>
                          На обʼєкті: <span style={{ color: T.textSecondary }}>{currentProject.title}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-0 flex-shrink-0">
                  <span className="text-[14px] font-bold" style={{ color: T.textPrimary }}>
                    {formatCurrency(Number(w.dailyRate))}
                  </span>
                  <span className="text-[10px]" style={{ color: T.textMuted }}>
                    /день
                  </span>
                </div>
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
  type = "text",
  value,
  onChange,
  required,
}: {
  label: string;
  type?: string;
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
        type={type}
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
