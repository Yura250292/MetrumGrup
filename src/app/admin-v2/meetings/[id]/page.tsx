"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Trash2,
  FileText,
  Sparkles,
  Mic,
  Folder,
  FolderInput,
  RefreshCw,
  Users,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { MoveToFolderDialog } from "@/components/folders/MoveToFolderDialog";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import {
  formatDuration,
  STATUS_LABELS,
  type Meeting,
  type MeetingTask,
} from "../_components/types";
import {
  SummaryView,
  type DelegationState,
} from "../_components/summary-view";
import { DelegateTaskModal } from "../_components/delegate-task-modal";
import { useAiPanel } from "@/contexts/AiPanelContext";

const POLL_INTERVAL_MS = 3000;

const POLLING_STATES = new Set([
  "UPLOADED",
  "TRANSCRIBING",
  "TRANSCRIBED",
  "SUMMARIZING",
]);

export default function MeetingDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"summary" | "transcript">(
    "summary"
  );
  const [delegating, setDelegating] = useState<{
    index: number;
    task: MeetingTask;
  } | null>(null);
  const [delegated, setDelegated] = useState<DelegationState>({});
  const [movingFolder, setMovingFolder] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [retranscribing, setRetranscribing] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const summaryTriggeredRef = useRef(false);
  const { open: openAiPanel } = useAiPanel();

  function askAiAboutTask(task: MeetingTask) {
    if (!meeting) return;
    const lines = [
      `Допоможи виконати цю задачу з наради «${meeting.title}»:`,
      "",
      `**${task.title}**`,
    ];
    if (task.assignee) lines.push(`Відповідальний за нарадою: ${task.assignee}`);
    if (task.dueDate) lines.push(`Дедлайн: ${task.dueDate}`);
    if (meeting.structured?.summary) {
      lines.push("", `Контекст наради: ${meeting.structured.summary}`);
    }
    lines.push(
      "",
      "Розпиши покроковий план дій. Якщо потрібно — шукай довідкову інформацію в інтернеті (корисні посилання, норми, постачальники, приклади). Будь практичним і конкретним."
    );
    openAiPanel(lines.join("\n"));
  }

  async function refresh() {
    try {
      const res = await fetch(`/api/admin/meetings/${id}`);
      if (!res.ok) throw new Error("Не вдалося завантажити нараду");
      const data = await res.json();
      setMeeting(data.meeting);
      return data.meeting as Meeting;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка");
      return null;
    }
  }

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [id]);

  useEffect(() => {
    if (!meeting) return;
    if (!POLLING_STATES.has(meeting.status)) return;

    const timer = setInterval(async () => {
      const next = await refresh();
      if (
        next?.status === "TRANSCRIBED" &&
        !summaryTriggeredRef.current
      ) {
        summaryTriggeredRef.current = true;
        fetch(`/api/admin/meetings/${id}/summarize`, { method: "POST" }).catch(
          () => {}
        );
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [meeting?.status, id]);

  async function handleDelete() {
    if (!confirm("Видалити нараду і всі дані?")) return;
    const res = await fetch(`/api/admin/meetings/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/admin-v2/meetings");
  }

  async function retryTranscribe() {
    await fetch(`/api/admin/meetings/${id}/transcribe`, { method: "POST" });
    await refresh();
  }

  async function retrySummarize() {
    await fetch(`/api/admin/meetings/${id}/summarize`, { method: "POST" });
    await refresh();
  }

  async function retranscribeFromScratch() {
    if (!meeting?.audioUrl) return;
    if (
      !confirm(
        "Перетранскрибувати з нуля? Поточний транскрипт І підсумок буде ЗАМІНЕНО новим. Делегованих задач не торкнеться. Це може зайняти кілька хвилин."
      )
    ) {
      return;
    }
    setRetranscribing(true);
    summaryTriggeredRef.current = false;
    setError(null);
    try {
      const tRes = await fetch(`/api/admin/meetings/${id}/transcribe`, {
        method: "POST",
      });
      if (!tRes.ok) {
        const j = await tRes.json().catch(() => ({}));
        throw new Error(j.error || "Не вдалося перетранскрибувати");
      }
      await refresh();
      summaryTriggeredRef.current = true;
      const sRes = await fetch(`/api/admin/meetings/${id}/summarize`, {
        method: "POST",
      });
      if (!sRes.ok) {
        const j = await sRes.json().catch(() => ({}));
        throw new Error(
          j.error ||
            "Транскрипт оновлено, але не вдалося перегенерувати підсумок"
        );
      }
      setDelegated({});
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка");
    } finally {
      setRetranscribing(false);
    }
  }

  async function regenerateSummary() {
    if (!meeting?.transcript) return;
    if (
      meeting.structured &&
      !confirm(
        "Перезапустити AI-аналіз? Поточний підсумок буде замінено новим. Делегованих задач це не торкнеться."
      )
    ) {
      return;
    }
    setRegenerating(true);
    summaryTriggeredRef.current = true;
    try {
      const res = await fetch(`/api/admin/meetings/${id}/summarize`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Не вдалося перегенерувати підсумок");
      }
      setDelegated({});
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка");
    } finally {
      setRegenerating(false);
    }
  }

  function startEditTitle() {
    if (!meeting) return;
    setTitleDraft(meeting.title);
    setEditingTitle(true);
  }

  async function saveTitle() {
    if (!meeting) return;
    const next = titleDraft.trim();
    if (!next || next === meeting.title) {
      setEditingTitle(false);
      return;
    }
    setSavingTitle(true);
    try {
      const res = await fetch(`/api/admin/meetings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: next }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Не вдалося зберегти назву");
      }
      await refresh();
      setEditingTitle(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка");
    } finally {
      setSavingTitle(false);
    }
  }

  async function moveToFolder(targetFolderId: string | null) {
    setMovingFolder(true);
    try {
      const res = await fetch(`/api/admin/meetings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: targetFolderId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Не вдалося перемістити");
      }
      setMoveOpen(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка");
    } finally {
      setMovingFolder(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 size={24} className="animate-spin" style={{ color: T.textMuted }} />
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div
        className="flex items-center gap-2 rounded-xl p-4"
        style={{ background: T.dangerSoft, color: T.danger }}
      >
        <AlertCircle size={18} /> {error || "Нараду не знайдено"}
      </div>
    );
  }

  const processing = POLLING_STATES.has(meeting.status);

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/admin-v2/meetings"
        className="mb-4 inline-flex items-center gap-1 text-sm"
        style={{ color: T.textMuted }}
      >
        <ArrowLeft size={14} /> До списку нарад
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex-1">
          <h1
            className="flex items-center gap-2 text-2xl font-bold"
            style={{ color: T.textPrimary }}
          >
            <Mic size={22} style={{ color: T.accentPrimary }} />
            {editingTitle ? (
              <span className="flex flex-1 items-center gap-2">
                <input
                  type="text"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveTitle();
                    if (e.key === "Escape") setEditingTitle(false);
                  }}
                  autoFocus
                  disabled={savingTitle}
                  className="min-w-0 flex-1 rounded-lg px-3 py-1.5 text-2xl font-bold outline-none"
                  style={{
                    background: T.panelElevated,
                    color: T.textPrimary,
                    border: `1px solid ${T.borderSoft}`,
                  }}
                />
                <button
                  onClick={saveTitle}
                  disabled={savingTitle}
                  className="rounded-lg p-2"
                  style={{ background: T.successSoft, color: T.success }}
                  title="Зберегти"
                >
                  {savingTitle ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                </button>
                <button
                  onClick={() => setEditingTitle(false)}
                  disabled={savingTitle}
                  className="rounded-lg p-2"
                  style={{ background: T.panelElevated, color: T.textSecondary }}
                  title="Скасувати"
                >
                  <X size={16} />
                </button>
              </span>
            ) : (
              <button
                onClick={startEditTitle}
                className="group flex flex-1 items-center gap-2 rounded-lg px-2 -mx-2 py-1 text-left hover:bg-[var(--t-panel-el)]"
                style={{ color: T.textPrimary }}
                title="Натисніть, щоб перейменувати"
              >
                <span className="flex-1">{meeting.title}</span>
                <Pencil
                  size={14}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  style={{ color: T.textMuted }}
                />
              </button>
            )}
          </h1>
          <div
            className="mt-1 flex items-center gap-3 text-sm"
            style={{ color: T.textMuted }}
          >
            {meeting.folder ? (
              <button
                onClick={() => setMoveOpen(true)}
                className="flex items-center gap-1 hover:underline"
                title="Змінити папку"
              >
                <Folder size={14} /> {meeting.folder.name}
              </button>
            ) : (
              <button
                onClick={() => setMoveOpen(true)}
                className="flex items-center gap-1 hover:underline"
                title="Додати у папку"
              >
                <Folder size={14} /> Без папки
              </button>
            )}
            <span>{new Date(meeting.recordedAt).toLocaleString("uk-UA")}</span>
            {meeting.audioDurationMs && (
              <span>{formatDuration(meeting.audioDurationMs)}</span>
            )}
            {meeting.speakerCount && meeting.speakerCount > 0 && (
              <span
                className="flex items-center gap-1"
                title="AssemblyAI розпізнав окремих спікерів через діаризацію"
              >
                <Users size={12} /> {meeting.speakerCount}{" "}
                {meeting.speakerCount === 1
                  ? "учасник"
                  : meeting.speakerCount < 5
                    ? "учасники"
                    : "учасників"}
              </span>
            )}
          </div>
          {meeting.description && (
            <p className="mt-2 text-sm" style={{ color: T.textSecondary }}>
              {meeting.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-2.5 py-1 text-xs font-medium"
            style={{
              background:
                meeting.status === "READY"
                  ? T.successSoft
                  : meeting.status === "FAILED"
                  ? T.dangerSoft
                  : T.panelElevated,
              color:
                meeting.status === "READY"
                  ? T.success
                  : meeting.status === "FAILED"
                  ? T.danger
                  : T.textSecondary,
            }}
          >
            {STATUS_LABELS[meeting.status]}
          </span>
          {meeting.transcript && (
            <button
              onClick={regenerateSummary}
              disabled={regenerating || retranscribing || processing}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
              style={{
                background: T.accentPrimarySoft,
                color: T.accentPrimary,
              }}
              title="Перезапустити AI-аналіз з тим же транскриптом, щоб отримати глибший підсумок"
            >
              {regenerating ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              {meeting.structured ? "Перегенерувати" : "Сформувати підсумок"}
            </button>
          )}
          {meeting.audioUrl && (
            <button
              onClick={retranscribeFromScratch}
              disabled={regenerating || retranscribing || processing}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
              style={{
                background: T.panelElevated,
                color: T.textPrimary,
              }}
              title="Прослухати аудіо ще раз і повністю переробити транскрипт + підсумок (наприклад, якщо імена розпізнало неправильно)"
            >
              {retranscribing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              Перетранскрибувати
            </button>
          )}
          <button
            onClick={() => setMoveOpen(true)}
            className="rounded-lg p-2"
            style={{ background: T.panelElevated, color: T.textSecondary }}
            title="Перемістити в папку"
          >
            <FolderInput size={16} />
          </button>
          <button
            onClick={handleDelete}
            className="rounded-lg p-2"
            style={{ background: T.panelElevated, color: T.danger }}
            title="Видалити"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {meeting.audioUrl && (
        <div
          className="mb-4 rounded-xl p-4"
          style={{ background: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <audio
            controls
            src={meeting.audioUrl}
            className="w-full"
            preload="metadata"
          />
        </div>
      )}

      {meeting.status === "FAILED" && (
        <div
          className="mb-4 rounded-xl p-4"
          style={{
            background: T.dangerSoft,
            border: `1px solid ${T.danger}33`,
          }}
        >
          <div className="flex items-center gap-2" style={{ color: T.danger }}>
            <AlertCircle size={18} />
            <span className="font-medium">Обробка завершилась з помилкою</span>
          </div>
          {meeting.processingError && (
            <p className="mt-2 text-sm" style={{ color: T.textSecondary }}>
              {meeting.processingError}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            {!meeting.transcript && (
              <button
                onClick={retryTranscribe}
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium"
                style={{ background: T.panel, color: T.textPrimary }}
              >
                <RefreshCw size={14} /> Спробувати транскрипцію знову
              </button>
            )}
            {meeting.transcript && (
              <button
                onClick={retrySummarize}
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium"
                style={{ background: T.panel, color: T.textPrimary }}
              >
                <RefreshCw size={14} /> Спробувати підсумок знову
              </button>
            )}
          </div>
        </div>
      )}

      {processing && (
        <div
          className="mb-4 flex items-center gap-3 rounded-xl p-4"
          style={{ background: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <Loader2
            size={18}
            className="animate-spin"
            style={{ color: T.accentPrimary }}
          />
          <span className="text-sm" style={{ color: T.textPrimary }}>
            {STATUS_LABELS[meeting.status]}
          </span>
        </div>
      )}

      {(meeting.transcript || meeting.structured) && (
        <div
          className="mb-3 flex gap-1 rounded-lg p-1"
          style={{ background: T.panelElevated, width: "fit-content" }}
        >
          <TabBtn
            active={activeTab === "summary"}
            onClick={() => setActiveTab("summary")}
            icon={<Sparkles size={14} />}
            label="Підсумок"
            disabled={!meeting.structured}
          />
          <TabBtn
            active={activeTab === "transcript"}
            onClick={() => setActiveTab("transcript")}
            icon={<FileText size={14} />}
            label="Транскрипт"
            disabled={!meeting.transcript}
          />
        </div>
      )}

      {activeTab === "summary" && meeting.structured && (
        <SummaryView
          data={meeting.structured}
          delegated={delegated}
          onDelegate={(index, task) => setDelegating({ index, task })}
          onAiHelp={askAiAboutTask}
        />
      )}

      {delegating && (
        <DelegateTaskModal
          task={delegating.task}
          meetingTitle={meeting.title}
          onClose={() => setDelegating(null)}
          onCreated={(taskId) => {
            setDelegated((prev) => ({
              ...prev,
              [delegating.index]: { taskId },
            }));
            setDelegating(null);
          }}
        />
      )}

      {activeTab === "transcript" && meeting.transcript && (
        <TranscriptView transcript={meeting.transcript} />
      )}

      <MoveToFolderDialog
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        onMove={moveToFolder}
        domain="MEETING"
        currentFolderId={meeting.folder?.id ?? null}
        loading={movingFolder}
        itemCount={1}
      />
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  label,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-40"
      style={{
        background: active ? T.panel : "transparent",
        color: active ? T.accentPrimary : T.textSecondary,
        boxShadow: active ? `0 1px 3px ${T.borderSoft}` : undefined,
      }}
    >
      {icon}
      {label}
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Transcript view: розбиваємо за лейблами «Speaker A [00:01:23]: ...»
// якщо це AssemblyAI-формат; інакше показуємо як є.
// ────────────────────────────────────────────────────────────────────────
const SPEAKER_LINE_RE = /^Speaker\s+([A-Z]+)(?:\s+\[([0-9:]+)\])?:\s+([\s\S]*)$/;
const SPEAKER_PALETTE = [
  T.accentPrimary,
  T.accentSecondary,
  T.success,
  T.warning,
  T.danger,
  "#0EA5E9",
  "#A855F7",
  "#14B8A6",
];

function TranscriptView({ transcript }: { transcript: string }) {
  const blocks = transcript
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  const parsed = blocks.map((b) => {
    const m = b.match(SPEAKER_LINE_RE);
    if (!m) return { kind: "raw" as const, text: b };
    return {
      kind: "speaker" as const,
      speaker: m[1],
      timestamp: m[2] ?? null,
      text: m[3].trim(),
    };
  });

  // Якщо жодна репліка не розпізналась як спікер — рендеримо plain.
  const hasSpeakers = parsed.some((p) => p.kind === "speaker");
  if (!hasSpeakers) {
    return (
      <div
        className="whitespace-pre-wrap rounded-xl p-5 text-sm leading-relaxed"
        style={{
          background: T.panel,
          border: `1px solid ${T.borderSoft}`,
          color: T.textPrimary,
        }}
      >
        {transcript}
      </div>
    );
  }

  // Стабільний колір на спікера.
  const speakerOrder = new Map<string, number>();
  for (const p of parsed) {
    if (p.kind === "speaker" && !speakerOrder.has(p.speaker)) {
      speakerOrder.set(p.speaker, speakerOrder.size);
    }
  }

  return (
    <div
      className="rounded-xl p-5 text-sm leading-relaxed"
      style={{
        background: T.panel,
        border: `1px solid ${T.borderSoft}`,
        color: T.textPrimary,
      }}
    >
      <div className="flex flex-col gap-3">
        {parsed.map((p, idx) => {
          if (p.kind === "raw") {
            return (
              <p key={idx} className="whitespace-pre-wrap">
                {p.text}
              </p>
            );
          }
          const colorIdx = speakerOrder.get(p.speaker) ?? 0;
          const color = SPEAKER_PALETTE[colorIdx % SPEAKER_PALETTE.length];
          return (
            <div key={idx} className="flex flex-col gap-1">
              <div
                className="flex items-center gap-2 text-[11px] font-bold tracking-wider"
                style={{ color }}
              >
                <span
                  className="inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1.5"
                  style={{ background: color + "22", color }}
                >
                  Speaker {p.speaker}
                </span>
                {p.timestamp && (
                  <span style={{ color: T.textMuted, fontWeight: 500 }}>
                    {p.timestamp}
                  </span>
                )}
              </div>
              <p
                className="whitespace-pre-wrap"
                style={{ color: T.textPrimary }}
              >
                {p.text}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
