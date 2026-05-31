"use client";

import { useState } from "react";
import { X, FileSpreadsheet, Check, Loader2 } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type Result = {
  estimateId: string;
  sectionsCreated: number;
  itemsCreated: number;
  predecessorsResolved: number;
  predecessorsUnresolved: number;
  warnings: string[];
};

export function ImportPlanModal({
  projectId,
  onClose,
  onImported,
}: {
  projectId: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function handleImport() {
    if (!file) return;
    setImporting(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (title.trim()) fd.append("title", title.trim());

      const res = await fetch(
        `/api/admin/projects/${projectId}/import-excel-plan`,
        { method: "POST", body: fd },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Помилка імпорту");
      }
      const json = (await res.json()) as { data: Result };
      setResult(json.data);
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка імпорту");
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="flex max-h-[80vh] w-full max-w-[560px] flex-col rounded-2xl shadow-2xl"
          style={{
            backgroundColor: T.panel,
            border: `1px solid ${T.borderSoft}`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex items-start justify-between gap-3 border-b px-5 py-4"
            style={{ borderColor: T.borderSoft }}
          >
            <div>
              <div
                className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider"
                style={{ color: T.textMuted }}
              >
                <FileSpreadsheet size={12} />
                Імпорт плану з Excel
              </div>
              <h3 className="mt-1 text-[16px] font-bold" style={{ color: T.textPrimary }}>
                Завантажити .xlsx (PROJECTS / STAGES)
              </h3>
              <p className="mt-1 text-[12px]" style={{ color: T.textSecondary }}>
                Створимо новий кошторис (DRAFT) з секціями за «Етап» і всіма
                planning-полями (план/тривалість/попередник/тип звʼязку).
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full transition hover:brightness-95"
              style={{ color: T.textMuted, backgroundColor: T.panelSoft }}
              aria-label="Закрити"
            >
              <X size={14} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            <label
              className="block text-[11px] font-medium uppercase tracking-wider"
              style={{ color: T.textMuted }}
            >
              Файл Excel
            </label>
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={importing}
              className="mt-1 block w-full text-[12px]"
              style={{ color: T.textPrimary }}
            />

            <label
              className="mt-4 block text-[11px] font-medium uppercase tracking-wider"
              style={{ color: T.textMuted }}
            >
              Назва кошторису (опціонально)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={importing}
              placeholder="За замовч. — з PROJECTS"
              className="mt-1 block w-full rounded border px-3 py-2 text-[12px]"
              style={{
                borderColor: T.borderSoft,
                backgroundColor: T.panelSoft,
                color: T.textPrimary,
              }}
            />

            {error && (
              <div
                className="mt-4 rounded-lg border p-3 text-[12px]"
                style={{
                  backgroundColor: T.dangerSoft,
                  borderColor: T.danger + "55",
                  color: T.danger,
                }}
              >
                {error}
              </div>
            )}

            {result && (
              <div
                className="mt-4 rounded-lg border p-3 text-[12px]"
                style={{
                  backgroundColor: T.successSoft,
                  borderColor: T.success + "55",
                  color: T.textPrimary,
                }}
              >
                <div
                  className="mb-1 flex items-center gap-1.5 font-semibold"
                  style={{ color: T.success }}
                >
                  <Check size={13} />
                  Імпортовано
                </div>
                <div style={{ color: T.textSecondary }}>
                  Секцій: <b>{result.sectionsCreated}</b>, позицій:{" "}
                  <b>{result.itemsCreated}</b>. Попередників резолвлено:{" "}
                  <b>{result.predecessorsResolved}</b>
                  {result.predecessorsUnresolved > 0 && (
                    <>
                      , не резолвлено: <b>{result.predecessorsUnresolved}</b>
                    </>
                  )}
                  .
                </div>
                {result.warnings.length > 0 && (
                  <details className="mt-2 text-[11px]" style={{ color: T.warning }}>
                    <summary className="cursor-pointer">
                      Попередження ({result.warnings.length})
                    </summary>
                    <ul className="mt-1 space-y-0.5 pl-4">
                      {result.warnings.slice(0, 20).map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                      {result.warnings.length > 20 && (
                        <li>…ще {result.warnings.length - 20}</li>
                      )}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </div>

          <div
            className="flex items-center justify-end gap-2 border-t px-5 py-3"
            style={{ borderColor: T.borderSoft }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={importing}
              className="rounded-lg px-3 py-2 text-[12px] font-medium transition hover:brightness-95 disabled:opacity-50"
              style={{ color: T.textSecondary, backgroundColor: T.panelSoft }}
            >
              Закрити
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={!file || importing}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12px] font-semibold transition hover:brightness-95 disabled:opacity-50"
              style={{ color: "#fff", backgroundColor: T.accentPrimary }}
            >
              {importing && <Loader2 size={12} className="animate-spin" />}
              {importing ? "Імпорт…" : "Імпортувати"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
