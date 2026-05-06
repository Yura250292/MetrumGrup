"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BigButton } from "../../../_components/big-button";
import { UploadDropzone, type UploadedFile } from "../../../_components/upload-dropzone";
import { ParseLoadingOverlay } from "../../../_components/parse-loading-overlay";

interface Props {
  projectId: string;
  projectTitle: string;
}

const PLACEHOLDER = `Опишіть витрати, наприклад:

плитка 50 м2 - 1300 грн
кладка плитки 50 м2 - 4000 грн
паркет 2*70 = 140 грн`;

export function ReportInputForm({ projectId, projectTitle }: Props) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draftKey = `foreman:draft:${projectId}`;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) setText(saved);
    } catch {}
  }, [draftKey]);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (text) localStorage.setItem(draftKey, text);
        else localStorage.removeItem(draftKey);
      } catch {}
    }, 500);
    return () => clearTimeout(t);
  }, [text, draftKey]);

  const canSubmit = (text.trim().length > 0 || files.length > 0) && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/foreman/reports/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          text: text.trim(),
          occurredAt,
          fileKeys: files.map((f) => ({
            key: f.key,
            mime: f.mime,
            originalName: f.originalName,
            size: f.size,
          })),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(body.message ?? body.error ?? "Не вдалось проаналізувати");
      }
      const { reportId } = (await res.json()) as { reportId: string };
      try {
        localStorage.removeItem(draftKey);
      } catch {}
      router.push(`/foreman/report/project/${projectId}/review/${reportId}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Помилка";
      setError(message);
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5 mt-2 pb-32">
      <div className="text-sm text-zinc-400">
        <span className="text-zinc-500">Об{"’"}єкт:</span> <span className="text-zinc-200 font-semibold">{projectTitle}</span>
      </div>

      <label className="block">
        <span className="text-xs font-semibold uppercase text-zinc-500">Дата витрати</span>
        <input
          type="date"
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
          className="w-full mt-1 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-lg focus:border-emerald-500 focus:outline-none"
        />
      </label>

      <label className="block">
        <span className="text-xs font-semibold uppercase text-zinc-500">Опис витрат</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER}
          className="w-full mt-1 h-72 px-4 py-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-white text-lg leading-relaxed focus:border-emerald-500 focus:outline-none resize-none"
        />
      </label>

      <div>
        <span className="text-xs font-semibold uppercase text-zinc-500 block mb-2">
          Або сфотографуйте накладну
        </span>
        <UploadDropzone files={files} onChange={setFiles} disabled={submitting} />
      </div>

      {error && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-zinc-950/95 backdrop-blur border-t border-zinc-800 px-4 py-3">
        <div className="max-w-md mx-auto">
          <BigButton onClick={handleSubmit} disabled={!canSubmit} loading={submitting} size="huge">
            Аналізувати
          </BigButton>
        </div>
      </div>

      <ParseLoadingOverlay visible={submitting} />
    </div>
  );
}
