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
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { financeCategoriesForType } from "@/lib/constants";
import type { ProjectOption } from "./types";

type Kind = "PLAN" | "FACT";
type Type = "INCOME" | "EXPENSE";

type Row = {
  occurredAt: string | null;
  title: string;
  amount: number;
  category: string;
  counterparty: string | null;
  description: string | null;
};

type ParseResponse = {
  rows: Row[];
  notes: string[];
  truncated: boolean;
  totalRowsInFile: number;
  sheetName: string;
  fileName: string;
};

const KIND_LABELS: Record<Kind, string> = {
  PLAN: "Планові",
  FACT: "Фактичні",
};
const TYPE_LABELS: Record<Type, string> = {
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
  onImported: (count: number) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<ParseResponse | null>(null);
  const [rows, setRows] = useState<(Row & { keep: boolean })[]>([]);
  const [projectId, setProjectId] = useState<string>(scope?.id ?? "");
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  const allowedCategories = useMemo(
    () => financeCategoriesForType(preset.type),
    [preset.type],
  );

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
        setError("AI не знайшов жодного валідного рядка. Перевірте файл або спробуйте інший формат.");
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
      .map(({ keep: _keep, ...r }) => r);
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
          type: preset.type,
          status: "DRAFT",
          projectId: projectId || null,
          folderId: folderContext?.id ?? null,
          rows: toImport,
          fallbackDate: new Date().toISOString().slice(0, 10),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      onImported(data.count ?? toImport.length);
      onClose();
    } catch (e) {
      setCommitError(e instanceof Error ? e.message : "Помилка імпорту");
    } finally {
      setCommitting(false);
    }
  }

  const totalAmount = rows.reduce((s, r) => (r.keep ? s + (r.amount || 0) : s), 0);
  const keptCount = rows.filter((r) => r.keep).length;

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
                Імпорт з Excel — {KIND_LABELS[preset.kind]} {TYPE_LABELS[preset.type]}
              </h3>
              <p className="text-[11px]" style={{ color: T.textMuted }}>
                AI розпізнає колонки, дати, суми та категорії автоматично
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Закрити" disabled={committing}>
            <X size={18} style={{ color: T.textMuted }} />
          </button>
        </div>

        <div className="flex flex-col gap-5 p-6">
          {/* Project selector — допоміжний (опціональний) */}
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

          {/* Upload zone */}
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
                .xlsx, .xls, .csv · макс 10 МБ
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
              AI розпізнає файл…
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
              ⚠️ Файл містить {parseResult.totalRowsInFile} рядків. Імпортується перші ~200 — для решти створіть ще один файл.
            </div>
          )}

          {/* Preview table */}
          {rows.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span
                  className="text-[10px] font-bold tracking-wider"
                  style={{ color: T.textMuted }}
                >
                  ПЕРЕВІРТЕ ТА ВІДРЕДАГУЙТЕ ({keptCount} з {rows.length})
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
                      <th className="px-2 py-2 text-left font-bold">Дата</th>
                      <th className="px-2 py-2 text-left font-bold">Назва</th>
                      <th className="px-2 py-2 text-left font-bold">Категорія</th>
                      <th className="px-2 py-2 text-right font-bold">Сума</th>
                      <th className="px-2 py-2 text-left font-bold">Контрагент</th>
                      <th className="px-2 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
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
                            onChange={(e) => updateRow(i, { keep: e.target.checked })}
                          />
                        </td>
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
                            onChange={(e) => updateRow(i, { title: e.target.value })}
                            className="w-full bg-transparent outline-none"
                            style={{ color: T.textPrimary }}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <select
                            value={r.category}
                            onChange={(e) => updateRow(i, { category: e.target.value })}
                            className="bg-transparent outline-none"
                            style={{ color: T.textPrimary }}
                          >
                            {allowedCategories.map((c) => (
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
                              updateRow(i, { amount: Number(e.target.value) || 0 })
                            }
                            className="w-[110px] bg-transparent outline-none text-right"
                            style={{ color: T.textPrimary }}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={r.counterparty ?? ""}
                            onChange={(e) =>
                              updateRow(i, {
                                counterparty: e.target.value.trim() || null,
                              })
                            }
                            className="w-[140px] bg-transparent outline-none"
                            style={{ color: T.textMuted }}
                          />
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
                    ))}
                  </tbody>
                </table>
              </div>
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
