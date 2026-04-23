"use client";

import { useEffect, useState } from "react";
import { Plus, X, Loader2, Sparkles, Eye, Pencil, Check } from "lucide-react";
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

/**
 * Flatten a tree of stages (parent → children) into an array with depth
 * so the dropdown can render hierarchical indentation.
 */
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
  const [priority, setPriority] = useState<TaskPriority>("NORMAL");
  const [dueDate, setDueDate] = useState("");
  const [estimatedHours, setEstimatedHours] = useState("");
  const [assignToMe, setAssignToMe] = useState(true);
  const [assigneeId, setAssigneeId] = useState("");
  const [teamUsers, setTeamUsers] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI state
  const [generatingSpec, setGeneratingSpec] = useState(false);
  const [specJson, setSpecJson] = useState<AiSpec | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [descMode, setDescMode] = useState<"edit" | "preview">("edit");
  const [applyChecklist, setApplyChecklist] = useState(true);
  const [checklistSelected, setChecklistSelected] = useState<Set<number>>(new Set());

  // Suggestions already applied (so chip shows "applied" state)
  const [appliedPriority, setAppliedPriority] = useState(false);
  const [appliedDueDate, setAppliedDueDate] = useState(false);
  const [appliedHours, setAppliedHours] = useState(false);

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
            const topLevelCurrent = first.stages.find(
              (s) => !s.parentStageId && s.stage === first.currentStage,
            );
            const firstTopLevel = first.stages.find((s) => !s.parentStageId);
            const fallback = topLevelCurrent ?? firstTopLevel ?? first.stages[0];
            if (fallback) setStageId(fallback.id);
          }
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

  useEffect(() => {
    if (!selectedProject) return;
    const topLevelCurrent = selectedProject.stages.find(
      (s) => !s.parentStageId && s.stage === selectedProject.currentStage,
    );
    const firstTopLevel = selectedProject.stages.find((s) => !s.parentStageId);
    const fallback = topLevelCurrent ?? firstTopLevel ?? selectedProject.stages[0];
    if (fallback) setStageId(fallback.id);
  }, [selectedProject]);

  const canGenerate = title.trim().length >= 4 && !generatingSpec;

  const generateSpec = async () => {
    if (!canGenerate) return;
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

  const applyPriority = () => {
    if (!specJson) return;
    setPriority(specJson.suggestedPriority);
    setAppliedPriority(true);
  };
  const applyDue = () => {
    if (!specJson?.suggestedDueDate) return;
    setDueDate(specJson.suggestedDueDate);
    setAppliedDueDate(true);
  };
  const applyHours = () => {
    if (!specJson?.suggestedEstimatedHours) return;
    setEstimatedHours(String(specJson.suggestedEstimatedHours));
    setAppliedHours(true);
  };

  const submit = async () => {
    if (!projectId || !stageId || !title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const ids = new Set<string>();
      if (assignToMe && currentUserId) ids.add(currentUserId);
      if (assigneeId) ids.add(assigneeId);
      const assigneeIds = [...ids];

      const checklist =
        applyChecklist && specJson
          ? specJson.checklist.filter((_, i) => checklistSelected.has(i))
          : undefined;

      const res = await fetch(`/api/admin/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          stageId,
          priority,
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
          estimatedHours: estimatedHours ? Number(estimatedHours) : undefined,
          assigneeIds: assigneeIds.length > 0 ? assigneeIds : undefined,
          checklist: checklist && checklist.length > 0 ? checklist : undefined,
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

  const hasSpec = !!specJson;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full mt-6 rounded-2xl p-5 flex flex-col gap-4 ${hasSpec ? "max-w-5xl" : "max-w-2xl"}`}
        style={{
          backgroundColor: T.panel,
          border: `1px solid ${T.borderStrong}`,
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold" style={{ color: T.textPrimary }}>
            Нова задача
          </h2>
          <button onClick={onClose} style={{ color: T.textMuted }} aria-label="Закрити">
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
          <div className={`grid gap-4 ${hasSpec ? "md:grid-cols-2" : "grid-cols-1"}`}>
            {/* ---------- Left column: form ---------- */}
            <div className="flex flex-col gap-4 min-w-0">
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
                <Field label="СТАДІЯ / ПІДЕТАП">
                  <select
                    value={stageId}
                    onChange={(e) => setStageId(e.target.value)}
                    className="rounded-lg px-3 py-2 text-sm outline-none"
                    style={inputStyle}
                  >
                    {flattenStageTree(selectedProject.stages).map(({ node, depth }) => {
                      const label = stageDisplayName({
                        stage: node.stage,
                        customName: node.customName,
                      });
                      const indent = "    ".repeat(depth);
                      const prefix = depth > 0 ? "↳ " : "";
                      return (
                        <option key={node.id} value={node.id}>
                          {`${indent}${prefix}${label}`}
                        </option>
                      );
                    })}
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

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: T.textMuted }}
                  >
                    ОПИС / ТЕХНІЧНЕ ЗАВДАННЯ
                  </span>
                  <div className="flex gap-1">
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
                      <Pencil size={10} /> Редагувати
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
                    rows={hasSpec ? 12 : 6}
                    placeholder="Напишіть короткий опис або натисніть «Згенерувати ТЗ з AI»…"
                    className="rounded-lg px-3 py-2 text-sm outline-none font-mono"
                    style={{ ...inputStyle, minHeight: hasSpec ? 280 : 140 }}
                  />
                ) : (
                  <div
                    className="rounded-lg px-3 py-2 text-sm overflow-y-auto prose prose-invert prose-sm max-w-none"
                    style={{
                      ...inputStyle,
                      minHeight: hasSpec ? 280 : 140,
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

                <button
                  type="button"
                  onClick={() => void generateSpec()}
                  disabled={!canGenerate}
                  className="mt-2 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-40"
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
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="ПРІОРИТЕТ">
                  <select
                    value={priority}
                    onChange={(e) =>
                      setPriority(e.target.value as TaskPriority)
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

              <Field label="ОЦІНКА, ГОД (необовʼязково)">
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

              {specJson && (
                <div className="flex flex-wrap gap-2">
                  {specJson.suggestedPriority !== priority && (
                    <SuggestionChip
                      label={`AI: пріоритет ${PRIORITY_LABELS[specJson.suggestedPriority]}`}
                      applied={appliedPriority}
                      onApply={applyPriority}
                    />
                  )}
                  {specJson.suggestedDueDate && specJson.suggestedDueDate !== dueDate && (
                    <SuggestionChip
                      label={`AI: дедлайн ${formatDue(specJson.suggestedDueDate)}`}
                      applied={appliedDueDate}
                      onApply={applyDue}
                    />
                  )}
                  {specJson.suggestedEstimatedHours &&
                    String(specJson.suggestedEstimatedHours) !== estimatedHours && (
                      <SuggestionChip
                        label={`AI: оцінка ${specJson.suggestedEstimatedHours} год`}
                        applied={appliedHours}
                        onApply={applyHours}
                      />
                    )}
                </div>
              )}

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
            </div>

            {/* ---------- Right column: AI spec details ---------- */}
            {hasSpec && specJson && (
              <div
                className="flex flex-col gap-3 min-w-0 rounded-xl p-4"
                style={{
                  backgroundColor: T.panelSoft ?? T.panelElevated,
                  border: `1px solid ${T.borderSoft}`,
                }}
              >
                <div className="flex items-center gap-2">
                  <Sparkles size={14} style={{ color: T.accentSecondary ?? T.accentPrimary }} />
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

function formatDue(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" });
}
