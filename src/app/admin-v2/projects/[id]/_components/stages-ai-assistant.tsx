"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  FileText,
  Hammer,
  Image as ImageIcon,
  Loader2,
  Package,
  Paperclip,
  Sparkles,
  X,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency } from "@/lib/utils";
import { stageDisplayName } from "@/lib/constants";
import type { StageRow } from "./stage-table";

/**
 * AI-помічник для розділу «Етапи виконання».
 *
 * Користувач описує вільним текстом виконані роботи / закуплені матеріали
 * («Залив 200 м³ бетону на фундамент, купив 50 кг цвяхів за 1200 грн»).
 * AI (Gemini) парсить, класифікує LABOR/MATERIAL і пропонує куди розмістити.
 * Користувач коригує у preview-таблиці і застосовує — це створює нові етапи
 * (за потреби), оновлює fact-поля існуючих або додає матеріали через
 * standard materials API.
 *
 * Параметри:
 *   open / onClose — controlled state з parent (stages-section toolbar)
 *   stages         — дерево для UI-валідації стейдж-селекту
 *   onApplied      — викликається після успішного apply (parent робить refetch)
 */

type Priority = "LOW" | "MEDIUM" | "HIGH";

type AiParseItem = {
  tempId: string;
  costType: "MATERIAL" | "LABOR";
  title: string;
  quantity: number | null | undefined;
  unit: string | null | undefined;
  unitPrice: number | null | undefined;
  amount: number | null | undefined;
  supplier: string | null | undefined;
  confidence: number;
  rawLine: string;
  proposedStageId: string | null | undefined;
  proposedNewStageTempId: string | null | undefined;
  reasoning: string | null | undefined;
  priority?: Priority | null;
  estimatedHours?: number | null;
};

type AiParseNewStage = {
  tempId: string;
  name: string;
  parentTempId: string | null | undefined;
};

type ApplyResult = {
  stagesCreated: number;
  stagesUpdated: number;
  materialsCreated: number;
};

type Props = {
  projectId: string;
  open: boolean;
  onClose: () => void;
  stages: StageRow[];
  onApplied: () => void | Promise<void>;
};

type DraftItem = AiParseItem & {
  accepted: boolean;
  // Поточний вибір користувача — окремо від AI-пропозиції щоб дозволити edit.
  targetStageRef: string; // existing-id АБО tempId з newStages
};

type UploadedFile = {
  key: string;
  name: string;
  mime: string;
  size: number;
};

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 МБ
const MAX_FILES = 5;
const ACCEPT =
  "image/*,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,.xlsx,.xls";

