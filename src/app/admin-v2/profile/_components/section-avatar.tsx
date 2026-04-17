"use client";

import { useState, useRef } from "react";
import { Camera, Upload, Trash2, Loader2, AlertTriangle } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { ProfileData } from "../_lib/types";

type Props = {
  profile: ProfileData;
  onUpload: (file: File) => Promise<string>;
  onDelete: () => Promise<void>;
};

const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

export function SectionAvatar({ profile, onUpload, onDelete }: Props) {
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Дозволені формати: JPG, PNG, WebP");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Максимальний розмір: 5MB");
      return;
    }
    try {
      setUploading(true);
      setError(null);
      await onUpload(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка завантаження");
    } finally {
      setUploading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleDelete = async () => {
    try {
      setDeleting(true);
      setError(null);
      await onDelete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка видалення");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section
      className="rounded-2xl p-5 md:p-6"
      style={{
        backgroundColor: T.panel,
        border: "1px solid " + T.borderSoft,
      }}
    >
      <div className="flex items-center gap-2 mb-5">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ backgroundColor: T.accentPrimarySoft }}
        >
          <Camera size={16} style={{ color: T.accentPrimary }} />
        </div>
        <h3 className="text-[15px] font-bold" style={{ color: T.textPrimary }}>
          Аватар
        </h3>
      </div>

      {!profile.avatar && (
        <div
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 mb-4 text-[13px]"
          style={{ backgroundColor: T.warningSoft, color: T.warning }}
        >
          <AlertTriangle size={14} />
          Аватар рекомендований для повного профілю
        </div>
      )}

      {error && (
        <div
          className="rounded-xl px-4 py-2.5 mb-4 text-[13px]"
          style={{ backgroundColor: T.dangerSoft, color: T.danger }}
        >
          {error}
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-start gap-6">
        {/* Current avatar */}
        <div className="flex-shrink-0">
          {profile.avatar ? (
            <img
              src={profile.avatar}
              alt="Avatar"
              className="h-32 w-32 rounded-2xl object-cover"
              style={{ border: "2px solid " + T.borderSoft }}
            />
          ) : (
            <div
              className="h-32 w-32 rounded-2xl flex items-center justify-center text-3xl font-bold"
              style={{
                background: "linear-gradient(135deg, " + T.accentPrimary + ", " + T.accentSecondary + ")",
                color: "#FFFFFF",
              }}
            >
              {(profile.firstName || profile.name || "?").charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* Upload zone */}
        <div className="flex-1 w-full">
          <div
            className="rounded-xl p-6 text-center cursor-pointer transition-colors"
            style={{
              backgroundColor: dragOver ? T.accentPrimarySoft : T.panelSoft,
              border: "2px dashed " + (dragOver ? T.accentPrimary : T.borderStrong),
            }}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 size={24} className="animate-spin" style={{ color: T.accentPrimary }} />
                <span className="text-[13px]" style={{ color: T.textSecondary }}>
                  Завантаження...
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload size={24} style={{ color: T.textMuted }} />
                <span className="text-[13px] font-medium" style={{ color: T.textSecondary }}>
                  Перетягніть зображення або натисніть для вибору
                </span>
                <span className="text-[11px]" style={{ color: T.textMuted }}>
                  JPG, PNG, WebP. Мінімум 400x400. Макс. 5MB
                </span>
              </div>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              onChange={handleInputChange}
              className="hidden"
            />
          </div>

          {profile.avatar && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 mt-3 text-[13px] font-medium transition disabled:opacity-50"
              style={{ color: T.danger }}
            >
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Видалити аватар
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
