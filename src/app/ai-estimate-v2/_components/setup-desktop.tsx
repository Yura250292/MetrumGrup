"use client";

import { useRef, useState, DragEvent, ChangeEvent } from "react";
import {
  Sparkles,
  Globe,
  ShieldCheck,
  CloudUpload,
  FolderOpen,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  Square,
  TrendingUp,
  ListChecks,
  BadgeCheck,
  ArrowRight,
  Check,
  Timer,
  Database,
  Eye,
  Info,
  ChevronRight,
  X,
  Loader2,
} from "lucide-react";
import { T } from "./tokens";
import { MetricPill, ChecklistItem, SourceStatusCard, ScoreDial } from "./primitives";
import { formatBytes } from "../_lib/format";
import type { AiEstimateController } from "../_lib/use-controller";

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (ext === "pdf") return FileText;
  if (["xlsx", "xls", "csv"].includes(ext)) return FileSpreadsheet;
  if (["jpg", "jpeg", "png", "webp", "zip"].includes(ext)) return ImageIcon;
  return FileText;
}

export function SetupDesktop({ controller }: { controller: AiEstimateController }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const totalSize = controller.files.reduce((sum, f) => sum + f.size, 0);
  const filesReady = controller.files.length > 0;
  const paramsReady = controller.area.trim() !== "";

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length > 0) controller.addFiles(dropped);
  }
  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(true);
  }
  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
    const picked = Array.from(e.target.files);
    if (picked.length > 0) controller.addFiles(picked);
    e.target.value = "";
  }

  const isBusy = controller.isAnalyzing || controller.isChunkedGenerating;
  const readiness =
    (filesReady ? 50 : 0) + (controller.wizardCompleted ? 30 : 0) + (paramsReady ? 20 : 0);

  return (
    <div className="w-full max-w-[1440px]" style={{ backgroundColor: T.background, color: T.textPrimary }}>
      {/* Hero */}
      <section className="flex items-start justify-between px-12 pt-10 pb-8">
        <div className="flex max-w-3xl flex-col gap-3.5">
          <div className="flex items-center gap-2 text-xs">
            <span style={{ color: T.textMuted }}>Кошториси</span>
            <ChevronRight size={12} style={{ color: T.textMuted }} />
            <span className="font-semibold" style={{ color: T.textSecondary }}>
              AI Генератор
            </span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight" style={{ color: T.textPrimary }}>
            AI генератор кошторисів
          </h1>
          <p className="text-[15px] leading-relaxed" style={{ color: T.textSecondary }}>
            Створюйте, верифікуйте та уточнюйте будівельні кошториси за допомогою інженерних AI-агентів — на основі
            RAG-памʼяті та ринкових даних Prozorro.
          </p>
          <div className="flex items-center gap-2 pt-1.5">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold"
              style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
            >
              <Sparkles size={12} /> AI + RAG
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold"
              style={{ backgroundColor: T.panelElevated, color: T.textPrimary, border: `1px solid ${T.borderStrong}` }}
            >
              <Globe size={12} style={{ color: T.accentSecondary }} /> Ринок Prozorro
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold"
              style={{ backgroundColor: T.panelElevated, color: T.textPrimary, border: `1px solid ${T.borderStrong}` }}
            >
              <ShieldCheck size={12} style={{ color: T.success }} /> Інженерний контроль
            </span>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <MetricPill label="Файли" value={String(controller.files.length)} />
          <MetricPill label="Розмір" value={controller.files.length ? formatBytes(totalSize) : "—"} />
          <MetricPill label="Час до чернетки" value="~3 хв" />
        </div>
      </section>

      {/* Workspace */}
      <section className="flex items-start gap-8 px-12 pb-14">
        {/* Main column */}
        <div className="flex flex-1 flex-col gap-5">
          {/* Dropzone */}
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={() => setIsDragging(false)}
            className="flex flex-col items-center gap-4 rounded-2xl p-8 transition"
            style={{
              backgroundColor: isDragging ? T.accentPrimarySoft : T.panel,
              border: `1px dashed ${isDragging ? T.accentPrimary : T.borderSoft}`,
            }}
          >
            <div
              className="flex h-16 w-16 items-center justify-center rounded-2xl"
              style={{ backgroundColor: T.accentPrimarySoft }}
            >
              <CloudUpload size={30} style={{ color: T.accentPrimary }} />
            </div>
            <div className="text-center text-lg font-semibold" style={{ color: T.textPrimary }}>
              Перетягніть документи проєкту, щоб почати
            </div>
            <div className="text-center text-[13px]" style={{ color: T.textMuted }}>
              PDF, креслення, фото, ВВР, специфікації — до 64 МБ на файл. AI парсить і звіряє кожен документ.
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isBusy}
                className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-60"
                style={{ backgroundColor: T.accentPrimary }}
              >
                <FolderOpen size={16} /> Обрати файли
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.xlsx,.xls,.csv,.jpg,.jpeg,.png,.webp,.zip"
                className="hidden"
                onChange={onFileChange}
              />
            </div>
            {controller.uploadProgress && (
              <div className="mt-2 text-xs" style={{ color: T.accentPrimary }}>
                Завантаження: {controller.uploadProgress.uploadedFiles}/{controller.uploadProgress.totalFiles} (
                {controller.uploadProgress.percentage}%)
              </div>
            )}
          </div>

          {/* Files added */}
          {filesReady && (
            <div
              className="rounded-2xl p-6"
              style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="text-[15px] font-semibold" style={{ color: T.textPrimary }}>
                    Документи проєкту
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{ backgroundColor: T.panelElevated, color: T.textSecondary }}
                  >
                    {controller.files.length} {controller.files.length === 1 ? "файл" : "файлів"} ·{" "}
                    {formatBytes(totalSize)}
                  </span>
                </div>
                <button
                  onClick={controller.clearFiles}
                  className="text-xs font-medium"
                  style={{ color: T.textMuted }}
                >
                  Очистити
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {controller.files.map((file, i) => {
                  const Icon = getFileIcon(file.name);
                  return (
                    <div
                      key={`${file.name}-${i}`}
                      className="flex items-center gap-3 rounded-xl p-3.5"
                      style={{ backgroundColor: T.panelElevated, border: `1px solid ${T.borderSoft}` }}
                    >
                      <div
                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg"
                        style={{ backgroundColor: T.accentPrimarySoft }}
                      >
                        <Icon size={20} style={{ color: T.accentPrimary }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold" style={{ color: T.textPrimary }}>
                          {file.name}
                        </div>
                        <div className="text-[11px]" style={{ color: T.textMuted }}>
                          {formatBytes(file.size)}
                        </div>
                      </div>
                      <button onClick={() => controller.removeFile(i)} aria-label="Видалити">
                        <X size={16} style={{ color: T.textMuted }} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Wizard promo */}
          <div
            className="rounded-2xl p-6"
            style={{
              backgroundColor: T.panel,
              border: `1px solid ${controller.wizardCompleted ? T.borderSoft : T.borderAccent}`,
            }}
          >
            <div className="flex items-center gap-6">
              <div className="flex flex-1 flex-col gap-2.5">
                <span
                  className="inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider"
                  style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
                >
                  <Sparkles size={12} />{" "}
                  {controller.wizardCompleted ? "МАЙСТЕР ЗАВЕРШЕНО" : "РЕЖИМ З МАЙСТРОМ"}
                </span>
                <div className="text-lg font-bold" style={{ color: T.textPrimary }}>
                  {controller.wizardCompleted
                    ? "Майстер заповнено — точність максимальна"
                    : "Запустіть майстер для ~3× кращої точності"}
                </div>
                <p className="text-[13px] leading-relaxed" style={{ color: T.textSecondary }}>
                  5 коротких кроків про геометрію, матеріали, конструктив та оздоблення. Майстер покращує обсяги,
                  кількість позицій і ціни.
                </p>
                <div className="flex items-center gap-4 pt-1">
                  <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: T.textSecondary }}>
                    <TrendingUp size={14} style={{ color: T.success }} /> Кращі обсяги
                  </span>
                  <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: T.textSecondary }}>
                    <ListChecks size={14} style={{ color: T.success }} /> Більше позицій
                  </span>
                  <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: T.textSecondary }}>
                    <BadgeCheck size={14} style={{ color: T.success }} /> Вища впевненість
                  </span>
                </div>
              </div>
              <div className="flex w-[200px] flex-col items-center gap-3">
                <ScoreDial
                  value={controller.wizardCompleted ? 100 : 0}
                  size={120}
                  color={controller.wizardCompleted ? T.success : T.accentPrimary}
                  bigLabel={controller.wizardCompleted ? "✓" : "0 / 5"}
                  label={controller.wizardCompleted ? "готово" : "кроків"}
                />
                <button
                  onClick={controller.openWizard}
                  className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white transition hover:brightness-95"
                  style={{ backgroundColor: T.accentPrimary }}
                >
                  {controller.wizardCompleted ? "Редагувати" : "Запустити майстер"} <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Project parameters */}
          <div className="rounded-2xl p-6" style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <span className="text-[15px] font-semibold" style={{ color: T.textPrimary }}>
                  Параметри проєкту
                </span>
                <span className="text-xs" style={{ color: T.textMuted }}>
                  Уточніть бриф для AI — площа, обсяг, обмеження
                </span>
              </div>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider"
                style={{ backgroundColor: T.warningSoft, color: T.warning }}
              >
                ОПЦІОНАЛЬНО
              </span>
            </div>
            <div className="flex gap-4">
              <div className="flex flex-1 flex-col gap-1.5">
                <label className="text-[11px] font-semibold tracking-wide" style={{ color: T.textMuted }}>
                  Площа проєкту, м²
                </label>
                <div
                  className="flex items-center gap-2 rounded-xl px-3.5 py-3"
                  style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderStrong}` }}
                >
                  <Square size={16} style={{ color: T.textMuted }} />
                  <input
                    value={controller.area}
                    onChange={(e) => controller.setArea(e.target.value)}
                    placeholder="напр. 320"
                    inputMode="numeric"
                    className="flex-1 bg-transparent text-sm outline-none"
                    style={{ color: T.textPrimary }}
                  />
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <label className="text-[11px] font-semibold tracking-wide" style={{ color: T.textMuted }}>
                  Модель генерації
                </label>
                <select
                  value={controller.selectedGenerationModel}
                  onChange={(e) =>
                    controller.setSelectedGenerationModel(e.target.value as "gemini" | "openai" | "anthropic" | "pipeline")
                  }
                  className="rounded-xl px-3.5 py-3 text-sm font-medium outline-none"
                  style={{
                    backgroundColor: T.panelSoft,
                    border: `1px solid ${T.borderAccent}`,
                    color: T.textPrimary,
                  }}
                >
                  <option value="gemini">Gemini</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="pipeline">Pipeline</option>
                </select>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold tracking-wide" style={{ color: T.textMuted }}>
                Нотатки проєкту
              </label>
              <textarea
                value={controller.projectNotes}
                onChange={(e) => controller.setProjectNotes(e.target.value)}
                placeholder="Опишіть особливості проєкту, обмеження, побажання…"
                rows={4}
                className="rounded-xl px-4 py-3.5 text-[13px] leading-relaxed outline-none resize-none"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderStrong}`,
                  color: T.textPrimary,
                }}
              />
            </div>
          </div>

          {/* Data sources */}
          <div className="rounded-2xl p-6" style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <span className="text-[15px] font-semibold" style={{ color: T.textPrimary }}>
                  Джерела даних
                </span>
                <span className="text-xs" style={{ color: T.textMuted }}>
                  Внутрішні документи · RAG памʼять · Ринковий контекст Prozorro
                </span>
              </div>
              <label className="flex items-center gap-2 text-xs font-medium" style={{ color: T.accentPrimary }}>
                <input
                  type="checkbox"
                  checked={controller.checkProzorro}
                  onChange={(e) => controller.setCheckProzorro(e.target.checked)}
                />
                Перевіряти Prozorro
              </label>
            </div>
            <div className="flex flex-col gap-2.5">
              <SourceStatusCard
                icon={FileText}
                title="Внутрішні документи"
                meta={controller.files.length ? `${controller.files.length} файлів додано` : "Немає файлів"}
              />
              <SourceStatusCard icon={Database} title="RAG памʼять" meta="Підключено · референси" />
              <SourceStatusCard
                icon={Globe}
                title="Ринок Prozorro"
                meta={controller.checkProzorro ? "Активно" : "Вимкнено"}
              />
            </div>
          </div>

          {controller.error && (
            <div
              className="flex items-start gap-2 rounded-xl px-4 py-3 text-sm"
              style={{ backgroundColor: T.dangerSoft, border: `1px solid ${T.danger}`, color: T.danger }}
            >
              <Info size={16} className="mt-0.5 flex-shrink-0" />
              <div className="flex-1">{controller.error}</div>
              <button onClick={controller.clearError}>
                <X size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="flex w-[380px] flex-col gap-4">
          <div className="rounded-2xl p-6" style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}>
            <div className="mb-3.5 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
                  ГОТОВНІСТЬ
                </span>
                <span className="text-base font-semibold" style={{ color: T.textPrimary }}>
                  {filesReady && controller.wizardCompleted
                    ? "Готово до генерації"
                    : filesReady
                      ? "Майже готово"
                      : "Додайте файли"}
                </span>
              </div>
              <ScoreDial value={readiness} size={48} bigLabel={`${readiness}%`} />
            </div>
            <div className="flex flex-col gap-2">
              <ChecklistItem
                icon={filesReady ? Check : Timer}
                title="Файли завантажено"
                meta={filesReady ? `${controller.files.length} · ${formatBytes(totalSize)}` : "Натисніть або перетягніть"}
                state={filesReady ? "done" : "warning"}
              />
              <ChecklistItem
                icon={paramsReady ? Check : Timer}
                title="Параметри проєкту"
                meta={paramsReady ? `${controller.area} м²` : "Площа не вказана"}
                state={paramsReady ? "done" : "warning"}
              />
              <ChecklistItem
                icon={controller.wizardCompleted ? Check : Timer}
                title="Майстер"
                meta={controller.wizardCompleted ? "Завершено" : "Опціонально, але рекомендовано"}
                state={controller.wizardCompleted ? "done" : "warning"}
              />
              <ChecklistItem icon={Check} title="Джерела даних" meta="Внутрішні · RAG · Prozorro" />
            </div>
          </div>

          <div
            className="flex flex-col gap-4 rounded-2xl p-6"
            style={{ backgroundColor: T.panelElevated, border: `1px solid ${T.borderAccent}` }}
          >
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
                ОЧІКУВАННЯ ВІД ГЕНЕРАЦІЇ
              </span>
              <div className="flex gap-2">
                <ExpectCell label="Режим" value={controller.wizardCompleted ? "Майстер" : "Швидкий"} />
                <ExpectCell label="Модель" value={controller.selectedGenerationModel} />
                <ExpectCell label="ETA" value="~3 хв" />
              </div>
            </div>
            <button
              disabled={!filesReady || isBusy}
              onClick={controller.runPreAnalysis}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl px-5 py-4 text-[15px] font-bold text-white transition hover:brightness-95 disabled:opacity-50"
              style={{ backgroundColor: T.accentPrimary }}
            >
              {controller.isAnalyzing ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
              {controller.isAnalyzing ? "Аналізуємо файли…" : "Згенерувати AI кошторис"}
            </button>
            <button
              disabled={!filesReady}
              className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-[13px] font-semibold transition hover:brightness-95 disabled:opacity-50"
              style={{ backgroundColor: T.panel, color: T.textSecondary, border: `1px solid ${T.borderStrong}` }}
            >
              <Eye size={16} /> Попередній перегляд
            </button>
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-2.5"
              style={{ backgroundColor: T.accentPrimarySoft }}
            >
              <Info size={14} style={{ color: T.accentPrimary }} />
              <span className="text-[11px] font-medium" style={{ color: T.accentPrimary }}>
                Майстер підвищує впевненість на ~30%
              </span>
            </div>
          </div>

          <div className="rounded-2xl p-6" style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}>
            <div className="mb-3 text-[13px] font-semibold" style={{ color: T.textPrimary }}>
              Що відбудеться після генерації
            </div>
            <div className="flex flex-col gap-2.5">
              <NextStep n="1" title="Пре-аналіз" meta="Документи парсяться та звіряються" />
              <NextStep n="2" title="Поетапна генерація" meta="Секції створюються паралельно" />
              <NextStep n="3" title="Верифікація" meta="Інженерна перевірка та оцінка впевненості" />
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}

function ExpectCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-1 flex-col gap-0.5 rounded-lg px-3 py-2.5" style={{ backgroundColor: T.panel }}>
      <span className="text-[10px]" style={{ color: T.textMuted }}>
        {label}
      </span>
      <span className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
        {value}
      </span>
    </div>
  );
}

function NextStep({ n, title, meta }: { n: string; title: string; meta: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div
        className="flex flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
        style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary, width: 22, height: 22 }}
      >
        {n}
      </div>
      <div className="flex flex-col gap-0.5">
        <div className="text-xs font-semibold" style={{ color: T.textPrimary }}>
          {title}
        </div>
        <div className="text-[11px]" style={{ color: T.textMuted }}>
          {meta}
        </div>
      </div>
    </div>
  );
}