export function StagesAiAssistant({
  projectId,
  open,
  onClose,
  stages,
  onApplied,
}: Props) {
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [newStages, setNewStages] = useState<AiParseNewStage[]>([]);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      // Reset при закритті
      setText("");
      setItems([]);
      setNewStages([]);
      setError(null);
      setResult(null);
      setFiles([]);
      setFileErrors([]);
    }
  }, [open]);

  async function handleFilePick(picked: FileList | null) {
    if (!picked || picked.length === 0) return;
    const arr = Array.from(picked);
    const slots = MAX_FILES - files.length;
    if (slots <= 0) {
      setError(`Максимум ${MAX_FILES} файлів`);
      return;
    }
    setError(null);
    setUploading(true);
    try {
      for (const file of arr.slice(0, slots)) {
        if (file.size > MAX_FILE_SIZE) {
          setError(`${file.name}: завеликий файл (>20 МБ)`);
          continue;
        }
        const mime = file.type || "application/octet-stream";

        // 1) Get presigned PUT URL
        let presignRes: Response;
        try {
          presignRes = await fetch(
            `/api/admin/projects/${projectId}/stages/ai-upload`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                originalName: file.name,
                mimeType: mime,
                size: file.size,
              }),
            },
          );
        } catch (e) {
          throw new Error(
            `[presign network] ${file.name}: ${
              e instanceof Error ? e.message : String(e)
            }`,
          );
        }
        if (!presignRes.ok) {
          const j = await presignRes.json().catch(() => ({}));
          throw new Error(
            `[presign ${presignRes.status}] ${file.name}: ${
              j.error ?? "невідома помилка"
            }`,
          );
        }
        let key: string;
        let putUrl: string;
        try {
          const parsed = (await presignRes.json()) as {
            key: string;
            putUrl: string;
          };
          key = parsed.key;
          putUrl = parsed.putUrl;
        } catch (e) {
          throw new Error(
            `[presign json] ${file.name}: ${
              e instanceof Error ? e.message : String(e)
            }`,
          );
        }
        if (!putUrl || typeof putUrl !== "string") {
          throw new Error(`[presign empty] ${file.name}: backend не повернув putUrl`);
        }
        // Валідуємо URL — щоб діагностувати «The string did not match...»
        try {
          // eslint-disable-next-line no-new
          new URL(putUrl);
        } catch (e) {
          throw new Error(
            `[presign bad URL] ${file.name}: ${
              e instanceof Error ? e.message : String(e)
            } (url[0..120]=${putUrl.slice(0, 120)})`,
          );
        }

        // 2) Direct PUT to R2
        let putRes: Response;
        try {
          putRes = await fetch(putUrl, {
            method: "PUT",
            body: file,
            headers: { "Content-Type": mime },
          });
        } catch (e) {
          throw new Error(
            `[R2 PUT network] ${file.name}: ${
              e instanceof Error ? e.message : String(e)
            }`,
          );
        }
        if (!putRes.ok) {
          throw new Error(
            `[R2 PUT ${putRes.status}] ${file.name}: ${putRes.statusText}`,
          );
        }
        setFiles((prev) => [
          ...prev,
          { key, name: file.name, mime, size: file.size },
        ]);
      }
    } catch (err) {
      console.error("[ai-upload] failed:", err);
      setError(err instanceof Error ? err.message : "Помилка завантаження файлу");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removeFile(key: string) {
    setFiles((prev) => prev.filter((f) => f.key !== key));
  }

  // Map stageId → display label (для dropdown).
  const stageOptions = useMemo(() => {
    const byId = new Map(stages.map((s) => [s.id, s]));
    const indent = (id: string): string => {
      let depth = 0;
      let cur = byId.get(id)?.parentStageId ?? null;
      while (cur) {
        depth++;
        cur = byId.get(cur)?.parentStageId ?? null;
        if (depth > 4) break;
      }
      return "  ".repeat(depth);
    };
    return stages
      .filter((s) => !s.isHidden)
      .map((s) => ({
        value: s.id,
        label: indent(s.id) + stageDisplayName(s),
      }));
  }, [stages]);

  async function handleParse() {
    if (text.trim().length < 5 && files.length === 0) {
      setError("Введи більше тексту або додай файл");
      return;
    }
    setError(null);
    setFileErrors([]);
    setParsing(true);
    setResult(null);
    try {
      let res: Response;
      try {
        res = await fetch(
          `/api/admin/projects/${projectId}/stages/ai-parse`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text,
              fileKeys: files.map((f) => ({
                key: f.key,
                mime: f.mime,
                name: f.name,
              })),
            }),
          },
        );
      } catch (e) {
        throw new Error(
          `[ai-parse network] ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      let json: {
        data?: { items: AiParseItem[]; newStages: AiParseNewStage[]; fileErrors?: string[] };
        error?: string;
        fileErrors?: string[];
      };
      try {
        json = await res.json();
      } catch (e) {
        throw new Error(
          `[ai-parse bad JSON ${res.status}] ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
      if (!res.ok) {
        if (Array.isArray(json.fileErrors) && json.fileErrors.length > 0) {
          setFileErrors(json.fileErrors);
        }
        throw new Error(json.error ?? `[ai-parse ${res.status}] невідома помилка`);
      }
      if (!json.data) {
        throw new Error(
          `[ai-parse no data] response: ${JSON.stringify(json).slice(0, 200)}`,
        );
      }
      const data = json.data;
      setNewStages(data.newStages);
      if (Array.isArray(data.fileErrors) && data.fileErrors.length > 0) {
        setFileErrors(data.fileErrors);
      }
      setItems(
        data.items.map((it) => {
          // Резолвимо початковий targetStageRef
          let targetRef =
            it.proposedStageId ?? it.proposedNewStageTempId ?? "";
          if (!targetRef && data.newStages.length > 0) {
            targetRef = data.newStages[0].tempId;
          }
          if (!targetRef && stages.length > 0) {
            targetRef = stages[0].id;
          }
          return { ...it, accepted: true, targetStageRef: targetRef };
        }),
      );
      if (data.items.length === 0) {
        setError("AI не зміг розпізнати позиції. Спробуй детальніше описати.");
      }
    } catch (err) {
      console.error("[ai-parse] failed:", err);
      setError(err instanceof Error ? err.message : "Помилка парсингу");
    } finally {
      setParsing(false);
    }
  }

  async function handleApply() {
    const accepted = items.filter((it) => it.accepted && it.targetStageRef);
    if (accepted.length === 0) {
      setError("Немає прийнятих позицій для застосування");
      return;
    }
    // Збираємо тільки newStages які реально використовуються.
    const usedTempIds = new Set<string>();
    for (const it of accepted) {
      if (it.targetStageRef.startsWith("new-")) {
        usedTempIds.add(it.targetStageRef);
      }
    }
    // Додаємо предків (parentTempId) рекурсивно.
    const allNewByTempId = new Map(newStages.map((n) => [n.tempId, n]));
    const expand = (tempId: string) => {
      const ns = allNewByTempId.get(tempId);
      if (!ns) return;
      if (ns.parentTempId && ns.parentTempId.startsWith("new-")) {
        usedTempIds.add(ns.parentTempId);
        expand(ns.parentTempId);
      }
    };
    for (const t of [...usedTempIds]) expand(t);

    const newStagesPayload = newStages.filter((n) => usedTempIds.has(n.tempId));

    setError(null);
    setApplying(true);
    try {
      let res: Response;
      try {
        res = await fetch(
          `/api/admin/projects/${projectId}/stages/ai-apply`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: accepted.map((it) => ({
                costType: it.costType,
                title: it.title,
                quantity: it.quantity,
                unit: it.unit,
                unitPrice: it.unitPrice,
                supplier: it.supplier,
                targetStageRef: it.targetStageRef,
                priority: it.priority ?? null,
                estimatedHours: it.estimatedHours ?? null,
              })),
              newStages: newStagesPayload,
            }),
          },
        );
      } catch (e) {
        throw new Error(
          `[ai-apply network] ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      let json: { data?: ApplyResult; error?: string };
      try {
        json = await res.json();
      } catch (e) {
        throw new Error(
          `[ai-apply bad JSON ${res.status}] ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
      if (!res.ok) {
        throw new Error(json.error ?? `[ai-apply ${res.status}] невідома помилка`);
      }
      if (!json.data) {
        throw new Error(
          `[ai-apply no data] response: ${JSON.stringify(json).slice(0, 200)}`,
        );
      }
      setResult(json.data);
      setItems([]);
      setNewStages([]);
      setText("");
      await onApplied();
    } catch (err) {
      console.error("[ai-apply] failed:", err);
      setError(err instanceof Error ? err.message : "Помилка застосування");
    } finally {
      setApplying(false);
    }
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop (light, Notion-style) */}
      <div
        className="fixed inset-0 z-40"
        style={{ backgroundColor: "rgba(0,0,0,0.2)" }}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className="fixed right-0 top-0 z-50 flex h-screen w-full sm:w-[min(92vw,540px)] flex-col shadow-2xl"
        style={{
          backgroundColor: T.panel,
          borderLeft: `1px solid ${T.borderStrong}`,
        }}
      >
        <header
          className="flex items-center justify-between gap-3 px-5 py-3"
          style={{ borderBottom: `1px solid ${T.borderSoft}` }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles size={16} style={{ color: T.violet }} />
            <h2
              className="text-[14px] font-bold"
              style={{ color: T.textPrimary }}
            >
              AI помічник етапів
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5"
            style={{ color: T.textMuted, backgroundColor: T.panelElevated }}
            aria-label="Закрити"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p
            className="mb-3 text-[12px]"
            style={{ color: T.textSecondary }}
          >
            Опиши що виконано чи що купили — AI класифікує позиції на роботи /
            матеріали та запропонує до яких етапів додати. Наприклад:{" "}
            <em>«Залили 200 м³ бетону на фундамент за 80 грн/м³. Купили
            50 кг цвяхів за 24 грн/кг у Епіцентрі.»</em>
          </p>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Опиши вільним текстом..."
            rows={4}
            disabled={parsing || applying}
            className="w-full resize-y rounded-lg border px-3 py-2 text-[13px] outline-none"
            style={{
              backgroundColor: T.panel,
              borderColor: T.borderSoft,
              color: T.textPrimary,
              minHeight: 100,
            }}
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleParse}
              disabled={
                parsing ||
                applying ||
                uploading ||
                (text.trim().length < 5 && files.length === 0)
              }
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold transition disabled:opacity-50"
              style={{ backgroundColor: T.accentPrimary, color: "white" }}
            >
              {parsing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              {parsing ? "AI думає…" : "Розпізнати"}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={parsing || applying || uploading || files.length >= MAX_FILES}
              title="Додати фото / PDF / Excel"
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold transition disabled:opacity-50"
              style={{
                backgroundColor: T.panelElevated,
                color: T.textPrimary,
                border: `1px solid ${T.borderSoft}`,
              }}
            >
              {uploading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Paperclip size={14} />
              )}
              {uploading ? "Завантаження…" : `Додати файл${files.length > 0 ? ` (${files.length}/${MAX_FILES})` : ""}`}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              multiple
              onChange={(e) => void handleFilePick(e.target.files)}
              className="hidden"
            />
            {items.length > 0 && (
              <span className="text-[11px]" style={{ color: T.textMuted }}>
                {items.filter((it) => it.accepted).length} / {items.length}{" "}
                прийнято
              </span>
            )}
          </div>

          {files.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {files.map((f) => (
                <FileChip
                  key={f.key}
                  file={f}
                  onRemove={() => removeFile(f.key)}
                  disabled={parsing || applying}
                />
              ))}
            </div>
          )}

          {fileErrors.length > 0 && (
            <div
              className="mt-2 rounded-lg px-3 py-2 text-[11px]"
              style={{
                backgroundColor: T.warningSoft,
                color: T.warning,
                border: `1px solid ${T.warning}55`,
              }}
            >
              <div className="font-semibold">
                Не всі файли вдалось обробити:
              </div>
              <ul className="mt-1 list-disc pl-4">
                {fileErrors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          {error && (
            <div
              className="mt-3 rounded-lg px-3 py-2 text-[12px]"
              style={{
                backgroundColor: T.dangerSoft ?? "#fee2e2",
                color: T.danger,
                border: `1px solid ${T.danger}55`,
              }}
            >
              {error}
            </div>
          )}

          {result && (
            <div
              className="mt-3 rounded-lg px-3 py-2 text-[12px] flex items-start gap-2"
              style={{
                backgroundColor: T.successSoft,
                color: T.success,
                border: `1px solid ${T.success}55`,
              }}
            >
              <Check size={14} className="mt-0.5 flex-shrink-0" />
              <span>
                Застосовано: <b>{result.stagesCreated}</b> нових етапів,{" "}
                <b>{result.stagesUpdated}</b> оновлень,{" "}
                <b>{result.materialsCreated}</b> матеріалів додано.
              </span>
            </div>
          )}

          {items.length > 0 && (
            <div className="mt-4">
              <div
                className="mb-2 text-[10px] font-bold uppercase tracking-wider"
                style={{ color: T.textMuted }}
              >
                Розпізнані позиції ({items.length})
              </div>
              <div className="flex flex-col gap-2">
                {items.map((it, idx) => (
                  <ItemRow
                    key={it.tempId}
                    item={it}
                    stageOptions={stageOptions}
                    newStages={newStages}
                    onChange={(next) => {
                      setItems((prev) => {
                        const copy = prev.slice();
                        copy[idx] = next;
                        return copy;
                      });
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {newStages.length > 0 && (
            <div className="mt-4">
              <div
                className="mb-2 text-[10px] font-bold uppercase tracking-wider"
                style={{ color: T.textMuted }}
              >
                Нові етапи запропоновано ({newStages.length})
              </div>
              <ul className="flex flex-col gap-1">
                {newStages.map((ns) => (
                  <li
                    key={ns.tempId}
                    className="rounded-lg px-2 py-1 text-[11px]"
                    style={{
                      backgroundColor: T.panelSoft,
                      border: `1px solid ${T.borderSoft}`,
                      color: T.textPrimary,
                    }}
                  >
                    <span style={{ color: T.textMuted }}>+ </span>
                    {ns.name}
                    {ns.parentTempId && (
                      <span style={{ color: T.textMuted }}>
                        {" "}
                        ↳ вкладено
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <footer
          className="flex items-center justify-between gap-3 px-5 py-3"
          style={{ borderTop: `1px solid ${T.borderSoft}` }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={applying}
            className="rounded-lg px-3 py-1.5 text-[12px] font-medium transition"
            style={{ backgroundColor: T.panelElevated, color: T.textPrimary }}
          >
            Закрити
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={
              applying ||
              parsing ||
              items.filter((it) => it.accepted && it.targetStageRef).length === 0
            }
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold transition disabled:opacity-50"
            style={{ backgroundColor: T.success, color: "white" }}
          >
            {applying ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Check size={14} />
            )}
            {applying ? "Застосовую…" : "Застосувати"}
          </button>
        </footer>
      </aside>
    </>
  );
}

function FileChip({
  file,
  onRemove,
  disabled,
}: {
  file: UploadedFile;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const isImage = file.mime.startsWith("image/");
  const isPdf = file.mime === "application/pdf";
  const Icon = isImage ? ImageIcon : isPdf ? FileText : Paperclip;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px]"
      style={{
        backgroundColor: T.accentPrimarySoft,
        color: T.accentPrimary,
        border: `1px solid ${T.accentPrimary}33`,
      }}
    >
      <Icon size={12} />
      <span className="max-w-[160px] truncate" title={file.name}>
        {file.name}
      </span>
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        className="ml-0.5 rounded p-0.5 disabled:opacity-40"
        style={{ color: T.accentPrimary }}
        aria-label="Видалити файл"
      >
        <X size={11} />
      </button>
    </span>
  );
}

function ItemRow({
  item,
  stageOptions,
  newStages,
  onChange,
}: {
  item: DraftItem;
  stageOptions: Array<{ value: string; label: string }>;
  newStages: AiParseNewStage[];
  onChange: (next: DraftItem) => void;
}) {
  const Icon = item.costType === "LABOR" ? Hammer : Package;
  const iconColor = item.costType === "LABOR" ? T.accentPrimary : T.warning;

  return (
    <div
      className="rounded-lg px-3 py-2"
      style={{
        backgroundColor: item.accepted ? T.panelSoft : T.panel,
        border: `1px solid ${item.accepted ? T.borderSoft : T.borderSoft}`,
        opacity: item.accepted ? 1 : 0.5,
      }}
    >
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={item.accepted}
          onChange={(e) => onChange({ ...item, accepted: e.target.checked })}
          className="mt-1 flex-shrink-0"
          style={{ accentColor: T.accentPrimary }}
        />
        <Icon size={14} className="mt-1 flex-shrink-0" style={{ color: iconColor }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span
              className="text-[12px] font-semibold"
              style={{ color: T.textPrimary }}
            >
              {item.title}
            </span>
            <span
              className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
              style={{
                backgroundColor:
                  item.costType === "LABOR"
                    ? T.accentPrimarySoft
                    : T.warningSoft,
                color: iconColor,
              }}
            >
              {item.costType === "LABOR" ? "Робота" : "Матеріал"}
            </span>
          </div>
          <div
            className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px]"
            style={{ color: T.textMuted }}
          >
            {item.quantity !== null && item.quantity !== undefined && (
              <span>
                {item.quantity}
                {item.unit ? ` ${item.unit}` : ""}
              </span>
            )}
            {item.unitPrice !== null && item.unitPrice !== undefined && (
              <span>× {formatCurrency(item.unitPrice)}</span>
            )}
            {item.amount !== null && item.amount !== undefined && (
              <span style={{ color: T.textSecondary, fontWeight: 600 }}>
                = {formatCurrency(item.amount)}
              </span>
            )}
            {item.supplier && <span>· {item.supplier}</span>}
          </div>
          {item.reasoning && (
            <div
              className="mt-0.5 text-[10.5px] italic"
              style={{ color: T.textMuted }}
            >
              {item.reasoning}
            </div>
          )}
          <div className="mt-2 flex items-center gap-1">
            <label
              className="text-[10px]"
              style={{ color: T.textMuted }}
            >
              →
            </label>
            <div className="relative flex-1">
              <select
                value={item.targetStageRef}
                onChange={(e) =>
                  onChange({ ...item, targetStageRef: e.target.value })
                }
                disabled={!item.accepted}
                className="w-full appearance-none rounded border px-2 py-1 pr-6 text-[11px] outline-none"
                style={{
                  backgroundColor: T.panel,
                  borderColor: T.borderSoft,
                  color: T.textPrimary,
                }}
              >
                {newStages.length > 0 && (
                  <optgroup label="Нові етапи">
                    {newStages.map((ns) => (
                      <option key={ns.tempId} value={ns.tempId}>
                        + {ns.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Існуючі етапи">
                  {stageOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </optgroup>
              </select>
              <ChevronDown
                size={11}
                className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2"
                style={{ color: T.textMuted }}
              />
            </div>
          </div>

          {/* Priority + estimated hours — лише для LABOR (для матеріалів зайве). */}
          {item.costType === "LABOR" && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <PriorityPicker
                value={item.priority ?? null}
                disabled={!item.accepted}
                onChange={(p) => onChange({ ...item, priority: p })}
              />
              <div
                className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5"
                style={{
                  backgroundColor: T.panel,
                  borderColor: T.borderSoft,
                }}
              >
                <span className="text-[10px]" style={{ color: T.textMuted }}>
                  Час, год:
                </span>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={item.estimatedHours ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    const n = v === "" ? null : Number(v);
                    onChange({
                      ...item,
                      estimatedHours:
                        n !== null && Number.isFinite(n) && n > 0 ? n : null,
                    });
                  }}
                  disabled={!item.accepted}
                  className="w-14 bg-transparent text-right text-[11px] outline-none"
                  style={{ color: T.textPrimary }}
                  placeholder="—"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const PRIORITY_OPTIONS: Array<{
  value: "LOW" | "MEDIUM" | "HIGH";
  label: string;
  bg: string;
  fg: string;
}> = [
  { value: "LOW", label: "Низький", bg: T.panelElevated, fg: T.textMuted },
  { value: "MEDIUM", label: "Середній", bg: T.accentPrimarySoft, fg: T.accentPrimary },
  { value: "HIGH", label: "Високий", bg: T.warningSoft, fg: T.warning },
];

function PriorityPicker({
  value,
  onChange,
  disabled,
}: {
  value: "LOW" | "MEDIUM" | "HIGH" | null;
  onChange: (v: "LOW" | "MEDIUM" | "HIGH" | null) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded border p-0.5"
      style={{ backgroundColor: T.panel, borderColor: T.borderSoft }}
    >
      <span className="px-1 text-[10px]" style={{ color: T.textMuted }}>
        Пріоритет:
      </span>
      {PRIORITY_OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(active ? null : opt.value)}
            className="rounded px-1.5 py-0.5 text-[10px] font-semibold transition disabled:opacity-50"
            style={{
              backgroundColor: active ? opt.bg : "transparent",
              color: active ? opt.fg : T.textMuted,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
