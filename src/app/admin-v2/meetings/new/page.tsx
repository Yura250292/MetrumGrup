"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, AlertCircle } from "lucide-react";
import Link from "next/link";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import {
  MeetingRecorder,
  MeetingUploader,
} from "../_components/meeting-recorder";

type Project = {
  id: string;
  title: string;
  slug: string;
};

type Stage =
  | "form"
  | "creating"
  | "recording"
  | "uploading"
  | "triggering"
  | "done";

export default function NewMeetingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialProject = searchParams.get("projectId") || "";

  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState(initialProject);

  const [stage, setStage] = useState<Stage>("form");
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/projects");
        if (!res.ok) throw new Error("Не вдалося завантажити проєкти");
        const data = await res.json();
        setProjects(data.data || []);
        if (!initialProject && data.data?.[0]) {
          setProjectId(data.data[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Помилка");
      } finally {
        setLoadingProjects(false);
      }
    })();
  }, [initialProject]);

  async function createMeetingIfNeeded(): Promise<string> {
    if (meetingId) return meetingId;

    setStage("creating");
    const res = await fetch("/api/admin/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        description: description.trim() || null,
        projectId,
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || "Не вдалося створити нараду");
    }
    const json = await res.json();
    setMeetingId(json.meeting.id);
    return json.meeting.id;
  }

  async function handleAudio(blob: Blob, mimeType: string, durationMs: number) {
    setError(null);
    try {
      if (!title.trim()) throw new Error("Введіть назву наради");
      if (!projectId) throw new Error("Оберіть проєкт");
      if (blob.size > 25 * 1024 * 1024) {
        throw new Error("Файл завеликий. Максимум 25 MB.");
      }

      const id = await createMeetingIfNeeded();

      setStage("uploading");
      const extension = mimeType.includes("webm")
        ? "webm"
        : mimeType.includes("mp4") || mimeType.includes("m4a")
        ? "m4a"
        : mimeType.includes("mpeg")
        ? "mp3"
        : mimeType.includes("wav")
        ? "wav"
        : "webm";
      const fileName = `recording-${Date.now()}.${extension}`;

      const urlRes = await fetch(`/api/admin/meetings/${id}/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName,
          contentType: mimeType,
          size: blob.size,
        }),
      });
      if (!urlRes.ok) {
        const j = await urlRes.json().catch(() => ({}));
        throw new Error(j.error || "Не вдалося отримати URL для завантаження");
      }
      const { uploadUrl, key, publicUrl } = await urlRes.json();

      await uploadWithProgress(uploadUrl, blob, mimeType, (p) =>
        setUploadProgress(p)
      );

      const completeRes = await fetch(
        `/api/admin/meetings/${id}/complete-upload`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audioR2Key: key,
            audioUrl: publicUrl,
            audioMimeType: mimeType,
            audioSizeBytes: blob.size,
            audioDurationMs: durationMs,
          }),
        }
      );
      if (!completeRes.ok) {
        throw new Error("Не вдалося зафіксувати завантаження");
      }

      setStage("triggering");
      fetch(`/api/admin/meetings/${id}/transcribe`, { method: "POST" }).catch(
        () => {}
      );

      router.push(`/admin-v2/meetings/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка");
      setStage("form");
    }
  }

  async function handleFile(file: File) {
    await handleAudio(file, file.type, 0);
  }

  const formValid = title.trim() && projectId;
  const busy = stage !== "form";

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/admin-v2/meetings"
        className="mb-4 inline-flex items-center gap-1 text-sm"
        style={{ color: T.textMuted }}
      >
        <ArrowLeft size={14} /> До списку нарад
      </Link>

      <h1 className="mb-6 text-2xl font-bold" style={{ color: T.textPrimary }}>
        Нова нарада
      </h1>

      <div
        className="mb-4 rounded-xl p-5"
        style={{ background: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <div className="mb-3">
          <label
            className="mb-1 block text-xs font-medium"
            style={{ color: T.textSecondary }}
          >
            Назва *
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
            placeholder="Нарада по проєкту..."
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{
              background: T.panelElevated,
              color: T.textPrimary,
              border: `1px solid ${T.borderSoft}`,
            }}
          />
        </div>

        <div className="mb-3">
          <label
            className="mb-1 block text-xs font-medium"
            style={{ color: T.textSecondary }}
          >
            Проєкт *
          </label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            disabled={busy || loadingProjects}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{
              background: T.panelElevated,
              color: T.textPrimary,
              border: `1px solid ${T.borderSoft}`,
            }}
          >
            <option value="">— Оберіть проєкт —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            className="mb-1 block text-xs font-medium"
            style={{ color: T.textSecondary }}
          >
            Опис (необов'язково)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={busy}
            rows={2}
            placeholder="Короткий контекст наради…"
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{
              background: T.panelElevated,
              color: T.textPrimary,
              border: `1px solid ${T.borderSoft}`,
            }}
          />
        </div>
      </div>

      {formValid && (
        <>
          <MeetingRecorder onReady={handleAudio} disabled={busy} />
          <div className="my-3" />
          <MeetingUploader onFile={handleFile} disabled={busy} />
        </>
      )}

      {error && (
        <div
          className="mt-4 flex items-center gap-2 rounded-lg p-3 text-sm"
          style={{ background: T.dangerSoft, color: T.danger }}
        >
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {busy && (
        <div
          className="mt-4 flex items-center gap-3 rounded-lg p-4"
          style={{ background: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <Loader2 size={18} className="animate-spin" style={{ color: T.accentPrimary }} />
          <span className="text-sm" style={{ color: T.textPrimary }}>
            {stage === "creating" && "Створення наради…"}
            {stage === "uploading" && `Завантаження аудіо… ${uploadProgress}%`}
            {stage === "triggering" && "Запускаємо розпізнавання…"}
          </span>
        </div>
      )}
    </div>
  );
}

function uploadWithProgress(
  url: string,
  blob: Blob,
  contentType: string,
  onProgress: (percent: number) => void
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        onProgress(Math.round((ev.loaded / ev.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`R2 upload failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("R2 upload error"));
    xhr.send(blob);
  });
}
