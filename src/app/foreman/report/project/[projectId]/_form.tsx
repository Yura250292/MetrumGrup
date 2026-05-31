"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
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
  const [occurredAt, setOccurredAt] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
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
        const body = (await res.json().catch(() => ({}))) as {
          message?: string;
          error?: string;
        };
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
    <div className="space-y-4 mt-1 pb-28">
      <div className="rounded-2xl bg-white border border-slate-200 px-3 py-2.5">
        <div className="text-[10px] font-extrabold tracking-[0.12em] text-slate-400 uppercase">
          Обʼєкт
        </div>
        <div className="text-[14px] font-semibold text-slate-900 truncate">
          {projectTitle}
        </div>
      </div>

      <label className="block">
        <span className="text-[10px] font-extrabold tracking-[0.12em] text-slate-500 uppercase">
          Дата витрати
        </span>
        <input
          type="date"
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
          className="w-full mt-1 px-3 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 text-[15px] font-medium focus:border-indigo-500 focus:outline-none"
        />
      </label>

      <label className="block">
        <span className="text-[10px] font-extrabold tracking-[0.12em] text-slate-500 uppercase">
          Опис витрат
        </span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER}
          className="w-full mt-1 h-48 sm:h-72 max-h-[40vh] px-3 py-3 rounded-2xl bg-white border border-slate-200 text-slate-900 text-[15px] leading-relaxed focus:border-indigo-500 focus:outline-none resize-none"
        />
      </label>

      <div>
        <span className="text-[10px] font-extrabold tracking-[0.12em] text-slate-500 uppercase block mb-1.5">
          Або сфотографуйте накладну
        </span>
        <UploadDropzone files={files} onChange={setFiles} disabled={submitting} />
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 px-3 py-2 text-sm">
          {error}
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-30 bg-slate-100/95 backdrop-blur px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-slate-200">
        <div className="max-w-md mx-auto">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 text-white font-bold text-[15px] py-3.5 active:scale-[0.99] transition disabled:opacity-60 shadow-[0_10px_24px_-10px_rgba(79,70,229,0.6)]"
          >
            <Sparkles size={18} strokeWidth={2.2} />
            {submitting ? "Аналізуємо…" : "Аналізувати"}
          </button>
        </div>
      </div>

      <ParseLoadingOverlay visible={submitting} />
    </div>
  );
}
