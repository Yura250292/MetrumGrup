"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  X,
  Users,
  CheckCircle2,
  AlertCircle,
  Calendar as CalendarIcon,
  Send,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency } from "@/lib/utils";

type PreviewRow = {
  id: string;
  fullName: string;
  position: string | null;
  salaryType: "MONTHLY" | "HOURLY";
  amount: number | null;
  currency: string;
  existing: { id: string; amount: number; status: string } | null;
};

type DraftAmounts = Record<string, string>;
type DraftSelected = Record<string, boolean>;

const MONTH_LABELS = [
  "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
  "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень",
];

export function PayrollModal({
  open,
  folderId,
  onClose,
  onSuccess,
}: {
  open: boolean;
  folderId?: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [selected, setSelected] = useState<DraftSelected>({});
  const [amounts, setAmounts] = useState<DraftAmounts>({});
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);
  const [kind, setKind] = useState<"PLAN" | "FACT">("PLAN");

  useEffect(() => {
    if (!open) return;
    void loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, year, month]);

  async function loadPreview() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(
        `/api/admin/financing/payroll/preview?year=${year}&month=${month}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const data: PreviewRow[] = json.rows ?? [];
      setRows(data);
      // pre-fill: select everyone who has a salary AND no existing entry
      const sel: DraftSelected = {};
      const amt: DraftAmounts = {};
      for (const r of data) {
        sel[r.id] = !r.existing && r.amount != null && r.amount > 0;
        amt[r.id] = r.amount != null ? String(r.amount) : "";
      }
      setSelected(sel);
      setAmounts(amt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося завантажити список");
    } finally {
      setLoading(false);
    }
  }

  const summary = useMemo(() => {
    let total = 0;
    let count = 0;
    for (const r of rows) {
      if (!selected[r.id] || r.existing) continue;
      const n = Number(amounts[r.id]);
      if (Number.isFinite(n) && n > 0) {
        total += n;
        count++;
      }
    }
    return { total, count };
  }, [rows, selected, amounts]);

  function toggleAll() {
    const allSelected = rows.every((r) => r.existing || selected[r.id]);
    const next: DraftSelected = {};
    for (const r of rows) {
      next[r.id] = !allSelected && !r.existing;
    }
    setSelected(next);
  }

  async function handleRun() {
    setError(null);
    const items = rows
      .filter((r) => selected[r.id] && !r.existing)
      .map((r) => ({ employeeId: r.id, amount: Number(amounts[r.id]) }))
      .filter((i) => Number.isFinite(i.amount) && i.amount > 0);

    if (items.length === 0) {
      setError("Виберіть хоча б одного співробітника з сумою > 0");
      return;
    }

    setRunning(true);
    try {
      const res = await fetch(`/api/admin/financing/payroll/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month, items, folderId, kind }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setResult({ created: json.created?.length ?? 0, skipped: json.skipped?.length ?? 0 });
      onSuccess();
      // refresh preview so existing badges appear
      void loadPreview();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка нарахування");
    } finally {
      setRunning(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl overflow-hidden flex flex-col"
        style={{
          backgroundColor: T.panel,
          border: `1px solid ${T.borderStrong}`,
          maxHeight: "90vh",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: T.borderSoft }}
        >
          <div className="flex items-center gap-2">
            <Users size={18} style={{ color: T.accentPrimary }} />
            <h3 className="text-base font-bold" style={{ color: T.textPrimary }}>
              Нарахування ЗП
            </h3>
          </div>
          <button onClick={onClose}>
            <X size={18} style={{ color: T.textMuted }} />
          </button>
        </div>

        {/* Period + kind */}
        <div
          className="flex flex-wrap items-center gap-3 px-5 py-3 border-b"
          style={{ borderColor: T.borderSoft, backgroundColor: T.panelElevated }}
        >
          <div className="flex items-center gap-2">
            <CalendarIcon size={14} style={{ color: T.textMuted }} />
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="rounded-lg px-2.5 py-1.5 text-[12px] font-semibold outline-none"
              style={{
                backgroundColor: T.panelSoft,
                border: `1px solid ${T.borderStrong}`,
                color: T.textPrimary,
              }}
            >
              {MONTH_LABELS.map((label, idx) => (
                <option key={idx} value={idx + 1}>{label}</option>
              ))}
            </select>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="rounded-lg px-2.5 py-1.5 text-[12px] font-semibold outline-none"
              style={{
                backgroundColor: T.panelSoft,
                border: `1px solid ${T.borderStrong}`,
                color: T.textPrimary,
              }}
            >
              {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-1 rounded-xl p-1" style={{ backgroundColor: T.panelSoft }}>
            {(["PLAN", "FACT"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className="rounded-lg px-3 py-1 text-[11px] font-bold"
                style={{
                  backgroundColor: kind === k ? T.accentPrimary : "transparent",
                  color: kind === k ? "#fff" : T.textSecondary,
                }}
              >
                {k === "PLAN" ? "План" : "Факт"}
              </button>
            ))}
          </div>

          <button
            onClick={toggleAll}
            className="ml-auto rounded-lg px-3 py-1.5 text-[11px] font-semibold"
            style={{
              backgroundColor: T.panelSoft,
              border: `1px solid ${T.borderStrong}`,
              color: T.textSecondary,
            }}
          >
            Виділити всіх
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-[12px]" style={{ color: T.textMuted }}>
              <Loader2 size={14} className="animate-spin" /> Завантаження…
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center" style={{ color: T.textMuted }}>
              <Users size={28} style={{ color: T.textMuted }} />
              <span className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
                Немає активних співробітників
              </span>
              <span className="text-[11px]">
                Додайте їх у HR → Співробітники, з вказанням посади та зарплати
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {rows.map((row) => {
                const isSelected = !!selected[row.id];
                const disabled = !!row.existing;
                const tint = disabled ? T.textMuted : isSelected ? T.accentPrimary : T.borderStrong;

                return (
                  <div
                    key={row.id}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition"
                    style={{
                      backgroundColor: disabled
                        ? T.panelSoft
                        : isSelected
                          ? "rgba(59,130,246,0.08)"
                          : T.panelSoft,
                      border: `1px solid ${tint}`,
                      opacity: disabled ? 0.55 : 1,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected && !disabled}
                      disabled={disabled}
                      onChange={(e) =>
                        setSelected((s) => ({ ...s, [row.id]: e.target.checked }))
                      }
                      className="w-4 h-4 cursor-pointer disabled:cursor-not-allowed"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-bold truncate" style={{ color: T.textPrimary }}>
                        {row.fullName}
                      </div>
                      <div className="text-[10.5px] truncate" style={{ color: T.textMuted }}>
                        {row.position || "—"}
                        {" · "}
                        {row.salaryType === "MONTHLY" ? "помісячна" : "погодинна"}
                      </div>
                    </div>

                    {disabled ? (
                      <div
                        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10.5px] font-bold"
                        style={{
                          backgroundColor: T.panelElevated,
                          color: T.textSecondary,
                          border: `1px solid ${T.borderSoft}`,
                        }}
                        title={`Запис уже існує: ${row.existing!.status}`}
                      >
                        <CheckCircle2 size={12} />
                        Уже нараховано
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.01"
                          inputMode="decimal"
                          value={amounts[row.id] ?? ""}
                          onChange={(e) =>
                            setAmounts((a) => ({ ...a, [row.id]: e.target.value }))
                          }
                          placeholder="0"
                          className="w-28 rounded-lg px-2.5 py-1 text-[12.5px] font-bold text-right outline-none"
                          style={{
                            backgroundColor: T.panel,
                            border: `1px solid ${T.borderStrong}`,
                            color: T.textPrimary,
                          }}
                        />
                        <span className="text-[10.5px] font-semibold" style={{ color: T.textMuted }}>
                          {row.currency}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex flex-col gap-2 px-5 py-3 border-t"
          style={{ borderColor: T.borderSoft, backgroundColor: T.panelElevated }}
        >
          {error && (
            <div
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px]"
              style={{
                backgroundColor: T.dangerSoft,
                color: T.danger,
                border: `1px solid ${T.danger}`,
              }}
            >
              <AlertCircle size={12} />
              {error}
            </div>
          )}
          {result && (
            <div
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px]"
              style={{
                backgroundColor: "rgba(22,163,74,0.1)",
                color: T.success,
                border: `1px solid ${T.success}`,
              }}
            >
              <CheckCircle2 size={12} />
              Нараховано: {result.created} · пропущено: {result.skipped}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <div className="text-[12px]" style={{ color: T.textSecondary }}>
              <span className="font-bold" style={{ color: T.textPrimary }}>{summary.count}</span>
              {" людей · "}
              <span className="font-bold" style={{ color: T.danger }}>
                {formatCurrency(summary.total)}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="rounded-lg px-3 py-2 text-[12px] font-medium"
                style={{ color: T.textSecondary }}
              >
                Закрити
              </button>
              <button
                onClick={handleRun}
                disabled={running || summary.count === 0}
                className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12px] font-bold text-white disabled:opacity-50"
                style={{ backgroundColor: T.accentPrimary }}
              >
                {running ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                Нарахувати ({summary.count})
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
