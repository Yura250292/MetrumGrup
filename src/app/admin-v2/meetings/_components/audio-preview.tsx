"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Upload, Trash2, AlertCircle } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

type Props = {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  fileName: string;
  onSave: () => void;
  onReset: () => void;
  saving?: boolean;
};

export function AudioPreview({
  blob,
  mimeType,
  durationMs,
  fileName,
  onSave,
  onReset,
  saving,
}: Props) {
  const [url, setUrl] = useState<string>("");

  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  const sizeMB = blob.size / 1024 / 1024;
  const tooLarge = blob.size > MAX_UPLOAD_BYTES;

  const durationText = useMemo(() => {
    if (!durationMs) return null;
    const total = Math.round(durationMs / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }, [durationMs]);

  function downloadLocal() {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold" style={{ color: T.textPrimary }}>
            Аудіо готове
          </p>
          <p className="text-xs" style={{ color: T.textMuted }}>
            {sizeMB.toFixed(2)} MB
            {durationText && ` · ${durationText}`}
            {` · ${mimeType.replace(/;.*$/, "")}`}
          </p>
        </div>
      </div>

      {url && (
        <audio src={url} controls className="mb-3 w-full" preload="metadata" />
      )}

      {tooLarge && (
        <div
          className="mb-3 flex items-start gap-2 rounded-lg p-3 text-sm"
          style={{ background: T.dangerSoft, color: T.danger }}
        >
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Файл завеликий для AI-розпізнавання</p>
            <p className="mt-0.5 text-xs" style={{ color: T.textSecondary }}>
              Ліміт Whisper — 25 MB. Збережіть файл локально і пере-експортуйте
              у нижчому бітрейті (наприклад, 32-64 кбіт/с opus/mp3) — для мовлення
              цього більш ніж достатньо.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={onSave}
          disabled={saving || tooLarge}
          className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: T.accentPrimary }}
        >
          <Upload size={16} />
          {saving ? "Зберігаємо…" : "Зберегти і розпізнати"}
        </button>
        <button
          onClick={downloadLocal}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
          style={{ background: T.panelElevated, color: T.textPrimary }}
        >
          <Download size={16} />
          Завантажити локально
        </button>
        <button
          onClick={onReset}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm disabled:opacity-50"
          style={{ background: "transparent", color: T.textMuted }}
        >
          <Trash2 size={16} />
          Скинути
        </button>
      </div>
    </div>
  );
}
