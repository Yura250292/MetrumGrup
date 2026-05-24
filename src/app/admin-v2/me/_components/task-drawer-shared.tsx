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
  Sparkles,
  RefreshCw,
  Trash2,
  Pencil,
} from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { TaskAttachmentsPanel } from "./task-attachments-panel";
import { CommentThread } from "@/components/collab/CommentThread";
import { TaskAiActions } from "./task-ai-actions";

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
  createdAt: string;
  projectId: string;
  project?: { id: string; title: string; personalInboxUserId?: string | null };
  createdById: string;
  createdBy?: { id: string; name: string; avatar: string | null } | null;
  status: DrawerStatus;
  stage: { stage: string };
  assignees: {
    id: string;
    userId: string | null;
    externalName: string | null;
    user: { id: string; name: string; avatar: string | null } | null;
  }[];
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
  currentUserId,
  currentUserRole,
  onClose,
  onUpdate,
}: {
  taskId: string;
  currentUserId?: string;
  currentUserRole?: string;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const [detail, setDetail] = useState<DrawerDetail | null>(null);
  const [rewritingSpec, setRewritingSpec] = useState(false);
  const [specError, setSpecError] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<DrawerStatus[]>([]);
  const [logs, setLogs] = useState<TimeLogEntry[]>([]);
  const [deps, setDeps] = useState<{ incoming: DependencyEntry[]; outgoing: DependencyEntry[] }>({
    incoming: [],
    outgoing: [],
  });
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDef[]>([]);
  const [activeTimerId, setActiveTimerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newChecklistItem, setNewChecklistItem] = useState("");
  const [saving, setSaving] = useState(false);
  const [timerBusy, setTimerBusy] = useState(false);

  // ── Permissions ──
  // Автор = той хто створив; Адмін = SUPER_ADMIN.
  // Тільки вони можуть редагувати поля, видаляти, закривати/повертати.
  const isAdmin = currentUserRole === "SUPER_ADMIN";
  const isAuthor =
    !!detail && !!currentUserId && detail.createdById === currentUserId;
  const canEditOrDelete = isAdmin || isAuthor;
  const isAssigneeNow =
    !!detail &&
    !!currentUserId &&
    (detail.assignees ?? []).some((a) => a.user?.id === currentUserId);

  // ── Edit mode ──
  // Авто-увімкнено для своїх задач (canEditOrDelete=true): автор/адмін одразу
  // редагує поля без зайвого кліку «Редагувати». Save bar зʼявляється лише
  // коли є зміни (isDirty); підтвердження «Зберегти зміни?» при сейві.
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDueDate, setEditDueDate] = useState(""); // YYYY-MM-DD
  const [editDueTime, setEditDueTime] = useState("18:00"); // HH:mm
  const [editPriority, setEditPriority] = useState<
    "LOW" | "NORMAL" | "HIGH" | "URGENT"
  >("NORMAL");
  const [editHours, setEditHours] = useState<string>("");
  const [editSaveError, setEditSaveError] = useState<string | null>(null);

  /** Fetch з 15-секундним таймаутом — без AbortController був ризик
   *  «вічного спінера» якщо мобільна мережа залипла. */
  const fetchWithTimeout = useCallback(
    async (url: string, timeoutMs = 15000): Promise<Response> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(url, { signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    },
    [],
  );

  // Коли клікнули на іншу задачу у списку — миттєво очищаємо detail щоб
  // не показувати дані попередньої. Завантаження нової стартує у load().
  useEffect(() => {
    setDetail(null);
    setLoadError(null);
  }, [taskId]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // Step 1: fetch task detail to get projectId
      const detailRes = await fetchWithTimeout(`/api/admin/tasks/${taskId}`);
      if (!detailRes.ok) {
        const msg =
          detailRes.status === 401
            ? "Сесія завершилась. Залогінься заново."
            : detailRes.status === 403
              ? "Немає доступу до цієї задачі."
              : detailRes.status === 404
                ? "Задача не знайдена або видалена."
                : `Не вдалося завантажити задачу (HTTP ${detailRes.status}).`;
        setLoadError(msg);
        return;
      }
      const { data: taskData } = await detailRes.json();
      setDetail(taskData);

      const projectId = taskData.projectId;

      // Step 2: parallel fetch — не критичні дані, помилки тут НЕ ламають
      // основний flow. Failed sub-fetch просто лишає секцію порожньою.
      const settled = await Promise.allSettled([
        fetchWithTimeout(`/api/admin/projects/${projectId}/statuses`),
        fetchWithTimeout(`/api/admin/tasks/${taskId}/time`),
        fetchWithTimeout(`/api/admin/time/timer/current`),
        fetchWithTimeout(`/api/admin/tasks/${taskId}/dependencies`),
        fetchWithTimeout(`/api/admin/projects/${projectId}/custom-fields`),
      ]);
      const [statusRes, logsRes, currentRes, depsRes, cfRes] = settled.map((s) =>
        s.status === "fulfilled" ? s.value : null,
      );

      if (statusRes?.ok) setStatuses((await statusRes.json()).data ?? []);
      if (logsRes?.ok) setLogs((await logsRes.json()).data ?? []);
      if (currentRes?.ok) {
        const j = await currentRes.json();
        setActiveTimerId(j.data && j.data.task?.id === taskId ? j.data.id : null);
      }
      if (depsRes?.ok) setDeps((await depsRes.json()).data ?? { incoming: [], outgoing: [] });
      if (cfRes?.ok) setCustomFieldDefs((await cfRes.json()).data ?? []);
    } catch (e) {
      const msg =
        e instanceof DOMException && e.name === "AbortError"
          ? "Таймаут. Перевірте інтернет і спробуйте знову."
          : e instanceof Error
            ? e.message
            : "Помилка завантаження";
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  }, [taskId, fetchWithTimeout]);

  useEffect(() => {
    void load();
  }, [load]);

  // Авто-enable edit-режиму для своїх задач після завантаження detail.
  // Активне поки drawer відкритий; коли користувач закриває drawer без
  // змін — нічого не зберігається.
  useEffect(() => {
    if (!detail || editing) return;
    if (canEditOrDelete) {
      startEdit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.id, canEditOrDelete]);

  // Чи є несейвлені зміни — щоб показувати Save-bar тільки коли є що
  // зберігати. Порівнюємо edit-state з оригінальним detail.
  const isDirty = (() => {
    if (!detail || !editing) return false;
    if (editTitle.trim() !== detail.title) return true;
    if ((editDescription || "") !== (detail.description ?? "")) return true;
    if (editPriority !== detail.priority) return true;
    // Дедлайн — порівнюємо ISO без секунд
    const originalIso = detail.dueDate
      ? new Date(detail.dueDate).toISOString().slice(0, 16)
      : "";
    const editIso = editDueDate
      ? (() => {
          const [hStr, mStr] = (editDueTime || "18:00").split(":");
          const d = new Date(editDueDate);
          d.setHours(Number(hStr) || 18, Number(mStr) || 0, 0, 0);
          return d.toISOString().slice(0, 16);
        })()
      : "";
    if (originalIso !== editIso) return true;
    // editHours може відрізнятися від detail (drawerDetail не має поля).
    // Поки skip — користувач явно бачить число у полі.
    return false;
  })();

  const rewriteSpec = async () => {
    if (!detail) return;
    if (
      !window.confirm(
        "AI виправить орфографію, пунктуацію і форматування. Суть тексту не змінюється. Замінити?",
      )
    )
      return;
    setRewritingSpec(true);
    setSpecError(null);
    try {
      const aiRes = await fetch("/api/admin/ai/task-spec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: detail.title,
          description: detail.description ?? undefined,
          projectId: detail.projectId,
          // У drawer'і «Переписати з AI» — це чистка тексту, а не генерація
          // структурованого ТЗ. Передаємо mode=refine.
          mode: "refine",
        }),
      });
      const aiJson = await aiRes.json();
      if (!aiRes.ok) throw new Error(aiJson.error ?? "Не вдалося згенерувати ТЗ");
      const markdown: string | undefined = aiJson.markdown;
      if (!markdown) throw new Error("AI не повернув ТЗ");
      await fetch(`/api/admin/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: markdown }),
      });
      await load();
      onUpdate();
    } catch (e) {
      setSpecError(e instanceof Error ? e.message : "Помилка AI");
    } finally {
      setRewritingSpec(false);
    }
  };

  /** Заповнює edit-state з поточного detail і вмикає редагування. */
  const startEdit = () => {
    if (!detail) return;
    setEditTitle(detail.title);
    setEditDescription(detail.description ?? "");
    if (detail.dueDate) {
      const d = new Date(detail.dueDate);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      setEditDueDate(`${y}-${m}-${day}`);
      const isMidnightUtc =
        d.getUTCHours() === 0 &&
        d.getUTCMinutes() === 0 &&
        d.getUTCSeconds() === 0;
      setEditDueTime(
        isMidnightUtc
          ? "18:00"
          : `${String(d.getHours()).padStart(2, "0")}:${String(
              d.getMinutes(),
            ).padStart(2, "0")}`,
      );
    } else {
      setEditDueDate("");
      setEditDueTime("18:00");
    }
    setEditPriority(
      (detail.priority as "LOW" | "NORMAL" | "HIGH" | "URGENT") ?? "NORMAL",
    );
    setEditHours(""); // не зберігаємо у DrawerDetail; reset до empty
    setEditSaveError(null);
    setEditing(true);
  };

  /**
   * Відкотити несейвлені зміни — заповнити edit-state з оригінального detail.
   * НЕ вимикає edit mode (він тепер завжди увімкнений для своїх задач).
   */
  const cancelEdit = () => {
    if (!detail) return;
    startEdit(); // повторне заповнення оригінальними даними з detail
    setEditSaveError(null);
  };

  const saveEdit = async () => {
    if (!detail) return;
    if (!editTitle.trim()) {
      setEditSaveError("Назва не може бути порожньою");
      return;
    }
    if (!window.confirm("Зберегти зміни?")) return;
    setSaving(true);
    setEditSaveError(null);
    try {
      const body: Record<string, unknown> = {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        priority: editPriority,
      };
      if (editDueDate) {
        const [hStr, mStr] = (editDueTime || "18:00").split(":");
        const d = new Date(editDueDate);
        d.setHours(Number(hStr) || 18, Number(mStr) || 0, 0, 0);
        body.dueDate = d.toISOString();
      } else {
        body.dueDate = null;
      }
      if (editHours.trim()) {
        const n = Number(editHours);
        if (!isNaN(n)) body.estimatedHours = n;
      } else {
        body.estimatedHours = null;
      }

      const res = await fetch(`/api/admin/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Не вдалося зберегти");
      }
      await load();
      onUpdate();
      // Лишаємо edit ON — користувач продовжує редагувати інші поля без
      // натиску «Редагувати» знову. Save bar просто зникне (isDirty=false).
    } catch (e) {
      setEditSaveError(e instanceof Error ? e.message : "Помилка збереження");
    } finally {
      setSaving(false);
    }
  };

  /**
   * Transition endpoints — серверні route'и гейтять права. Тут просто
   * викликаємо + перезавантажуємо.
   */
  const doTransition = async (path: "resolve" | "confirm" | "reject") => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/tasks/${taskId}/${path}`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? "Не вдалося змінити статус");
        return;
      }
      await load();
      onUpdate();
    } finally {
      setSaving(false);
    }
  };

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
    // Side-panel (не модал) — список зліва лишається клікабельним.
    // На мобільному займає весь екран, на десктопі — права частина (60vw,
    // максимум 1000px). Закривається тільки кнопкою X — клік по списку не
    // закриває drawer, можна вільно перемикатись між задачами.
    <div
      className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[60vw] sm:max-w-[1000px] overflow-y-auto"
      style={{
        backgroundColor: T.panel,
        borderLeft: `1px solid ${T.borderStrong}`,
        boxShadow: "-12px 0 32px rgba(0,0,0,0.18)",
      }}
    >
      <div className="h-full">
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
          <div className="flex items-center gap-1">
            {detail && canEditOrDelete && (
                <button
                  onClick={async () => {
                    if (!confirm(`Видалити задачу «${detail.title}»?`)) return;
                    const res = await fetch(`/api/admin/tasks/${taskId}`, {
                      method: "DELETE",
                    });
                    if (res.ok) {
                      onUpdate();
                      onClose();
                    } else {
                      const j = await res.json().catch(() => ({}));
                      alert(j.error ?? "Не вдалося видалити");
                    }
                  }}
                  className="rounded-lg p-2"
                  style={{ color: T.danger }}
                  title="Видалити задачу"
                  aria-label="Видалити задачу"
                >
                  <Trash2 size={16} />
                </button>
              )}
            <button
              onClick={onClose}
              className="rounded-lg p-2"
              style={{ color: T.textMuted }}
              aria-label="Закрити"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm" style={{ color: T.textMuted }}>
            <Loader2 size={18} className="animate-spin inline mr-2" />
            Завантаження…
          </div>
        ) : loadError || !detail ? (
          <div className="p-6 flex flex-col gap-3 items-center text-center">
            <div
              className="text-sm font-semibold"
              style={{ color: T.danger }}
            >
              {loadError ?? "Не вдалося завантажити задачу"}
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg px-4 py-2 text-sm font-semibold"
              style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
            >
              Спробувати знову
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-xs"
              style={{ color: T.textMuted }}
            >
              Закрити
            </button>
          </div>
        ) : (
          <div className="p-5 flex flex-col gap-5">
            {/* Title + project link (або редагований title) */}
            <div>
              {editing ? (
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Назва задачі"
                  className="w-full rounded-lg px-3 py-2 text-base font-bold outline-none"
                  style={{
                    backgroundColor: T.panelElevated,
                    color: T.textPrimary,
                    border: `1px solid ${T.borderSoft}`,
                  }}
                />
              ) : (
                <h3 className="text-lg font-bold" style={{ color: T.textPrimary }}>
                  {detail.title}
                </h3>
              )}
              {!editing &&
                detail.project &&
                // Personal Inbox — це бакет, не проєкт; ховаємо link.
                !(
                  detail.project.personalInboxUserId &&
                  detail.project.personalInboxUserId === currentUserId
                ) && (
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

            {/* Compact meta-row: дедлайн + пріоритет.
                У edit-режимі замінюємо на повноцінні інпути. */}
            {editing ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: T.textMuted }}
                  >
                    Дедлайн
                  </span>
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <input
                      type="date"
                      value={editDueDate}
                      onChange={(e) => setEditDueDate(e.target.value)}
                      className="rounded-lg px-3 py-2 text-sm outline-none"
                      style={{
                        backgroundColor: T.panelElevated,
                        color: T.textPrimary,
                        border: `1px solid ${T.borderSoft}`,
                      }}
                    />
                    <select
                      value={editDueTime}
                      onChange={(e) => setEditDueTime(e.target.value)}
                      className="rounded-lg px-3 py-2 text-sm outline-none"
                      style={{
                        backgroundColor: T.panelElevated,
                        color: T.textPrimary,
                        border: `1px solid ${T.borderSoft}`,
                      }}
                    >
                      {WORKING_HOUR_SLOTS_DRAWER.map((slot) => (
                        <option key={slot} value={slot}>
                          {slot}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider"
                      style={{ color: T.textMuted }}
                    >
                      Пріоритет
                    </span>
                    <select
                      value={editPriority}
                      onChange={(e) =>
                        setEditPriority(
                          e.target.value as
                            | "LOW"
                            | "NORMAL"
                            | "HIGH"
                            | "URGENT",
                        )
                      }
                      className="rounded-lg px-3 py-2 text-sm outline-none"
                      style={{
                        backgroundColor: T.panelElevated,
                        color: T.textPrimary,
                        border: `1px solid ${T.borderSoft}`,
                      }}
                    >
                      <option value="LOW">Низький</option>
                      <option value="NORMAL">Нормальний</option>
                      <option value="HIGH">Високий</option>
                      <option value="URGENT">Терміновий</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider"
                      style={{ color: T.textMuted }}
                    >
                      Оцінка, год
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={editHours}
                      onChange={(e) => setEditHours(e.target.value)}
                      placeholder="—"
                      className="rounded-lg px-3 py-2 text-sm outline-none"
                      style={{
                        backgroundColor: T.panelElevated,
                        color: T.textPrimary,
                        border: `1px solid ${T.borderSoft}`,
                      }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                {detail.dueDate &&
                  (() => {
                    const m = deadlineMarker(
                      detail.dueDate,
                      detail.createdAt,
                      detail.status?.isDone ?? false,
                    );
                    return (
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold"
                        style={{
                          backgroundColor: m.bg,
                          color: m.color,
                        }}
                        title={`Дедлайн · ${m.label}`}
                      >
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: m.color }}
                        />
                        📅 {formatDeadline(detail.dueDate)}
                      </span>
                    );
                  })()}
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold"
                  style={{
                    backgroundColor: priorityBg(detail.priority),
                    color: priorityColor(detail.priority),
                  }}
                  title="Пріоритет"
                >
                  ⚑ {priorityLabel(detail.priority)}
                </span>
                {detail.createdBy && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold"
                    style={{
                      backgroundColor: T.panelElevated,
                      color: T.textSecondary,
                      border: `1px solid ${T.borderSoft}`,
                    }}
                    title="Хто поставив задачу"
                  >
                    ✍ Автор: {detail.createdBy.name}
                  </span>
                )}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span
                  className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: T.textMuted }}
                >
                  {detail.description ? "Технічне завдання" : "Опис"}
                </span>
                {canEditOrDelete && (
                  <button
                    type="button"
                    onClick={() => void rewriteSpec()}
                    disabled={!detail.description || rewritingSpec}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold uppercase disabled:opacity-50"
                    style={{
                      backgroundColor: T.panelElevated,
                      color: T.accentPrimary,
                      border: `1px solid ${T.borderSoft}`,
                    }}
                    title={
                      detail.description
                        ? "AI виправить орфографію та пунктуацію, не змінюючи суть"
                        : "Опис відсутній"
                    }
                  >
                    {rewritingSpec ? (
                      <Loader2 size={10} className="animate-spin" />
                    ) : (
                      <RefreshCw size={10} />
                    )}
                    AI: виправити текст
                  </button>
                )}
              </div>
              {specError && (
                <div
                  className="rounded-md px-2 py-1 text-[11px]"
                  style={{ backgroundColor: "#ef444422", color: "#ef4444" }}
                >
                  {specError}
                </div>
              )}
              {editing ? (
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Що саме треба зробити?"
                  rows={8}
                  className="rounded-lg px-3 py-2 text-sm outline-none font-mono"
                  style={{
                    backgroundColor: T.panelElevated,
                    color: T.textPrimary,
                    border: `1px solid ${T.borderSoft}`,
                    minHeight: 180,
                  }}
                />
              ) : detail.description ? (
                <div
                  className="prose prose-invert prose-sm max-w-none rounded-lg px-3 py-2 font-mono overflow-y-auto"
                  style={{
                    color: T.textPrimary,
                    backgroundColor: T.panelElevated,
                    border: `1px solid ${T.borderSoft}`,
                    minHeight: 220,
                    maxHeight: "50vh",
                  }}
                >
                  {/* Зберігаємо переноси рядків як у textarea: одиночний \n
                      перетворюємо на markdown line-break ("  \n"), якщо там
                      ще не подвійний абзац. Так ТЗ з AI з ## заголовками
                      рендериться, а звичайний текст не зливається у простий
                      параграф. */}
                  <ReactMarkdown>
                    {detail.description.replace(/(?<!\n)\n(?!\n)/g, "  \n")}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="text-xs italic" style={{ color: T.textMuted }}>
                  Опис відсутній. Натисніть «Згенерувати ТЗ», щоб AI створив структуроване
                  технічне завдання.
                </p>
              )}
            </div>

            {/* Status — author/admin бачить усі pills (повний контроль);
                асайні без авторства бачать тільки потрібні transition кнопки. */}
            <Section label="СТАТУС">
              {canEditOrDelete ? (
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
              ) : (
                /* Виконавець без авторства — тільки relevant action button. */
                <div className="flex flex-wrap gap-2 items-center">
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-semibold"
                    style={{
                      backgroundColor: detail.status.color + "33",
                      color: detail.status.color,
                      border: `1px solid ${detail.status.color}`,
                    }}
                  >
                    {detail.status.name}
                  </span>
                  {isAssigneeNow &&
                    (detail.status.name === "Новий" ||
                      detail.status.name === "В роботі") && (
                      <button
                        onClick={() => void doTransition("resolve")}
                        disabled={saving}
                        className="rounded-lg px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
                        style={{
                          backgroundColor: "#f59e0b",
                          color: "#fff",
                        }}
                        title="Позначити як вирішено — задача піде автору на перевірку"
                      >
                        Позначити як вирішено
                      </button>
                    )}
                  {detail.status.name === "Вирішено" && (
                    <span
                      className="text-[11px]"
                      style={{ color: T.textMuted }}
                    >
                      Чекає підтвердження автора.
                    </span>
                  )}
                </div>
              )}

              {/* Author actions для статусу «Вирішено» — кнопки confirm / reject. */}
              {canEditOrDelete && detail.status.name === "Вирішено" && (
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => void doTransition("confirm")}
                    disabled={saving}
                    className="rounded-lg px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
                    style={{ backgroundColor: T.success, color: "#fff" }}
                    title="Підтвердити що задача виконана коректно — закрити"
                  >
                    Підтвердити (Закрити)
                  </button>
                  <button
                    onClick={() => void doTransition("reject")}
                    disabled={saving}
                    className="rounded-lg px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
                    style={{
                      backgroundColor: T.panelElevated,
                      color: T.danger,
                      border: `1px solid ${T.danger}40`,
                    }}
                    title="Повернути на доопрацювання"
                  >
                    Повернути на доопрацювання
                  </button>
                </div>
              )}
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
                  {detail.assignees.map((a) => {
                    const isExternal = !a.user;
                    const name = isExternal
                      ? (a.externalName ?? "—")
                      : (a.user?.name ?? "—");
                    return (
                      <span
                        key={a.id}
                        className="rounded-full px-3 py-1 text-[11px] font-semibold"
                        style={
                          isExternal
                            ? {
                                backgroundColor: T.panelElevated,
                                color: T.textSecondary,
                                border: `1px dashed ${T.borderStrong}`,
                              }
                            : {
                                backgroundColor: T.panelElevated,
                                color: T.textPrimary,
                              }
                        }
                        title={isExternal ? "Зовнішній виконавець" : undefined}
                      >
                        {name}
                        {isExternal && (
                          <span style={{ color: T.textMuted, marginLeft: 4 }}>
                            · зовн.
                          </span>
                        )}
                      </span>
                    );
                  })}
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

            {/* Attachments — файли, прикріплені до задачі (PDF/Word/Excel/тощо). */}
            <TaskAttachmentsPanel taskId={taskId} />

            {/* AI помічник — згорнутий за замовчуванням, щоб не лякати новачків.
                Тімер-трекінг прибрано повністю — переїде у наступну ітерацію,
                якщо буде потреба. */}
            {detail && (
              <details className="group">
                <summary
                  className="flex items-center justify-between gap-2 cursor-pointer rounded-lg px-3 py-2 text-xs font-semibold select-none"
                  style={{
                    backgroundColor: T.panelElevated,
                    color: T.textSecondary,
                    border: `1px solid ${T.borderSoft}`,
                    listStyle: "none",
                  }}
                  title="AI може коротко пояснити задачу, розбити на кроки, знайти блокери, підказати кого підключити, скласти чекліст або повідомлення. Все — на основі цієї задачі."
                >
                  <span className="flex items-center gap-2">
                    <Sparkles size={12} style={{ color: T.accentPrimary }} />
                    AI помічник
                    <span
                      className="text-[10px] font-normal"
                      style={{ color: T.textMuted }}
                    >
                      підказки, кроки, чекліст…
                    </span>
                  </span>
                  <span
                    className="text-[10px] font-normal transition-transform group-open:rotate-180"
                    style={{ color: T.textMuted }}
                  >
                    ▼
                  </span>
                </summary>
                <div
                  className="rounded-xl p-3 mt-2"
                  style={{
                    backgroundColor: T.panelSoft,
                    border: `1px solid ${T.borderSoft}`,
                  }}
                >
                  <TaskAiActions
                    task={{
                      id: detail.id,
                      title: detail.title,
                      description: detail.description,
                      status: { name: detail.status.name },
                      priority: detail.priority,
                      dueDate: detail.dueDate,
                      project: detail.project,
                      assignees: detail.assignees,
                      checklist: detail.checklist.map((c) => ({
                        content: c.content,
                        isDone: c.isDone,
                      })),
                      stage: detail.stage,
                    }}
                  />
                </div>
              </details>
            )}

            {/* Save bar — зʼявляється тільки коли є несейвлені зміни. */}
            {editing && isDirty && (
              <div
                className="sticky bottom-0 flex items-center justify-end gap-2 -mx-5 px-5 py-3 mt-1"
                style={{
                  backgroundColor: T.panel,
                  borderTop: `1px solid ${T.borderSoft}`,
                }}
              >
                {editSaveError && (
                  <span
                    className="mr-auto text-[11px] font-semibold"
                    style={{ color: T.danger }}
                  >
                    {editSaveError}
                  </span>
                )}
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={saving}
                  className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
                  style={{
                    backgroundColor: T.panelElevated,
                    color: T.textPrimary,
                    border: `1px solid ${T.borderSoft}`,
                  }}
                  title="Повернути до оригінальних значень"
                >
                  Відкотити
                </button>
                <button
                  type="button"
                  onClick={() => void saveEdit()}
                  disabled={saving || !editTitle.trim()}
                  className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
                  style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                  Зберегти
                </button>
              </div>
            )}

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

/** 09:00..18:00 з кроком 30 хв — пресет для edit-режиму. */
const WORKING_HOUR_SLOTS_DRAWER: string[] = (() => {
  const slots: string[] = [];
  for (let h = 9; h <= 18; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00`);
    if (h < 18) slots.push(`${String(h).padStart(2, "0")}:30`);
  }
  return slots;
})();

