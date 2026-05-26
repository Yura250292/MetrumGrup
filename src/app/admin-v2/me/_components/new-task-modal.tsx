"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  X,
  Loader2,
  Sparkles,
  Eye,
  Pencil,
  Check,
  ChevronDown,
  ChevronUp,
  UserPlus,
  Search,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { stageDisplayName } from "@/lib/constants";
import type { ProjectStage } from "@prisma/client";

type StageNode = {
  id: string;
  stage: ProjectStage | null;
  customName: string | null;
  status: string;
  parentStageId: string | null;
  sortOrder: number;
};

type MyProject = {
  id: string;
  title: string;
  currentStage: string;
  isInternal?: boolean;
  stages: StageNode[];
};

type TaskPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

type AiSpec = {
  goal: string;
  scope: string;
  deliverables: string[];
  acceptanceCriteria: string[];
  suggestedDueDate?: string | null;
  suggestedPriority: TaskPriority;
  suggestedEstimatedHours?: number | null;
  checklist: string[];
  risks: string[];
  involvedRoles: string[];
  clarifications: string[];
  markdown: string;
};

type AssigneeChip =
  | { kind: "user"; userId: string; name: string }
  | { kind: "external"; name: string };

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: "Низький",
  NORMAL: "Нормальний",
  HIGH: "Високий",
  URGENT: "Терміновий",
};

const inputStyle: React.CSSProperties = {
  backgroundColor: T.panelElevated,
  color: T.textPrimary,
  border: `1px solid ${T.borderSoft}`,
};

/**
 * Робочий діапазон 09:00–18:00 з кроком 30 хв. Передбачає що дедлайн
 * ставлять у межах робочого дня. Не накладає DB-обмежень — це тільки
 * UI-пресет для зручності.
 */
