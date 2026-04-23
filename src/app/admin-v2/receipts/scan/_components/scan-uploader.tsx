"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type ProjectOption = { id: string; title: string; status: string };

interface Props {
  projects: ProjectOption[];
}

export function ScanUploader({ projects }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [projectId, setProjectId] = useState<string>(projects[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = (f: File | null) => {
    setError(null);
    if (!f) return setFile(null);
    if (f.size > 20 * 1024 * 1024) {
      setError("Файл завеликий (макс 20 МБ)");
      return;
    }
    setFile(f);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return setError("Оберіть проєкт");
    if (!file) return setError("Оберіть файл накладної");

    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("projectId", projectId);
      if (notes.trim()) fd.append("notes", notes.trim());

      const res = await fetch("/api/admin/receipts/scan", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Помилка завантаження");
        setSubmitting(false);
        return;
      }
      router.push(`/admin-v2/receipts/${json.data.scanId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка мережі");
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-5 rounded-2xl p-6"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" style={{ color: T.textPrimary }}>
          Проєкт <span style={{ color: T.danger }}>*</span>
        </label>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="rounded-xl px-3 py-2.5 text-sm"
          style={{
            backgroundColor: T.panelSoft,
            border: `1px solid ${T.borderSoft}`,
            color: T.textPrimary,
          }}
          required
        >
          <option value="">— оберіть проєкт —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" style={{ color: T.textPrimary }}>
          Файл накладної <span style={{ color: T.danger }}>*</span>
        </label>
        <div
          className="flex flex-col items-center gap-3 rounded-xl px-4 py-10 text-center"
          style={{
            backgroundColor: T.panelSoft,
            border: `2px dashed ${T.borderSoft}`,
          }}
        >
          {file ? (
            <>
              <span className="text-sm font-medium" style={{ color: T.textPrimary }}>
                {file.name}
              </span>
              <span className="text-xs" style={{ color: T.textMuted }}>
                {(file.size / 1024 / 1024).toFixed(2)} МБ · {file.type}
              </span>
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="text-xs underline"
                style={{ color: T.textMuted }}
              >
                Замінити файл
              </button>
            </>
          ) : (
            <>
              <Upload size={28} style={{ color: T.textMuted }} />
              <span className="text-sm" style={{ color: T.textSecondary }}>
                Оберіть JPG, PNG, WebP або PDF (до 20 МБ)
              </span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg px-3 py-1.5 text-sm font-medium"
                style={{ backgroundColor: T.accentPrimary, color: "white" }}
              >
                Обрати файл
              </button>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" style={{ color: T.textPrimary }}>
          Нотатка (опційно)
        </label>
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Напр.: партія для першого поверху"
          className="rounded-xl px-3 py-2.5 text-sm"
          style={{
            backgroundColor: T.panelSoft,
            border: `1px solid ${T.borderSoft}`,
            color: T.textPrimary,
          }}
        />
      </div>

      {error && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{ backgroundColor: T.dangerSoft, color: T.danger }}
        >
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium disabled:opacity-50"
          style={{ backgroundColor: T.accentPrimary, color: "white" }}
        >
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          {submitting ? "Розпізнаю…" : "Завантажити та розпізнати"}
        </button>
      </div>
    </form>
  );
}
