"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
  type MeetingEntity,
  type MeetingSpeaker,
  type MeetingTask,
} from "../_components/types";
import {
  SummaryView,
  type DelegationState,
} from "../_components/summary-view";
import { DelegateTaskModal } from "../_components/delegate-task-modal";
import { LiveAgentPanel } from "../_components/live-agent-panel";
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
          <SeekableAudio
            src={meeting.audioUrl}
            mimeType={meeting.audioMimeType}
            durationMs={meeting.audioDurationMs}
          />
        </div>
      )}

      <div className="mb-4">
        <LiveAgentPanel meetingId={id} />
      </div>

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
          onSpeakerEdit={async (label, patch) => {
            const res = await fetch(
              `/api/admin/meetings/${id}/speakers`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ label, ...patch }),
              },
            );
            if (!res.ok) {
              const j = await res.json().catch(() => ({}));
              setError(j.error || "Не вдалося зберегти імʼя спікера");
              return;
            }
            await refresh();
          }}
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
        <TranscriptView
          transcript={meeting.transcript}
          entities={meeting.entities ?? []}
          speakers={meeting.structured?.speakers ?? []}
          meetingId={id}
          onSaved={async () => {
            await refresh();
          }}
        />
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

// Розбиває довгий блок тексту репліки на речення для гарного читання.
// Розпізнає `.`, `!`, `?`, `…` як кінець речення. Зберігає пунктуацію.
// Не ріже на абревіатурах (т.д., тис., грн. — не закінчуються на крапку
// з пробілом + великою літерою у спікерських репліках).
function splitIntoSentences(text: string): string[] {
  if (!text) return [];
  const sentences: string[] = [];
  let buf = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    buf += ch;
    if (ch === "." || ch === "!" || ch === "?" || ch === "…") {
      const next = text[i + 1];
      // Кінець речення: за пунктуацією йде пробіл (далі — нове речення)
      // або кінець рядка. Послідовність "..." або "?!" — захоплюємо повністю.
      while (
        i + 1 < text.length &&
        (text[i + 1] === "." ||
          text[i + 1] === "!" ||
          text[i + 1] === "?" ||
          text[i + 1] === "…")
      ) {
        i++;
        buf += text[i];
      }
      if (!next || /\s/.test(text[i + 1] ?? "")) {
        const trimmed = buf.trim();
        if (trimmed) sentences.push(trimmed);
        buf = "";
      }
    }
  }
  const tail = buf.trim();
  if (tail) sentences.push(tail);
  return sentences.length > 0 ? sentences : [text];
}

// Підсвітка named entities в тексті. AssemblyAI повертає entities як
// { entity_type, text, start, end }. Будуємо regex з текстів (longest-first)
// і обертаємо матчі у span з кольоровим стилем за типом.
type EntityStyle = { bg: string; fg: string; border?: string; label: string };

function getEntityStyle(type: string): EntityStyle {
  if (type === "person_name" || type === "person") {
    return {
      bg: "#3B5BFF15",
      fg: "#3B5BFF",
      border: "#3B5BFF",
      label: "Особа",
    };
  }
  if (
    type === "organization" ||
    type === "company" ||
    type === "person_age"
  ) {
    return {
      bg: "#A855F715",
      fg: "#A855F7",
      border: "#A855F7",
      label: "Організація",
    };
  }
  if (
    type === "money_amount" ||
    type === "monetary_value" ||
    type === "money"
  ) {
    return { bg: "#16A34A20", fg: "#15803D", label: "Сума" };
  }
  if (type === "date" || type === "date_interval" || type === "time") {
    return { bg: "#EA580C20", fg: "#C2410C", label: "Дата/час" };
  }
  if (type === "location" || type === "address" || type === "place") {
    return { bg: "#0EA5E920", fg: "#0369A1", label: "Місце" };
  }
  if (type === "phone_number" || type === "email_address") {
    return { bg: "#14B8A620", fg: "#0F766E", label: "Контакт" };
  }
  if (type === "number" || type === "percentage") {
    return { bg: "#6B72801A", fg: "#374151", label: "Число" };
  }
  return { bg: "#6B72801A", fg: "#374151", label: type };
}

