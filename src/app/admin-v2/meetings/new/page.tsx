"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Mic,
  FileText,
  Save,
} from "lucide-react";
import Link from "next/link";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import {
  MeetingRecorder,
  MeetingUploader,
} from "../_components/meeting-recorder";
import { AudioPreview } from "../_components/audio-preview";
import { LiveAgentPanel } from "../_components/live-agent-panel";
import { MeetingsNavSidebar } from "../_components/meetings-nav-sidebar";
import { MeetingNoteEditor } from "../_components/meeting-note-editor";
import {
  AttachmentStager,
  uploadMeetingAttachment,
} from "../_components/meeting-attachments";
import { toDateTimeLocalValue } from "../_components/types";
import { useMeetingRecording } from "@/contexts/MeetingRecordingContext";

type FolderOption = {
  id: string;
  name: string;
  parentId: string | null;
  depth: number;
};

type PendingAudio = {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  fileName: string;
};

// Як створюється нарада: голосом (запис/аудіофайл) або текстовою нотаткою.
type SourceMode = "voice" | "text";

type Stage = "form" | "creating" | "uploading" | "attaching" | "triggering";

export default function NewMeetingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialFolder = searchParams.get("folderId") || "";

  const [folderOptions, setFolderOptions] = useState<FolderOption[]>([]);

  const [mode, setMode] = useState<SourceMode>("voice");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [folderId, setFolderId] = useState<string>(initialFolder);
  // Дата проведення наради. Дефолт — зараз; можна виправити, якщо файл
  // завантажують пізніше за саму нараду.
  const [recordedAt, setRecordedAt] = useState(() =>
    toDateTimeLocalValue(new Date()),
  );

  const [noteText, setNoteText] = useState("");
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);

  const [pending, setPending] = useState<PendingAudio | null>(null);
  const [stage, setStage] = useState<Stage>("form");
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Створюємо meeting eagerly при старті запису — щоб Live AI Agent міг
  // зберігати інсайти прямо під час розмови (а не лише на сторінці готової
  // наради). При фінальному save використаємо вже існуючий meetingId.
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [creatingDraft, setCreatingDraft] = useState(false);

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

  // Створення draft-meeting при старті запису — для Live AI Agent.
  useEffect(() => {
    if (
      mode === "voice" &&
      recState === "recording" &&
      !meetingId &&
      !creatingDraft &&
      stage === "form"
    ) {
      void (async () => {
        setCreatingDraft(true);
        try {
          const res = await fetch("/api/admin/meetings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: title.trim() || autoDefaultTitle(),
              description: description.trim() || null,
              folderId: folderId || null,
              recordedAt: recordedAtIso(recordedAt),
            }),
          });
          if (!res.ok) throw new Error("draft create failed");
          const { meeting } = await res.json();
          setMeetingId(meeting.id);
        } catch (err) {
          console.warn("[new-meeting] draft create failed:", err);
          // Не блокуємо запис — Live Agent просто буде недоступний.
        } finally {
          setCreatingDraft(false);
        }
      })();
    }
  }, [mode, recState, meetingId, creatingDraft, stage, title, description, folderId]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/folders/tree?domain=MEETING");
        if (!res.ok) return;
        const data = await res.json();
        setFolderOptions(flattenFolderTree(data.folders || []));
      } catch {
        // folders are optional; ignore failure
      }
    })();
  }, []);

  function handleFile(file: File) {
    setError(null);
    setPending({
      blob: file,
      mimeType: file.type,
      durationMs: 0,
      fileName: file.name,
    });
  }

  // Завантаження стейдж-файлів у вже створену нараду. Не критичний шлях —
  // якщо якийсь файл не завантажився, нараду все одно зберігаємо, а вкладення
  // можна додати пізніше на сторінці наради.
  async function uploadStagedAttachments(targetMeetingId: string) {
    for (const file of stagedFiles) {
      try {
        await uploadMeetingAttachment(targetMeetingId, file);
      } catch (err) {
        console.warn("[new-meeting] attachment upload failed:", file.name, err);
      }
    }
  }

  // ── Голосова нарада: створити → завантажити аудіо → вкладення → транскрипція
  async function saveAndProcess() {
    if (!pending) return;
    setError(null);
    try {
      const finalTitle = title.trim() || autoDefaultTitle();

      setStage("creating");
      let id: string;
      if (meetingId) {
        // Draft вже створено при старті запису — оновлюємо назву/опис.
        const patchRes = await fetch(`/api/admin/meetings/${meetingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: finalTitle,
            description: description.trim() || null,
            folderId: folderId || null,
            recordedAt: recordedAtIso(recordedAt),
          }),
        });
        if (!patchRes.ok) {
          const j = await patchRes.json().catch(() => ({}));
          throw new Error(j.error || "Не вдалося оновити нараду");
        }
        id = meetingId;
      } else {
        const createRes = await fetch("/api/admin/meetings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: finalTitle,
            description: description.trim() || null,
            folderId: folderId || null,
            recordedAt: recordedAtIso(recordedAt),
          }),
        });
        if (!createRes.ok) {
          const j = await createRes.json().catch(() => ({}));
          throw new Error(j.error || "Не вдалося створити нараду");
        }
        const { meeting } = await createRes.json();
        id = meeting.id;
      }

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

      if (stagedFiles.length > 0) {
        setStage("attaching");
        await uploadStagedAttachments(id);
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

  // ── Текстова нарада: створити з нотаткою → вкладення → (опц.) AI.
  // analyze=false — «Зберегти» (текст готовий); analyze=true — «АІ
  // покращення» (підсумок + вичищена версія тексту).
  async function saveTextMeeting(analyze: boolean) {
    const text = noteText.trim();
    if (!text) {
      setError("Спершу введіть текст наради");
      return;
    }
    setError(null);
    try {
      const finalTitle = title.trim() || autoDefaultTitle();

      setStage("creating");
      const createRes = await fetch("/api/admin/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: finalTitle,
          description: description.trim() || null,
          folderId: folderId || null,
          noteText: text,
          analyze,
          recordedAt: recordedAtIso(recordedAt),
        }),
      });
      if (!createRes.ok) {
        const j = await createRes.json().catch(() => ({}));
        throw new Error(j.error || "Не вдалося створити нараду");
      }
      const { meeting } = await createRes.json();
      const id: string = meeting.id;

      if (stagedFiles.length > 0) {
        setStage("attaching");
        await uploadStagedAttachments(id);
      }

      if (analyze) {
        setStage("triggering");
        // AI-підсумок + вичищена версія генеруються окремо;
        // оригінальну нотатку не змінюють.
        fetch(`/api/admin/meetings/${id}/summarize`, { method: "POST" }).catch(
          () => {}
        );
      }

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

  const busy = stage !== "form";
  const titlePlaceholder = autoDefaultTitle();
  // Перемикач режиму ховаємо, щойно користувач почав запис / має аудіо —
  // на цьому етапі нарада вже «голосова».
  const canSwitchMode = !busy && !pending && recState === "idle";

  return (
    <div className="mx-auto max-w-[1800px]">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[320px_1fr]">
        <MeetingsNavSidebar highlightFolderId={folderId || null} />
        <div className="min-w-0">
          <Link
            href="/admin-v2/meetings"
            className="mb-4 inline-flex items-center gap-1 text-sm"
            style={{ color: T.textMuted }}
          >
            <ArrowLeft size={14} /> До списку нарад
          </Link>

          <h1
            className="mb-3 text-2xl font-bold"
            style={{ color: T.textPrimary }}
          >
            Нова нарада
          </h1>

          {/* Перемикач способу: голос або текст */}
          {canSwitchMode && (
            <div
              className="mb-3 flex gap-1 rounded-xl p-1"
              style={{
                background: T.panel,
                border: `1px solid ${T.borderSoft}`,
                width: "fit-content",
              }}
            >
              <ModeTab
                active={mode === "voice"}
                onClick={() => setMode("voice")}
                icon={<Mic size={15} />}
                label="Голосова"
              />
              <ModeTab
                active={mode === "text"}
                onClick={() => setMode("text")}
                icon={<FileText size={15} />}
                label="Текстова"
              />
            </div>
          )}

          {!busy && (
            <p
              className="mb-4 flex items-center gap-1.5 text-sm"
              style={{ color: T.textMuted }}
            >
              <Sparkles size={14} style={{ color: T.accentPrimary }} />
              {mode === "voice"
                ? "Натисніть «Почати запис» або завантажте аудіо. Назву AI підбере сам після розпізнавання."
                : "Запишіть нараду текстом — AI зробить структурований підсумок, рішення та задачі. Назву підбере сам."}
            </p>
          )}

          {/* ─────────────── ГОЛОСОВА ─────────────── */}
          {mode === "voice" && (
            <>
              {!pending && !busy && (
                <>
                  <MeetingRecorder />
                  {recState === "idle" && (
                    <>
                      <div className="my-3" />
                      <MeetingUploader onFile={handleFile} disabled={false} />
                    </>
                  )}
                </>
              )}

              {/* Live AI Agent — зʼявляється коли draft-meeting створено
                  (момент старту запису). Дає підказки в реальному часі. */}
              {meetingId && (
                <div className="mt-4">
                  <LiveAgentPanel meetingId={meetingId} />
                </div>
              )}

              {pending && (
                <div className="mt-4">
                  <AudioPreview
                    blob={pending.blob}
                    mimeType={pending.mimeType}
                    durationMs={pending.durationMs}
                    fileName={pending.fileName}
                    onSave={saveAndProcess}
                    onReset={resetPending}
                    saving={busy}
                  />
                </div>
              )}
            </>
          )}

          {/* ─────────────── ТЕКСТОВА ─────────────── */}
          {mode === "text" && !busy && (
            <MeetingNoteEditor
              value={noteText}
              onChange={setNoteText}
              disabled={busy}
            />
          )}

          {/* ─────────────── ВКЛАДЕННЯ (обидва режими) ─────────────── */}
          {!busy && (
            <div className="mt-4">
              <AttachmentStager
                files={stagedFiles}
                onChange={setStagedFiles}
                disabled={busy}
              />
            </div>
          )}

          {/* ─────────────── ДЕТАЛІ ─────────────── */}
          {!busy && (
            <div
              className="mt-4 rounded-xl"
              style={{ background: T.panel, border: `1px solid ${T.borderSoft}` }}
            >
              <button
                type="button"
                onClick={() => setDetailsOpen((v) => !v)}
                className="flex w-full items-center justify-between px-5 py-3 text-sm font-medium"
                style={{ color: T.textPrimary }}
              >
                <span>
                  Деталі (необовʼязково)
                  <span className="ml-2 text-xs" style={{ color: T.textMuted }}>
                    {title.trim() || "AI назве сам"}
                  </span>
                </span>
                {detailsOpen ? (
                  <ChevronUp size={16} />
                ) : (
                  <ChevronDown size={16} />
                )}
              </button>
              {detailsOpen && (
                <div
                  className="border-t px-5 pb-5 pt-3"
                  style={{ borderColor: T.borderSoft }}
                >
                  <div className="mb-3">
                    <label
                      className="mb-1 block text-xs font-medium"
                      style={{ color: T.textSecondary }}
                    >
                      Назва
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      disabled={busy}
                      placeholder={`Залиште порожньою — AI назве сам · напр. «${titlePlaceholder}»`}
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
                      Дата наради
                    </label>
                    <input
                      type="datetime-local"
                      value={recordedAt}
                      onChange={(e) => setRecordedAt(e.target.value)}
                      disabled={busy}
                      className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                      style={{
                        background: T.panelElevated,
                        color: T.textPrimary,
                        border: `1px solid ${T.borderSoft}`,
                      }}
                    />
                    <p
                      className="mt-1 text-xs"
                      style={{ color: T.textMuted }}
                    >
                      Коли нарада фактично відбулася. За замовчуванням —
                      зараз; змініть, якщо завантажуєте пізніше.
                    </p>
                  </div>

                  <div className="mb-3">
                    <label
                      className="mb-1 block text-xs font-medium"
                      style={{ color: T.textSecondary }}
                    >
                      Папка
                    </label>
                    <select
                      value={folderId}
                      onChange={(e) => setFolderId(e.target.value)}
                      disabled={busy}
                      className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                      style={{
                        background: T.panelElevated,
                        color: T.textPrimary,
                        border: `1px solid ${T.borderSoft}`,
                      }}
                    >
                      <option value="">— Без папки —</option>
                      {folderOptions.map((f) => (
                        <option key={f.id} value={f.id}>
                          {`${"— ".repeat(f.depth)}${f.name}`}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      className="mb-1 block text-xs font-medium"
                      style={{ color: T.textSecondary }}
                    >
                      Опис
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      disabled={busy}
                      rows={2}
                      placeholder="Короткий контекст для AI (опційно)…"
                      className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                      style={{
                        background: T.panelElevated,
                        color: T.textPrimary,
                        border: `1px solid ${T.borderSoft}`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Кнопки збереження текстової наради */}
          {mode === "text" && !busy && (
            <div className="mt-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => saveTextMeeting(false)}
                  disabled={!noteText.trim()}
                  className="flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
                  style={{
                    background: T.panelElevated,
                    color: T.textPrimary,
                    border: `1px solid ${T.borderSoft}`,
                  }}
                >
                  <Save size={16} />
                  Зберегти
                </button>
                <button
                  type="button"
                  onClick={() => saveTextMeeting(true)}
                  disabled={!noteText.trim()}
                  className="flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: T.accentPrimary }}
                >
                  <Sparkles size={16} />
                  АІ покращення
                </button>
              </div>
              <p className="mt-2 text-xs" style={{ color: T.textMuted }}>
                «Зберегти» — текст уже готовий, лишити як є. «АІ покращення» —
                AI виправить помилки, гарно оформить і додасть структурований
                підсумок (рішення, задачі). Оригінал тексту збережеться в
                будь-якому разі.
              </p>
            </div>
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
              <Loader2
                size={18}
                className="animate-spin"
                style={{ color: T.accentPrimary }}
              />
              <span className="text-sm" style={{ color: T.textPrimary }}>
                {stage === "creating" && "Створення наради…"}
                {stage === "uploading" &&
                  `Завантаження аудіо… ${uploadProgress}%`}
                {stage === "attaching" && "Завантаження вкладень…"}
                {stage === "triggering" &&
                  (mode === "text"
                    ? "Запускаємо AI-аналіз…"
                    : "Запускаємо розпізнавання…")}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-semibold transition"
      style={{
        background: active ? T.accentPrimary : "transparent",
        color: active ? "#fff" : T.textSecondary,
      }}
    >
      {icon}
      {label}
    </button>
  );
}

// datetime-local string → ISO для API. Порожнє/невалідне → undefined
// (сервер підставить поточну дату через @default(now())).
function recordedAtIso(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

function autoDefaultTitle(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `Нарада ${dd}.${mm}.${yyyy} ${hh}:${min}`;
}

function flattenFolderTree(
  flat: { id: string; name: string; parentId: string | null }[],
): FolderOption[] {
  const out: FolderOption[] = [];
  function walk(parentId: string | null, depth: number) {
    for (const f of flat.filter((x) => x.parentId === parentId)) {
      out.push({ id: f.id, name: f.name, parentId: f.parentId, depth });
      walk(f.id, depth + 1);
    }
  }
  walk(null, 0);
  return out;
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  if (mimeType.includes("mpeg") || mimeType.includes("mpga")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("ogg") || mimeType.includes("oga")) return "ogg";
  if (mimeType.includes("flac")) return "flac";
  if (mimeType.includes("opus")) return "opus";
  if (mimeType.includes("aac")) return "aac";
  if (mimeType.includes("amr")) return "amr";
  if (mimeType.includes("3gp")) return "3gp";
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