const WORKING_HOUR_SLOTS: string[] = (() => {
  const slots: string[] = [];
  for (let h = 9; h <= 18; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00`);
    if (h < 18) slots.push(`${String(h).padStart(2, "0")}:30`);
  }
  return slots;
})();

function flattenStageTree(stages: StageNode[]): Array<{ node: StageNode; depth: number }> {
  const byParent = new Map<string | null, StageNode[]>();
  for (const s of stages) {
    const key = s.parentStageId ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(s);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder);
  }
  const out: Array<{ node: StageNode; depth: number }> = [];
  const walk = (parentId: string | null, depth: number) => {
    const list = byParent.get(parentId) ?? [];
    for (const node of list) {
      out.push({ node, depth });
      walk(node.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function NewTaskModal({
  currentUserId,
  onClose,
  onCreated,
}: {
  currentUserId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  // ── Required core fields ──
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  // Дедлайн розділили на 2 поля: дата + час. Час — з пресету 09:00-18:00
  // через <select>, щоб не вводити нонсенс на кшталт 03:14.
  const [dueDate, setDueDate] = useState(""); // YYYY-MM-DD
  const [dueTime, setDueTime] = useState("18:00"); // HH:mm, default = кінець робочого дня

  // ── Assignees ──
  // Модель: ОДИН виконавець. Або «Ви» (assignToMe), або інший User. Якщо
  // обираєш іншого — заміняєш, а не додаєш (взаємно виключно). Зовнішні
  // виконавці поки прибрано — лишимо як майбутню фічу, коли буде Contact CRUD.
  const [assignee, setAssignee] = useState<AssigneeChip | null>(null);
  const [assignToMe, setAssignToMe] = useState(true);
  /**
   * Об'єднаний список кандидатів для picker'а: User'и CRM + Employee'и з HR.
   *  - Якщо Employee має linkedUserId — він зливається з User'ом
   *    (показуємо одним записом з kind="user").
   *  - Інакше показуємо як kind="employee" → при виборі додаємо як
   *    externalName (бо User'а у системі немає).
   */
  const [candidates, setCandidates] = useState<
    Array<
      | { kind: "user"; id: string; name: string; subtitle?: string }
      | { kind: "employee"; id: string; name: string; subtitle?: string }
    >
  >([]);
  const [userPickerOpen, setUserPickerOpen] = useState(false);
  const [userSearch, setUserSearch] = useState("");

  // ── Advanced (collapsed by default) ──
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [projects, setProjects] = useState<MyProject[]>([]);
  const [projectId, setProjectId] = useState(""); // "" → Personal Inbox
  const [stageId, setStageId] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("NORMAL");
  const [estimatedHours, setEstimatedHours] = useState("");

  // ── Reminders ── (поки що: один preset на задачу; multiple — пізніше)
  type ReminderPreset = "none" | "p50" | "p75" | "h24" | "h1";
  const [reminder, setReminder] = useState<ReminderPreset>("p75");

  // ── Повторення ── (recurring task). Якщо чекбокс на → створюється
  // template, з якого cron-spawner у /api/cron/tick кожні 5 хв перевіряє
  // чи треба додати наступний instance. Horizon — 24h, тому календар
  // не заспамиться вперед: тільки 1 запис на день перед наступним.
  type RecurrencePreset = "daily" | "weekly" | "monthly";
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrencePreset, setRecurrencePreset] = useState<RecurrencePreset>("weekly");

  // ── AI ──
  const [generatingSpec, setGeneratingSpec] = useState(false);
  const [specJson, setSpecJson] = useState<AiSpec | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [descMode, setDescMode] = useState<"edit" | "preview">("edit");
  const [applyChecklist, setApplyChecklist] = useState(true);
  const [checklistSelected, setChecklistSelected] = useState<Set<number>>(new Set());
  const [appliedPriority, setAppliedPriority] = useState(false);
  const [appliedDueDate, setAppliedDueDate] = useState(false);
  const [appliedHours, setAppliedHours] = useState(false);

  // ── Submit state ──
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(true);

  const userPickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // Без role-filter: assignee може бути ХТО завгодно (раніше FOREMAN/HR/
        // CLIENT випадали, бо filter обмежував SUPER_ADMIN/MANAGER/ENGINEER/
        // FINANCIER). Тепер фільтруємо лише за isActive.
        const [projRes, usersRes, empRes] = await Promise.all([
          fetch("/api/admin/me/projects"),
          fetch("/api/admin/users"),
          fetch("/api/admin/employees/picker"),
        ]);
        if (projRes.ok) {
          const j = await projRes.json();
          setProjects((j.data ?? []) as MyProject[]);
        }

        // Зливаємо User'ів і Employee'ів в один список кандидатів.
        // Employee з linkedUserId — показуємо як User (щоб не дублювати).
        // Решта Employees — як kind="employee" (буде externalName).
        const merged = new Map<
          string,
          | { kind: "user"; id: string; name: string; subtitle?: string }
          | { kind: "employee"; id: string; name: string; subtitle?: string }
        >();

        if (usersRes.ok) {
          const j = await usersRes.json();
          for (const u of (j.data ?? []).filter((u: any) => u.isActive)) {
            merged.set(`user:${u.id}`, {
              kind: "user",
              id: u.id,
              name: u.name,
            });
          }
        }
        if (empRes.ok) {
          const j = await empRes.json();
          for (const e of j.data ?? []) {
            if (e.linkedUserId) {
              const key = `user:${e.linkedUserId}`;
              const existing = merged.get(key);
              if (existing) {
                // Employee має акаунт + вже у списку → додаємо посаду
                merged.set(key, {
                  ...existing,
                  subtitle: e.position ?? undefined,
                });
              } else {
                // Linked User не повернувся у /users (через ACL чи бо неактивний
                // user-side) — додаємо за рахунок employee-picker.
                merged.set(key, {
                  kind: "user",
                  id: e.linkedUserId,
                  name: e.linkedUserName ?? e.fullName,
                  subtitle: e.position ?? undefined,
                });
              }
            } else {
              merged.set(`emp:${e.id}`, {
                kind: "employee",
                id: e.id,
                name: e.fullName,
                subtitle: e.position ?? "співробітник без акаунту",
              });
            }
          }
        }
        setCandidates([...merged.values()]);
      } finally {
        setLoadingProjects(false);
      }
    })();
  }, []);

  const selectedProject = projects.find((p) => p.id === projectId);

  // When project changes, auto-pick the matching top-level stage (if any).
  useEffect(() => {
    if (!selectedProject) {
      setStageId("");
      return;
    }
    if (selectedProject.isInternal) {
      setStageId("");
      return;
    }
    const topLevelCurrent = selectedProject.stages.find(
      (s) => !s.parentStageId && s.stage === selectedProject.currentStage,
    );
    const firstTopLevel = selectedProject.stages.find((s) => !s.parentStageId);
    const fallback = topLevelCurrent ?? firstTopLevel ?? selectedProject.stages[0];
    setStageId(fallback?.id ?? "");
  }, [selectedProject]);

  // Click-outside for user picker dropdown.
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (
        userPickerRef.current &&
        !userPickerRef.current.contains(e.target as Node)
      ) {
        setUserPickerOpen(false);
      }
    }
    if (userPickerOpen) {
      window.addEventListener("mousedown", handle);
      return () => window.removeEventListener("mousedown", handle);
    }
  }, [userPickerOpen]);

  const canGenerateSpec = title.trim().length >= 4 && !generatingSpec;
  // Опис тепер опційний — інколи заголовку достатньо.
  // Обовʼязкові: тільки назва і дедлайн (дата).
  const formValid = title.trim().length > 0 && dueDate.length > 0;

  const generateSpec = async () => {
    if (!canGenerateSpec) return;
    setGeneratingSpec(true);
    setAiError(null);
    try {
      const res = await fetch("/api/admin/ai/task-spec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          projectId: projectId || undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Не вдалося згенерувати ТЗ");
      if (j.markdown) setDescription(j.markdown);
      if (j.spec) {
        setSpecJson(j.spec as AiSpec);
        setChecklistSelected(
          new Set((j.spec.checklist as string[]).map((_, i) => i)),
        );
        setAppliedPriority(false);
        setAppliedDueDate(false);
        setAppliedHours(false);
      }
      setDescMode("preview");
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Помилка AI");
    } finally {
      setGeneratingSpec(false);
    }
  };

  const applySpecPriority = () => {
    if (!specJson) return;
    setPriority(specJson.suggestedPriority);
    setAppliedPriority(true);
  };
  const applySpecDue = () => {
    if (!specJson?.suggestedDueDate) return;
    // AI повертає YYYY-MM-DD — час залишаємо як є (юзер сам вибрав 18:00 за дефолтом).
    setDueDate(specJson.suggestedDueDate);
    setAppliedDueDate(true);
  };
  const applySpecHours = () => {
    if (!specJson?.suggestedEstimatedHours) return;
    setEstimatedHours(String(specJson.suggestedEstimatedHours));
    setAppliedHours(true);
  };

  /**
   * Виставити ОДНОГО виконавця. Якщо це я — просто assignToMe=true.
   * Якщо інший — assignToMe=false і запам'ятовуємо чип. Взаємно виключно.
   */
  const setUserAssignee = (userId: string, name: string) => {
    if (userId === currentUserId) {
      setAssignToMe(true);
      setAssignee(null);
    } else {
      setAssignToMe(false);
      setAssignee({ kind: "user", userId, name });
    }
    setUserPickerOpen(false);
    setUserSearch("");
  };

  /** Очистити поточного виконавця → дефолт «Ви». */
  const clearAssignee = () => {
    setAssignee(null);
    setAssignToMe(true);
  };

  const filteredCandidates = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    const list = candidates.filter(
      (c) => !q || c.name.toLowerCase().includes(q),
    );
    // Сортуємо: спочатку User'и (бо їх можна нотифікувати), потім Employees.
    list.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "user" ? -1 : 1;
      return a.name.localeCompare(b.name, "uk");
    });
    return list.slice(0, 50);
  }, [candidates, userSearch]);

  const submit = async () => {
    if (!formValid) return;
    setSaving(true);
    setError(null);
    try {
      // Build assignees payload. У моделі — ОДИН виконавець.
      // { userId } для User'а; { externalName } для Employee без акаунту
      // (API нормалізує обидва шейпи).
      const payload: Array<{ userId?: string; externalName?: string }> = [];
      if (assignToMe) {
        payload.push({ userId: currentUserId });
      } else if (assignee?.kind === "user") {
        payload.push({ userId: assignee.userId });
      } else if (assignee?.kind === "external") {
        payload.push({ externalName: assignee.name });
      }

      const checklist =
        applyChecklist && specJson
          ? specJson.checklist.filter((_, i) => checklistSelected.has(i))
          : undefined;

      // Збираємо ISO з 2 окремих полів: dueDate (YYYY-MM-DD) + dueTime (HH:mm).
      const dueIso = (() => {
        const [hStr, mStr] = (dueTime || "18:00").split(":");
        const d = new Date(dueDate);
        d.setHours(Number(hStr) || 18, Number(mStr) || 0, 0, 0);
        return d.toISOString();
      })();

      // Reminder → структурований spec для бекенда. Бекенд порахує fireAt
      // на основі createdAt + dueDate.
      const reminderSpec: {
        kind: "PERCENT" | "BEFORE_HOURS";
        value: number;
      } | null =
        reminder === "none"
          ? null
          : reminder === "p50"
            ? { kind: "PERCENT", value: 50 }
            : reminder === "p75"
              ? { kind: "PERCENT", value: 75 }
              : reminder === "h24"
                ? { kind: "BEFORE_HOURS", value: 24 }
                : { kind: "BEFORE_HOURS", value: 1 };

      const body: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim(),
        dueDate: dueIso,
        priority,
        estimatedHours: estimatedHours ? Number(estimatedHours) : undefined,
        assignees: payload.length > 0 ? payload : undefined,
        checklist: checklist && checklist.length > 0 ? checklist : undefined,
        reminder: reminderSpec,
        recurrence: isRecurring ? { preset: recurrencePreset } : undefined,
      };
      if (projectId) {
        body.projectId = projectId;
        if (stageId) body.stageId = stageId;
      }

      const res = await fetch("/api/admin/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

  const hasSpec = !!specJson;
  // Modal wider за дефолтом — у задачах часто длинні описи (з протоколів,
  // переписок). max-w-2xl ≈ 672px, у 1.6× ширше за попередній max-w-lg.
  const modalWidth = hasSpec ? "max-w-5xl" : "max-w-2xl";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full mt-6 rounded-2xl p-5 flex flex-col gap-4 ${modalWidth}`}
        style={{
          backgroundColor: T.panel,
          border: `1px solid ${T.borderStrong}`,
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold" style={{ color: T.textPrimary }}>
            Нова задача
          </h2>
          <button
            onClick={onClose}
            style={{ color: T.textMuted }}
            aria-label="Закрити"
          >
            <X size={18} />
          </button>
        </div>

        <div className={`grid gap-4 ${hasSpec ? "md:grid-cols-2" : "grid-cols-1"}`}>
          <div className="flex flex-col gap-4 min-w-0">
            {/* ── Title (required) ── */}
            <RequiredField label="Назва задачі">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Напр. «Передзвонити підряднику»"
                className="rounded-lg px-3 py-2.5 text-sm outline-none h-11"
                style={inputStyle}
                autoFocus
              />
            </RequiredField>

            {/* ── Description (optional) ── інколи заголовку достатньо.
                Підтримує Markdown — користувачі часто вставляють текст з
                AI-протоколів нарад, де є # заголовки, * списки тощо.
                Toggle Текст / Перегляд щоб бачити як виглядатиме. */}
            <Field label="Короткий опис (необовʼязково)">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-[10px]"
                    style={{ color: T.textMuted }}
                  >
                    Підтримує markdown (#, **, списки)
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setDescMode("edit")}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold uppercase"
                      style={{
                        backgroundColor:
                          descMode === "edit" ? T.accentPrimary : T.panelElevated,
                        color: descMode === "edit" ? "#fff" : T.textMuted,
                      }}
                    >
                      <Pencil size={10} /> Текст
                    </button>
                    <button
                      type="button"
                      onClick={() => setDescMode("preview")}
                      disabled={!description.trim()}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold uppercase disabled:opacity-40"
                      style={{
                        backgroundColor:
                          descMode === "preview" ? T.accentPrimary : T.panelElevated,
                        color: descMode === "preview" ? "#fff" : T.textMuted,
                      }}
                    >
                      <Eye size={10} /> Перегляд
                    </button>
                  </div>
                </div>
                {descMode === "edit" ? (
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onPaste={(e) => {
                      // Якщо вставили markdown-структурований текст (заголовки,
                      // списки) — автоматично перемикаємо на Перегляд щоб
                      // користувач одразу побачив що # рендериться.
                      const pasted = e.clipboardData?.getData("text") ?? "";
                      if (/^#{1,6}\s|^\*\s|^-\s|^\d+\.\s/m.test(pasted)) {
                        // Відстрочуємо setDescription уже обробив paste
                        setTimeout(() => setDescMode("preview"), 0);
                      }
                    }}
                    rows={hasSpec ? 14 : 8}
                    placeholder={`Що саме треба зробити?\n\nМожна вставляти текст з протоколу наради — markdown (## заголовки, - списки) рендериться.`}
                    className="rounded-lg px-3 py-2 text-sm outline-none font-mono"
                    style={{
                      ...inputStyle,
                      minHeight: hasSpec ? 320 : 220,
                      maxHeight: "50vh",
                    }}
                  />
                ) : (
                  <div
                    className="rounded-lg px-3 py-2 text-sm overflow-y-auto prose prose-invert prose-sm max-w-none"
                    style={{
                      ...inputStyle,
                      minHeight: hasSpec ? 320 : 220,
                      maxHeight: "50vh",
                      color: T.textPrimary,
                    }}
                  >
                    {description.trim() ? (
                      <ReactMarkdown>{description}</ReactMarkdown>
                    ) : (
                      <span style={{ color: T.textMuted }}>Нічого не введено</span>
                    )}
                  </div>
                )}
              </div>
            </Field>

            {/* ── Due date + time (required) ──
                Розділили на 2 поля: дата (type=date) + час (select 09:00-18:00).
                Чому select для часу: на mobile native time-picker нудний, а
                юзери у нас працюють у робочому діапазоні. Default = 18:00. */}
            <RequiredField label="Дедлайн">
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="rounded-lg px-3 py-2.5 text-sm outline-none h-11"
                  style={inputStyle}
                />
                <select
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                  className="rounded-lg px-3 py-2.5 text-sm outline-none h-11"
                  style={inputStyle}
                  aria-label="Час"
                  title="Робочий діапазон 09:00–18:00"
                >
                  {WORKING_HOUR_SLOTS.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))}
                </select>
              </div>
            </RequiredField>

            {/* ── Повторення ── одразу під дедлайном бо логічно повʼязано */}
            <Field label="">
              <label
                className="flex items-center gap-2 text-[12px] cursor-pointer"
                style={{ color: T.textPrimary }}
              >
                <input
                  type="checkbox"
                  checked={isRecurring}
                  onChange={(e) => setIsRecurring(e.target.checked)}
                />
                <span>🔁 Повторювана задача</span>
              </label>
              {isRecurring && (
                <div className="flex flex-col gap-1.5 mt-1">
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        { id: "daily", label: "Щодня" },
                        { id: "weekly", label: "Щотижня" },
                        { id: "monthly", label: "Щомісяця" },
                      ] as { id: RecurrencePreset; label: string }[]
                    ).map((p) => {
                      const active = recurrencePreset === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setRecurrencePreset(p.id)}
                          className="rounded-full px-2.5 py-1 text-[11px] font-semibold transition"
                          style={{
                            backgroundColor: active
                              ? T.accentPrimarySoft
                              : T.panelElevated,
                            color: active ? T.accentPrimary : T.textMuted,
                            border: `1px solid ${active ? T.accentPrimary + "40" : T.borderSoft}`,
                          }}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                  <span className="text-[10px]" style={{ color: T.textMuted }}>
                    Наступний екземпляр зʼявиться автоматично за день до
                    дедлайну — календар не спамиться вперед.
                  </span>
                </div>
              )}
            </Field>

            {/* ── Reminder (optional, default 75% часу) ── */}
            <Field label="Нагадати про дедлайн">
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { id: "p50", label: "50% часу" },
                    { id: "p75", label: "75% часу" },
                    { id: "h24", label: "за 1 день" },
                    { id: "h1", label: "за 1 годину" },
                    { id: "none", label: "Не треба" },
                  ] as { id: ReminderPreset; label: string }[]
                ).map((p) => {
                  const active = reminder === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setReminder(p.id)}
                      className="rounded-full px-2.5 py-1 text-[11px] font-semibold transition"
                      style={{
                        backgroundColor: active
                          ? T.accentPrimarySoft
                          : T.panelElevated,
                        color: active ? T.accentPrimary : T.textMuted,
                        border: `1px solid ${active ? T.accentPrimary + "40" : T.borderSoft}`,
                      }}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </Field>

            {/* ── Assignee (single) ──
                ЛЮДЕЙ ОДНА ПОЗИЦІЯ. За дефолтом — «Ви» (автор=виконавець).
                Натиск «Змінити виконавця» → picker → інший User замінює мене.
                Тоді: Автор = я, Виконавець = він. */}
            <Field label="Виконавець">
              <div className="flex flex-col gap-2">
                {/* Поточний виконавець як один чип */}
                <div className="flex flex-wrap gap-1.5">
                  {assignToMe && !assignee && (
                    <Chip
                      label="Ви"
                      onRemove={() => {
                        // прибрати «Ви» не можна — мають бути або я, або інший.
                        // Просто залишаємо як є; для «нікого» юзер натискає
                        // «Змінити» і не обирає нікого (поки нема такого UI —
                        // лишаємо завжди когось).
                      }}
                      tone="primary"
                    />
                  )}
                  {assignee && assignee.kind === "user" && (
                    <Chip
                      label={assignee.name}
                      onRemove={clearAssignee}
                      tone="default"
                    />
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {/* User picker */}
                  <div className="relative" ref={userPickerRef}>
                    <button
                      type="button"
                      onClick={() => setUserPickerOpen((v) => !v)}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"
                      style={{
                        backgroundColor: T.panelElevated,
                        color: T.textPrimary,
                        border: `1px solid ${T.borderSoft}`,
                      }}
                    >
                      <Plus size={12} /> Змінити виконавця
                    </button>
                    {userPickerOpen && (
                      <div
                        className="absolute z-10 mt-1 w-80 rounded-lg p-2 shadow-lg flex flex-col gap-1"
                        style={{
                          backgroundColor: T.panel,
                          border: `1px solid ${T.borderStrong}`,
                        }}
                      >
                        <div
                          className="flex items-center gap-2 rounded-md px-2 py-1.5"
                          style={{
                            backgroundColor: T.panelElevated,
                            border: `1px solid ${T.borderSoft}`,
                          }}
                        >
                          <Search size={12} style={{ color: T.textMuted }} />
                          <input
                            value={userSearch}
                            onChange={(e) => setUserSearch(e.target.value)}
                            placeholder="Пошук по імʼю / прізвищу…"
                            className="flex-1 bg-transparent text-xs outline-none"
                            style={{ color: T.textPrimary }}
                            autoFocus
                          />
                        </div>
                        <div className="max-h-72 overflow-y-auto flex flex-col gap-0.5">
                          {filteredCandidates.length === 0 ? (
                            <div
                              className="px-2 py-3 text-center text-[11px]"
                              style={{ color: T.textMuted }}
                            >
                              Не знайдено
                            </div>
                          ) : (
                            // Усі кандидати: і User'и, і Employees без акаунту
                            // (вибір employee створює external-assignee — у
                            // нотифікації йому не пушаться, але задача показує
                            // ПІБ як виконавця).
                            filteredCandidates.map((c) => {
                                const isCurrent =
                                  c.kind === "user"
                                    ? c.id === currentUserId
                                      ? assignToMe
                                      : assignee?.kind === "user" && assignee.userId === c.id
                                    : assignee?.kind === "external" && assignee.name === c.name;
                                const onClick =
                                  c.kind === "user"
                                    ? () => setUserAssignee(c.id, c.name)
                                    : () => {
                                        setAssignToMe(false);
                                        setAssignee({ kind: "external", name: c.name });
                                      };
                                return (
                                  <button
                                    key={`${c.kind}:${c.id}`}
                                    type="button"
                                    onClick={onClick}
                                    className="flex items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:brightness-95"
                                    style={{ color: T.textPrimary }}
                                  >
                                    <span className="flex flex-col leading-tight">
                                      <span className="flex items-center gap-1.5">
                                        {c.name}
                                        {c.kind === "user" && c.id === currentUserId && (
                                          <span style={{ color: T.textMuted }}>(ви)</span>
                                        )}
                                        {c.kind === "employee" && (
                                          <span
                                            className="rounded px-1 text-[9px] font-bold uppercase"
                                            style={{
                                              backgroundColor: T.panelElevated,
                                              color: T.textMuted,
                                              border: `1px solid ${T.borderSoft}`,
                                            }}
                                            title="Співробітник без акаунту — нотифікація не піде"
                                          >
                                            без акаунту
                                          </span>
                                        )}
                                      </span>
                                      {c.subtitle && (
                                        <span
                                          className="text-[10px]"
                                          style={{ color: T.textMuted }}
                                        >
                                          {c.subtitle}
                                        </span>
                                      )}
                                    </span>
                                    {isCurrent && (
                                      <Check size={12} style={{ color: T.success }} />
                                    )}
                                  </button>
                                );
                              })
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                </div>
                {!assignToMe && (
                  <button
                    type="button"
                    onClick={clearAssignee}
                    className="text-[11px] underline self-start"
                    style={{ color: T.textMuted }}
                  >
                    Призначити мені
                  </button>
                )}
              </div>
            </Field>

            {/* ── Advanced (collapsible) ── */}
            <div
              className="rounded-lg overflow-hidden"
              style={{ border: `1px solid ${T.borderSoft}` }}
            >
              <button
                type="button"
                onClick={() => setAdvancedOpen((v) => !v)}
                className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold"
                style={{
                  backgroundColor: T.panelElevated,
                  color: T.textSecondary,
                }}
              >
                <span>Додатково (проєкт, пріоритет, AI-ТЗ)</span>
                {advancedOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {advancedOpen && (
                <div className="p-3 flex flex-col gap-3">
                  {/* Project */}
                  <Field label="Проєкт">
                    <select
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                      className="rounded-lg px-3 py-2 text-sm outline-none"
                      style={inputStyle}
                      disabled={loadingProjects}
                    >
                      <option value="">— Без проєкту (Особисті задачі)</option>
                      {projects.some((p) => p.isInternal) && (
                        <optgroup label="Внутрішні">
                          {projects
                            .filter((p) => p.isInternal)
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.title}
                              </option>
                            ))}
                        </optgroup>
                      )}
                      {projects.some((p) => !p.isInternal) && (
                        <optgroup label="Проєкти">
                          {projects
                            .filter((p) => !p.isInternal)
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.title}
                              </option>
                            ))}
                        </optgroup>
                      )}
                    </select>
                  </Field>

                  {/* Stage — only for explicit non-internal project */}
                  {selectedProject && !selectedProject.isInternal && (
                    <Field label="Стадія">
                      <select
                        value={stageId}
                        onChange={(e) => setStageId(e.target.value)}
                        className="rounded-lg px-3 py-2 text-sm outline-none"
                        style={inputStyle}
                      >
                        {flattenStageTree(selectedProject.stages).map(
                          ({ node, depth }) => {
                            const label = stageDisplayName({
                              stage: node.stage,
                              customName: node.customName,
                            });
                            const indent = "    ".repeat(depth);
                            const prefix = depth > 0 ? "↳ " : "";
                            return (
                              <option key={node.id} value={node.id}>
                                {`${indent}${prefix}${label}`}
                              </option>
                            );
                          },
                        )}
                      </select>
                    </Field>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Пріоритет">
                      <select
                        value={priority}
                        onChange={(e) =>
                          setPriority(e.target.value as TaskPriority)
                        }
                        className="rounded-lg px-3 py-2 text-sm outline-none"
                        style={inputStyle}
                      >
                        {(["LOW", "NORMAL", "HIGH", "URGENT"] as TaskPriority[]).map(
                          (p) => (
                            <option key={p} value={p}>
                              {PRIORITY_LABELS[p]}
                            </option>
                          ),
                        )}
                      </select>
                    </Field>
                    <Field label="Оцінка, год">
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={estimatedHours}
                        onChange={(e) => setEstimatedHours(e.target.value)}
                        placeholder="—"
                        className="rounded-lg px-3 py-2 text-sm outline-none"
                        style={inputStyle}
                      />
                    </Field>
                  </div>

                  {/* AI generation */}
                  <button
                    type="button"
                    onClick={() => void generateSpec()}
                    disabled={!canGenerateSpec}
                    className="flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-40"
                    style={{
                      background: "linear-gradient(135deg,#7C3AED,#2563EB)",
                      color: "#fff",
                    }}
                  >
                    {generatingSpec ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Sparkles size={14} />
                    )}
                    {generatingSpec
                      ? "AI формує ТЗ…"
                      : hasSpec
                        ? "Переписати ТЗ з AI"
                        : "Згенерувати ТЗ з AI"}
                  </button>
                  {aiError && (
                    <div
                      className="rounded-md px-2 py-1 text-[11px]"
                      style={{ backgroundColor: "#ef444422", color: "#ef4444" }}
                    >
                      {aiError}
                    </div>
                  )}

                  {specJson && (
                    <div className="flex flex-wrap gap-2">
                      {specJson.suggestedPriority !== priority && (
                        <SuggestionChip
                          label={`AI: пріоритет ${PRIORITY_LABELS[specJson.suggestedPriority]}`}
                          applied={appliedPriority}
                          onApply={applySpecPriority}
                        />
                      )}
                      {specJson.suggestedDueDate &&
                        specJson.suggestedDueDate !== dueDate && (
                          <SuggestionChip
                            label={`AI: дедлайн ${formatDueChip(specJson.suggestedDueDate)}`}
                            applied={appliedDueDate}
                            onApply={applySpecDue}
                          />
                        )}
                      {specJson.suggestedEstimatedHours &&
                        String(specJson.suggestedEstimatedHours) !==
                          estimatedHours && (
                          <SuggestionChip
                            label={`AI: оцінка ${specJson.suggestedEstimatedHours} год`}
                            applied={appliedHours}
                            onApply={applySpecHours}
                          />
                        )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {error && (
              <div
                className="rounded-lg px-3 py-2 text-xs"
                style={{ backgroundColor: "#ef444422", color: "#ef4444" }}
              >
                {error}
              </div>
            )}

            <div className="flex gap-2 justify-end pt-1">
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
                disabled={saving || !formValid}
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
          </div>

          {/* AI spec details (right column when generated) */}
          {hasSpec && specJson && (
            <div
              className="flex flex-col gap-3 min-w-0 rounded-xl p-4"
              style={{
                backgroundColor: T.panelSoft ?? T.panelElevated,
                border: `1px solid ${T.borderSoft}`,
              }}
            >
              <div className="flex items-center gap-2">
                <Sparkles
                  size={14}
                  style={{ color: T.accentSecondary ?? T.accentPrimary }}
                />
                <h3
                  className="text-xs font-bold uppercase tracking-wider"
                  style={{ color: T.textSecondary }}
                >
                  AI-деталізація
                </h3>
              </div>

              {specJson.checklist.length > 0 && (
                <div className="flex flex-col gap-2">
                  <label
                    className="flex items-center gap-2 text-xs font-semibold"
                    style={{ color: T.textPrimary }}
                  >
                    <input
                      type="checkbox"
                      checked={applyChecklist}
                      onChange={(e) => setApplyChecklist(e.target.checked)}
                    />
                    Додати чекліст ({checklistSelected.size} з{" "}
                    {specJson.checklist.length})
                  </label>
                  <ul className="flex flex-col gap-1 pl-1">
                    {specJson.checklist.map((item, i) => (
                      <li key={i}>
                        <label
                          className="flex items-start gap-2 text-xs cursor-pointer"
                          style={{ color: T.textSecondary }}
                        >
                          <input
                            type="checkbox"
                            disabled={!applyChecklist}
                            checked={checklistSelected.has(i)}
                            onChange={(e) => {
                              const next = new Set(checklistSelected);
                              if (e.target.checked) next.add(i);
                              else next.delete(i);
                              setChecklistSelected(next);
                            }}
                            className="mt-0.5"
                          />
                          <span>{item}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {specJson.risks.length > 0 && (
                <SpecList heading="Ризики" items={specJson.risks} />
              )}
              {specJson.involvedRoles.length > 0 && (
                <SpecList heading="Залучені ролі" items={specJson.involvedRoles} />
              )}
              {specJson.clarifications.length > 0 && (
                <SpecList
                  heading="Варто уточнити"
                  items={specJson.clarifications}
                  tone="warn"
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-components ─── */

function RequiredField({
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
        style={{ color: T.textSecondary }}
      >
        {label}
        <span style={{ color: T.danger }}> *</span>
      </span>
      {children}
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

function Chip({
  label,
  onRemove,
  tone,
}: {
  label: string;
  onRemove: () => void;
  tone: "default" | "primary" | "external";
}) {
  const style: React.CSSProperties =
    tone === "primary"
      ? { backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }
      : tone === "external"
        ? {
            backgroundColor: T.panelElevated,
            color: T.textSecondary,
            border: `1px dashed ${T.borderStrong}`,
          }
        : {
            backgroundColor: T.panelElevated,
            color: T.textPrimary,
            border: `1px solid ${T.borderSoft}`,
          };
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
      style={style}
    >
      {tone === "external" && <UserPlus size={10} />}
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="opacity-60 hover:opacity-100"
        aria-label="Видалити"
      >
        <X size={11} />
      </button>
    </span>
  );
}

function SuggestionChip({
  label,
  applied,
  onApply,
}: {
  label: string;
  applied: boolean;
  onApply: () => void;
}) {
  return (
    <button
      type="button"
      onClick={applied ? undefined : onApply}
      className="flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold"
      style={{
        backgroundColor: applied ? "#22c55e33" : T.panelElevated,
        color: applied ? "#22c55e" : T.accentPrimary,
        border: `1px solid ${applied ? "#22c55e66" : T.borderSoft}`,
      }}
    >
      {applied ? <Check size={11} /> : <Sparkles size={11} />}
      {label}
      {!applied && <span style={{ color: T.textMuted, marginLeft: 4 }}>застосувати</span>}
    </button>
  );
}

function SpecList({
  heading,
  items,
  tone,
}: {
  heading: string;
  items: string[];
  tone?: "warn";
}) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className="text-[10px] font-bold uppercase tracking-wider"
        style={{ color: tone === "warn" ? "#f59e0b" : T.textMuted }}
      >
        {heading}
      </span>
      <ul className="flex flex-col gap-0.5 pl-4 list-disc">
        {items.map((item, i) => (
          <li key={i} className="text-xs" style={{ color: T.textSecondary }}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatDueChip(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" });
}