// Бере шматок тексту і повертає React-вузли з підсвіченими ентіті.
function highlightEntities(
  text: string,
  entities: MeetingEntity[],
): React.ReactNode {
  if (!entities || entities.length === 0) return text;

  // Унікальні (text, type) пари; longest-first щоб «Любовь Николаевна»
  // матчилась раніше ніж «Любовь».
  const dedup = new Map<string, string>();
  for (const e of entities) {
    const t = (e.text ?? "").trim();
    const tp = (e.entity_type ?? "").trim();
    if (!t || !tp) continue;
    const key = t.toLowerCase();
    if (!dedup.has(key)) dedup.set(key, tp);
  }
  if (dedup.size === 0) return text;

  const sorted = Array.from(dedup.keys()).sort((a, b) => b.length - a.length);
  const escaped = sorted.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");

  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.slice(lastIdx, match.index));
    }
    const matched = match[0];
    const type = dedup.get(matched.toLowerCase()) ?? "";
    const style = getEntityStyle(type);
    parts.push(
      <mark
        key={`${match.index}-${matched}`}
        className="rounded-[3px] px-1 font-medium"
        style={{
          background: style.bg,
          color: style.fg,
          ...(style.border
            ? { boxShadow: `inset 0 -1px 0 ${style.border}33` }
            : {}),
        }}
        title={style.label}
      >
        {matched}
      </mark>,
    );
    lastIdx = match.index + matched.length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts;
}

// Стилізація markdown-елементів узгоджена з токенами дизайну. Підтримує
// заголовки, списки, bold/italic, code, hr, blockquote, links.
const MD_COMPONENTS = {
  h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1
      {...props}
      className="mt-5 mb-3 text-xl font-bold"
      style={{ color: T.textPrimary }}
    />
  ),
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2
      {...props}
      className="mt-5 mb-2 text-lg font-bold"
      style={{ color: T.textPrimary }}
    />
  ),
  h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3
      {...props}
      className="mt-4 mb-2 text-base font-bold"
      style={{ color: T.textPrimary }}
    />
  ),
  h4: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h4
      {...props}
      className="mt-3 mb-2 text-sm font-bold"
      style={{ color: T.textPrimary }}
    />
  ),
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p {...props} className="my-2 leading-relaxed" />
  ),
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul {...props} className="my-2 list-disc pl-6 space-y-1" />
  ),
  ol: (props: React.OlHTMLAttributes<HTMLOListElement>) => (
    <ol {...props} className="my-2 list-decimal pl-6 space-y-1" />
  ),
  li: (props: React.HTMLAttributes<HTMLLIElement>) => (
    <li {...props} className="leading-relaxed" />
  ),
  strong: (props: React.HTMLAttributes<HTMLElement>) => (
    <strong
      {...props}
      style={{ color: T.textPrimary, fontWeight: 700 }}
    />
  ),
  em: (props: React.HTMLAttributes<HTMLElement>) => (
    <em {...props} style={{ color: T.textSecondary }} />
  ),
  hr: () => (
    <hr
      className="my-5 border-0"
      style={{ borderTop: `1px solid ${T.borderSoft}` }}
    />
  ),
  blockquote: (props: React.BlockquoteHTMLAttributes<HTMLQuoteElement>) => (
    <blockquote
      {...props}
      className="my-3 pl-4 italic"
      style={{
        borderLeft: `3px solid ${T.borderStrong}`,
        color: T.textSecondary,
      }}
    />
  ),
  code: (props: React.HTMLAttributes<HTMLElement>) => (
    <code
      {...props}
      className="rounded px-1 py-0.5 text-[12px]"
      style={{
        background: T.panelElevated,
        color: T.textPrimary,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      }}
    />
  ),
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      {...props}
      target="_blank"
      rel="noreferrer noopener"
      className="underline"
      style={{ color: T.accentPrimary }}
    />
  ),
};

