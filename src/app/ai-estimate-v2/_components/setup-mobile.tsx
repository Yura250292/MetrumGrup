"use client";

import { useRef, useState, ChangeEvent, DragEvent } from "react";
import {
  ArrowLeft,
  Settings,
  CloudUpload,
  Sparkles,
  Square,
  Database,
  ChevronRight,
  ChevronDown,
  Check,
  Timer,
  FileText,
  X,
  Loader2,
} from "lucide-react";
import { T } from "./tokens";
import { formatBytes } from "../_lib/format";
import type { AiEstimateController } from "../_lib/use-controller";

export function SetupMobile({ controller }: { controller: AiEstimateController }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [paramsOpen, setParamsOpen] = useState(false);

  const totalSize = controller.files.reduce((sum, f) => sum + f.size, 0);
  const filesReady = controller.files.length > 0;
  const paramsReady = controller.area.trim() !== "";
  const readiness = (filesReady ? 50 : 0) + (controller.wizardCompleted ? 30 : 0) + (paramsReady ? 20 : 0);
  const isBusy = controller.isAnalyzing || controller.isChunkedGenerating;

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
    const picked = Array.from(e.target.files);
    if (picked.length > 0) controller.addFiles(picked);
    e.target.value = "";
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length > 0) controller.addFiles(dropped);
  }

  return (
    <div
      className="relative flex w-full max-w-[430px] flex-col pb-32"
      style={{ backgroundColor: T.background, color: T.textPrimary, minHeight: "100vh" }}
    >
      {/* Top bar */}
      <header
        className="flex h-14 items-center justify-between border-b px-4 sticky top-0 z-10"
        style={{ backgroundColor: T.panel, borderColor: T.borderSoft }}
      >
        <div className="flex items-center gap-2.5">
          <ArrowLeft size={18} style={{ color: T.textPrimary }} />
          <span className="text-sm font-semibold" style={{ color: T.textPrimary }}>
            AI Кошторис
          </span>
        </div>
        <Settings size={18} style={{ color: T.textSecondary }} />
      </header>

      {/* Hero */}
      <section className="flex flex-col gap-3.5 px-5 py-6">
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: T.textPrimary }}>
          AI генератор кошторисів
        </h1>
        <p className="text-[13px] leading-relaxed" style={{ color: T.textSecondary }}>
          Створюйте будівельні кошториси за допомогою інженерних AI-агентів.
        </p>
        <div className="flex gap-1.5">
          <span
            className="rounded-full px-2.5 py-1.5 text-[10px] font-bold"
            style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
          >
            AI + RAG
          </span>
          <span
            className="rounded-full px-2.5 py-1.5 text-[10px] font-bold"
            style={{ backgroundColor: T.panelElevated, color: T.textSecondary }}
          >
            Prozorro
          </span>
          <span
            className="rounded-full px-2.5 py-1.5 text-[10px] font-bold"
            style={{ backgroundColor: T.panelElevated, color: T.success }}
          >
            Перевірено
          </span>
        </div>
      </section>

      {/* Content */}
      <div className="flex flex-col gap-3.5 px-4">
        {/* Dropzone */}
        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center gap-2.5 rounded-2xl p-6 cursor-pointer"
          style={{ backgroundColor: T.panel, border: `1px dashed ${T.borderSoft}` }}
        >
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl"
            style={{ backgroundColor: T.accentPrimarySoft }}
          >
            <CloudUpload size={24} style={{ color: T.accentPrimary }} />
          </div>
          <span className="text-center text-sm font-semibold" style={{ color: T.textPrimary }}>
            Натисніть, щоб додати документи
          </span>
          <span className="text-center text-[11px]" style={{ color: T.textMuted }}>
            PDF · креслення · фото
          </span>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.xlsx,.xls,.csv,.jpg,.jpeg,.png,.webp,.zip"
            className="hidden"
            onChange={onFileChange}
          />
          {controller.uploadProgress && (
            <div className="text-xs" style={{ color: T.accentPrimary }}>
              {controller.uploadProgress.uploadedFiles}/{controller.uploadProgress.totalFiles} ({controller.uploadProgress.percentage}%)
            </div>
          )}
        </div>

        {/* Files */}
        {filesReady && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-semibold" style={{ color: T.textMuted }}>
                {controller.files.length} файлів · {formatBytes(totalSize)}
              </span>
              <button onClick={controller.clearFiles} className="text-[11px] font-semibold" style={{ color: T.accentPrimary }}>
                Очистити
              </button>
            </div>
            {controller.files.map((file, i) => (
              <div
                key={`${file.name}-${i}`}
                className="flex items-center gap-3 rounded-xl p-3.5"
                style={{ backgroundColor: T.panelElevated, border: `1px solid ${T.borderSoft}` }}
              >
                <div
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: T.accentPrimarySoft }}
                >
                  <FileText size={18} style={{ color: T.accentPrimary }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold" style={{ color: T.textPrimary }}>
                    {file.name}
                  </div>
                  <div className="text-[10px]" style={{ color: T.textMuted }}>
                    {formatBytes(file.size)}
                  </div>
                </div>
                <button onClick={() => controller.removeFile(i)}>
                  <X size={16} style={{ color: T.textMuted }} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Setup accordion */}
        <div className="flex flex-col gap-2.5 mt-2">
          <span className="px-1 text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
            Налаштування
          </span>

          <button
            onClick={controller.openWizard}
            className="flex items-center gap-3 rounded-xl p-4"
            style={{
              backgroundColor: T.panel,
              border: `1px solid ${controller.wizardCompleted ? T.borderSoft : T.borderAccent}`,
            }}
          >
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ backgroundColor: T.accentPrimarySoft }}
            >
              <Sparkles size={16} style={{ color: T.accentPrimary }} />
            </div>
            <div className="flex flex-1 flex-col gap-0.5 text-left">
              <span className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
                {controller.wizardCompleted ? "Майстер заповнено" : "Запустити майстер"}
              </span>
              <span className="text-[11px]" style={{ color: T.accentPrimary }}>
                {controller.wizardCompleted ? "Редагувати" : "Підвищить точність на ~30%"}
              </span>
            </div>
            <ChevronRight size={16} style={{ color: T.textMuted }} />
          </button>

          <div
            className="flex flex-col rounded-xl"
            style={{
              backgroundColor: T.panel,
              border: `1px solid ${T.borderSoft}`,
            }}
          >
            <button
              onClick={() => setParamsOpen((v) => !v)}
              className="flex items-center gap-3 p-4"
            >
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{ backgroundColor: T.panelElevated }}
              >
                <Square size={16} style={{ color: T.textSecondary }} />
              </div>
              <div className="flex flex-1 flex-col gap-0.5 text-left">
                <span className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
                  Параметри проєкту
                </span>
                <span className="text-[11px]" style={{ color: T.textMuted }}>
                  {paramsReady ? `${controller.area} м²` : "Площа не вказана"}
                </span>
              </div>
              <ChevronDown
                size={16}
                style={{
                  color: T.textMuted,
                  transform: paramsOpen ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s",
                }}
              />
            </button>
            {paramsOpen && (
              <div className="flex flex-col gap-3 px-4 pb-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-semibold tracking-wide" style={{ color: T.textMuted }}>
                    Площа, м²
                  </label>
                  <input
                    value={controller.area}
                    onChange={(e) => controller.setArea(e.target.value)}
                    placeholder="напр. 320"
                    inputMode="numeric"
                    className="rounded-xl px-3.5 py-3 text-sm outline-none"
                    style={{
                      backgroundColor: T.panelSoft,
                      border: `1px solid ${T.borderStrong}`,
                      color: T.textPrimary,
                    }}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-semibold tracking-wide" style={{ color: T.textMuted }}>
                    Нотатки
                  </label>
                  <textarea
                    value={controller.projectNotes}
                    onChange={(e) => controller.setProjectNotes(e.target.value)}
                    rows={3}
                    placeholder="Особливості проєкту…"
                    className="resize-none rounded-xl px-3.5 py-3 text-[13px] outline-none"
                    style={{
                      backgroundColor: T.panelSoft,
                      border: `1px solid ${T.borderStrong}`,
                      color: T.textPrimary,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <div
            className="flex items-center gap-3 rounded-xl p-4"
            style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
          >
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ backgroundColor: T.successSoft }}
            >
              <Database size={16} style={{ color: T.success }} />
            </div>
            <div className="flex flex-1 flex-col gap-0.5">
              <span className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
                Джерела даних
              </span>
              <span className="text-[11px]" style={{ color: T.success }}>
                Внутрішні · RAG · Prozorro
              </span>
            </div>
          </div>
        </div>

        {/* Readiness */}
        <div
          className="flex flex-col gap-3 rounded-xl p-[18px] mt-2"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold" style={{ color: T.textPrimary }}>
              {filesReady && controller.wizardCompleted ? "Готово" : "Майже готово"}
            </span>
            <DialMini value={readiness} />
          </div>
          <div className="flex flex-col gap-1.5">
            <RowSmall icon={filesReady ? Check : Timer} bg={filesReady ? T.success : T.warning} text="Файли завантажені" />
            <RowSmall
              icon={paramsReady ? Check : Timer}
              bg={paramsReady ? T.success : T.warning}
              text="Параметри"
            />
            <RowSmall
              icon={controller.wizardCompleted ? Check : Timer}
              bg={controller.wizardCompleted ? T.success : T.warning}
              text="Майстер — рекомендовано"
            />
          </div>
        </div>

        {controller.error && (
          <div
            className="rounded-xl px-3 py-2.5 text-xs mt-2"
            style={{ backgroundColor: T.dangerSoft, color: T.danger, border: `1px solid ${T.danger}` }}
          >
            {controller.error}
          </div>
        )}
      </div>

      {/* Sticky bottom CTA */}
      <div
        className="fixed bottom-0 left-1/2 -translate-x-1/2 flex w-full max-w-[430px] flex-col gap-2.5 border-t px-4 pt-4 pb-7 z-20"
        style={{ backgroundColor: T.panel, borderColor: T.borderSoft }}
      >
        <button
          onClick={controller.runPreAnalysis}
          disabled={!filesReady || isBusy}
          className="flex w-full items-center justify-center gap-2.5 rounded-xl px-5 py-4 text-sm font-bold text-white disabled:opacity-50"
          style={{ backgroundColor: T.accentPrimary }}
        >
          {isBusy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {controller.isAnalyzing ? "Аналіз…" : "Згенерувати AI кошторис"}
        </button>
      </div>
    </div>
  );
}

function DialMini({ value }: { value: number }) {
  const size = 36;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (value / 100) * c;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke={T.panelElevated} strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={T.success}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          fill="none"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[9px] font-bold" style={{ color: T.textPrimary }}>
          {value}%
        </span>
      </div>
    </div>
  );
}

function RowSmall({ icon: Icon, bg, text }: { icon: any; bg: string; text: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-4 w-4 items-center justify-center rounded-full" style={{ backgroundColor: bg }}>
        <Icon size={10} color="#FFFFFF" />
      </div>
      <span className="text-xs" style={{ color: T.textPrimary }}>
        {text}
      </span>
    </div>
  );
}
