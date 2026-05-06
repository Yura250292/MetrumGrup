"use client";

import { useRef, useState } from "react";

export interface UploadedFile {
  key: string;
  mime: string;
  originalName: string;
  size: number;
}

interface UploadDropzoneProps {
  files: UploadedFile[];
  onChange: (files: UploadedFile[]) => void;
  disabled?: boolean;
}

const MAX_FILES = 5;
const MAX_SIZE = 20 * 1024 * 1024;
const ACCEPT = "image/*,application/pdf,.xlsx,.xls";

export function UploadDropzone({ files, onChange, disabled }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setError(null);

    const incoming = Array.from(list);
    if (files.length + incoming.length > MAX_FILES) {
      setError(`Максимум ${MAX_FILES} файлів`);
      return;
    }
    for (const f of incoming) {
      if (f.size > MAX_SIZE) {
        setError(`Файл «${f.name}» більший за 20 МБ`);
        return;
      }
    }

    setUploading(true);
    try {
      const uploaded: UploadedFile[] = [];
      for (const file of incoming) {
        const presignRes = await fetch("/api/foreman/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            originalName: file.name,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
          }),
        });
        if (!presignRes.ok) {
          throw new Error("Не вдалось отримати посилання на завантаження");
        }
        const { key, putUrl } = (await presignRes.json()) as { key: string; putUrl: string };

        const putRes = await fetch(putUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!putRes.ok) {
          throw new Error(`Не вдалось завантажити «${file.name}»`);
        }

        uploaded.push({
          key,
          mime: file.type || "application/octet-stream",
          originalName: file.name,
          size: file.size,
        });
      }
      onChange([...files, ...uploaded]);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Помилка завантаження";
      setError(message);
    } finally {
      setUploading(false);
    }
  }

  function removeFile(key: string) {
    onChange(files.filter((f) => f.key !== key));
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => cameraRef.current?.click()}
          className="min-h-[80px] rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-emerald-500 active:scale-95 transition flex flex-col items-center justify-center gap-1 disabled:opacity-50"
        >
          <span className="text-3xl">📷</span>
          <span className="text-sm font-semibold text-zinc-200">Сфотографувати</span>
        </button>
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          className="min-h-[80px] rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-emerald-500 active:scale-95 transition flex flex-col items-center justify-center gap-1 disabled:opacity-50"
        >
          <span className="text-3xl">📎</span>
          <span className="text-sm font-semibold text-zinc-200">Додати файл</span>
        </button>
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="sr-only"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.currentTarget.value = "";
        }}
      />
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="sr-only"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.currentTarget.value = "";
        }}
      />

      {uploading && (
        <div className="text-sm text-zinc-400 flex items-center gap-2">
          <span className="inline-block h-4 w-4 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
          Завантаження…
        </div>
      )}
      {error && <div className="text-sm text-rose-400">{error}</div>}

      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((f) => (
            <li
              key={f.key}
              className="flex items-center gap-3 rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2"
            >
              <span className="text-2xl">
                {f.mime.startsWith("image/") ? "🖼️" : f.mime.includes("pdf") ? "📄" : "📊"}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{f.originalName}</div>
                <div className="text-xs text-zinc-500">{Math.round(f.size / 1024)} КБ</div>
              </div>
              <button
                type="button"
                onClick={() => removeFile(f.key)}
                className="text-zinc-400 hover:text-rose-400 px-2 py-1"
                aria-label="Видалити"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
