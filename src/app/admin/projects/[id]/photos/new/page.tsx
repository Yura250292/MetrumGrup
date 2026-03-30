"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { STAGE_LABELS, STAGE_ORDER } from "@/lib/constants";
import { ArrowLeft, Upload, Save } from "lucide-react";
import Link from "next/link";

export default function NewPhotoReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [projectTitle, setProjectTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [stage, setStage] = useState("WALLS");
  const [imageUrls, setImageUrls] = useState<string[]>([""]);

  useEffect(() => {
    fetch(`/api/admin/projects/${id}`)
      .then((r) => r.json())
      .then(({ data }) => {
        setProjectTitle(data.title);
        setStage(data.currentStage);
      });
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
    try {
      const images = imageUrls
        .filter((url) => url.trim())
        .map((url) => ({ url: url.trim() }));

      const res = await fetch(`/api/admin/projects/${id}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, stage, images }),
      });

      if (res.ok) {
        router.push(`/admin/projects/${id}`);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <Link
        href={`/admin/projects/${id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        {projectTitle}
      </Link>

      <h1 className="mb-6 text-2xl font-bold">Новий фотозвіт</h1>

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Заголовок <span className="text-destructive">*</span>
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Прогрес зведення стін"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Опис</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Детальний опис виконаних робіт..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary resize-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Етап</label>
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            >
              {STAGE_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABELS[s]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Фото (URL-посилання)
            </label>
            <p className="mb-2 text-xs text-muted-foreground">
              Вставте посилання на зображення. У продакшн-версії буде завантаження файлів.
            </p>
            <div className="space-y-2">
              {imageUrls.map((url, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={url}
                    onChange={(e) => updateImageUrl(i, e.target.value)}
                    placeholder="https://example.com/photo.jpg"
                    className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  {imageUrls.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeImageField(i)}
                      className="px-2 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={addImageField}
            >
              <Upload className="h-3.5 w-3.5" />
              Додати ще
            </Button>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Link href={`/admin/projects/${id}`}>
              <Button type="button" variant="outline">Скасувати</Button>
            </Link>
            <Button type="submit" disabled={saving}>
              <Save className="h-4 w-4" />
              {saving ? "Збереження..." : "Зберегти фотозвіт"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
