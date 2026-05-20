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
  const [dueDate, setDueDate] = useState("");

  // ── Assignees ──
  const [assignees, setAssignees] = useState<AssigneeChip[]>([]);
  const [assignToMe, setAssignToMe] = useState(true);
  const [teamUsers, setTeamUsers] = useState<{ id: string; name: string }[]>([]);
  const [userPickerOpen, setUserPickerOpen] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [externalInput, setExternalInput] = useState("");
  const [showExternalInput, setShowExternalInput] = useState(false);

  // ── Advanced (collapsed by default) ──
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [projects, setProjects] = useState<MyProject[]>([]);
  const [projectId, setProjectId] = useState(""); // "" → Personal Inbox
  const [stageId, setStageId] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("NORMAL");
  const [estimatedHours, setEstimatedHours] = useState("");

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
        const [projRes, usersRes] = await Promise.all([
          fetch("/api/admin/me/projects"),
          fetch("/api/admin/users?role=SUPER_ADMIN,MANAGER,ENGINEER,FINANCIER"),
        ]);
        if (projRes.ok) {
          const j = await projRes.json();
          setProjects((j.data ?? []) as MyProject[]);
        }
        if (usersRes.ok) {
          const j = await usersRes.json();
          setTeamUsers(
            (j.data ?? [])
              .filter((u: any) => u.isActive)
              .map((u: any) => ({ id: u.id, name: u.name })),
          );
        }
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
  const formValid =
    title.trim().length > 0 &&
    description.trim().length > 0 &&
    dueDate.length > 0;

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
    setDueDate(specJson.suggestedDueDate);
    setAppliedDueDate(true);
  };
  const applySpecHours = () => {
    if (!specJson?.suggestedEstimatedHours) return;
    setEstimatedHours(String(specJson.suggestedEstimatedHours));
    setAppliedHours(true);
  };

  const addUserAssignee = (userId: string, name: string) => {
    setAssignees((prev) =>
      prev.some((a) => a.kind === "user" && a.userId === userId)
        ? prev
        : [...prev, { kind: "user", userId, name }],
    );
    setUserPickerOpen(false);
    setUserSearch("");
  };

  const addExternalAssignee = () => {
    const name = externalInput.trim();
    if (!name) return;
    setAssignees((prev) =>
      prev.some(
        (a) => a.kind === "external" && a.name.toLowerCase() === name.toLowerCase(),
      )
        ? prev
        : [...prev, { kind: "external", name: name.slice(0, 100) }],
    );
    setExternalInput("");
    setShowExternalInput(false);
  };

  const removeAssignee = (idx: number) => {
    setAssignees((prev) => prev.filter((_, i) => i !== idx));
  };

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    const list = teamUsers.filter((u) => !q || u.name.toLowerCase().includes(q));
    return list.slice(0, 50);
  }, [teamUsers, userSearch]);

  const submit = async () => {
    if (!formValid) return;
    setSaving(true);
    setError(null);
    try {
      // Build assignees payload.
      const payload: Array<{ userId?: string; externalName?: string }> = [];
      const seenUserIds = new Set<string>();
      if (assignToMe) {
        payload.push({ userId: currentUserId });
        seenUserIds.add(currentUserId);
      }
      for (const a of assignees) {
        if (a.kind === "user") {
          if (seenUserIds.has(a.userId)) continue;
          seenUserIds.add(a.userId);
          payload.push({ userId: a.userId });
        } else {
          payload.push({ externalName: a.name });
        }
      }

      const checklist =
        applyChecklist && specJson
          ? specJson.checklist.filter((_, i) => checklistSelected.has(i))
          : undefined;

      const body: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim(),
        dueDate: new Date(dueDate).toISOString(),
        priority,
        estimatedHours: estimatedHours ? Number(estimatedHours) : undefined,
        assignees: payload.length > 0 ? payload : undefined,
        checklist: checklist && checklist.length > 0 ? checklist : undefined,
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
  const modalWidth = hasSpec ? "max-w-5xl" : "max-w-lg";

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

            {/* ── Description (required) ── */}
            <RequiredField label="Короткий опис">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-end gap-1">
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
                {descMode === "edit" ? (
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={hasSpec ? 12 : 3}
                    placeholder="Що саме треба зробити?"
                    className="rounded-lg px-3 py-2 text-sm outline-none font-mono"
                    style={{ ...inputStyle, minHeight: hasSpec ? 280 : 90 }}
                  />
                ) : (
                  <div
                    className="rounded-lg px-3 py-2 text-sm overflow-y-auto prose prose-invert prose-sm max-w-none"
                    style={{
                      ...inputStyle,
                      minHeight: hasSpec ? 280 : 90,
                      maxHeight: 400,
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
            </RequiredField>

            {/* ── Due date (required) ── */}
            <RequiredField label="Дедлайн">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="rounded-lg px-3 py-2.5 text-sm outline-none h-11"
                style={inputStyle}
              />
            </RequiredField>

            {/* ── Assignees (optional) ── */}
            <Field label="Виконавець (необовʼязково)">
              <div className="flex flex-col gap-2">
                {/* Existing chips */}
                {(assignees.length > 0 || assignToMe) && (
                  <div className="flex flex-wrap gap-1.5">
                    {assignToMe && (
                      <Chip
                        label={`Ви`}
                        onRemove={() => setAssignToMe(false)}
                        tone="primary"
                      />
                    )}
                    {assignees.map((a, i) => (
                      <Chip
                        key={`${a.kind}-${i}-${a.name}`}
                        label={a.name}
                        onRemove={() => removeAssignee(i)}
                        tone={a.kind === "external" ? "external" : "default"}
                      />
                    ))}
                  </div>
                )}
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
                      <Plus size={12} /> Додати користувача
                    </button>
                    {userPickerOpen && (
                      <div
                        className="absolute z-10 mt-1 w-72 rounded-lg p-2 shadow-lg flex flex-col gap-1"
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
                            placeholder="Пошук…"
                            className="flex-1 bg-transparent text-xs outline-none"
                            style={{ color: T.textPrimary }}
                            autoFocus
                          />
                        </div>
                        <div className="max-h-60 overflow-y-auto flex flex-col gap-0.5">
                          {filteredUsers.length === 0 ? (
                            <div
                              className="px-2 py-3 text-center text-[11px]"
                              style={{ color: T.textMuted }}
                            >
                              Не знайдено
                            </div>
                          ) : (
                            filteredUsers.map((u) => {
                              const already =
                                (u.id === currentUserId && assignToMe) ||
                                assignees.some(
                                  (a) => a.kind === "user" && a.userId === u.id,
                                );
                              return (
                                <button
                                  key={u.id}
                                  type="button"
                                  disabled={already}
                                  onClick={() => addUserAssignee(u.id, u.name)}
                                  className="flex items-center justify-between rounded-md px-2 py-1.5 text-left text-xs disabled:opacity-40 hover:brightness-95"
                                  style={{ color: T.textPrimary }}
                                >
                                  <span>
                                    {u.name}
                                    {u.id === currentUserId && (
                                      <span style={{ color: T.textMuted }}>
                                        {" "}
                                        (ви)
                                      </span>
                                    )}
                                  </span>
                                  {already && (
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

                  {/* External assignee */}
                  {showExternalInput ? (
                    <div
                      className="flex items-center gap-1 rounded-lg px-2 py-1"
                      style={{
                        backgroundColor: T.panelElevated,
                        border: `1px dashed ${T.borderStrong}`,
                      }}
                    >
                      <UserPlus size={12} style={{ color: T.textMuted }} />
                      <input
                        value={externalInput}
                        onChange={(e) => setExternalInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addExternalAssignee();
                          }
                          if (e.key === "Escape") {
                            setExternalInput("");
                            setShowExternalInput(false);
                          }
                        }}
                        placeholder="напр. «Юрій Федишин»"
                        className="bg-transparent text-xs outline-none w-44"
                        style={{ color: T.textPrimary }}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={addExternalAssignee}
                        className="rounded-md px-2 py-1 text-[10px] font-bold"
                        style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
                      >
                        ОК
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowExternalInput(true)}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"
                      style={{
                        backgroundColor: T.panelElevated,
                        color: T.textSecondary,
                        border: `1px dashed ${T.borderStrong}`,
                      }}
                      title="Додати людину, яка не є користувачем CRM"
                    >
                      <UserPlus size={12} /> Додати зовнішнього
                    </button>
                  )}
                </div>
                {!assignToMe && (
                  <label
                    className="flex items-center gap-2 text-[11px]"
                    style={{ color: T.textMuted }}
                  >
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={() => setAssignToMe(true)}
                    />
                    Призначити мені
                  </label>
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
