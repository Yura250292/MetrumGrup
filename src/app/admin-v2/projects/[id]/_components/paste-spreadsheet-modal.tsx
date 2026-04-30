"use client";

import { useMemo, useState } from "react";
import { X, ClipboardPaste, Loader2, Check, AlertCircle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type PasteSpreadsheetModalProps = {
  projectId: string;
  onClose: () => void;
  onImported: () => Promise<void> | void;
};

type PreviewNode = {
  tempId: string;
  parentTempId: string | null;
  customName: string;
  isSection: boolean;
  unit: string | null;
  planVolume: number | null;
  planUnitPrice: number | null;
  planClientUnitPrice: number | null;
  responsibleHint: string | null;
  sourceLine: number;
};

export function PasteSpreadsheetModal({
  projectId,
  onClose,
  onImported,
}: PasteSpreadsheetModalProps) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<PreviewNode[] | null>(null);
  const [parseErrors, setParseErrors] = useState<
    { line: number; raw: string; reason: string }[]
  >([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    sections: number;
    items: number;
  } | null>(null);

  const sectionCount = useMemo(
    () => preview?.filter((n) => n.isSection).length ?? 0,
    [preview],
  );
  const itemCount = useMemo(
    () => preview?.filter((n) => !n.isSection).length ?? 0,
    [preview],
  );

  async function parsePreview() {
    setResult(null);
    setParseErrors([]);
    if (!text.trim()) {
      setPreview(null);
      return;
    }
    // Викликаємо backend dry-parse: відправляємо text і отримуємо
    // parsed nodes без створення (через GET? простіше окремий поле на POST
    // з ?dry=1, але для простоти тут виконуємо парсинг локально через
    // інлайн-копію того самого алгоритму).
    // Замість дублювання — fetch на POST з Accept: dry, але ми не маємо
    // dry-режиму. Робимо POST до /import-spreadsheet → отримуємо помилки
    // якщо порожньо. Inline-парсинг тут потребує дублювання.
    //
    // Pragmatic compromise: невеликий локальний парсер.
    const parsed = parseLocally(text);
    setPreview(parsed.nodes);
    setParseErrors(parsed.errors);
  }

  async function doImport() {
    if (!preview) return;
    setImporting(true);
    setResult(null);
    try {
      const res = await fetch(
        `/api/admin/projects/${projectId}/import-spreadsheet`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            nodes: preview, // дозволяємо передати відредагований preview
          }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Помилка імпорту");
      }
      const json = (await res.json()) as {
        data: { sections: number; items: number };
      };
      setResult(json.data);
      await onImported();
    } catch (err) {
      console.error("[paste-spreadsheet-modal] import failed", err);
      alert(err instanceof Error ? err.message : "Помилка імпорту");
    } finally {
      setImporting(false);
    }
  }

  function updatePreview(idx: number, patch: Partial<PreviewNode>) {
    setPreview((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }
  function removeFromPreview(idx: number) {
    setPreview((prev) => (prev ? prev.filter((_, i) => i !== idx) : prev));
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="flex max-h-[88vh] w-full max-w-[840px] flex-col rounded-2xl shadow-2xl"
          style={{
            backgroundColor: T.panel,
            border: `1px solid ${T.borderSoft}`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className="flex items-start justify-between gap-3 border-b px-5 py-4"
            style={{ borderColor: T.borderSoft }}
          >
            <div>
              <div
                className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider"
                style={{ color: T.textMuted }}
              >
                <ClipboardPaste size={12} />
                Імпорт з Excel / Google Sheets
              </div>
              <h3
                className="mt-1 text-[16px] font-bold"
                style={{ color: T.textPrimary }}
              >
                Вставити рядки таблиці
              </h3>
              <p
                className="mt-1 text-[12px]"
                style={{ color: T.textSecondary }}
              >
                Скопіюй з таблиці і встав сюди (Cmd+C / Ctrl+C → Cmd+V).
                Розділи (одна колонка) стануть етапами; рядки з
                обсягом + ціною — підетапами.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full transition hover:brightness-95"
              style={{ color: T.textMuted, backgroundColor: T.panelSoft }}
            >
              <X size={14} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {!preview && !result && (
              <>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={10}
                  placeholder={`Промислова підлога\nМонтаж лотка водовідведення\tм.п.\t92\t400\nМонтаж опалубки\tм.п.\t39\t150\nУлаштування бетону М-350\tм2\t3000\t200\t300`}
                  className="w-full rounded-lg border px-3 py-2 font-mono text-[12px] outline-none"
                  style={{
                    backgroundColor: T.panelSoft,
                    borderColor: T.borderSoft,
                    color: T.textPrimary,
                    minHeight: 240,
                  }}
                />
                <div
                  className="mt-2 text-[11px]"
                  style={{ color: T.textMuted }}
                >
                  <b>Формат рядка-підетапу (через табуляцію):</b>{" "}
                  Назва → Од.виміру → Обсяг → Вартість за од. → (опційно) Ціна
                  для замовника.
                </div>
              </>
            )}

            {preview && !result && (
              <div>
                <div
                  className="mb-2 flex items-center justify-between text-[12px]"
                  style={{ color: T.textSecondary }}
                >
                  <span>
                    Розпізнано: <b>{sectionCount}</b> розділ(ів),{" "}
                    <b>{itemCount}</b> підетап(ів). Перевір і відредагуй за потреби.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPreview(null);
                      setParseErrors([]);
                    }}
                    className="text-[11px] underline"
                    style={{ color: T.textMuted }}
                  >
                    Назад до тексту
                  </button>
                </div>
                {parseErrors.length > 0 && (
                  <div
                    className="mb-2 rounded border px-2 py-1.5 text-[11px]"
                    style={{
                      backgroundColor: T.warningSoft,
                      borderColor: T.warning + "55",
                      color: T.textSecondary,
                    }}
                  >
                    <AlertCircle size={11} className="mr-1 inline" />
                    Пропущено {parseErrors.length} рядок(ів):{" "}
                    {parseErrors
                      .slice(0, 3)
                      .map((e) => `№${e.line}`)
                      .join(", ")}
                    {parseErrors.length > 3 ? "…" : ""}
                  </div>
                )}
                <div className="overflow-x-auto rounded-lg border" style={{ borderColor: T.borderSoft }}>
                  <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
                    <thead style={{ backgroundColor: T.panelSoft }}>
                      <tr>
                        <th className="px-2 py-1.5 text-left text-[10px] font-bold" style={{ color: T.textMuted }}>
                          Тип
                        </th>
                        <th className="px-2 py-1.5 text-left text-[10px] font-bold" style={{ color: T.textMuted }}>
                          Назва
                        </th>
                        <th className="px-2 py-1.5 text-center text-[10px] font-bold" style={{ color: T.textMuted }}>
                          Од.
                        </th>
                        <th className="px-2 py-1.5 text-right text-[10px] font-bold" style={{ color: T.textMuted }}>
                          Обсяг
                        </th>
                        <th className="px-2 py-1.5 text-right text-[10px] font-bold" style={{ color: T.textMuted }}>
                          Вартість
                        </th>
                        <th className="px-2 py-1.5 text-right text-[10px] font-bold" style={{ color: T.textMuted }}>
                          Замовнику
                        </th>
                        <th className="px-2 py-1.5 text-right text-[10px] font-bold" style={{ color: T.textMuted }}>
                          Σ Витрати
                        </th>
                        <th className="px-2 py-1.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((node, idx) => {
                        const total = (node.planVolume ?? 0) * (node.planUnitPrice ?? 0);
                        return (
                          <tr
                            key={node.tempId}
                            style={{
                              borderTop: `1px solid ${T.borderSoft}`,
                              backgroundColor: node.isSection ? T.panelSoft : T.panel,
                            }}
                          >
                            <td className="px-2 py-1 text-[11px]" style={{ color: T.textMuted }}>
                              {node.isSection ? "Розділ" : "↳ Підетап"}
                            </td>
                            <td className="px-2 py-1">
                              <input
                                value={node.customName}
                                onChange={(e) => updatePreview(idx, { customName: e.target.value })}
                                className="w-full rounded border px-1.5 py-0.5 text-[12px]"
                                style={{
                                  backgroundColor: T.panel,
                                  borderColor: T.borderSoft,
                                  color: T.textPrimary,
                                  fontWeight: node.isSection ? 600 : 400,
                                }}
                              />
                            </td>
                            <td className="px-2 py-1">
                              <input
                                value={node.unit ?? ""}
                                onChange={(e) =>
                                  updatePreview(idx, { unit: e.target.value || null })
                                }
                                disabled={node.isSection}
                                className="w-14 rounded border px-1 py-0.5 text-center text-[11px]"
                                style={{
                                  backgroundColor: T.panel,
                                  borderColor: T.borderSoft,
                                  color: T.textPrimary,
                                }}
                              />
                            </td>
                            <td className="px-2 py-1">
                              <input
                                type="number"
                                value={node.planVolume ?? ""}
                                onChange={(e) =>
                                  updatePreview(idx, {
                                    planVolume:
                                      e.target.value === "" ? null : Number(e.target.value),
                                  })
                                }
                                disabled={node.isSection}
                                className="w-20 rounded border px-1 py-0.5 text-right text-[11px]"
                                style={{
                                  backgroundColor: T.panel,
                                  borderColor: T.borderSoft,
                                  color: T.textPrimary,
                                }}
                              />
                            </td>
                            <td className="px-2 py-1">
                              <input
                                type="number"
                                value={node.planUnitPrice ?? ""}
                                onChange={(e) =>
                                  updatePreview(idx, {
                                    planUnitPrice:
                                      e.target.value === "" ? null : Number(e.target.value),
                                  })
                                }
                                disabled={node.isSection}
                                className="w-24 rounded border px-1 py-0.5 text-right text-[11px]"
                                style={{
                                  backgroundColor: T.panel,
                                  borderColor: T.borderSoft,
                                  color: T.textPrimary,
                                }}
                              />
                            </td>
                            <td className="px-2 py-1">
                              <input
                                type="number"
                                value={node.planClientUnitPrice ?? ""}
                                onChange={(e) =>
                                  updatePreview(idx, {
                                    planClientUnitPrice:
                                      e.target.value === "" ? null : Number(e.target.value),
                                  })
                                }
                                disabled={node.isSection}
                                className="w-24 rounded border px-1 py-0.5 text-right text-[11px]"
                                style={{
                                  backgroundColor: T.panel,
                                  borderColor: T.borderSoft,
                                  color: T.textPrimary,
                                }}
                              />
                            </td>
                            <td
                              className="px-2 py-1 text-right text-[11px] font-semibold"
                              style={{ color: total > 0 ? T.textPrimary : T.textMuted }}
                            >
                              {total > 0 ? formatCurrency(total) : "—"}
                            </td>
                            <td className="px-2 py-1">
                              <button
                                type="button"
                                onClick={() => removeFromPreview(idx)}
                                title="Видалити з preview"
                                className="text-[11px]"
                                style={{ color: T.danger }}
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {result && (
              <div
                className="rounded-lg border p-4 text-[12px]"
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
                  <Check size={14} />
                  Імпорт завершено
                </div>
                <div style={{ color: T.textSecondary }}>
                  Створено <b>{result.sections}</b> розділ(ів) і{" "}
                  <b>{result.items}</b> підетап(ів). STAGE_AUTO записи у
                  фінансуванні створено автоматично з обсягу × вартості.
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-between border-t px-5 py-3"
            style={{ borderColor: T.borderSoft }}
          >
            <button
              type="button"
              onClick={onClose}
              className="rounded px-3 py-1.5 text-[12px] font-medium transition"
              style={{
                backgroundColor: T.panelSoft,
                color: T.textSecondary,
              }}
            >
              {result ? "Готово" : "Скасувати"}
            </button>
            {!result && (
              <div className="flex items-center gap-2">
                {!preview ? (
                  <button
                    type="button"
                    onClick={parsePreview}
                    disabled={!text.trim()}
                    className="rounded px-3 py-1.5 text-[12px] font-semibold transition disabled:opacity-50"
                    style={{
                      backgroundColor: T.accentPrimary,
                      color: "white",
                    }}
                  >
                    Розпізнати
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={doImport}
                    disabled={importing || preview.length === 0}
                    className="flex items-center gap-1.5 rounded px-3 py-1.5 text-[12px] font-semibold transition disabled:opacity-50"
                    style={{
                      backgroundColor: T.success,
                      color: "white",
                    }}
                  >
                    {importing ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Check size={12} />
                    )}
                    Імпортувати ({preview.length})
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ---- Локальний парсер (дзеркало серверного для миттєвого preview) ----

function parseLocally(text: string): {
  nodes: PreviewNode[];
  errors: { line: number; raw: string; reason: string }[];
} {
  const HEADER_KW = [
    "назва",
    "об'єм",
    "обєм",
    "обсяг",
    "од.",
    "одиниц",
    "вартість",
    "ціна",
    "замовник",
    "відповідальний",
    "статус",
  ];
  const UNIT_HINT = new Set([
    "шт",
    "шт.",
    "м",
    "м.",
    "м2",
    "м²",
    "м3",
    "м³",
    "кг",
    "т",
    "л",
    "пог.м",
    "м.п.",
    "м.п",
    "пог",
    "год",
  ]);

  function isLikelyHeader(cells: string[]) {
    const lc = cells.join(" ").toLowerCase();
    let h = 0;
    for (const k of HEADER_KW) if (lc.includes(k)) h++;
    return h >= 2;
  }
  function num(s: string): number | null {
    if (!s) return null;
    const cleaned = s.replace(/[   ]/g, "").replace(/[₴$€£]/g, "");
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    let normalized = cleaned;
    if (lastComma >= 0 && lastDot >= 0) {
      normalized =
        lastComma > lastDot
          ? cleaned.replace(/\./g, "").replace(",", ".")
          : cleaned.replace(/,/g, "");
    } else if (lastComma >= 0) {
      const after = cleaned.length - lastComma - 1;
      normalized = after <= 3 ? cleaned.replace(",", ".") : cleaned.replace(/,/g, "");
    }
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }
  function isUnit(s: string) {
    return UNIT_HINT.has(s.toLowerCase()) || /^[а-яa-z]{1,5}\.?\d?$/i.test(s);
  }
  function tempId() {
    return `tmp_${Math.random().toString(36).slice(2, 10)}`;
  }

  const nodes: PreviewNode[] = [];
  const errors: { line: number; raw: string; reason: string }[] = [];
  let currentSection: string | null = null;
  let headerSkipped = false;

  const lines = text.split(/\r?\n/);
  lines.forEach((rawLine, i) => {
    const line = rawLine.replace(/ /g, " ");
    if (!line.trim()) return;
    let cells = line.split("\t");
    if (cells.length === 1) cells = line.split(/\s{2,}|\s*\|\s*|;/);
    cells = cells.map((c) => c.trim());
    if (!headerSkipped && isLikelyHeader(cells)) {
      headerSkipped = true;
      return;
    }
    headerSkipped = true;
    const nonEmpty = cells.filter(Boolean);
    if (nonEmpty.length === 0) return;
    const first = cells[0];
    if (!first) {
      errors.push({ line: i + 1, raw: rawLine, reason: "Порожня перша колонка" });
      return;
    }
    if (nonEmpty.length === 1) {
      const id = tempId();
      nodes.push({
        tempId: id,
        parentTempId: null,
        customName: first.slice(0, 200),
        isSection: true,
        unit: null,
        planVolume: null,
        planUnitPrice: null,
        planClientUnitPrice: null,
        responsibleHint: null,
        sourceLine: i + 1,
      });
      currentSection = id;
      return;
    }
    const nums: number[] = [];
    let unit: string | null = null;
    let responsible: string | null = null;
    cells.forEach((c, idx) => {
      if (!c || idx === 0) return;
      if (isUnit(c) && !unit) {
        unit = c;
        return;
      }
      const n = num(c);
      if (n !== null) {
        nums.push(n);
        return;
      }
      const lc = c.toLowerCase();
      if (lc === "новий" || lc.includes("процес") || lc.includes("заверш") || lc.includes("очік"))
        return;
      if (!responsible && idx <= 5) responsible = c;
    });
    if (nums.length === 0 && !unit) {
      const id = tempId();
      nodes.push({
        tempId: id,
        parentTempId: null,
        customName: first.slice(0, 200),
        isSection: true,
        unit: null,
        planVolume: null,
        planUnitPrice: null,
        planClientUnitPrice: null,
        responsibleHint: null,
        sourceLine: i + 1,
      });
      currentSection = id;
      return;
    }
    nodes.push({
      tempId: tempId(),
      parentTempId: currentSection,
      customName: first.slice(0, 200),
      isSection: false,
      unit,
      planVolume: nums[0] ?? null,
      planUnitPrice: nums[1] ?? null,
      planClientUnitPrice: nums[2] ?? null,
      responsibleHint: responsible,
      sourceLine: i + 1,
    });
  });
  return { nodes, errors };
}
