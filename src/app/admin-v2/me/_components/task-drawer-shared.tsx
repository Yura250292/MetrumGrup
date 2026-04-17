"use client";

import { useCallback, useEffect, useState } from "react";
import {
  X,
  Loader2,
  CheckCircle2,
  Circle,
  Plus,
  Play,
  Square,
  Clock,
  Link2,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { CommentThread } from "@/components/collab/CommentThread";

type DrawerStatus = {
  id: string;
  name: string;
  color: string;
  isDone: boolean;
  position: number;
};

type DrawerDetail = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  dueDate: string | null;
  projectId: string;
  project?: { id: string; title: string };
  status: DrawerStatus;
  stage: { stage: string };
  assignees: { user: { id: string; name: string; avatar: string | null } }[];
  labels: { label: { id: string; name: string; color: string } }[];
  checklist: { id: string; content: string; isDone: boolean; position: number }[];
  customFields: Record<string, unknown> | null;
  _count: { subtasks: number; checklist: number };
};

type TimeLogEntry = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  minutes: number | null;
  description: string | null;
  user: { id: string; name: string; avatar: string | null };
};

type DependencyEntry = {
  id: string;
  type: string;
  predecessor?: { id: string; title: string; status: { name: string; color: string } };
  successor?: { id: string; title: string; status: { name: string; color: string } };
};

type CustomFieldDef = {
  id: string;
  name: string;
  type: "TEXT" | "NUMBER" | "DATE" | "SELECT" | "MULTI_SELECT" | "URL" | "USER";
  options: { values?: string[] } | null;
  isRequired: boolean;
};