// Чи текст виглядає як markdown — просте евристичне виявлення:
// - заголовки ## або ###
// - горизонтальна лінія ---
// - bold **текст**
// - bullet/нумерований список з кількома елементами
// Якщо так — рендеримо через ReactMarkdown (юзер свідомо склав текст).
function looksLikeMarkdown(text: string): boolean {
  if (!text) return false;
  if (/^|\n\s*#{1,6}\s+/.test(text)) return true;
  if (/\n\s*---\s*\n/.test(text)) return true;
  if (/\*\*[^*\n]+\*\*/.test(text)) return true;
  // 3+ markdown bullets/items
  const bulletLines = (text.match(/^\s*[-*]\s+/gm) ?? []).length;
  const numberedLines = (text.match(/^\s*\d+\.\s+/gm) ?? []).length;
  if (bulletLines >= 3 || numberedLines >= 3) return true;
  return false;
}

function TranscriptView({
  transcript,
  entities,
  speakers,
  meetingId,
  onSaved,
}: {
  transcript: string;
  entities: MeetingEntity[];
  speakers: MeetingSpeaker[];
  meetingId: string;
  onSaved?: () => void | Promise<void>;
}) {
  // Мапа лейбл -> ідентифіковане імʼя/роль
  const speakerNameByLabel = new Map<string, string>();
  for (const s of speakers) {
    if (s.label && s.guessedName) {
      speakerNameByLabel.set(s.label, s.guessedName);
    }
  }
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(transcript);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Якщо транскрипт оновився ззовні (refresh) — синхронізуємо чернетку.
  useEffect(() => {
    if (!editing) setDraft(transcript);
  }, [transcript, editing]);

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/admin/meetings/${meetingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: draft }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Не вдалося зберегти");
      }
      setEditing(false);
      if (onSaved) await onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Помилка");
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setDraft(transcript);
    setEditing(false);
    setSaveError(null);
  }

  // Edit mode — суцільний textarea зі збереженням структури "Speaker X [time]: …"
  if (editing) {
    return (
      <div
        className="rounded-xl p-5"
        style={{ background: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs" style={{ color: T.textMuted }}>
            Збережи лейбли спікерів («Speaker A [00:00]: …») — від цього
            залежить розбивка по людях.
          </span>
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full rounded-lg p-3 text-sm leading-relaxed outline-none"
          style={{
            background: T.panelElevated,
            color: T.textPrimary,
            border: `1px solid ${T.borderSoft}`,
            minHeight: 400,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          }}
        />
        {saveError && (
          <div
            className="mt-2 rounded-lg px-3 py-2 text-xs"
            style={{ background: T.dangerSoft, color: T.danger }}
          >
            {saveError}
          </div>
        )}
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => void save()}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50"
            style={{ background: T.success, color: "#fff" }}
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Check size={14} />
            )}
            Зберегти
          </button>
          <button
            onClick={cancel}
            disabled={saving}
            className="rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50"
            style={{
              background: T.panelElevated,
              color: T.textPrimary,
              border: `1px solid ${T.borderSoft}`,
            }}
          >
            Скасувати
          </button>
        </div>
      </div>
    );
  }

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

  const hasSpeakers = parsed.some((p) => p.kind === "speaker");
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
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs" style={{ color: T.textMuted }}>
          {hasSpeakers
            ? `${speakerOrder.size} спікер${speakerOrder.size === 1 ? "" : speakerOrder.size < 5 ? "и" : "ів"} · ${parsed.length} реплік`
            : "Транскрипт"}
        </span>
        <button
          onClick={() => setEditing(true)}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold transition hover:brightness-105"
          style={{
            background: T.panelElevated,
            color: T.textSecondary,
            border: `1px solid ${T.borderSoft}`,
          }}
          title="Відредагувати транскрипт — виправити імена, помилки, розставити розділові знаки"
        >
          <Pencil size={12} /> Редагувати
        </button>
      </div>

      {looksLikeMarkdown(transcript) ? (
        <div className="text-sm leading-relaxed">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={MD_COMPONENTS}
          >
            {transcript}
          </ReactMarkdown>
        </div>
      ) : !hasSpeakers ? (
        <p className="whitespace-pre-wrap leading-relaxed">
          {highlightEntities(transcript, entities)}
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {parsed.map((p, idx) => {
            if (p.kind === "raw") {
              return (
                <p key={idx} className="whitespace-pre-wrap leading-relaxed">
                  {highlightEntities(p.text, entities)}
                </p>
              );
            }
            const colorIdx = speakerOrder.get(p.speaker) ?? 0;
            const color = SPEAKER_PALETTE[colorIdx % SPEAKER_PALETTE.length];
            const sentences = splitIntoSentences(p.text);
            return (
              <div key={idx} className="flex flex-col gap-1.5">
                <div
                  className="flex items-center gap-2 text-[11px] font-bold tracking-wider"
                  style={{ color }}
                >
                  <span
                    className="inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1.5"
                    style={{ background: color + "22", color }}
                  >
                    {speakerNameByLabel.get(p.speaker) ?? `Speaker ${p.speaker}`}
                  </span>
                  {p.timestamp && (
                    <span style={{ color: T.textMuted, fontWeight: 500 }}>
                      {p.timestamp}
                    </span>
                  )}
                </div>
                <div
                  className="flex flex-col gap-1 leading-relaxed"
                  style={{
                    color: T.textPrimary,
                    paddingLeft: 8,
                    borderLeft: `2px solid ${color}33`,
                    marginLeft: 4,
                  }}
                >
                  {sentences.map((s, si) => (
                    <p key={si} className="leading-relaxed">
                      {highlightEntities(s, entities)}
                    </p>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// SeekableAudio: простий аудіо-плеєр + кнопка «Викачати у WAV» для
// випадків коли вбудований <audio> не справляється (Safari + webm,
// пошкоджені файли, etc). WAV грається в будь-якому плеєрі з seek.
// ────────────────────────────────────────────────────────────────────────
function SeekableAudio({
  src,
  mimeType,
  durationMs: _durationMs,
}: {
  src: string;
  mimeType: string | null;
  durationMs: number | null;
}) {
  const [fixError, setFixError] = useState<string | null>(null);
  const playableSrc = src;

  function handleAudioError() {
    if (!fixError) {
      setFixError(
        "Браузер не зміг відтворити цей файл. Натисни «Викачати у WAV» і слухай локально (VLC, QuickTime тощо).",
      );
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <audio
        key={playableSrc}
        controls
        src={playableSrc}
        className="w-full"
        preload="metadata"
        onError={handleAudioError}
      />
      <div className="flex items-center gap-3 text-[11px]">
        <button
          onClick={() => void downloadAudio(src, mimeType)}
          className="rounded-md px-2 py-1 transition hover:underline"
          style={{ color: T.textMuted }}
          title="Завантажити аудіо у форматі WAV (універсальний, з повноцінною перемоткою у будь-якому плеєрі)"
        >
          Викачати у WAV
        </button>
        {fixError && <span style={{ color: T.warning }}>{fixError}</span>}
      </div>
    </div>
  );
}

// Завантажує webm/opus, декодує через Web Audio API, кодує у WAV (PCM)
// і триггерить браузерне збереження. WAV — універсальний формат із
// нативною підтримкою seek у будь-якому плеєрі. Файл важчий за webm
// (~10×), але lossless і завжди працює.
async function downloadAudio(src: string, _mimeType: string | null) {
  try {
    const res = await fetch(src);
    if (!res.ok) throw new Error("Не вдалося завантажити файл");
    const arrayBuffer = await res.arrayBuffer();

    const AudioCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtor) throw new Error("AudioContext недоступний у браузері");
    const ctx = new AudioCtor();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    await ctx.close();

    const wavBlob = audioBufferToWav(audioBuffer);
    const url = URL.createObjectURL(wavBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meeting-${Date.now()}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    console.error("[downloadAudio] failed:", err);
    alert(
      "Не вдалося завантажити файл як WAV. Перевір консоль браузера.",
    );
  }
}

// Кодує AudioBuffer у WAV-blob (PCM 16-bit). Стандартний RIFF-header +
// інтерлівнуті семпли. Безпечно для mono і stereo.
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = 2; // 16-bit PCM
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const numFrames = buffer.length;
  const dataSize = numFrames * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const ab = new ArrayBuffer(totalSize);
  const view = new DataView(ab);
  let off = 0;

  const writeStr = (s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off++, s.charCodeAt(i));
  };

  // RIFF header
  writeStr("RIFF");
  view.setUint32(off, totalSize - 8, true);
  off += 4;
  writeStr("WAVE");

  // fmt chunk
  writeStr("fmt ");
  view.setUint32(off, 16, true);
  off += 4; // subchunk size
  view.setUint16(off, 1, true);
  off += 2; // PCM format
  view.setUint16(off, numChannels, true);
  off += 2;
  view.setUint32(off, sampleRate, true);
  off += 4;
  view.setUint32(off, byteRate, true);
  off += 4;
  view.setUint16(off, blockAlign, true);
  off += 2;
  view.setUint16(off, bytesPerSample * 8, true);
  off += 2;

  // data chunk
  writeStr("data");
  view.setUint32(off, dataSize, true);
  off += 4;

  // Інтерлівні семпли (channel-by-channel у кожному фреймі)
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c));

  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numChannels; c++) {
      let s = channels[c][i];
      // Clamp + конвертація у 16-bit signed
      s = Math.max(-1, Math.min(1, s));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }

  return new Blob([ab], { type: "audio/wav" });
}
