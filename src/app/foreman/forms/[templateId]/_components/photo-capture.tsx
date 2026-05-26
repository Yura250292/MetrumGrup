"use client";

import { useRef, useState } from "react";
import { Camera, X } from "lucide-react";

type Mode = "image" | "any";

/**
 * Foreman фото/файл capture. Завантажує через presigned URL flow
 * (`/api/foreman/form-submissions/[id]/attachment` — буде використано після
 * створення submission у Stage 5; тут поки локально кешуємо як data: URL).
 *
 * Поточна поведінка: файл -> FileReader -> base64 data URL у value. Stage 5
 * перепише на R2 upload через IndexedDB outbox. Базовий UX уже працює.
 */
export function PhotoCapture({
  fieldKey,
  submissionDraftId,
  value,
  onChange,
  multiple,
  mode,
}: {
  fieldKey: string;
  submissionDraftId: string;
  value: string | string[] | undefined;
  onChange: (v: string | string[] | null) => void;
  multiple: boolean;
  mode: Mode;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  void fieldKey;
  void submissionDraftId;

  const items: string[] = Array.isArray(value)
    ? value
    : typeof value === "string" && value.length > 0
      ? [value]
      : [];

  async function readFile(f: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(f);
    });
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      const added: string[] = [];
      for (const f of Array.from(files)) {
        const url = await readFile(f);
        added.push(url);
      }
      const next = multiple ? [...items, ...added] : added.slice(0, 1);
      onChange(multiple ? next : next[0] ?? null);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function remove(idx: number) {
    const next = items.filter((_, i) => i !== idx);
    onChange(multiple ? next : next[0] ?? null);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {items.map((src, idx) => (
          <div key={idx} className="relative">
            {src.startsWith("data:image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt="" className="h-20 w-20 rounded-lg object-cover" />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-white/10 text-[10px] text-white/70">
                файл
              </div>
            )}
            <button
              onClick={() => remove(idx)}
              className="absolute -right-1 -top-1 rounded-full bg-black/70 p-0.5"
              aria-label="Видалити"
            >
              <X size={12} className="text-white" />
            </button>
          </div>
        ))}
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex h-20 w-20 items-center justify-center rounded-lg border-2 border-dashed border-white/30 text-white/70"
          aria-label="Додати"
        >
          <Camera size={20} />
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={mode === "image" ? "image/*" : "*/*"}
        capture={mode === "image" ? "environment" : undefined}
        multiple={multiple}
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
      />
    </div>
  );
}