export function SelfContainedTaskDrawer({
  taskId,
  onClose,
  onUpdate,
}: {
  taskId: string;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const [detail, setDetail] = useState<DrawerDetail | null>(null);
  const [statuses, setStatuses] = useState<DrawerStatus[]>([]);
  const [logs, setLogs] = useState<TimeLogEntry[]>([]);
  const [deps, setDeps] = useState<{ incoming: DependencyEntry[]; outgoing: DependencyEntry[] }>({
    incoming: [],
    outgoing: [],
  });
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDef[]>([]);
  const [activeTimerId, setActiveTimerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newChecklistItem, setNewChecklistItem] = useState("");
  const [saving, setSaving] = useState(false);
  const [timerBusy, setTimerBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Step 1: fetch task detail to get projectId
      const detailRes = await fetch(`/api/admin/tasks/${taskId}`);
      if (!detailRes.ok) return;
      const { data: taskData } = await detailRes.json();
      setDetail(taskData);

      const projectId = taskData.projectId;

      // Step 2: parallel fetch project-scoped data + other task data
      const [statusRes, logsRes, currentRes, depsRes, cfRes] = await Promise.all([
        fetch(`/api/admin/projects/${projectId}/statuses`),
        fetch(`/api/admin/tasks/${taskId}/time`),
        fetch(`/api/admin/time/timer/current`),
        fetch(`/api/admin/tasks/${taskId}/dependencies`),
        fetch(`/api/admin/projects/${projectId}/custom-fields`),
      ]);

      if (statusRes.ok) setStatuses((await statusRes.json()).data ?? []);
      if (logsRes.ok) setLogs((await logsRes.json()).data ?? []);
      if (currentRes.ok) {
        const j = await currentRes.json();
        setActiveTimerId(j.data && j.data.task?.id === taskId ? j.data.id : null);
      }
      if (depsRes.ok) setDeps((await depsRes.json()).data ?? { incoming: [], outgoing: [] });
      if (cfRes.ok) setCustomFieldDefs((await cfRes.json()).data ?? []);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  const setStatus = async (statusId: string) => {
    setSaving(true);
    try {
      await fetch(`/api/admin/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusId }),
      });
      await load();
      onUpdate();
    } finally {
      setSaving(false);
    }
  };

  const addChecklist = async () => {
    if (!newChecklistItem.trim()) return;
    await fetch(`/api/admin/tasks/${taskId}/checklist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newChecklistItem }),
    });
    setNewChecklistItem("");
    await load();
  };

  const toggleChecklist = async (itemId: string) => {
    await fetch(`/api/admin/tasks/${taskId}/checklist/${itemId}`, { method: "PATCH" });
    await load();
  };

  const startTimer = async () => {
    setTimerBusy(true);
    try {
      await fetch("/api/admin/time/timer/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
      });
      window.dispatchEvent(new Event("timer:refresh"));
      await load();
      onUpdate();
    } finally {
      setTimerBusy(false);
    }
  };

  const stopTimer = async () => {
    setTimerBusy(true);
    try {
      await fetch("/api/admin/time/timer/stop", { method: "POST" });
      window.dispatchEvent(new Event("timer:refresh"));
      await load();
      onUpdate();
    } finally {
      setTimerBusy(false);
    }
  };

  const setCustomField = async (fieldId: string, value: unknown) => {
    const currentCf = detail?.customFields ?? {};
    await fetch(`/api/admin/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customFields: { ...currentCf, [fieldId]: value } }),
    });
    await load();
  };

  const totalMinutes = logs.reduce((sum, l) => sum + (l.minutes ?? 0), 0);
  const totalHours = (totalMinutes / 60).toFixed(2);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full sm:w-[560px] overflow-y-auto"
        style={{
          backgroundColor: T.panel,
          borderLeft: `1px solid ${T.borderStrong}`,
        }}
      >
        <div
          className="sticky top-0 flex items-center justify-between p-4 z-10"
          style={{
            backgroundColor: T.panel,
            borderBottom: `1px solid ${T.borderSoft}`,
          }}
        >
          <h2 className="text-sm font-bold" style={{ color: T.textPrimary }}>
            Задача
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2"
            style={{ color: T.textMuted }}
          >
            <X size={18} />
          </button>
        </div>

        {loading || !detail ? (
          <div className="p-8 text-center text-sm" style={{ color: T.textMuted }}>
            <Loader2 size={18} className="animate-spin inline mr-2" />
            Завантаження…
          </div>
        ) : (
          <div className="p-5 flex flex-col gap-5">
            {/* Title + project link */}
            <div>
              <h3 className="text-lg font-bold" style={{ color: T.textPrimary }}>
                {detail.title}
              </h3>
              {detail.project && (
                <Link
                  href={`/admin-v2/projects/${detail.project.id}?tab=tasks`}
                  className="inline-flex items-center gap-1 text-[11px] mt-1"
                  style={{ color: T.accentPrimary }}
                >
                  <ExternalLink size={10} />
                  {detail.project.title}
                </Link>
              )}
            </div>

            {detail.description && (
              <p className="text-sm whitespace-pre-wrap" style={{ color: T.textSecondary }}>
                {detail.description}
              </p>
            )}

            {/* Status selector */}
            <Section label="СТАТУС">
              <div className="flex flex-wrap gap-2">
                {statuses.map((s) => {
                  const active = s.id === detail.status.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => void setStatus(s.id)}
                      disabled={saving}
                      className="rounded-full px-3 py-1.5 text-[11px] font-semibold disabled:opacity-60"
                      style={{
                        backgroundColor: active ? s.color + "33" : T.panelElevated,
                        color: active ? s.color : T.textMuted,
                        border: `1px solid ${active ? s.color : T.borderSoft}`,
                      }}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </Section>

            {/* Checklist */}
            <Section label="ЧЕК-ЛИСТ">
              <ul className="flex flex-col gap-1">
                {detail.checklist.map((ci) => (
                  <li
                    key={ci.id}
                    onClick={() => void toggleChecklist(ci.id)}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm cursor-pointer"
                    style={{
                      color: ci.isDone ? T.textMuted : T.textPrimary,
                      textDecoration: ci.isDone ? "line-through" : "none",
                    }}
                  >
                    {ci.isDone ? (
                      <CheckCircle2 size={14} color={T.success} />
                    ) : (
                      <Circle size={14} color={T.textMuted} />
                    )}
                    {ci.content}
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <input
                  value={newChecklistItem}
                  onChange={(e) => setNewChecklistItem(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void addChecklist();
                  }}
                  placeholder="Новий пункт…"
                  className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
                  style={{
                    backgroundColor: T.panelElevated,
                    color: T.textPrimary,
                    border: `1px solid ${T.borderSoft}`,
                  }}
                />
                <button
                  onClick={() => void addChecklist()}
                  className="rounded-lg px-3 py-2 text-sm font-semibold"
                  style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
                >
                  <Plus size={14} />
                </button>
              </div>
            </Section>

            {/* Assignees */}
            {detail.assignees.length > 0 && (
              <Section label="ВИКОНАВЦІ">
                <div className="flex flex-wrap gap-2">
                  {detail.assignees.map((a) => (
                    <span
                      key={a.user.id}
                      className="rounded-full px-3 py-1 text-[11px] font-semibold"
                      style={{ backgroundColor: T.panelElevated, color: T.textPrimary }}
                    >
                      {a.user.name}
                    </span>
                  ))}
                </div>
              </Section>
            )}

            {/* Dependencies */}
            {(deps.incoming.length > 0 || deps.outgoing.length > 0) && (
              <Section label="ЗАЛЕЖНОСТІ" icon={<Link2 size={11} />}>
                <ul className="flex flex-col gap-1">
                  {deps.incoming.map((d) => (
                    <DepRow key={"in-" + d.id} label="← залежить від" task={d.predecessor} />
                  ))}
                  {deps.outgoing.map((d) => (
                    <DepRow key={"out-" + d.id} label="блокує →" task={d.successor} />
                  ))}
                </ul>
              </Section>
            )}

            {/* Custom fields */}
            {customFieldDefs.length > 0 && (
              <Section label="КАСТОМНІ ПОЛЯ">
                <div className="flex flex-col gap-2">
                  {customFieldDefs.map((def) => (
                    <div key={def.id} className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold" style={{ color: T.textMuted }}>
                        {def.name}
                      </span>
                      {def.type === "SELECT" ? (
                        <select
                          value={String((detail.customFields ?? {})[def.id] ?? "")}
                          onChange={(e) => void setCustomField(def.id, e.target.value)}
                          className="rounded-lg px-2.5 py-1.5 text-sm outline-none"
                          style={{
                            backgroundColor: T.panelElevated,
                            color: T.textPrimary,
                            border: `1px solid ${T.borderSoft}`,
                          }}
                        >
                          <option value="">—</option>
                          {(def.options?.values ?? []).map((v) => (
                            <option key={v} value={v}>{v}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={def.type === "NUMBER" ? "number" : def.type === "DATE" ? "date" : "text"}
                          value={String((detail.customFields ?? {})[def.id] ?? "")}
                          onChange={(e) => void setCustomField(def.id, e.target.value)}
                          className="rounded-lg px-2.5 py-1.5 text-sm outline-none"
                          style={{
                            backgroundColor: T.panelElevated,
                            color: T.textPrimary,
                            border: `1px solid ${T.borderSoft}`,
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Time tracking */}
            <Section label={`ТАЙМ-ТРЕКІНГ · ${totalHours} год`} icon={<Clock size={11} />}>
              <div className="flex gap-2">
                {activeTimerId ? (
                  <button
                    onClick={() => void stopTimer()}
                    disabled={timerBusy}
                    className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold"
                    style={{ backgroundColor: "#ef4444", color: "#fff" }}
                  >
                    {timerBusy ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />}
                    Зупинити
                  </button>
                ) : (
                  <button
                    onClick={() => void startTimer()}
                    disabled={timerBusy}
                    className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold"
                    style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
                  >
                    {timerBusy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                    Старт
                  </button>
                )}
              </div>
              {logs.length > 0 && (
                <ul className="flex flex-col gap-1 mt-1">
                  {logs.slice(0, 10).map((l) => (
                    <li
                      key={l.id}
                      className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[11px]"
                      style={{ backgroundColor: T.panelElevated, color: T.textSecondary }}
                    >
                      <span className="truncate flex-1">
                        {l.user.name} · {new Date(l.startedAt).toLocaleDateString("uk-UA")}
                        {l.description ? ` · ${l.description}` : ""}
                      </span>
                      <span className="font-mono font-bold ml-2" style={{ color: T.textPrimary }}>
                        {l.minutes !== null
                          ? `${Math.floor(l.minutes / 60)}:${(l.minutes % 60).toString().padStart(2, "0")}`
                          : "..."}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {/* Comments */}
            <CommentThread entityType="TASK" entityId={taskId} />
          </div>
        )}
      </div>
    </div>
  );
}

function Section({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label
        className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider"
        style={{ color: T.textMuted }}
      >
        {icon}
        {label}
      </label>
      {children}
    </div>
  );
}

function DepRow({
  label,
  task,
}: {
  label: string;
  task?: { id: string; title: string; status: { name: string; color: string } };
}) {
  if (!task) return null;
  return (
    <li
      className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px]"
      style={{ backgroundColor: T.panelElevated }}
    >
      <span style={{ color: T.textMuted }}>{label}</span>
      <span className="font-semibold truncate" style={{ color: T.textPrimary }}>
        {task.title}
      </span>
      <span
        className="rounded-full px-1.5 py-0.5 text-[9px] font-bold ml-auto"
        style={{ backgroundColor: task.status.color + "22", color: task.status.color }}
      >
        {task.status.name}
      </span>
    </li>
  );
}
