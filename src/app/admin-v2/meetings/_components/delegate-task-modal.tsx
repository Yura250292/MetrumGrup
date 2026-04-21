"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, X, Loader2, CheckCircle2 } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { STAGE_LABELS } from "@/lib/constants";
import type { ProjectStage } from "@prisma/client";
import type { MeetingTask } from "./types";

type MyProject = {
  id: string;
  title: string;
  currentStage: string;
  isInternal?: boolean;
  stages: { id: string; stage: ProjectStage; status: string }[];
};

type TeamUser = { id: string; name: string };

type Priority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

const inputStyle: React.CSSProperties = {
  backgroundColor: T.panelElevated,
  color: T.textPrimary,
  border: `1px solid ${T.borderSoft}`,
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/;

export function DelegateTaskModal({
  task,
  projectId,
  meetingTitle,
  onClose,
  onCreated,
}: {
  task: MeetingTask;
  projectId: string;
  meetingTitle: string;
  onClose: () => void;
  onCreated: (createdTaskId: string) => void;
}) {
  const [project, setProject] = useState<MyProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [stageId, setStageId] = useState("");
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(
    `З наради «${meetingTitle}».` +
      (task.assignee ? `\nЗгадано як відповідального: ${task.assignee}.` : "") +
      (task.dueDate ? `\nЗгаданий дедлайн: ${task.dueDate}.` : "")
  );
  const [priority, setPriority] = useState<Priority>("NORMAL");
  const [dueDate, setDueDate] = useState(
    task.dueDate && ISO_DATE_RE.test(task.dueDate)
      ? task.dueDate.slice(0, 10)
      : ""
  );
  const [assigneeId, setAssigneeId] = useState("");
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [projRes, usersRes] = await Promise.all([
          fetch("/api/admin/me/projects"),
          fetch("/api/admin/users?role=SUPER_ADMIN,MANAGER,ENGINEER,FINANCIER"),
        ]);
        if (projRes.ok) {
          const j = await projRes.json();
          const items = (j.data ?? []) as MyProject[];
          const match = items.find((p) => p.id === projectId);
          if (!match) {
            setLoadError(
              "Проєкт наради недоступний для створення задач у вашому акаунті"
            );
          } else {
            setProject(match);
            const current =
              match.stages.find((s) => s.stage === match.currentStage) ??
              match.stages[0];
            if (current) setStageId(current.id);
          }
        }
        if (usersRes.ok) {
          const j = await usersRes.json();
          setTeamUsers(
            (j.data ?? [])
              .filter((u: { isActive?: boolean }) => u.isActive)
              .map((u: { id: string; name: string }) => ({
                id: u.id,
                name: u.name,
              }))
          );
        }
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Помилка завантаження");
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId]);

  const suggestedAssignee = useMemo(() => {
    if (!task.assignee) return null;
    const lower = task.assignee.toLowerCase();
    return (
      teamUsers.find((u) => u.name.toLowerCase().includes(lower)) ?? null
    );
  }, [task.assignee, teamUsers]);

  useEffect(() => {
    if (suggestedAssignee && !assigneeId) {
      setAssigneeId(suggestedAssignee.id);
    }
  }, [suggestedAssignee, assigneeId]);

  async function submit() {
    if (!project || !stageId || !title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/projects/${project.id}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          stageId,
          priority,
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
          assigneeIds: assigneeId ? [assigneeId] : undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Не вдалося створити задачу");
      }
      const json = await res.json();
      onCreated(json.data?.id ?? json.id ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="mt-10 flex w-full max-w-lg flex-col gap-4 rounded-2xl p-5"
        style={{
          backgroundColor: T.panel,
          border: `1px solid ${T.borderStrong}`,
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold" style={{ color: T.textPrimary }}>
            Делегувати задачу
          </h2>
          <button onClick={onClose} style={{ color: T.textMuted }}>
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <p
            className="py-6 text-center text-sm"
            style={{ color: T.textMuted }}
          >
            Завантаження…
          </p>
        ) : loadError ? (
          <p className="py-6 text-sm" style={{ color: T.danger }}>
            {loadError}
          </p>
        ) : project ? (
          <>
            <div
              className="rounded-lg p-2 text-xs"
              style={{ background: T.panelElevated, color: T.textMuted }}
            >
              Проєкт: <strong style={{ color: T.textPrimary }}>{project.title}</strong>
            </div>

            {!project.isInternal && (
              <Field label="СТАДІЯ">
                <select
                  value={stageId}
                  onChange={(e) => setStageId(e.target.value)}
                  className="rounded-lg px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                >
                  {project.stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {STAGE_LABELS[s.stage]}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <Field label="НАЗВА">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle}
                autoFocus
              />
            </Field>

            <Field label="ОПИС">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="resize-none rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="ПРІОРИТЕТ">
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Priority)}
                  className="rounded-lg px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                >
                  <option value="LOW">Низький</option>
                  <option value="NORMAL">Нормальний</option>
                  <option value="HIGH">Високий</option>
                  <option value="URGENT">Терміновий</option>
                </select>
              </Field>
              <Field label="ДЕДЛАЙН">
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="rounded-lg px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                />
              </Field>
            </div>

            <Field label="ВИКОНАВЕЦЬ">
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle}
              >
                <option value="">— без виконавця —</option>
                {teamUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                    {suggestedAssignee?.id === u.id ? " · AI підказує" : ""}
                  </option>
                ))}
              </select>
            </Field>

            {task.assignee && !suggestedAssignee && (
              <p className="text-xs" style={{ color: T.textMuted }}>
                AI згадав виконавця «{task.assignee}», але він не знайдений
                серед користувачів. Оберіть вручну.
              </p>
            )}

            {error && (
              <div
                className="rounded-lg px-3 py-2 text-xs"
                style={{ backgroundColor: T.dangerSoft, color: T.danger }}
              >
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-xl px-4 py-2 text-sm font-semibold"
                style={{
                  backgroundColor: T.panelElevated,
                  color: T.textPrimary,
                  border: `1px solid ${T.borderSoft}`,
                }}
              >
                Скасувати
              </button>
              <button
                onClick={() => void submit()}
                disabled={saving || !title.trim() || !stageId}
                className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: T.accentPrimary }}
              >
                {saving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Plus size={14} />
                )}
                Створити задачу
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span
        className="text-[10px] font-bold uppercase tracking-wider"
        style={{ color: T.textMuted }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

export { CheckCircle2 as DelegatedIcon };
