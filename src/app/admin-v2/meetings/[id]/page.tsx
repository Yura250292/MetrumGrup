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
  FolderOpen,
  RefreshCw,
} from "lucide-react";
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
  const summaryTriggeredRef = useRef(false);

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
            {meeting.title}
          </h1>
          <div
            className="mt-1 flex items-center gap-3 text-sm"
            style={{ color: T.textMuted }}
          >
            <Link
              href={`/admin-v2/projects/${meeting.project.id}`}
              className="flex items-center gap-1 hover:underline"
            >
              <FolderOpen size={14} /> {meeting.project.title}
            </Link>
            <span>{new Date(meeting.recordedAt).toLocaleString("uk-UA")}</span>
            {meeting.audioDurationMs && (
              <span>{formatDuration(meeting.audioDurationMs)}</span>
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
        />
      )}

      {delegating && (
        <DelegateTaskModal
          task={delegating.task}
          projectId={meeting.project.id}
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
        <div
          className="whitespace-pre-wrap rounded-xl p-5 text-sm leading-relaxed"
          style={{
            background: T.panel,
            border: `1px solid ${T.borderSoft}`,
            color: T.textPrimary,
          }}
        >
          {meeting.transcript}
        </div>
      )}
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
