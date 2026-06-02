"use client";
/** Вкладка «Зарплата» — KPI + офіційна частина/реквізити + історія змін. */
import { useMemo, useState } from "react";
import { Loader2, Plus, Trash2, X, Check } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { P } from "./profile-tokens";
import { Divider, KpiCard, SectionTitle } from "./field";
import {
  type SalaryPeriod,
  type PayrollPeriod,
  formatDate,
} from "./types";

const MONTHS = ["січ","лют","бер","квіт","трав","черв","лип","серп","вер","жовт","лист","груд"];
function periodLabel(p: string): string {
  const [y, m] = p.split("-");
  const mi = Number(m) - 1;
  return mi < 0 || mi > 11 ? p : `${MONTHS[mi]} ${y}`;
}
function periodMs(p: string): number {
  const [y, m] = p.split("-").map(Number);
  return new Date(y, (m || 1) - 1, 1).getTime();
}
function num(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

/** Рядок key-value у блоках «Офіційна частина» / «Реквізити». */
function Kv({
  label,
  value,
  accent,
  strong,
  last,
}: {
  label: string;
  value: React.ReactNode;
  accent?: boolean;
  strong?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between py-[5px] text-[13px]"
      style={{ borderBottom: last ? "none" : `0.5px solid ${P.border}` }}
    >
      <span style={{ color: strong ? P.text : P.label, fontWeight: strong ? 500 : 400 }}>{label}</span>
      <span
        className="tabular-nums"
        style={{ color: accent ? P.blue : P.text, fontWeight: accent ? 500 : 400 }}
      >
        {value}
      </span>
    </div>
  );
}

export function SalaryTab({
  employeeId,
  salaries,
  payrollPeriods,
  canEdit,
  onChanged,
}: {
  employeeId: string;
  salaries: SalaryPeriod[];
  payrollPeriods: PayrollPeriod[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const active = useMemo(() => {
    const now = Date.now();
    return (
      [...salaries]
        .sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime())
        .find((s) =>
          s.effectiveTo
            ? new Date(s.effectiveTo).getTime() >= now
            : new Date(s.effectiveFrom).getTime() <= now,
        ) ?? salaries[0] ?? null
    );
  }, [salaries]);

  const latestPayroll = useMemo(
    () => (payrollPeriods.length ? [...payrollPeriods].sort((a, b) => (a.period < b.period ? 1 : -1))[0] : null),
    [payrollPeriods],
  );

  const base = active ? Number(active.baseSalary) : 0;
  const coef = active ? Number(active.coefficient ?? 0) : 0;
  const onHand = base + coef;

  const off = latestPayroll
    ? {
        gross: num(latestPayroll.officialPart),
        pdfo: num(latestPayroll.pdfo),
        vz: num(latestPayroll.vz),
        esv: num(latestPayroll.esv),
        onCard: num(latestPayroll.salaryToCard),
        total: num(latestPayroll.totalSum),
      }
    : null;

  const money = (v: number | null) => (v != null ? formatCurrency(v) : "—");

  // --- історія + додавання ---
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    baseSalary: "",
    officialPart: "",
    coefficient: "0",
    description: "",
    effectiveFrom: new Date().toISOString().slice(0, 10),
    effectiveTo: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const b = Number(form.baseSalary);
    if (!Number.isFinite(b) || b < 0) {
      setError("Оклад обовʼязковий і не може бути від'ємним");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/hr/employees/${employeeId}/salaries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseSalary: b,
          officialPart: form.officialPart === "" ? null : Number(form.officialPart),
          coefficient: form.coefficient === "" ? 0 : Number(form.coefficient),
          description: form.description.trim() || null,
          effectiveFrom: form.effectiveFrom,
          effectiveTo: form.effectiveTo || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "Помилка");
        return;
      }
      setCreating(false);
      setForm({ baseSalary: "", officialPart: "", coefficient: "0", description: "", effectiveFrom: new Date().toISOString().slice(0, 10), effectiveTo: "" });
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Видалити цей запис ЗП?")) return;
    const res = await fetch(`/api/admin/hr/employees/${employeeId}/salaries/${id}`, { method: "DELETE" });
    if (res.ok) onChanged();
    else {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Помилка видалення");
    }
  }

  type Row =
    | { kind: "manual"; ms: number; s: SalaryPeriod }
    | { kind: "payroll"; ms: number; p: PayrollPeriod };
  const rows: Row[] = [
    ...salaries.map((s): Row => ({ kind: "manual", ms: new Date(s.effectiveFrom).getTime(), s })),
    ...payrollPeriods.map((p): Row => ({ kind: "payroll", ms: periodMs(p.period), p })),
  ].sort((a, b) => b.ms - a.ms);

  const inputCls = "rounded-[5px] border-[0.5px] bg-white px-2 py-1 text-[12px] outline-none focus:border-[#185FA5] focus:shadow-[0_0_0_2px_#E6F1FB]";
  const inputStyle = { borderColor: P.border2, color: P.text } as React.CSSProperties;
  const th = "whitespace-nowrap px-2 py-1.5 text-left font-medium text-[12px]";

  return (
    <div>
      {/* KPI */}
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
        <KpiCard label="На руки" value={active ? formatCurrency(onHand) : "—"} accent />
        <KpiCard label="Оклад" value={active ? formatCurrency(base) : "—"} />
        <KpiCard label="Премія" value={active ? (coef === 0 ? "—" : formatCurrency(coef)) : "—"} />
        <KpiCard label="Офіційно разом" value={money(off?.total ?? null)} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
        <div>
          <SectionTitle>
            Офіційна частина
            {latestPayroll && (
              <span className="ml-2 normal-case" style={{ color: P.label, letterSpacing: 0 }}>
                {periodLabel(latestPayroll.period)}
              </span>
            )}
          </SectionTitle>
          <Kv label="Офіційна зарплата" value={money(off?.gross ?? null)} />
          <Kv label="ПДФО" value={money(off?.pdfo ?? null)} />
          <Kv label="ВЗ" value={money(off?.vz ?? null)} />
          <Kv label="ЄСВ" value={money(off?.esv ?? null)} />
          <Kv label="На картку" value={money(off?.onCard ?? null)} />
          <Kv label="Офіційно разом" value={money(off?.total ?? null)} accent strong last />
          {!latestPayroll && (
            <p className="mt-2 text-[11px]" style={{ color: P.label }}>
              Немає даних з 1С (імпортується разом зі штатним розкладом).
            </p>
          )}
        </div>
        <div>
          <SectionTitle>Реквізити виплати</SectionTitle>
          <Kv label="Банк" value={<span style={{ color: P.label }}>—</span>} />
          <Kv label="Картка" value={<span style={{ color: P.label }}>—</span>} />
          <Kv label="IBAN" value={<span style={{ color: P.label }}>—</span>} last />
          <p className="mt-2 text-[11px]" style={{ color: P.label }}>
            Реквізити ще не ведуться в системі.
          </p>
        </div>
      </div>

      <Divider />

      {/* Історія */}
      <div className="flex items-center gap-2">
        <SectionTitle style={{ marginBottom: 0 }}>Історія змін зарплати</SectionTitle>
        <div className="flex-1" />
        {canEdit && !creating && (
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1 rounded-[5px] px-2.5 py-1 text-[12px] font-medium text-white"
            style={{ background: P.blue }}
          >
            <Plus size={13} /> Додати період
          </button>
        )}
      </div>

      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Період", "Оклад", "Премія", "Оф. ЗП", "На картку", "Підстава", canEdit ? "" : ""].map((h, i) => (
                <th key={i} className={th} style={{ color: P.text2, borderBottom: `0.5px solid ${P.border}` }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {creating && (
              <>
                <tr style={{ background: P.blueLt }}>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1 text-[11px]">
                      <input type="date" value={form.effectiveFrom} onChange={(e) => setForm((p) => ({ ...p, effectiveFrom: e.target.value }))} className={inputCls} style={inputStyle} />
                      <span style={{ color: P.label }}>—</span>
                      <input type="date" value={form.effectiveTo} onChange={(e) => setForm((p) => ({ ...p, effectiveTo: e.target.value }))} className={inputCls} style={inputStyle} />
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <input autoFocus type="number" value={form.baseSalary} placeholder="Оклад *" onChange={(e) => setForm((p) => ({ ...p, baseSalary: e.target.value }))} className={`${inputCls} w-24 text-right`} style={inputStyle} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="number" value={form.coefficient} onChange={(e) => setForm((p) => ({ ...p, coefficient: e.target.value }))} className={`${inputCls} w-20 text-right`} style={inputStyle} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="number" value={form.officialPart} placeholder="—" onChange={(e) => setForm((p) => ({ ...p, officialPart: e.target.value }))} className={`${inputCls} w-24 text-right`} style={inputStyle} />
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: P.text }}>
                    {form.baseSalary ? formatCurrency(Number(form.baseSalary || 0) + Number(form.coefficient || 0)) : "—"}
                  </td>
                  <td className="px-2 py-1.5">
                    <input value={form.description} placeholder="Підстава" onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} className={`${inputCls} w-full`} style={inputStyle} />
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right">
                    <button onClick={() => { setCreating(false); setError(null); }} disabled={saving} className="rounded p-1 hover:bg-black/5" aria-label="Скасувати">
                      <X size={14} style={{ color: P.text2 }} />
                    </button>
                    <button onClick={submit} disabled={saving} className="rounded p-1 hover:bg-black/5" aria-label="Зберегти">
                      {saving ? <Loader2 size={14} className="animate-spin" style={{ color: P.blue }} /> : <Check size={14} style={{ color: P.activeFg }} />}
                    </button>
                  </td>
                </tr>
                {error && (
                  <tr>
                    <td colSpan={7} className="px-2 py-1.5 text-[12px]" style={{ color: P.dangerFg }}>{error}</td>
                  </tr>
                )}
              </>
            )}
            {rows.map((row, idx) => {
              const last = idx === rows.length - 1;
              const bb = last ? "none" : `0.5px solid ${P.border}`;
              if (row.kind === "payroll") {
                const p = row.p;
                return (
                  <tr key={`pp-${p.id}`} style={{ borderBottom: bb }}>
                    <td className="whitespace-nowrap px-2 py-1.5" style={{ color: P.text }}>
                      {periodLabel(p.period)}
                      <span className="ml-2 text-[10px]" style={{ color: P.label }}>1С · {formatDate(p.createdAt)}</span>
                    </td>
                    <td className="px-2 py-1.5 text-right" style={{ color: P.label }}>—</td>
                    <td className="px-2 py-1.5 text-right" style={{ color: P.label }}>—</td>
                    <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: P.text }}>{money(num(p.officialPart))}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: P.text }}>{money(num(p.salaryToCard))}</td>
                    <td className="px-2 py-1.5" style={{ color: P.text2 }}>{p.sourceFile ? `Імпорт: ${p.sourceFile}` : "Імпорт з 1С"}</td>
                    <td className="px-2 py-1.5 text-right text-[10px]" style={{ color: P.label }}>readonly</td>
                  </tr>
                );
              }
              const s = row.s;
              const total = Number(s.baseSalary) + Number(s.coefficient ?? 0);
              const open = !s.effectiveTo;
              return (
                <tr key={s.id} style={{ borderBottom: bb }}>
                  <td className="whitespace-nowrap px-2 py-1.5" style={{ color: P.text }}>
                    {formatDate(s.effectiveFrom)} — {s.effectiveTo ? formatDate(s.effectiveTo) : "досі"}
                    {open && <span className="ml-2 text-[10px] font-medium" style={{ color: P.activeFg }}>Активний</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: P.text }}>{formatCurrency(Number(s.baseSalary))}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: Number(s.coefficient ?? 0) === 0 ? P.label : P.text }}>
                    {Number(s.coefficient ?? 0) === 0 ? "—" : formatCurrency(Number(s.coefficient))}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: s.officialPart ? P.text : P.label }}>
                    {s.officialPart != null ? formatCurrency(Number(s.officialPart)) : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-medium" style={{ color: P.text }}>{formatCurrency(total)}</td>
                  <td className="px-2 py-1.5" style={{ color: P.text2 }}>{s.description || "—"}</td>
                  <td className="px-2 py-1.5 text-right">
                    {canEdit && (
                      <button onClick={() => remove(s.id)} className="rounded p-1 hover:bg-black/5" aria-label="Видалити">
                        <Trash2 size={13} style={{ color: P.dangerFg }} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!creating && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-2 py-8 text-center text-[13px]" style={{ color: P.text2 }}>
                  Записів про ЗП ще немає. Додайте перший період або імпортуйте з 1С.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
