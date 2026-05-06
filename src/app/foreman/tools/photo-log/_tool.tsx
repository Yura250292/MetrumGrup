"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Camera, Plus, Trash2, X, Check } from "lucide-react";

interface ProjectOption {
  id: string;
  title: string;
  folderName: string | null;
}

interface UploadedPhoto {
  id: string;
  key: string;
  previewUrl: string;
  caption: string;
  uploading: boolean;
}

const MAX_PHOTOS = 20;
const MAX_SIZE = 20 * 1024 * 1024;

let counter = 0;
const newId = () => {
  counter += 1;
  return `p-${Date.now()}-${counter}`;
};

interface Props {
  projects: ProjectOption[];
}

export function PhotoLogTool({ projects }: Props) {
  const router = useRouter();
  const [projectId, setProjectId] = useState<string>(projects[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);

  if (projects.length === 0) {
    return (
      <div className="mt-8 rounded-2xl bg-white/[0.03] backdrop-blur-md border border-white/10 p-8 text-center">
        <div className="text-lg font-semibold mb-2 text-white">Немає призначень</div>
        <div className="text-sm text-zinc-400">
          Зверніться до менеджера, щоб призначив вас на об{"’"}єкт.
        </div>
      </div>
    );
  }

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const arr = Array.from(list);

    if (photos.length + arr.length > MAX_PHOTOS) {
      setError(`Максимум ${MAX_PHOTOS} фото`);
      return;
    }
    for (const f of arr) {
      if (f.size > MAX_SIZE) {
        setError(`Файл «${f.name}» більший за 20 МБ`);
        return;
      }
    }
    setError(null);

    const stubs: UploadedPhoto[] = arr.map((file) => ({
      id: newId(),
      key: "",
      previewUrl: URL.createObjectURL(file),
      caption: "",
      uploading: true,
    }));
    setPhotos((prev) => [...prev, ...stubs]);

    // Upload one by one so progress feels live
    for (let i = 0; i < arr.length; i++) {
      const file = arr[i];
      const stub = stubs[i];
      try {
        const presignRes = await fetch("/api/foreman/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            originalName: file.name,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
          }),
        });
        if (!presignRes.ok) throw new Error("presign");
        const { key, putUrl } = (await presignRes.json()) as { key: string; putUrl: string };
        const putRes = await fetch(putUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!putRes.ok) throw new Error("put");

        setPhotos((prev) =>
          prev.map((p) => (p.id === stub.id ? { ...p, key, uploading: false } : p)),
        );
      } catch {
        setPhotos((prev) => prev.filter((p) => p.id !== stub.id));
        setError(`Не вдалось завантажити ${file.name}`);
      }
    }
  }

  const removePhoto = (id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  const setCaption = (id: string, caption: string) => {
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, caption } : p)));
  };

  const canSubmit =
    !submitting &&
    projectId &&
    title.trim().length > 0 &&
    photos.length > 0 &&
    photos.every((p) => !p.uploading && p.key);

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/foreman/photo-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          title: title.trim(),
          description: description.trim() || undefined,
          files: photos.map((p) => ({ key: p.key, caption: p.caption.trim() || null })),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? "Не вдалось зберегти");
      }
      router.push("/foreman?phototlog=ok");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4 pb-32">
      {/* Project picker */}
      <label className="block">
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
          Об{"’"}єкт
        </span>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="mt-1 w-full px-4 py-3 rounded-xl bg-zinc-950 border border-white/10 text-white text-base focus:border-emerald-500/60 focus:outline-none"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.folderName ? `${p.folderName} · ` : ""}
              {p.title}
            </option>
          ))}
        </select>
      </label>

      {/* Title */}
      <label className="block">
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
          Назва звіту
        </span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="напр. Прогрес плитки 06.05"
          className="mt-1 w-full px-4 py-3 rounded-xl bg-zinc-950 border border-white/10 text-white text-base focus:border-emerald-500/60 focus:outline-none"
        />
      </label>

      {/* Description */}
      <label className="block">
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
          Опис (необов{"’"}язково)
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Деталі або примітки"
          rows={2}
          className="mt-1 w-full px-4 py-3 rounded-xl bg-zinc-950 border border-white/10 text-white text-sm focus:border-emerald-500/60 focus:outline-none resize-none"
        />
      </label>

      {/* Photo capture buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          disabled={submitting || photos.length >= MAX_PHOTOS}
          className="flex flex-col items-center justify-center gap-1.5 min-h-[80px] rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 cursor-pointer active:scale-95 disabled:opacity-50 transition"
        >
          <Camera size={22} />
          <span className="text-xs font-semibold">Сфотографувати</span>
        </button>
        <button
          type="button"
          onClick={() => galleryRef.current?.click()}
          disabled={submitting || photos.length >= MAX_PHOTOS}
          className="flex flex-col items-center justify-center gap-1.5 min-h-[80px] rounded-2xl bg-white/[0.04] border border-white/10 text-zinc-200 cursor-pointer active:scale-95 disabled:opacity-50 transition"
        >
          <Plus size={22} />
          <span className="text-xs font-semibold">З галереї</span>
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
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.currentTarget.value = "";
        }}
      />

      {/* Photo list */}
      {photos.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 px-1">
            Фото ({photos.length})
          </div>
          {photos.map((p) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl bg-white/[0.03] border border-white/10 overflow-hidden flex"
            >
              <div className="relative w-24 h-24 shrink-0 bg-zinc-950">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.previewUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                {p.uploading && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  </div>
                )}
                {!p.uploading && p.key && (
                  <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                    <Check size={12} className="text-white" strokeWidth={3} />
                  </div>
                )}
              </div>
              <div className="flex-1 p-2 flex flex-col gap-1">
                <input
                  type="text"
                  value={p.caption}
                  onChange={(e) => setCaption(p.id, e.target.value)}
                  placeholder="Підпис до фото"
                  className="w-full bg-transparent text-sm text-white px-1 py-1 focus:outline-none focus:bg-white/5 rounded"
                />
                <button
                  type="button"
                  onClick={() => removePhoto(p.id)}
                  className="self-start text-xs text-zinc-500 hover:text-rose-400 cursor-pointer flex items-center gap-1 px-1"
                >
                  <Trash2 size={12} /> видалити
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 px-4 py-3 text-sm flex items-start gap-2">
          <X size={16} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Sticky submit */}
      <div className="fixed bottom-0 left-0 right-0 bg-zinc-950/95 backdrop-blur border-t border-white/5 px-4 py-3 z-20">
        <div className="max-w-md mx-auto">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full min-h-[64px] rounded-2xl bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 text-white font-bold text-lg shadow-[0_8px_30px_-8px_rgba(16,185,129,0.6)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-[0.98] transition flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <span className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                Зберігаю…
              </>
            ) : (
              "Зберегти фотолог"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
