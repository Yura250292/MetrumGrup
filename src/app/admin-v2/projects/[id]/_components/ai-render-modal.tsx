"use client";

import { useState, useCallback } from "react";
import { X, ImageIcon, Camera, Sparkles, Upload, Loader2 } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { useProjectFiles } from "@/hooks/useProjectFiles";
import { useAiStylePresets, useCreateAiRender, useAiCredits } from "@/hooks/useAiRender";
import { AiStylePresetPicker } from "./ai-style-preset-picker";
import type { AiRenderMode } from "@prisma/client";

type Step = "mode" | "image" | "settings";

export function AiRenderModal({
  projectId,
  onClose,
  onJobCreated,
}: {
  projectId: string;
  onClose: () => void;
  onJobCreated: (jobId: string) => void;
}) {
  const [step, setStep] = useState<Step>("mode");
  const [mode, setMode] = useState<AiRenderMode>("SKETCH_TO_RENDER");
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedFileUrl, setSelectedFileUrl] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
  const [stylePreset, setStylePreset] = useState<string | null>("modern_minimalist");
  const [prompt, setPrompt] = useState("");
  const [strength, setStrength] = useState(0.7);
  const [controlnetType, setControlnetType] = useState<string>("lineart");
  const [outputSize, setOutputSize] = useState<{ w: number; h: number }>({ w: 1024, h: 768 });

  const { data: files } = useProjectFiles(projectId);
  const { data: presets } = useAiStylePresets(projectId);
  const { data: credits } = useAiCredits(projectId);
  const createRender = useCreateAiRender(projectId);

  const imageFiles = files?.filter((f) => f.mimeType.startsWith("image/")) ?? [];

  const handleModeSelect = (m: AiRenderMode) => {
    setMode(m);
    setStrength(m === "SKETCH_TO_RENDER" ? 0.75 : 0.55);
    setControlnetType(m === "SKETCH_TO_RENDER" ? "lineart" : "depth");
    setStep("image");
  };

  const handleFileSelect = (fileId: string, fileUrl: string) => {
    setSelectedFileId(fileId);
    setSelectedFileUrl(fileUrl);
    setUploadedFile(null);
    setUploadPreviewUrl(null);
    setStep("settings");
  };

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFile(file);
    setUploadPreviewUrl(URL.createObjectURL(file));
    setSelectedFileId(null);
    setSelectedFileUrl(null);
    setStep("settings");
  }, []);

  const handleGenerate = async () => {
    // If user uploaded a new file, first upload to project files
    let inputFileId = selectedFileId ?? undefined;
    let inputUrl = selectedFileUrl ?? undefined;

    if (uploadedFile && !inputFileId) {
      // Upload via multipart
      const formData = new FormData();
      formData.append("file", uploadedFile);
      const res = await fetch(`/api/admin/projects/${projectId}/files`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      inputFileId = data.file.id;
      inputUrl = data.file.url;
    }

    const job = await createRender.mutateAsync({
      mode,
      inputFileId,
      inputUrl,
      stylePreset: stylePreset ?? undefined,
      prompt: prompt.trim() || undefined,
      strength,
      controlnetType,
      width: outputSize.w,
      height: outputSize.h,
    });

    onJobCreated(job.id);
    onClose();
  };

  const hasInput = !!selectedFileId || !!uploadedFile;
  const previewUrl = uploadPreviewUrl || selectedFileUrl;
  const creditsNeeded = outputSize.w > 1024 || outputSize.h > 1024 ? 2 : 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.7)" }}>
      <div
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl p-6"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Sparkles size={18} style={{ color: T.accentPrimary }} />
            <h2 className="text-[16px] font-bold" style={{ color: T.textPrimary }}>
              AI Візуалізація
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:opacity-70">
            <X size={18} style={{ color: T.textMuted }} />
          </button>
        </div>

        {/* Step: Mode Selection */}
        {step === "mode" && (
          <div className="flex flex-col gap-3">
            <p className="text-[13px] mb-1" style={{ color: T.textSecondary }}>
              Оберіть режим візуалізації
            </p>
            <button
              onClick={() => handleModeSelect("SKETCH_TO_RENDER")}
              className="flex items-center gap-4 rounded-xl p-4 transition-all hover:opacity-90"
              style={{ backgroundColor: T.panelElevated, border: `1px solid ${T.borderSoft}` }}
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: T.accentPrimarySoft }}>
                <ImageIcon size={24} style={{ color: T.accentPrimary }} />
              </div>
              <div className="text-left">
                <span className="text-[14px] font-semibold block" style={{ color: T.textPrimary }}>
                  Ескіз → Рендер
                </span>
                <span className="text-[12px]" style={{ color: T.textMuted }}>
                  Перетворіть архітектурний ескіз у фотореалістичний рендер
                </span>
              </div>
            </button>
            <button
              onClick={() => handleModeSelect("PHOTO_RERENDER")}
              className="flex items-center gap-4 rounded-xl p-4 transition-all hover:opacity-90"
              style={{ backgroundColor: T.panelElevated, border: `1px solid ${T.borderSoft}` }}
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: T.accentPrimarySoft }}>
                <Camera size={24} style={{ color: T.accentPrimary }} />
              </div>
              <div className="text-left">
                <span className="text-[14px] font-semibold block" style={{ color: T.textPrimary }}>
                  Фото → Рендер
                </span>
                <span className="text-[12px]" style={{ color: T.textMuted }}>
                  Перетворіть фото об'єкта у стилізовану візуалізацію
                </span>
              </div>
            </button>
          </div>
        )}

        {/* Step: Image Selection */}
        {step === "image" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <p className="text-[13px]" style={{ color: T.textSecondary }}>
                Оберіть зображення
              </p>
              <button
                onClick={() => setStep("mode")}
                className="text-[12px] font-medium"
                style={{ color: T.accentPrimary }}
              >
                ← Назад
              </button>
            </div>

            {/* Upload new */}
            <label
              className="flex items-center gap-3 rounded-xl p-4 cursor-pointer transition-all hover:opacity-90"
              style={{ backgroundColor: T.panelElevated, border: `2px dashed ${T.borderStrong}` }}
            >
              <Upload size={20} style={{ color: T.accentPrimary }} />
              <span className="text-[13px] font-medium" style={{ color: T.textPrimary }}>
                Завантажити нове зображення
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
              />
            </label>

            {/* Existing project images */}
            {imageFiles.length > 0 && (
              <>
                <p className="text-[12px] font-medium" style={{ color: T.textMuted }}>
                  Або оберіть з файлів проєкту
                </p>
                <div className="grid grid-cols-3 gap-2 max-h-[250px] overflow-y-auto">
                  {imageFiles.map((file) => (
                    <button
                      key={file.id}
                      onClick={() => handleFileSelect(file.id, file.url)}
                      className="aspect-square rounded-xl overflow-hidden transition-all hover:ring-2"
                      style={{
                        border: `2px solid ${selectedFileId === file.id ? T.accentPrimary : "transparent"}`,
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={file.url}
                        alt={file.name}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Step: Settings */}
        {step === "settings" && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <p className="text-[13px]" style={{ color: T.textSecondary }}>
                Налаштування генерації
              </p>
              <button
                onClick={() => setStep("image")}
                className="text-[12px] font-medium"
                style={{ color: T.accentPrimary }}
              >
                ← Назад
              </button>
            </div>

            {/* Preview */}
            {previewUrl && (
              <div className="rounded-xl overflow-hidden aspect-video" style={{ backgroundColor: T.panelElevated }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt="Preview" className="w-full h-full object-contain" />
              </div>
            )}

            {/* Style presets */}
            {presets && presets.length > 0 && (
              <div>
                <label className="text-[12px] font-medium mb-2 block" style={{ color: T.textSecondary }}>
                  Архітектурний стиль
                </label>
                <AiStylePresetPicker
                  presets={presets}
                  selected={stylePreset}
                  onSelect={setStylePreset}
                />
              </div>
            )}

            {/* Custom prompt */}
            <div>
              <label className="text-[12px] font-medium mb-1.5 block" style={{ color: T.textSecondary }}>
                Опис (необов'язково)
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Двоповерховий будинок з терасою, натуральний камінь..."
                rows={2}
                className="w-full rounded-xl px-3 py-2.5 text-[13px] resize-none outline-none"
                style={{
                  backgroundColor: T.panelElevated,
                  color: T.textPrimary,
                  border: `1px solid ${T.borderSoft}`,
                }}
              />
            </div>

            {/* Strength slider */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[12px] font-medium" style={{ color: T.textSecondary }}>
                  AI Imagination
                </label>
                <span className="text-[12px] font-bold" style={{ color: T.accentPrimary }}>
                  {(strength * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min={10}
                max={95}
                value={strength * 100}
                onChange={(e) => setStrength(Number(e.target.value) / 100)}
                className="w-full accent-[#3B5BFF]"
              />
              <div className="flex justify-between mt-1">
                <span className="text-[10px]" style={{ color: T.textMuted }}>Точніше до оригіналу</span>
                <span className="text-[10px]" style={{ color: T.textMuted }}>Більше творчості</span>
              </div>
            </div>

            {/* Output size */}
            <div>
              <label className="text-[12px] font-medium mb-1.5 block" style={{ color: T.textSecondary }}>
                Розмір
              </label>
              <div className="flex gap-2">
                {[
                  { w: 1024, h: 768, label: "Landscape" },
                  { w: 1024, h: 1024, label: "Square" },
                  { w: 768, h: 1024, label: "Portrait" },
                ].map((size) => {
                  const isSelected = outputSize.w === size.w && outputSize.h === size.h;
                  return (
                    <button
                      key={size.label}
                      onClick={() => setOutputSize({ w: size.w, h: size.h })}
                      className="flex-1 rounded-xl py-2 text-[12px] font-medium transition-all"
                      style={{
                        backgroundColor: isSelected ? T.accentPrimarySoft : T.panelElevated,
                        color: isSelected ? T.accentPrimary : T.textSecondary,
                        border: `1px solid ${isSelected ? T.borderAccent : T.borderSoft}`,
                      }}
                    >
                      {size.w}x{size.h}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Generate button */}
            <button
              onClick={handleGenerate}
              disabled={!hasInput || createRender.isPending || (credits?.remaining ?? 0) < creditsNeeded}
              className="flex items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-bold text-white transition-all disabled:opacity-50"
              style={{ backgroundColor: T.accentPrimary }}
            >
              {createRender.isPending ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Генерація...
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Згенерувати ({creditsNeeded} кредит{creditsNeeded > 1 ? "и" : ""})
                </>
              )}
            </button>

            {createRender.isError && (
              <p className="text-[12px] text-center" style={{ color: T.danger }}>
                {createRender.error.message}
              </p>
            )}

            {credits && credits.remaining < creditsNeeded && (
              <p className="text-[12px] text-center" style={{ color: T.warning }}>
                Недостатньо кредитів ({credits.remaining} з {credits.total})
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
