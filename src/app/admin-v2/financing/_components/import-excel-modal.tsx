"use client";

import { useEffect, useMemo, useState } from "react";
import {
  X,
  Loader2,
  Upload,
  Sparkles,
  FileSpreadsheet,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Link2,
  ArrowDownCircle,
  ArrowUpCircle,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { FINANCE_CATEGORIES, financeCategoriesForType } from "@/lib/constants";
import type { ProjectOption } from "./types";

type Kind = "PLAN" | "FACT";
type Type = "INCOME" | "EXPENSE" | "AUTO";

type Row = {
  occurredAt: string | null;
  title: string;
  amount: number;
  category: string;
  counterparty: string | null;
  counterpartyId?: string;
  counterpartyResolved?: string;
  description: string | null;
  /** AUTO режим — server повертає direction per row. */
  direction?: "INCOME" | "EXPENSE";
};

type ParseResponse = {
  rows: Row[];
  notes: string[];
  truncated: boolean;
  totalRowsInFile: number;
  sheetName: string;
  fileName: string;
  matchedCounterparties: number;
};

const KIND_LABELS: Record<Kind, string> = {
  PLAN: "Планові",
  FACT: "Фактичні",
};
const TYPE_LABELS: Record<"INCOME" | "EXPENSE", string> = {
  EXPENSE: "витрати",
  INCOME: "доходи",
};

export function ImportExcelModal({
  preset,
  projects,
  scope,
  folderContext,
  onClose,
  onImported,
}: {
  preset: { kind: Kind; type: Type };
  projects: ProjectOption[];
  scope?: { id: string; title: string };
  folderContext?: { id: string; name: string } | null;
  onClose: () => void;
  onImported: (count: number, skipped: number, duplicates: number) => void;
}) {
  const isAuto = preset.type === "AUTO";

  const [file, setFile] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<ParseResponse | null>(null);
  const [rows, setRows] = useState<(Row & { keep: boolean })[]>([]);
  const [projectId, setProjectId] = useState<string>(scope?.id ?? "");
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  const allowedCategories = useMemo(() => {
    if (isAuto) return FINANCE_CATEGORIES;
    return financeCategoriesForType(preset.type as "INCOME" | "EXPENSE");
  }, [preset.type, isAuto]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !committing) onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose, committing]);

  async function handleFileSelect(f: File) {
    const lower = f.name.toLowerCase();
    if (!/\.(xlsx|xls|csv)$/.test(lower)) {
      setError("Підтримуються .xlsx, .xls, .csv");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError("Файл завеликий (макс 10 МБ)");
      return;
    }
    setError(null);
    setFile(f);
    setScanning(true);
    setParseResult(null);
    setRows([]);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("type", preset.type);
      const res = await fetch("/api/admin/financing/import/parse", {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      const parsed: ParseResponse = data;
      setParseResult(parsed);
      setRows(parsed.rows.map((r) => ({ ...r, keep: true })));
      if (parsed.rows.length === 0) {
        setError(
          "AI не знайшов жодного валідного рядка. Перевірте файл або спробуйте інший формат.",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка обробки файлу");
      setFile(null);
    } finally {
      setScanning(false);
    }
  }

  function updateRow(idx: number, patch: Partial<Row & { keep: boolean }>) {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }

  async function handleImport() {
    setCommitError(null);
    const toImport = rows
      .filter((r) => r.keep)
      .map(({ keep: _k, ...r }) => ({
        occurredAt: r.occurredAt,
        title: r.title,
        amount: r.amount,
        category: r.category,
        counterparty: r.counterparty,
        counterpartyId: r.counterpartyId ?? null,
        description: r.description,
        type: isAuto ? r.direction : undefined,
      }));
    if (toImport.length === 0) {
      setCommitError("Оберіть хоча б один рядок");
      return;
    }

    setCommitting(true);
    try {
      const res = await fetch("/api/admin/financing/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: preset.kind,
          type: preset.type, // може бути "AUTO"
          status: isAuto ? "APPROVED" : "DRAFT",
          projectId: projectId || null,
          folderId: folderContext?.id ?? null,
          rows: toImport,
          fallbackDate: new Date().toISOString().slice(0, 10),
          skipDuplicates: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      onImported(data.count ?? 0, data.skipped ?? 0, data.duplicates ?? 0);
      onClose();
    } catch (e) {
      setCommitError(e instanceof Error ? e.message : "Помилка імпорту");
    } finally {
      setCommitting(false);
    }
  }

  const totalAmount = rows.reduce((s, r) => (r.keep ? s + (r.amount || 0) : s), 0);
  const keptCount = rows.filter((r) => r.keep).length;
  const matchedCount = rows.filter((r) => r.keep && r.counterpartyId).length;

  const headerTitle = isAuto
    ? "Імпорт виписки банку"
    : `Імпорт з Excel — ${KIND_LABELS[preset.kind]} ${TYPE_LABELS[preset.type as "INCOME" | "EXPENSE"]}`;
  const headerHint = isAuto
    ? "AI визначає тип (дохід/витрата) автоматично за знаком суми"
    : "AI розпізнає колонки, дати, суми та категорії автоматично";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-5xl max-h-[95vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderStrong}` }}
      >
        <div
          className="sticky top-0 z-10 flex items-center justify-between border-b px-6 py-4"
          style={{ borderColor: T.borderSoft, backgroundColor: T.panel }}
        >
          <div className="flex items-center gap-2">
            <Sparkles size={18} style={{ color: T.accentPrimary }} />
            <div>
              <h3 className="text-lg font-bold" style={{ color: T.textPrimary }}>
                {headerTitle}
              </h3>
              <p className="text-[11px]" style={{ color: T.textMuted }}>
                {headerHint}
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Закрити" disabled={committing}>
            <X size={18} style={{ color: T.textMuted }} />
          </button>
        </div>

        <div className="flex flex-col gap-5 p-6">
          {!scope && (
            <div className="flex flex-col gap-1.5">
              <span
                className="text-[10px] font-bold tracking-wider"
                style={{ color: T.textMuted }}
              >
                ПРОЄКТ (опціонально — застосується до всіх рядків)
              </span>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderStrong}`,
                  color: T.textPrimary,
                }}
              >
                <option value="">— Без проєкту —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!file && (
            <label
              className="flex flex-col items-center justify-center gap-2 rounded-xl px-6 py-12 cursor-pointer transition hover:brightness-105"
              style={{
                backgroundColor: T.panelSoft,
                border: `2px dashed ${T.borderStrong}`,
              }}
            >
              <Upload size={28} style={{ color: T.accentPrimary }} />
              <span
                className="text-[14px] font-semibold"
                style={{ color: T.textPrimary }}
              >
                Клікніть або перетягніть Excel-файл
              </span>
              <span className="text-[11px]" style={{ color: T.textMuted }}>
                .xlsx, .xls, .csv · макс 10 МБ · до 1000 рядків
              </span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                }}
              />
            </label>
          )}

          {file && (
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-2.5"
              style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}` }}
            >
              <FileSpreadsheet size={16} style={{ color: T.accentPrimary }} />
              <span
                className="flex-1 truncate text-[12px] font-medium"
                style={{ color: T.textPrimary }}
              >
                {file.name}
              </span>
              <span className="text-[10px]" style={{ color: T.textMuted }}>
                {(file.size / 1024).toFixed(0)} KB
              </span>
              {!scanning && (
                <button
                  onClick={() => {
                    setFile(null);
                    setParseResult(null);
                    setRows([]);
                    setError(null);
                  }}
                  style={{ color: T.textMuted }}
                  title="Видалити"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          )}

          {scanning && (
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-[12px] font-semibold"
              style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
            >
              <Loader2 size={13} className="animate-spin" />
              AI розпізнає файл (можливо кілька батчів)…
            </div>
          )}

          {error && (
            <div
              className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-[12px]"
              style={{
                backgroundColor: T.dangerSoft,
                color: T.danger,
                border: `1px solid ${T.danger}`,
              }}
            >
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {parseResult && parseResult.notes.length > 0 && (
            <div
              className="rounded-lg px-3 py-2 text-[11px] flex flex-col gap-0.5"
              style={{
                backgroundColor: T.warningSoft,
                color: T.warning,
                border: `1px solid ${T.warning}40`,
              }}
            >
              {parseResult.notes.map((n, i) => (
                <div key={i}>⚠️ {n}</div>
              ))}
            </div>
          )}

          {parseResult && parseResult.truncated && (
            <div
              className="rounded-lg px-3 py-2 text-[11px]"
              style={{
                backgroundColor: T.warningSoft,
                color: T.warning,
                border: `1px solid ${T.warning}40`,
              }}
            >
              ⚠️ Файл містить {parseResult.totalRowsInFile} рядків. Імпортується
              перші 1000 — для решти створіть ще один файл.
            </div>
          )}

          {parseResult && parseResult.matchedCounterparties > 0 && (
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-[11px]"
              style={{
                backgroundColor: T.accentPrimarySoft,
                color: T.accentPrimary,
                border: `1px solid ${T.accentPrimary}40`,
              }}
            >
              <Link2 size={12} />
              Розпізнано {parseResult.matchedCounterparties} контрагент(ів) з
              існуючої бази
            </div>
          )}

          {rows.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span
                  className="text-[10px] font-bold tracking-wider"
                  style={{ color: T.textMuted }}
                >
                  ПЕРЕВІРТЕ ТА ВІДРЕДАГУЙТЕ ({keptCount} з {rows.length})
                  {matchedCount > 0 && (
                    <>
                      {" · "}
                      <span style={{ color: T.accentPrimary }}>
                        🔗 {matchedCount} звʼязків
                      </span>
                    </>
                  )}
                </span>
                <span className="text-[12px] font-bold" style={{ color: T.accentPrimary }}>
                  {totalAmount.toLocaleString("uk-UA", { maximumFractionDigits: 0 })} ₴
                </span>
              </div>

              <div
                className="max-h-[420px] overflow-auto rounded-lg"
                style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}` }}
              >
                <table className="w-full border-collapse text-[11px]">
                  <thead
                    className="sticky top-0 z-10"
                    style={{ backgroundColor: T.panelElevated }}
                  >
                    <tr style={{ color: T.textMuted }}>
                      <th className="px-2 py-2 text-left font-bold">✓</th>
                      {isAuto && <th className="px-2 py-2 text-left font-bold">+/−</th>}
                      <th className="px-2 py-2 text-left font-bold">Дата</th>
                      <th className="px-2 py-2 text-left font-bold">Назва</th>
                      <th className="px-2 py-2 text-left font-bold">Категорія</th>
                      <th className="px-2 py-2 text-right font-bold">Сума</th>
                      <th className="px-2 py-2 text-left font-bold">Контрагент</th>
                      <th className="px-2 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const dirCategories = isAuto
                        ? FINANCE_CATEGORIES.filter(
                            (c) => c.applicableTo === r.direction,
                          )
                        : allowedCategories;
                      return (
                        <tr
                          key={i}
                          className="border-t"
                          style={{
                            borderColor: T.borderSoft,
                            opacity: r.keep ? 1 : 0.4,
                          }}
                        >
                          <td className="px-2 py-1.5">
                            <input
                              type="checkbox"
                              checked={r.keep}
                              onChange={(e) =>
                                updateRow(i, { keep: e.target.checked })
                              }
                            />
                          </td>
                          {isAuto && (
                            <td className="px-2 py-1.5">
                              <button
                                onClick={() => {
                                  const next: "INCOME" | "EXPENSE" =
                                    r.direction === "INCOME" ? "EXPENSE" : "INCOME";
                                  // Підбираємо першу категорію відповідного типу.
                                  const cat = FINANCE_CATEGORIES.find(
                                    (c) => c.applicableTo === next,
                                  )?.key ?? r.category;
                                  updateRow(i, { direction: next, category: cat });
                                }}
                                title={
                                  r.direction === "INCOME" ? "Дохід" : "Витрата"
                                }
                                style={{
                                  color:
                                    r.direction === "INCOME" ? T.success : T.danger,
                                }}
                              >
                                {r.direction === "INCOME" ? (
                                  <ArrowDownCircle size={14} />
                                ) : (
                                  <ArrowUpCircle size={14} />
                                )}
                              </button>
                            </td>
                          )}
                          <td className="px-2 py-1.5">
                            <input
                              type="date"
                              value={r.occurredAt ?? ""}
                              onChange={(e) =>
                                updateRow(i, { occurredAt: e.target.value || null })
                              }
                              className="w-[110px] bg-transparent outline-none"
                              style={{ color: T.textPrimary }}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="text"
                              value={r.title}
                              onChange={(e) =>
                                updateRow(i, { title: e.target.value })
                              }
                              className="w-full bg-transparent outline-none"
                              style={{ color: T.textPrimary }}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <select
                              value={r.category}
                              onChange={(e) =>
                                updateRow(i, { category: e.target.value })
                              }
                              className="bg-transparent outline-none"
                              style={{ color: T.textPrimary }}
                            >
                              {dirCategories.map((c) => (
                                <option key={c.key} value={c.key}>
                                  {c.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <input
                              type="number"
                              step="0.01"
                              value={r.amount}
                              onChange={(e) =>
                                updateRow(i, {
                                  amount: Number(e.target.value) || 0,
                                })
                              }
                              className="w-[110px] bg-transparent outline-none text-right"
                              style={{ color: T.textPrimary }}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <div className="flex items-center gap-1">
                              {r.counterpartyId && (
                                <Link2
                                  size={11}
                                  style={{ color: T.accentPrimary, flexShrink: 0 }}
                                  aria-label="Звʼязано з контрагентом"
                                />
                              )}
                              <input
                                type="text"
                                value={r.counterparty ?? ""}
                                onChange={(e) =>
                                  updateRow(i, {
                                    counterparty: e.target.value.trim() || null,
                                    // якщо змінили вручну — розривати привʼязку до існуючого
                                    counterpartyId: undefined,
                                    counterpartyResolved: undefined,
                                  })
                                }
                                className="w-[140px] bg-transparent outline-none"
                                style={{
                                  color: r.counterpartyId
                                    ? T.accentPrimary
                                    : T.textMuted,
                                }}
                                title={
                                  r.counterpartyResolved
                                    ? `Звʼязано з: ${r.counterpartyResolved}`
                                    : undefined
                                }
                              />
                            </div>
                          </td>
                          <td className="px-2 py-1.5">
                            <button
                              onClick={() =>
                                setRows((prev) => prev.filter((_, j) => j !== i))
                              }
                              title="Прибрати рядок"
                              style={{ color: T.danger }}
                            >
                              <Trash2 size={11} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p className="text-[10px]" style={{ color: T.textMuted }}>
                Дублікати (той самий kind+type+дата+сума+назва) автоматично
                пропускаються при імпорті.
              </p>
            </div>
          )}

          {commitError && (
            <div
              className="rounded-lg px-3 py-2.5 text-[12px]"
              style={{
                backgroundColor: T.dangerSoft,
                color: T.danger,
                border: `1px solid ${T.danger}`,
              }}
            >
              {commitError}
            </div>
          )}

          <div
            className="flex items-center justify-end gap-2 border-t pt-4"
            style={{ borderColor: T.borderSoft }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={committing}
              className="rounded-xl px-4 py-2.5 text-sm font-medium"
              style={{ color: T.textSecondary }}
            >
              Скасувати
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={!rows.some((r) => r.keep) || committing}
              className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              style={{ backgroundColor: T.accentPrimary }}
            >
              {committing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <CheckCircle2 size={14} />
              )}
              Імпортувати ({keptCount})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
