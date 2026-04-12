"use client";

import { useState, useRef, type ChangeEvent } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";

/**
 * Завантажити обкладинку проекту: upload файла у R2 (через presigned URL
 * для великих або multipart для маленьких), потім PATCH /api/admin/projects/:id
 * з coverImageUrl.
 */
export function ProjectCoverUpload({
  projectId,
  currentUrl,
}: {
  projectId: string;
  currentUrl: string | null;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadAndSet = async (file: File) => {
    setError(null);
    setUploading(true);

    try {
      // 1) Upload image as project file and get its public URL.
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", "PHOTO_ATTACHMENT");
      formData.append("visibility", "TEAM");

      const uploadRes = await fetch(`/api/admin/projects/${projectId}/files`, {
        method: "POST",
        body: formData,
      });
      if (!uploadRes.ok) {
        const body = await uploadRes.json().catch(() => ({}));
        throw new Error(body.error ?? `Upload failed: ${uploadRes.status}`);
      }
      const { file: uploaded } = await uploadRes.json();
      const publicUrl: string = uploaded.url;

      // 2) Set as cover via PATCH.
      const patchRes = await fetch(`/api/admin/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverImageUrl: publicUrl }),
      });
      if (!patchRes.ok) {
        throw new Error("Не вдалось оновити обкладинку проекту");
      }

      setPreviewUrl(publicUrl);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const removeCover = async () => {
    setError(null);
    setUploading(true);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverImageUrl: null }),
      });
      if (!res.ok) throw new Error("Не вдалось видалити обкладинку");
      setPreviewUrl(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadAndSet(file);
    e.target.value = "";
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        className="relative aspect-[16/7] rounded-2xl overflow-hidden cursor-pointer group"
        style={{
          backgroundColor: "rgba(255,255,255,0.03)",
          border: "1px dashed rgba(255,255,255,0.12)",
        }}
        onClick={() => !uploading && inputRef.current?.click()}
      >
        {previewUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Обкладинка проєкту"
              className="h-full w-full object-cover"
            />
            {/* Overlay on hover */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-xs font-semibold text-white">Змінити обкладинку</span>
            </div>
          </>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center">
            {uploading ? (
              <Loader2 size={28} className="animate-spin" style={{ color: "rgba(255,255,255,0.3)" }} />
            ) : (
              <>
                <ImagePlus size={28} style={{ color: "rgba(255,255,255,0.2)" }} />
                <span className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.3)" }}>
                  Додати обкладинку проєкту
                </span>
              </>
            )}
          </div>
        )}
        {uploading && previewUrl && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2 size={28} className="animate-spin text-white" />
          </div>
        )}
      </div>
      {previewUrl && !uploading && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            removeCover();
          }}
          className="self-end flex items-center gap-1 text-[11px] font-medium rounded px-2 py-1 transition-colors"
          style={{ color: "rgba(255,255,255,0.4)" }}
        >
          <Trash2 size={12} /> Видалити обкладинку
        </button>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onChange}
      />
    </div>
  );
}
