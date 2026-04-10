"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Upload,
  Save,
  Loader2,
  AlertCircle,
  X,
  Camera,
  Plus,
} from "lucide-react";
import { STAGE_LABELS, STAGE_ORDER } from "@/lib/constants";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

export default function AdminV2NewPhotoReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [projectTitle, setProjectTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [stage, setStage] = useState("WALLS");
  const [imageUrls, setImageUrls] = useState<string[]>([""]);

  useEffect(() => {
    fetch(`/api/admin/projects/${id}`)
      .then((r) => r.json())
      .then(({ data }) => {
        setProjectTitle(data.title);
        if (data.currentStage) setStage(data.currentStage);
      })
      .catch(() => undefined);
  }, [id]);

  function addImageField() {
    setImageUrls((prev) => [...prev, ""]);
  }
  function updateImageUrl(index: number, url: string) {
    setImageUrls((prev) => prev.map((u, i) => (i === index ? url : u)));
  }
  function removeImageField(index: number) {
    setImageUrls((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const images = imageUrls
        .filter((url) => url.trim())
        .map((url) => ({ url: url.trim() }));

      const res = await fetch(`/api/admin/projects/${id}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, stage, images }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || "Помилка збереження");
      }
      router.push(`/admin-v2/projects/${id}?tab=photos`);
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Помилка збереження");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <Link
        href={`/admin-v2/projects/${id}?tab=photos`}
        className="inline-flex w-fit items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition hover:brightness-125"
        style={{ backgroundColor: T.panelElevated, color: T.textSecondary }}
      >
        <ArrowLeft size={14} /> {projectTitle || "Назад"}
      </Link>

      {/* Hero */}
      <section className="flex flex-col gap-2">
        <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
          ФОТО-ЗВІТ
        </span>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight" style={{ color: T.textPrimary }}>
          Новий фото-звіт
        </h1>
        <p className="text-[15px]" style={{ color: T.textSecondary }}>
          Зафіксуйте прогрес робіт по проєкту
        </p>
      </section>

      {error && (
        <div
          className="flex items-start gap-2.5 rounded-xl p-4"
          style={{
            backgroundColor: T.dangerSoft,
            color: T.danger,
            border: `1px solid ${T.danger}`,
          }}
        >
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span className="text-xs">{error}</span>
        </div>
      )}

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-5 rounded-2xl p-6"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <Field label="Заголовок" required>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="Прогрес зведення стін"
            className="w-full rounded-xl px-4 py-3 text-sm outline-none"
            style={{
              backgroundColor: T.panelSoft,
              border: `1px solid ${T.borderStrong}`,
              color: T.textPrimary,
            }}
          />
        </Field>

        <Field label="Опис">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Детальний опис виконаних робіт…"
            className="w-full resize-none rounded-xl px-4 py-3 text-sm outline-none"
            style={{
              backgroundColor: T.panelSoft,
              border: `1px solid ${T.borderStrong}`,
              color: T.textPrimary,
            }}
          />
        </Field>

        <Field label="Етап">
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="w-full rounded-xl px-4 py-3 text-sm outline-none"
            style={{
              backgroundColor: T.panelSoft,
              border: `1px solid ${T.borderStrong}`,
              color: T.textPrimary,
            }}
          >
            {STAGE_ORDER.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Фото (URL-посилання)">
          <p className="-mt-1 mb-1 text-[11px]" style={{ color: T.textMuted }}>
            Вставте посилання на зображення. У продакшн-версії буде завантаження файлів.
          </p>
          <div className="flex flex-col gap-2">
            {imageUrls.map((url, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={url}
                  onChange={(e) => updateImageUrl(i, e.target.value)}
                  placeholder="https://example.com/photo.jpg"
                  className="flex-1 rounded-xl px-4 py-3 text-sm outline-none"
                  style={{
                    backgroundColor: T.panelSoft,
                    border: `1px solid ${T.borderStrong}`,
                    color: T.textPrimary,
                  }}
                />
                {imageUrls.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeImageField(i)}
                    className="rounded-xl px-3"
                    style={{ color: T.danger }}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addImageField}
              className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-[12px] font-medium"
              style={{
                backgroundColor: T.panelSoft,
                color: T.textMuted,
                border: `1px dashed ${T.borderSoft}`,
              }}
            >
              <Plus size={12} /> Додати ще
            </button>
          </div>
        </Field>

        {/* Hint */}
        <div
          className="flex items-start gap-2.5 rounded-xl p-3.5"
          style={{ backgroundColor: T.accentPrimarySoft }}
        >
          <Camera
            size={14}
            style={{ color: T.accentPrimary }}
            className="mt-0.5 flex-shrink-0"
          />
          <span className="text-[11px] leading-relaxed" style={{ color: T.accentPrimary }}>
            Фото-звіт зʼявиться у Workspace проєкту в табі «Фото» та потрапить у стрічку
            активності.
          </span>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 pt-2">
          <Link
            href={`/admin-v2/projects/${id}?tab=photos`}
            className="rounded-xl px-4 py-3 text-sm font-medium"
            style={{ color: T.textSecondary }}
          >
            Скасувати
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
            style={{ backgroundColor: T.accentPrimary }}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? "Збереження…" : "Зберегти фото-звіт"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
        {label.toUpperCase()}
        {required && (
          <span className="ml-1" style={{ color: T.danger }}>
            *
          </span>
        )}
      </span>
      {children}
    </label>
  );
}
