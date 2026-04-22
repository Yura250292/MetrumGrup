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
import { AudioPreview } from "../_components/audio-preview";
import { useMeetingRecording } from "@/contexts/MeetingRecordingContext";

type Project = {
  id: string;
  title: string;
  slug: string;
};

type PendingAudio = {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  fileName: string;
};

type Stage = "form" | "creating" | "uploading" | "triggering";

export default function NewMeetingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialProject = searchParams.get("projectId") || "";

  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState(initialProject);

  const [pending, setPending] = useState<PendingAudio | null>(null);
  const [stage, setStage] = useState<Stage>("form");
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const {
    state: recState,
    recorded,
    reset: resetRecording,
  } = useMeetingRecording();

  useEffect(() => {
    if (recorded && !pending) {
      const ext = extensionFor(recorded.mimeType);
      setPending({
        blob: recorded.blob,
        mimeType: recorded.mimeType,
        durationMs: recorded.durationMs,
        fileName: `recording-${Date.now()}.${ext}`,
      });
    }
  }, [recorded, pending]);

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

  function handleFile(file: File) {
    setError(null);
    setPending({
      blob: file,
      mimeType: file.type,
      durationMs: 0,
      fileName: file.name,
    });
  }

  async function saveAndProcess() {
    if (!pending) return;
    setError(null);
    try {
      if (!title.trim()) throw new Error("Введіть назву наради");
      if (!projectId) throw new Error("Оберіть проєкт");

      setStage("creating");
      const createRes = await fetch("/api/admin/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          projectId,
        }),
      });
      if (!createRes.ok) {
        const j = await createRes.json().catch(() => ({}));
        throw new Error(j.error || "Не вдалося створити нараду");
      }
      const { meeting } = await createRes.json();
      const id = meeting.id;

      setStage("uploading");
      const urlRes = await fetch(`/api/admin/meetings/${id}/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: pending.fileName,
          contentType: pending.mimeType,
          size: pending.blob.size,
        }),
      });
      if (!urlRes.ok) {
        const j = await urlRes.json().catch(() => ({}));
        throw new Error(j.error || "Не вдалося отримати URL для завантаження");
      }
      const { uploadUrl, key, publicUrl } = await urlRes.json();

      await uploadWithProgress(
        uploadUrl,
        pending.blob,
        pending.mimeType,
        setUploadProgress
      );

      const completeRes = await fetch(
        `/api/admin/meetings/${id}/complete-upload`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audioR2Key: key,
            audioUrl: publicUrl,
            audioMimeType: pending.mimeType,
            audioSizeBytes: pending.blob.size,
            audioDurationMs: pending.durationMs,
          }),
        }
      );
      if (!completeRes.ok) throw new Error("Не вдалося зафіксувати завантаження");

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

  function resetPending() {
    setPending(null);
    setUploadProgress(0);
    resetRecording();
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

      {!pending && !busy && (formValid || recState !== "idle") && (
        <>
          <MeetingRecorder />
          {recState === "idle" && formValid && (
            <>
              <div className="my-3" />
              <MeetingUploader onFile={handleFile} />
            </>
          )}
        </>
      )}

      {pending && (
        <AudioPreview
          blob={pending.blob}
          mimeType={pending.mimeType}
          durationMs={pending.durationMs}
          fileName={pending.fileName}
          onSave={saveAndProcess}
          onReset={resetPending}
          saving={busy}
        />
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

function extensionFor(mimeType: string): string {
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
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
