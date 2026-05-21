"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Paperclip,
  Loader2,
  Trash2,
  FileText,
  FileImage,
  FileSpreadsheet,
  File as FileIcon,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type Attachment = {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  url: string;
  uploadedBy?: { id: string; name: string } | null;
};

/** Іконка за MIME-типом (документ / картинка / таблиця / інше). */
function iconForMime(mime: string) {
  if (mime.startsWith("image/")) return FileImage;
  if (mime.includes("pdf") || mime.includes("word") || mime.includes("text/"))
    return FileText;
  if (mime.includes("excel") || mime.includes("spreadsheet") || mime.includes("csv"))
    return FileSpreadsheet;
  return FileIcon;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

export function TaskAttachmentsPanel({ taskId }: { taskId: string }) {
  const [items, setItems] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/tasks/${taskId}/attachments`);
      if (res.ok) {
        const j = await res.json();
        setItems(j.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      for (const f of files) fd.append("files", f);
      const res = await fetch(`/api/admin/tasks/${taskId}/attachments`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Не вдалося завантажити");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка завантаження");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const remove = async (id: string, name: string) => {
    if (!confirm(`Видалити «${name}»?`)) return;
    await fetch(`/api/admin/tasks/${taskId}/attachments/${id}`, {
      method: "DELETE",
    });
    await load();
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files);
    void upload(files);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label
          className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider"
          style={{ color: T.textMuted }}
        >
          <Paperclip size={11} />
          ВКЛАДЕННЯ {items.length > 0 && `· ${items.length}`}
        </label>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold uppercase disabled:opacity-50"
          style={{
            backgroundColor: T.panelElevated,
            color: T.accentPrimary,
            border: `1px solid ${T.borderSoft}`,
          }}
        >
          {uploading ? <Loader2 size={10} className="animate-spin" /> : "+"}
          Додати
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => void upload(Array.from(e.target.files ?? []))}
        />
      </div>

      {error && (
        <div
          className="rounded-md px-2 py-1 text-[11px]"
          style={{ backgroundColor: "#ef444422", color: "#ef4444" }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div
          className="text-[11px] text-center py-3"
          style={{ color: T.textMuted }}
        >
          Завантаження…
        </div>
      ) : items.length === 0 ? (
        <div
          onDragOver={onDragOver}
          onDrop={onDrop}
          className="rounded-lg p-4 text-center text-[11px] cursor-pointer"
          style={{
            color: T.textMuted,
            backgroundColor: T.panelElevated,
            border: `1px dashed ${T.borderStrong}`,
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          Перетягніть файли сюди або натисніть «Додати»
          <div className="mt-1 text-[10px]">
            PDF · Word · Excel · картинки · до 25 МБ
          </div>
        </div>
      ) : (
        <ul
          onDragOver={onDragOver}
          onDrop={onDrop}
          className="flex flex-col gap-1"
        >
          {items.map((a) => {
            const Icon = iconForMime(a.mimeType);
            return (
              <li
                key={a.id}
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px]"
                style={{
                  backgroundColor: T.panelElevated,
                  border: `1px solid ${T.borderSoft}`,
                }}
              >
                <Icon size={14} style={{ color: T.textSecondary }} />
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 truncate hover:underline"
                  style={{ color: T.textPrimary }}
                  title={a.originalName}
                >
                  {a.originalName}
                </a>
                <span
                  className="text-[10px] whitespace-nowrap"
                  style={{ color: T.textMuted }}
                >
                  {formatSize(a.size)}
                </span>
                <button
                  type="button"
                  onClick={() => void remove(a.id, a.originalName)}
                  className="rounded-md p-1 opacity-60 hover:opacity-100"
                  style={{ color: T.danger }}
                  title="Видалити"
                  aria-label="Видалити"
                >
                  <Trash2 size={12} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
