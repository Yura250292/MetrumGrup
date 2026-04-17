"use client";

import { useEffect, useState } from "react";
import { Plus, X, Loader2 } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { STAGE_LABELS } from "@/lib/constants";
import type { ProjectStage } from "@prisma/client";

type MyProject = {
  id: string;
  title: string;
  currentStage: string;
  isInternal?: boolean;
  stages: { id: string; stage: ProjectStage; status: string }[];
};

const inputStyle: React.CSSProperties = {
  backgroundColor: T.panelElevated,
  color: T.textPrimary,
  border: `1px solid ${T.borderSoft}`,
};

export function NewTaskModal({
  currentUserId,
  onClose,
  onCreated,
}: {
  currentUserId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [projects, setProjects] = useState<MyProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [projectId, setProjectId] = useState("");
  const [stageId, setStageId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"LOW" | "NORMAL" | "HIGH" | "URGENT">("NORMAL");
  const [dueDate, setDueDate] = useState("");
  const [assignToMe, setAssignToMe] = useState(true);
  const [assigneeId, setAssigneeId] = useState("");
  const [teamUsers, setTeamUsers] = useState<{ id: string; name: string }[]>([]);
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
          setProjects(items);
          if (items.length > 0) {
            const first = items[0]!;
            setProjectId(first.id);
            const currentStageRecord =
              first.stages.find((s) => s.stage === first.currentStage) ??
              first.stages[0];
            if (currentStageRecord) setStageId(currentStageRecord.id);
          }
        }
        if (usersRes.ok) {
          const j = await usersRes.json();
          setTeamUsers(
            (j.data ?? [])
              .filter((u: any) => u.isActive)
              .map((u: any) => ({ id: u.id, name: u.name }))
          );
        }
      } finally {
        setLoadingProjects(false);
      }
    })();
  }, []);

  const selectedProject = projects.find((p) => p.id === projectId);

  useEffect(() => {
    if (!selectedProject) return;
    const currentStageRecord =
      selectedProject.stages.find((s) => s.stage === selectedProject.currentStage) ??
      selectedProject.stages[0];
    if (currentStageRecord) setStageId(currentStageRecord.id);
  }, [selectedProject]);

  const submit = async () => {
    if (!projectId || !stageId || !title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const ids = new Set<string>();
      if (assignToMe && currentUserId) ids.add(currentUserId);
      if (assigneeId) ids.add(assigneeId);
      const assigneeIds = [...ids];
      const res = await fetch(`/api/admin/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          stageId,
          priority,
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
          assigneeIds: assigneeIds.length > 0 ? assigneeIds : undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Не вдалося створити задачу");
      }
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg mt-10 rounded-2xl p-5 flex flex-col gap-4"
        style={{
          backgroundColor: T.panel,
          border: `1px solid ${T.borderStrong}`,
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold" style={{ color: T.textPrimary }}>
            Нова задача
          </h2>
          <button onClick={onClose} style={{ color: T.textMuted }}>
            <X size={18} />
          </button>
        </div>

        {loadingProjects ? (
          <p className="text-sm text-center py-6" style={{ color: T.textMuted }}>
            Завантаження проєктів…
          </p>
        ) : projects.length === 0 ? (
          <p className="text-sm py-6" style={{ color: T.textMuted }}>
            У вас немає проєктів, де ви маєте право створювати задачі. Зверніться до
            адміністратора, щоб додав вас учасником проєкту.
          </p>
        ) : (
          <>
            <Field label="ПРОЄКТ / КАТЕГОРІЯ">
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle}
              >
                {projects.some((p) => p.isInternal) && (
                  <optgroup label="Внутрішні">
                    {projects.filter((p) => p.isInternal).map((p) => (
                      <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                  </optgroup>
                )}
                {projects.some((p) => !p.isInternal) && (
                  <optgroup label="Проєкти">
                    {projects.filter((p) => !p.isInternal).map((p) => (
                      <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </Field>

            {selectedProject && !selectedProject.isInternal && (
              <Field label="СТАДІЯ">
                <select
                  value={stageId}
                  onChange={(e) => setStageId(e.target.value)}
                  className="rounded-lg px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                >
                  {selectedProject.stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {STAGE_LABELS[s.stage as ProjectStage]}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <Field label="НАЗВА">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Коротко опишіть задачу…"
                className="rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle}
                autoFocus
              />
            </Field>

            <Field label="ОПИС (необовʼязково)">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="rounded-lg px-3 py-2 text-sm outline-none resize-none"
                style={inputStyle}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="ПРІОРИТЕТ">
                <select
                  value={priority}
                  onChange={(e) =>
                    setPriority(e.target.value as typeof priority)
                  }
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
                    {u.name}{u.id === currentUserId ? " (ви)" : ""}
                  </option>
                ))}
              </select>
            </Field>

            <label
              className="flex items-center gap-2 text-xs"
              style={{ color: T.textSecondary }}
            >
              <input
                type="checkbox"
                checked={assignToMe}
                onChange={(e) => setAssignToMe(e.target.checked)}
              />
              Також призначити мені
            </label>

            {error && (
              <div
                className="rounded-lg px-3 py-2 text-xs"
                style={{ backgroundColor: "#ef444422", color: "#ef4444" }}
              >
                {error}
              </div>
            )}

            <div className="flex gap-2 justify-end">
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
                disabled={saving || !title.trim() || !projectId || !stageId}
                className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
                style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
              >
                {saving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Plus size={14} />
                )}
                Створити
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
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
