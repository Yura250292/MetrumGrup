"use client";

import { useState } from "react";
import { Download, RefreshCw, Clock, AlertCircle, Loader2, Check, Trash2 } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { AiRenderJobDTO } from "@/lib/ai-render/types";
import { AiRenderComparisonSlider } from "./ai-render-comparison-slider";

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  QUEUED: { label: "В черзі", color: T.textMuted, bg: T.panelElevated },
  PROCESSING: { label: "Генерація...", color: T.accentPrimary, bg: T.accentPrimarySoft },
  UPLOADING: { label: "Збереження...", color: T.accentPrimary, bg: T.accentPrimarySoft },
  COMPLETED: { label: "Готово", color: T.success, bg: T.successSoft },
  FAILED: { label: "Помилка", color: T.danger, bg: T.dangerSoft },
  CANCELLED: { label: "Скасовано", color: T.textMuted, bg: T.panelElevated },
};

export function AiRenderResultCard({
  job,
  onRegenerate,
  onDelete,
}: {
  job: AiRenderJobDTO;
  onRegenerate?: (job: AiRenderJobDTO) => void;
  onDelete?: (jobId: string) => void;
}) {
  const [showComparison, setShowComparison] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const statusInfo = STATUS_MAP[job.status] ?? STATUS_MAP.QUEUED;
  const isInProgress = job.status === "QUEUED" || job.status === "PROCESSING" || job.status === "UPLOADING";
  const canDelete = !isInProgress;

  return (
    <div
      className="overflow-hidden rounded-2xl"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      {/* Image area */}
      <div
        className="relative aspect-[4/3] flex items-center justify-center"
        style={{ backgroundColor: T.panelElevated }}
      >
        {isInProgress && (
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={32} className="animate-spin" style={{ color: T.accentPrimary }} />
            <span className="text-[13px] font-medium" style={{ color: T.textSecondary }}>
              {statusInfo.label}
            </span>
          </div>
        )}

        {job.status === "FAILED" && (
          <div className="flex flex-col items-center gap-3 px-4 text-center">
            <AlertCircle size={32} style={{ color: T.danger }} />
            <span className="text-[12px]" style={{ color: T.textMuted }}>
              {job.errorMessage || "Помилка генерації"}
            </span>
          </div>
        )}

        {job.status === "CANCELLED" && (
          <div className="flex flex-col items-center gap-3 px-4 text-center">
            <AlertCircle size={32} style={{ color: T.textMuted }} />
            <span className="text-[12px]" style={{ color: T.textMuted }}>
              Скасовано
            </span>
          </div>
        )}

        {job.status === "COMPLETED" && job.outputUrl && (
          <>
            {showComparison ? (
              <AiRenderComparisonSlider inputUrl={job.inputUrl} outputUrl={job.outputUrl} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={job.outputUrl}
                alt="AI Render"
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => setShowComparison(true)}
              />
            )}
          </>
        )}

        {/* Status badge */}
        <div
          className="absolute top-2 right-2 flex items-center gap-1.5 rounded-lg px-2 py-1"
          style={{ backgroundColor: statusInfo.bg }}
        >
          {isInProgress && <Loader2 size={12} className="animate-spin" style={{ color: statusInfo.color }} />}
          {job.status === "COMPLETED" && <Check size={12} style={{ color: statusInfo.color }} />}
          {(job.status === "FAILED" || job.status === "CANCELLED") && <AlertCircle size={12} style={{ color: statusInfo.color }} />}
          <span className="text-[11px] font-semibold" style={{ color: statusInfo.color }}>
            {statusInfo.label}
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold truncate" style={{ color: T.textPrimary }}>
            {job.mode === "SKETCH_TO_RENDER" ? "Ескіз → Рендер" : "Фото → Рендер"}
          </span>
          {job.durationMs && (
            <span className="flex items-center gap-1 text-[11px]" style={{ color: T.textMuted }}>
              <Clock size={10} />
              {(job.durationMs / 1000).toFixed(1)}с
            </span>
          )}
        </div>

        {job.stylePreset && (
          <span className="text-[11px]" style={{ color: T.textSecondary }}>
            Стиль: {job.stylePreset.replace(/_/g, " ")}
          </span>
        )}

        <div className="flex items-center justify-between">
          <span className="text-[11px]" style={{ color: T.textMuted }}>
            {job.createdBy.name} · {new Date(job.createdAt).toLocaleDateString("uk-UA")}
          </span>
          <div className="flex gap-1">
            {job.status === "COMPLETED" && job.outputUrl && (
              <>
                <button
                  onClick={() => setShowComparison((v) => !v)}
                  className="p-1.5 rounded-lg transition-colors hover:opacity-80"
                  style={{ backgroundColor: T.panelElevated }}
                  title={showComparison ? "Показати результат" : "Порівняти"}
                >
                  <RefreshCw size={14} style={{ color: T.textSecondary }} />
                </button>
                <a
                  href={job.outputUrl}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-lg transition-colors hover:opacity-80"
                  style={{ backgroundColor: T.panelElevated }}
                  title="Завантажити"
                >
                  <Download size={14} style={{ color: T.textSecondary }} />
                </a>
              </>
            )}
            {(job.status === "COMPLETED" || job.status === "FAILED") && onRegenerate && (
              <button
                onClick={() => onRegenerate(job)}
                className="p-1.5 rounded-lg transition-colors hover:opacity-80"
                style={{ backgroundColor: T.accentPrimarySoft }}
                title="Згенерувати повторно"
              >
                <RefreshCw size={14} style={{ color: T.accentPrimary }} />
              </button>
            )}
            {canDelete && onDelete && (
              confirmDelete ? (
                <button
                  onClick={() => { onDelete(job.id); setConfirmDelete(false); }}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors hover:opacity-80"
                  style={{ backgroundColor: T.dangerSoft, color: T.danger }}
                  title="Підтвердити видалення"
                >
                  <Trash2 size={12} />
                  Так
                </button>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="p-1.5 rounded-lg transition-colors hover:opacity-80"
                  style={{ backgroundColor: T.panelElevated }}
                  title="Видалити"
                >
                  <Trash2 size={14} style={{ color: T.textMuted }} />
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