/** "21 трав, 18:00" — компактний формат дедлайну для меta-row. */
function formatDeadline(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString("uk-UA", { day: "2-digit", month: "short" });
  const isMidnightUtc =
    d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
  if (isMidnightUtc) return date; // legacy date-only — час не показуємо
  const time = d.toLocaleTimeString("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date}, ${time}`;
}

function priorityLabel(p: string): string {
  return p === "URGENT"
    ? "Терміновий"
    : p === "HIGH"
      ? "Високий"
      : p === "LOW"
        ? "Низький"
        : "Нормальний";
}

function priorityColor(p: string): string {
  return p === "URGENT" || p === "HIGH"
    ? "#ef4444"
    : p === "LOW"
      ? T.textMuted
      : T.accentPrimary;
}

/**
 * Колір для маркера часу до дедлайну.
 *  🟢 >50% часу лишилось
 *  🟡 25–50%
 *  🔴 <25%
 *  ⚫ прострочено
 *  ✅ виконано (виконано → нейтральний muted)
 */
function deadlineMarker(
  dueIso: string,
  createdAtIso: string,
  isDone: boolean,
): { color: string; bg: string; label: string } {
  if (isDone) {
    return { color: T.textMuted, bg: T.panelElevated, label: "виконано" };
  }
  const due = new Date(dueIso).getTime();
  const created = new Date(createdAtIso).getTime();
  const now = Date.now();
  if (now > due) {
    return { color: "#000000", bg: "#0000001a", label: "прострочено" };
  }
  const total = Math.max(due - created, 1);
  const remaining = due - now;
  const pct = (remaining / total) * 100;
  if (pct >= 50)
    return { color: "#10b981", bg: "#10b98122", label: `>50% часу (${Math.round(pct)}%)` };
  if (pct >= 25)
    return { color: "#f59e0b", bg: "#f59e0b22", label: `<50% часу (${Math.round(pct)}%)` };
  return { color: "#ef4444", bg: "#ef444422", label: `<25% часу (${Math.round(pct)}%)` };
}

function priorityBg(p: string): string {
  return p === "URGENT" || p === "HIGH"
    ? "#ef444422"
    : p === "LOW"
      ? T.panelElevated
      : T.accentPrimarySoft;
}
