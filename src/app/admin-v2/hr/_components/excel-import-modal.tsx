"use client";

import { useRef, useState } from "react";
import { Upload, X, Loader2, Download, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type PreviewResult = {
  totalRows: number;
  validRows: number;
  errors: Array<{ row: number; field: string; message: string }>;
  data: Array<Record<string, unknown>>;
};

type ImportResult = {
  created: number;
  totalRows: number;
  errors: Array<{ row: number; field: string; message: string }>;
};

export function ExcelImportModal({
  open,
  onClose,
  title,
  templateUrl,
  importUrl,
  previewColumns,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  templateUrl: string;
  importUrl: string;
  previewColumns: Array<{ key: string; label: string }>;
  onImported: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function reset() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function close() {
    reset();
    onClose();
  }

  async function handleFile(selected: File) {
    setFile(selected);
    setResult(null);
    setError(null);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", selected);
      const res = await fetch(`${importUrl}?mode=validate`, { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Помилка парсингу");
      setPreview(json.preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка");
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }

  async function runImport() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(importUrl, { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Помилка імпорту");
      setResult(json);
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
      onClick={close}
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between p-5"
          style={{ borderBottom: `1px solid ${T.borderSoft}` }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ backgroundColor: T.accentPrimarySoft }}
            >
              <FileSpreadsheet size={20} style={{ color: T.accentPrimary }} />
            </div>
            <div>
              <h2 className="text-lg font-bold" style={{ color: T.textPrimary }}>
                {title}
              </h2>
              <p className="text-[12px]" style={{ color: T.textMuted }}>
                Завантажте Excel-файл зі списком записів
              </p>
            </div>
          </div>
          <button onClick={close} className="rounded-lg p-2" style={{ color: T.textMuted }}>
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          <a
            href={templateUrl}
            className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold self-start"
            style={{ backgroundColor: T.panelSoft, color: T.accentPrimary, border: `1px solid ${T.borderStrong}` }}
          >
            <Download size={14} /> Завантажити шаблон
          </a>

          {!file && (
            <label
              className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 cursor-pointer transition hover:brightness-95"
              style={{ borderColor: T.borderStrong, backgroundColor: T.panelSoft }}
            >
              <Upload size={32} style={{ color: T.accentPrimary }} />
              <span className="text-sm font-semibold" style={{ color: T.textPrimary }}>
                Виберіть або перетягніть .xlsx файл
              </span>
              <span className="text-[12px]" style={{ color: T.textMuted }}>
                Підтримуються .xlsx і .xls
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </label>
          )}

          {file && (
            <div
              className="flex items-center justify-between gap-3 rounded-xl px-4 py-3"
              style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderStrong}` }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <FileSpreadsheet size={18} style={{ color: T.accentPrimary }} />
                <span className="text-sm truncate" style={{ color: T.textPrimary }}>
                  {file.name}
                </span>
              </div>
              <button
                onClick={reset}
                className="rounded-lg px-3 py-1.5 text-xs"
                style={{ color: T.textMuted }}
              >
                Видалити
              </button>
            </div>
          )}

          {error && (
            <div
              className="flex items-start gap-2 rounded-xl px-4 py-3 text-sm"
              style={{
                backgroundColor: T.dangerSoft,
                color: T.danger,
                border: `1px solid ${T.danger}`,
              }}
            >
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {loading && !preview && !result && (
            <div className="flex items-center gap-2 text-sm" style={{ color: T.textMuted }}>
              <Loader2 size={14} className="animate-spin" /> Парсимо файл…
            </div>
          )}

          {preview && !result && (
            <>
              <div className="flex flex-wrap items-center gap-4">
                <Stat label="Усього рядків" value={String(preview.totalRows)} accent={T.textPrimary} />
                <Stat label="Валідних" value={String(preview.validRows)} accent={T.success} />
                <Stat
                  label="Помилок"
                  value={String(preview.errors.length)}
                  accent={preview.errors.length ? T.danger : T.textMuted}
                />
              </div>

              {preview.errors.length > 0 && (
                <div
                  className="rounded-xl p-3 text-sm"
                  style={{ backgroundColor: T.warningSoft, border: `1px solid ${T.warning}` }}
                >
                  <p className="font-semibold mb-1" style={{ color: T.warning }}>
                    Пропущені рядки ({preview.errors.length}):
                  </p>
                  <ul className="text-[12px] space-y-0.5" style={{ color: T.textSecondary }}>
                    {preview.errors.slice(0, 10).map((e, i) => (
                      <li key={i}>
                        Рядок {e.row}, {e.field}: {e.message}
                      </li>
                    ))}
                    {preview.errors.length > 10 && (
                      <li>…і ще {preview.errors.length - 10}</li>
                    )}
                  </ul>
                </div>
              )}

              <div
                className="rounded-xl overflow-auto"
                style={{ border: `1px solid ${T.borderSoft}` }}
              >
                <table className="w-full text-[12px]">
                  <thead>
                    <tr style={{ backgroundColor: T.panelElevated }}>
                      {previewColumns.map((c) => (
                        <th
                          key={c.key}
                          className="px-3 py-2 text-left font-bold tracking-wider"
                          style={{ color: T.textMuted }}
                        >
                          {c.label.toUpperCase()}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.data.slice(0, 20).map((row, i) => (
                      <tr
                        key={i}
                        style={{ borderTop: `1px solid ${T.borderSoft}` }}
                      >
                        {previewColumns.map((c) => (
                          <td
                            key={c.key}
                            className="px-3 py-2"
                            style={{ color: T.textPrimary }}
                          >
                            {formatCell(row[c.key])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.data.length > 20 && (
                  <div
                    className="px-3 py-2 text-[11px] text-center"
                    style={{ color: T.textMuted, borderTop: `1px solid ${T.borderSoft}` }}
                  >
                    Показано перші 20 з {preview.data.length} записів
                  </div>
                )}
              </div>
            </>
          )}

          {result && (
            <div
              className="flex items-center gap-3 rounded-xl p-4"
              style={{ backgroundColor: T.successSoft, border: `1px solid ${T.success}` }}
            >
              <CheckCircle2 size={22} style={{ color: T.success }} />
              <div className="flex flex-col">
                <span className="text-sm font-bold" style={{ color: T.success }}>
                  Імпортовано {result.created} записів
                </span>
                {result.errors.length > 0 && (
                  <span className="text-[12px]" style={{ color: T.textSecondary }}>
                    Пропущено {result.errors.length} рядків через помилки
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <div
          className="flex items-center justify-end gap-2 p-5"
          style={{ borderTop: `1px solid ${T.borderSoft}` }}
        >
          <button
            onClick={close}
            className="rounded-xl px-4 py-2.5 text-sm font-medium"
            style={{ color: T.textSecondary }}
          >
            {result ? "Закрити" : "Скасувати"}
          </button>
          {preview && !result && preview.validRows > 0 && (
            <button
              onClick={runImport}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              style={{ backgroundColor: T.accentPrimary }}
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              Імпортувати {preview.validRows}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
        {label.toUpperCase()}
      </span>
      <span className="text-lg font-bold" style={{ color: accent }}>
        {value}
      </span>
    </div>
  );
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (v instanceof Date) return v.toLocaleDateString("uk-UA");
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    return new Date(v).toLocaleDateString("uk-UA");
  }
  if (typeof v === "number") return v.toLocaleString("uk-UA");
  return String(v);
}
