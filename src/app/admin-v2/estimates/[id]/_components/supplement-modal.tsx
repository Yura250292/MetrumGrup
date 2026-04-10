"use client";

import { useRef, ChangeEvent, DragEvent, useState } from "react";
import {
  X,
  Plus,
  CloudUpload,
  FolderOpen,
  FileText,
  Sparkles,
  Loader2,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { EstimateController } from "../_lib/use-controller";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export function SupplementModal({ controller }: { controller: EstimateController }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const totalSize = controller.supplementFiles.reduce((sum, f) => sum + f.size, 0);
  const progress = controller.supplementProgress?.progress ?? 0;
  const canSubmit =
    !controller.supplementing &&
    (controller.supplementFiles.length > 0 || controller.supplementInfo.trim().length > 0);

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length > 0) controller.addSupplementFiles(dropped);
  }
  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
    const picked = Array.from(e.target.files);
    if (picked.length > 0) controller.addSupplementFiles(picked);
    e.target.value = "";
  }

  return (
    <div
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[680px] flex-col"
      style={{ backgroundColor: T.panel, borderLeft: `1px solid ${T.borderStrong}` }}
    >
      {/* Header */}
      <header
        className="flex items-start justify-between gap-4 border-b px-8 pt-7 pb-5"
        style={{ borderColor: T.borderSoft }}
      >
        <div className="flex flex-col gap-1.5">
          <span
            className="inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider"
            style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
          >
            <Plus size={12} /> ДОПОВНИТИ КОШТОРИС
          </span>
          <h2 className="text-[22px] font-bold" style={{ color: T.textPrimary }}>
            Додати інформацію та регенерувати
          </h2>
          <p className="max-w-[540px] text-xs leading-relaxed" style={{ color: T.textSecondary }}>
            Завантажте нові креслення/специфікації або опишіть зміни. AI зіллє їх у наявний кошторис.
          </p>
        </div>
        <button
          onClick={controller.closeSupplement}
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ backgroundColor: T.panelElevated }}
        >
          <X size={16} style={{ color: T.textSecondary }} />
        </button>
      </header>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-8 py-6">
        {/* Dropzone */}
        <div
          onDrop={onDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          className="flex items-center gap-4 rounded-2xl p-6"
          style={{
            backgroundColor: isDragging ? T.accentPrimarySoft : T.panelElevated,
            border: `1px dashed ${isDragging ? T.accentPrimary : T.borderStrong}`,
          }}
        >
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl"
            style={{ backgroundColor: T.accentPrimarySoft }}
          >
            <CloudUpload size={24} style={{ color: T.accentPrimary }} />
          </div>
          <div className="flex flex-1 flex-col gap-0.5">
            <span className="text-sm font-semibold" style={{ color: T.textPrimary }}>
              Перетягніть документи
            </span>
            <span className="text-xs" style={{ color: T.textMuted }}>
              PDF · креслення · фото
            </span>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white"
            style={{ backgroundColor: T.accentPrimary }}
          >
            <FolderOpen size={16} /> Обрати
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.xlsx,.xls,.csv,.jpg,.jpeg,.png,.webp"
            className="hidden"
            onChange={onFileChange}
          />
        </div>

        {controller.supplementFiles.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
                Очікують завантаження
              </span>
              <span className="text-[11px]" style={{ color: T.textMuted }}>
                {controller.supplementFiles.length} файлів · {formatBytes(totalSize)}
              </span>
            </div>
            {controller.supplementFiles.map((file, idx) => (
              <div
                key={`${file.name}-${idx}`}
                className="flex items-center gap-3 rounded-xl p-3.5"
                style={{ backgroundColor: T.panelElevated, border: `1px solid ${T.borderSoft}` }}
              >
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-lg"
                  style={{ backgroundColor: T.accentPrimarySoft }}
                >
                  <FileText size={18} style={{ color: T.accentPrimary }} />
                </div>
                <div className="flex flex-1 flex-col gap-0.5">
                  <div className="text-sm font-semibold" style={{ color: T.textPrimary }}>
                    {file.name}
                  </div>
                  <div className="text-[11px]" style={{ color: T.textMuted }}>
                    {formatBytes(file.size)}
                  </div>
                </div>
                <button onClick={() => controller.removeSupplementFile(idx)}>
                  <X size={16} style={{ color: T.textMuted }} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
            ДОДАТКОВА ІНФОРМАЦІЯ
          </span>
          <textarea
            value={controller.supplementInfo}
            onChange={(e) => controller.setSupplementInfo(e.target.value)}
            placeholder="Опишіть зміни які треба врахувати"
            rows={5}
            className="resize-none rounded-xl px-4 py-3.5 text-[13px] outline-none"
            style={{
              backgroundColor: T.panelSoft,
              border: `1px solid ${T.borderStrong}`,
              color: T.textPrimary,
            }}
          />
        </div>

        {(controller.supplementing || controller.supplementProgress) && (
          <div
            className="flex flex-col gap-3.5 rounded-2xl p-5"
            style={{ backgroundColor: T.panelElevated, border: `1px solid ${T.borderSoft}` }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
                Прогрес
              </span>
              <span className="text-[11px] font-semibold" style={{ color: T.accentPrimary }}>
                {progress}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: T.panelSoft }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${progress}%`, backgroundColor: T.accentPrimary }}
              />
            </div>
            {controller.supplementProgress?.message && (
              <div className="text-xs" style={{ color: T.textMuted }}>
                {controller.supplementProgress.message}
              </div>
            )}
          </div>
        )}

        {controller.supplementError && (
          <div
            className="rounded-xl px-3 py-2.5 text-xs"
            style={{
              backgroundColor: T.dangerSoft,
              color: T.danger,
              border: `1px solid ${T.danger}`,
            }}
          >
            {controller.supplementError}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer
        className="flex items-center justify-end gap-2.5 border-t px-8 py-5"
        style={{ backgroundColor: T.panelSoft, borderColor: T.borderSoft }}
      >
        <button
          onClick={controller.closeSupplement}
          className="rounded-xl px-4 py-3 text-sm font-medium"
          style={{ color: T.textSecondary }}
        >
          Скасувати
        </button>
        <button
          onClick={controller.supplementEstimate}
          disabled={!canSubmit}
          className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
          style={{ backgroundColor: T.accentPrimary }}
        >
          {controller.supplementing ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Sparkles size={16} />
          )}
          {controller.supplementing ? "Регенерація…" : "Запустити"}
        </button>
      </footer>
    </div>
  );
}
