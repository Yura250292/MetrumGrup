"use client";

import Image from "next/image";
import { useState } from "react";
import { Receipt, FileText, FileSpreadsheet } from "lucide-react";
import { AiBadge, ConfidenceLabel } from "./ai-badge";

export interface PhotoAttachment {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: Date | string;
  thumbUrl: string | null;
}

interface PhotoPreviewCardProps {
  attachments: PhotoAttachment[];
  /** Reasonable average confidence across recognised items (0..1). */
  confidence?: number | null;
}

export function PhotoPreviewCard({ attachments, confidence }: PhotoPreviewCardProps) {
  const primary = attachments[0];
  if (!primary) return null;

  return (
    <div className="rounded-2xl bg-slate-900 p-3 text-white shadow-[0_8px_24px_-12px_rgba(15,23,42,0.45)]">
      <div className="flex items-start gap-3">
        <Thumbnail att={primary} />

        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold truncate">{shortFileName(primary)}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {formatTime(primary.createdAt)} · {formatSize(primary.size)}
            {attachments.length > 1 && ` · ще ${attachments.length - 1}`}
          </div>

          <div className="mt-3">
            <AiBadge confidence={confidence ?? undefined} />
          </div>
          {typeof confidence === "number" && (
            <div className="mt-2">
              <ConfidenceLabel confidence={confidence} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Thumbnail({ att }: { att: PhotoAttachment }) {
  const [error, setError] = useState(false);
  const isImage = att.mimeType.startsWith("image/");

  if (isImage && att.thumbUrl && !error) {
    return (
      <div className="relative w-[108px] h-[108px] rounded-xl overflow-hidden bg-slate-700 shrink-0">
        <Image
          src={att.thumbUrl}
          alt={att.originalName}
          fill
          className="object-cover"
          sizes="108px"
          onError={() => setError(true)}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center w-[108px] h-[108px] rounded-xl bg-slate-700 shrink-0">
      <FileIcon mime={att.mimeType} />
    </div>
  );
}

function FileIcon({ mime }: { mime: string }) {
  if (mime.startsWith("image/")) {
    return <Receipt size={40} className="text-slate-900" />;
  }
  if (mime === "application/pdf") {
    return <FileText size={40} className="text-slate-900" />;
  }
  if (/sheet|excel/i.test(mime)) {
    return <FileSpreadsheet size={40} className="text-slate-900" />;
  }
  return <FileText size={40} className="text-slate-900" />;
}

function formatTime(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function shortFileName(att: PhotoAttachment): string {
  const isImage = att.mimeType.startsWith("image/");
  if (isImage) {
    return att.originalName.replace(/\.[^.]+$/, "") || "Фото чеку";
  }
  return att.originalName;
}
