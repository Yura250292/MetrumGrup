"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Paperclip,
  Plus,
  Trash2,
  X,
  Loader2,
  Image as ImageIcon,
  FileText,
  FileSpreadsheet,
  File as FileIcon,
  AlertCircle,
  Download,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_BYTES,
  attachmentKindFor,
  isAllowedAttachment,
  formatBytes,
  type AttachmentKind,
} from "@/lib/meetings/attachments";
import type { MeetingAttachment } from "./types";

// ────────────────────────────────────────────────────────────────────────
// Завантаження одного вкладення у вже створену нараду: presigned URL → R2
// PUT → фіксація рядка в БД. Експортується для повторного використання на
// сторінці «Нова нарада» (там файли стейджаться, аплоадяться після save).
// ────────────────────────────────────────────────────────────────────────
export async function uploadMeetingAttachment(
  meetingId: string,
  file: File,
): Promise<void> {
  const contentType = file.type || "application/octet-stream";

  const urlRes = await fetch(
    `/api/admin/meetings/${meetingId}/attachments/upload-url`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        contentType,
        size: file.size,
      }),
    },
  );
  if (!urlRes.ok) {
    const j = await urlRes.json().catch(() => ({}));
    throw new Error(j.error || `Не вдалося підготувати «${file.name}»`);
  }
  const { uploadUrl, key, publicUrl } = await urlRes.json();

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: file,
  });
  if (!putRes.ok) {
    throw new Error(`Помилка завантаження «${file.name}» у сховище`);
  }

  const recRes = await fetch(`/api/admin/meetings/${meetingId}/attachments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      r2Key: key,
      url: publicUrl,
      originalName: file.name,
      mimeType: contentType,
      size: file.size,
    }),
  });
  if (!recRes.ok) {
    const j = await recRes.json().catch(() => ({}));
    throw new Error(j.error || `Не вдалося зберегти «${file.name}»`);
  }
}

// ────────────────────────────────────────────────────────────────────────
// Допоміжні візуальні елементи
// ────────────────────────────────────────────────────────────────────────
const KIND_COLOR: Record<AttachmentKind, string> = {
  image: "#0EA5E9",
  pdf: "#EF4444",
  spreadsheet: "#16A34A",
  document: "#6366F1",
  other: "#6B7280",
};

function KindIcon({ kind, size = 18 }: { kind: AttachmentKind; size?: number }) {
  if (kind === "image") return <ImageIcon size={size} />;
  if (kind === "spreadsheet") return <FileSpreadsheet size={size} />;
  if (kind === "pdf" || kind === "document") return <FileText size={size} />;
  return <FileIcon size={size} />;
}

/** 40×40 прев'ю: thumbnail для зображень, кольорова іконка для решти. */
function FileThumb({
  kind,
  previewUrl,
}: {
  kind: AttachmentKind;
  previewUrl?: string | null;
}) {
  const color = KIND_COLOR[kind];
  if (kind === "image" && previewUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={previewUrl}
        alt=""
        className="h-10 w-10 flex-shrink-0 rounded-lg object-cover"
        style={{ border: `1px solid ${T.borderSoft}` }}
      />
    );
  }
  return (
    <div
      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg"
      style={{ background: color + "1A", color }}
    >
      <KindIcon kind={kind} />
    </div>
  );
}

/** objectURL для стейдж-файлу (зображення) — створюється/звільняється сам. */
function useObjectUrl(file: File): string | null {
  const url = useMemo(
    () => (file.type.startsWith("image/") ? URL.createObjectURL(file) : null),
    [file],
  );
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);
  return url;
}

// ────────────────────────────────────────────────────────────────────────
// AttachmentStager — для сторінки «Нова нарада». Тримає File[] локально,
// нічого не вантажить до моменту збереження наради.
// ────────────────────────────────────────────────────────────────────────
export function AttachmentStager({
  files,
  onChange,
  disabled,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const next = [...files];
    const errs: string[] = [];
    for (const f of Array.from(list)) {
      if (!isAllowedAttachment(f.type, f.name)) {
        errs.push(`«${f.name}» — тип не підтримується`);
        continue;
      }
      if (f.size > ATTACHMENT_MAX_BYTES) {
        errs.push(`«${f.name}» — понад 50 MB`);
        continue;
      }
      if (next.some((x) => x.name === f.name && x.size === f.size)) continue;
      next.push(f);
    }
    setError(errs.length ? errs.join("; ") : null);
    onChange(next);
  }

  return (
    <div
      className="rounded-xl"
      style={{ background: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <div
          className="flex items-center gap-2 text-sm font-medium"
          style={{ color: T.textPrimary }}
        >
          <Paperclip size={16} style={{ color: T.accentPrimary }} />
          Вкладення
          {files.length > 0 && (
            <span
              className="rounded-full px-1.5 py-0.5 text-[11px] font-semibold"
              style={{ background: T.accentPrimarySoft, color: T.accentPrimary }}
            >
              {files.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          style={{ background: T.panelElevated, color: T.textPrimary }}
        >
          <Plus size={14} /> Додати файли
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ATTACHMENT_ACCEPT}
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <div className="px-4 pb-3">
        {files.length === 0 ? (
          <p className="text-xs" style={{ color: T.textMuted }}>
            Фото, PDF, Excel, Word — довідкові матеріали до наради. До 50 MB
            на файл.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {files.map((f, i) => (
              <StagedRow
                key={`${f.name}-${f.size}-${i}`}
                file={f}
                disabled={disabled}
                onRemove={() =>
                  onChange(files.filter((_, idx) => idx !== i))
                }
              />
            ))}
          </div>
        )}
        {error && (
          <div
            className="mt-2 flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-xs"
            style={{ background: T.dangerSoft, color: T.danger }}
          >
            <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function StagedRow({
  file,
  onRemove,
  disabled,
}: {
  file: File;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const previewUrl = useObjectUrl(file);
  const kind = attachmentKindFor(file.type, file.name);
  return (
    <div
      className="flex items-center gap-3 rounded-lg px-2.5 py-2"
      style={{ background: T.panelElevated }}
    >
      <FileThumb kind={kind} previewUrl={previewUrl} />
      <div className="min-w-0 flex-1">
        <p
          className="truncate text-sm font-medium"
          style={{ color: T.textPrimary }}
        >
          {file.name}
        </p>
        <p className="text-xs" style={{ color: T.textMuted }}>
          {formatBytes(file.size)}
        </p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        className="rounded-lg p-1.5 disabled:opacity-50"
        style={{ color: T.textMuted }}
        title="Прибрати"
      >
        <X size={15} />
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// AttachmentsPanel — для сторінки наради. Вантажить одразу на сервер,
// показує наявні вкладення, дозволяє видаляти.
// ────────────────────────────────────────────────────────────────────────
export function AttachmentsPanel({
  meetingId,
  attachments,
  onChange,
}: {
  meetingId: string;
  attachments: MeetingAttachment[];
  onChange: () => void | Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setError(null);
    setUploading(true);
    const errs: string[] = [];
    try {
      for (const file of Array.from(list)) {
        if (!isAllowedAttachment(file.type, file.name)) {
          errs.push(`«${file.name}» — тип не підтримується`);
          continue;
        }
        if (file.size > ATTACHMENT_MAX_BYTES) {
          errs.push(`«${file.name}» — понад 50 MB`);
          continue;
        }
        await uploadMeetingAttachment(meetingId, file);
      }
      await onChange();
    } catch (e) {
      errs.push(e instanceof Error ? e.message : "Помилка завантаження");
    } finally {
      setUploading(false);
      setError(errs.length ? errs.join("; ") : null);
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Видалити вкладення «${name}»?`)) return;
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/meetings/${meetingId}/attachments/${id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Не вдалося видалити");
      }
      await onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div
      className="rounded-xl"
      style={{ background: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <div
          className="flex items-center gap-2 text-sm font-semibold"
          style={{ color: T.textPrimary }}
        >
          <Paperclip size={16} style={{ color: T.accentPrimary }} />
          Вкладення
          {attachments.length > 0 && (
            <span
              className="rounded-full px-1.5 py-0.5 text-[11px] font-semibold"
              style={{ background: T.accentPrimarySoft, color: T.accentPrimary }}
            >
              {attachments.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          style={{ background: T.panelElevated, color: T.textPrimary }}
        >
          {uploading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Plus size={14} />
          )}
          {uploading ? "Завантаження…" : "Додати файли"}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ATTACHMENT_ACCEPT}
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <div className="px-4 pb-3">
        {attachments.length === 0 ? (
          <p className="text-xs" style={{ color: T.textMuted }}>
            Поки що немає вкладень. Прикріпіть фото, PDF, Excel чи документи —
            до 50 MB на файл.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {attachments.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 rounded-lg px-2.5 py-2"
                style={{ background: T.panelElevated }}
              >
                <FileThumb kind={a.kind} previewUrl={a.url} />
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="min-w-0 flex-1"
                >
                  <p
                    className="truncate text-sm font-medium hover:underline"
                    style={{ color: T.textPrimary }}
                  >
                    {a.originalName}
                  </p>
                  <p className="text-xs" style={{ color: T.textMuted }}>
                    {formatBytes(a.size)}
                  </p>
                </a>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  download={a.originalName}
                  className="rounded-lg p-1.5"
                  style={{ color: T.textMuted }}
                  title="Відкрити / завантажити"
                >
                  <Download size={15} />
                </a>
                <button
                  type="button"
                  onClick={() => remove(a.id, a.originalName)}
                  disabled={deletingId === a.id}
                  className="rounded-lg p-1.5 disabled:opacity-50"
                  style={{ color: T.danger }}
                  title="Видалити"
                >
                  {deletingId === a.id ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Trash2 size={15} />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
        {error && (
          <div
            className="mt-2 flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-xs"
            style={{ background: T.dangerSoft, color: T.danger }}
          >
            <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
