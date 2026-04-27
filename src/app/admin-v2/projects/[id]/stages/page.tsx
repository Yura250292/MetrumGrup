"use client";

import { useState, useEffect, use, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  Check,
  Clock,
  Circle,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Plus,
  Trash2,
  EyeOff,
  Eye,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { STAGE_ORDER, stageDisplayName } from "@/lib/constants";
import type { ProjectStage } from "@prisma/client";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

const MAX_DEPTH = 2; // 0-indexed

type StageData = {
  id?: string;
  clientKey: string;
  stage: ProjectStage | null;
  customName: string;
  isHidden: boolean;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  progress: number;
  notes: string;
  startDate: string;
  endDate: string;
  responsibleUserId: string | null;
  allocatedBudget: number | null;
  children: StageData[];
};

type FlatStageDTO = {
  id: string;
  stage: ProjectStage | null;
  customName: string | null;
  isHidden: boolean;
  status: StageData["status"];
  progress: number;
  notes: string | null;
  startDate: string | null;
  endDate: string | null;
  parentStageId: string | null;
  responsibleUserId: string | null;
  allocatedBudget: string | number | null;
  sortOrder: number;
};

type Candidate = { id: string; name: string };

const STATUS_COLORS: Record<
  StageData["status"],
  { bg: string; fg: string; icon: typeof Check }
> = {
  COMPLETED: { bg: T.successSoft, fg: T.success, icon: Check },
  IN_PROGRESS: { bg: T.accentPrimarySoft, fg: T.accentPrimary, icon: Clock },
  PENDING: { bg: T.panelElevated, fg: T.textMuted, icon: Circle },
};

const STATUS_LABELS: Record<StageData["status"], string> = {
  PENDING: "Очікує",
  IN_PROGRESS: "В процесі",
  COMPLETED: "Завершено",
};

function genKey() {
  return `new-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function buildTree(flat: FlatStageDTO[]): StageData[] {
  const byId = new Map<string, StageData>();
  const roots: StageData[] = [];

  // Сортуємо за sortOrder щоб зберегти порядок серед siblings
  const sorted = [...flat].sort((a, b) => a.sortOrder - b.sortOrder);

  for (const f of sorted) {
    byId.set(f.id, {
      id: f.id,
      clientKey: f.id,
      stage: f.stage,
      customName: f.customName ?? "",
      isHidden: f.isHidden,
      status: f.status,
      progress: f.progress,
      notes: f.notes ?? "",
      startDate: f.startDate ? String(f.startDate).split("T")[0] : "",
      endDate: f.endDate ? String(f.endDate).split("T")[0] : "",
      responsibleUserId: f.responsibleUserId,
      allocatedBudget:
        f.allocatedBudget === null || f.allocatedBudget === undefined
          ? null
          : Number(f.allocatedBudget),
      children: [],
    });
  }

  for (const f of sorted) {
    const node = byId.get(f.id)!;
    if (f.parentStageId && byId.has(f.parentStageId)) {
      byId.get(f.parentStageId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function defaultStages(): StageData[] {
  return STAGE_ORDER.map((stage) => ({
    clientKey: genKey(),
    stage,
    customName: "",
    isHidden: false,
    status: "PENDING" as const,
    progress: 0,
    notes: "",
    startDate: "",
    endDate: "",
    responsibleUserId: null,
    allocatedBudget: null,
    children: [],
  }));
}

function updateAtPath(
  tree: StageData[],
  path: number[],
  updater: (node: StageData) => StageData,
): StageData[] {
  if (path.length === 0) return tree;
  const [head, ...rest] = path;
  return tree.map((node, i) => {
    if (i !== head) return node;
    if (rest.length === 0) return updater(node);
    return { ...node, children: updateAtPath(node.children, rest, updater) };
  });
}

function modifySiblings(
  tree: StageData[],
  parentPath: number[],
  mutator: (siblings: StageData[]) => StageData[],
): StageData[] {
  if (parentPath.length === 0) return mutator(tree);
  const [head, ...rest] = parentPath;
  return tree.map((node, i) => {
    if (i !== head) return node;
    return { ...node, children: modifySiblings(node.children, rest, mutator) };
  });
}

export default function AdminV2ProjectStagesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [stages, setStages] = useState<StageData[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [projectTitle, setProjectTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/projects/${id}`)
      .then((r) => r.json())
      .then(({ data, responsibleCandidates }) => {
        setProjectTitle(data.title);
        setCandidates(responsibleCandidates ?? []);
        if (data.stages?.length > 0) {
          setStages(buildTree(data.stages as FlatStageDTO[]));
        } else {
          setStages(defaultStages());
        }
      })
      .catch(() => setError("Не вдалось завантажити проєкт"))
      .finally(() => setLoading(false));
  }, [id]);

  function updateNode(path: number[], updates: Partial<StageData>) {
    setStages((prev) =>
      updateAtPath(prev, path, (node) => {
        const next = { ...node, ...updates };
        if (updates.status === "COMPLETED") next.progress = 100;
        else if (updates.status === "PENDING") next.progress = 0;
        return next;
      }),
    );
  }

  function moveSibling(path: number[], direction: -1 | 1) {
    if (path.length === 0) return;
    const parentPath = path.slice(0, -1);
    const idx = path[path.length - 1];
    setStages((prev) =>
      modifySiblings(prev, parentPath, (siblings) => {
        const next = [...siblings];
        const target = idx + direction;
        if (target < 0 || target >= next.length) return siblings;
        [next[idx], next[target]] = [next[target], next[idx]];
        return next;
      }),
    );
  }

  function addChildAt(parentPath: number[]) {
    setStages((prev) =>
      modifySiblings(prev, parentPath, (siblings) => [
        ...siblings,
        {
          clientKey: genKey(),
          stage: null,
          customName: "Новий підетап",
          isHidden: false,
          status: "PENDING",
          progress: 0,
          notes: "",
          startDate: "",
          endDate: "",
          responsibleUserId: null,
          allocatedBudget: null,
          children: [],
        },
      ]),
    );
  }

  function addRoot() {
    setStages((prev) => [
      ...prev,
      {
        clientKey: genKey(),
        stage: null,
        customName: "Новий етап",
        isHidden: false,
        status: "PENDING",
        progress: 0,
        notes: "",
        startDate: "",
        endDate: "",
        responsibleUserId: null,
        allocatedBudget: null,
        children: [],
      },
    ]);
  }

  function removeAtPath(path: number[]) {
    if (path.length === 0) return;
    const parentPath = path.slice(0, -1);
    const idx = path[path.length - 1];
    const node = getAtPath(stages, path);
    const label = node ? displayLabel(node) || "цей етап" : "цей етап";
    const hasChildren = node?.children.length ?? 0;
    const confirmMsg = hasChildren
      ? `Видалити "${label}" разом з ${hasChildren} вкладеними підетапами?\n\nЯкщо у піддереві є задачі — все буде приховано, а не видалено.`
      : `Видалити "${label}"?\n\nЯкщо до нього прив'язані задачі — етап буде прихований, а не видалений.`;
    if (!confirm(confirmMsg)) return;
    setStages((prev) =>
      modifySiblings(prev, parentPath, (siblings) => siblings.filter((_, i) => i !== idx)),
    );
  }

  function toggleHiddenAt(path: number[]) {
    const node = getAtPath(stages, path);
    if (!node) return;
    updateNode(path, { isHidden: !node.isHidden });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const payload = serialize(stages);
      const res = await fetch(`/api/admin/projects/${id}/stages`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stages: payload }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || "Помилка збереження");
      }
      router.push(`/admin-v2/projects/${id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка збереження");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div
        className="flex items-center justify-center gap-2 rounded-2xl py-16 text-sm"
        style={{
          backgroundColor: T.panel,
          color: T.textMuted,
          border: `1px solid ${T.borderSoft}`,
        }}
      >
        <Loader2 size={16} className="animate-spin" /> Завантажуємо…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <Link
        href={`/admin-v2/projects/${id}`}
        className="inline-flex w-fit items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition hover:brightness-[0.97]"
        style={{ backgroundColor: T.panelElevated, color: T.textSecondary }}
      >
        <ArrowLeft size={14} /> {projectTitle || "Назад"}
      </Link>

      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span
            className="text-[11px] font-bold tracking-wider"
            style={{ color: T.textMuted }}
          >
            ЕТАПИ ВИКОНАННЯ
          </span>
          <h1
            className="text-3xl md:text-4xl font-bold tracking-tight"
            style={{ color: T.textPrimary }}
          >
            Управління етапами
          </h1>
          <p className="text-[15px]" style={{ color: T.textSecondary }}>
            До 3 рівнів вкладеності. Для кожного етапу — термін, відповідальний і бюджет.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
          style={{ backgroundColor: T.accentPrimary }}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? "Збереження…" : "Зберегти"}
        </button>
      </section>

      {error && (
        <div
          className="flex items-start gap-2.5 rounded-xl p-4"
          style={{
            backgroundColor: T.dangerSoft,
            color: T.danger,
            border: `1px solid ${T.danger}`,
          }}
        >
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span className="text-xs">{error}</span>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {stages.map((stage, i) => (
          <StageNode
            key={stage.clientKey}
            stage={stage}
            depth={0}
            path={[i]}
            siblingCount={stages.length}
            candidates={candidates}
            onUpdate={updateNode}
            onMove={moveSibling}
            onAddChild={addChildAt}
            onRemove={removeAtPath}
            onToggleHidden={toggleHiddenAt}
          />
        ))}

        <button
          onClick={addRoot}
          className="flex items-center justify-center gap-2 rounded-2xl py-4 text-sm font-semibold transition hover:brightness-[0.97]"
          style={{
            backgroundColor: T.panelSoft,
            color: T.accentPrimary,
            border: `1px dashed ${T.borderStrong}`,
          }}
        >
          <Plus size={15} /> Додати етап
        </button>
      </div>
    </div>
  );
}

function StageNode({
  stage,
  depth,
  path,
  siblingCount,
  candidates,
  onUpdate,
  onMove,
  onAddChild,
  onRemove,
  onToggleHidden,
}: {
  stage: StageData;
  depth: number;
  path: number[];
  siblingCount: number;
  candidates: Candidate[];
  onUpdate: (path: number[], updates: Partial<StageData>) => void;
  onMove: (path: number[], direction: -1 | 1) => void;
  onAddChild: (parentPath: number[]) => void;
  onRemove: (path: number[]) => void;
  onToggleHidden: (path: number[]) => void;
}) {
  const colors = STATUS_COLORS[stage.status];
  const Icon = colors.icon;
  const label = displayLabel(stage);
  const idx = path[path.length - 1];
  const [expanded, setExpanded] = useState(true);
  const canAddChild = depth < MAX_DEPTH;

  const childBudgetSum = useMemo(
    () =>
      stage.children.reduce(
        (sum, c) => sum + (c.allocatedBudget !== null ? c.allocatedBudget : 0),
        0,
      ),
    [stage.children],
  );
  const budgetOverflow =
    stage.allocatedBudget !== null && childBudgetSum > stage.allocatedBudget;

  return (
    <div
      className="flex flex-col gap-4 rounded-2xl p-5"
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${T.borderSoft}`,
        opacity: stage.isHidden ? 0.55 : 1,
        marginLeft: depth * 24,
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        {stage.children.length > 0 ? (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex h-6 w-6 items-center justify-center rounded"
            style={{ color: T.textMuted }}
            aria-label={expanded ? "Згорнути" : "Розгорнути"}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="w-6" />
        )}
        <div className="flex flex-col">
          <button
            onClick={() => onMove(path, -1)}
            disabled={idx === 0}
            className="flex h-5 w-5 items-center justify-center rounded disabled:opacity-30"
            style={{ color: T.textMuted }}
            aria-label="Перемістити вгору"
          >
            <ArrowUp size={12} />
          </button>
          <button
            onClick={() => onMove(path, 1)}
            disabled={idx === siblingCount - 1}
            className="flex h-5 w-5 items-center justify-center rounded disabled:opacity-30"
            style={{ color: T.textMuted }}
            aria-label="Перемістити вниз"
          >
            <ArrowDown size={12} />
          </button>
        </div>
        <div
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: colors.bg }}
        >
          <Icon size={18} style={{ color: colors.fg }} />
        </div>
        <input
          type="text"
          value={stage.customName}
          onChange={(e) => onUpdate(path, { customName: e.target.value })}
          placeholder={
            stage.stage
              ? stageDisplayName({ stage: stage.stage, customName: null })
              : depth === 0
                ? "Назва етапу"
                : "Назва підетапу"
          }
          className="flex-1 min-w-[160px] rounded-xl px-3 py-2 text-base font-bold outline-none"
          style={{
            backgroundColor: T.panelSoft,
            border: `1px solid ${T.borderStrong}`,
            color: T.textPrimary,
          }}
        />
        <select
          value={stage.status}
          onChange={(e) =>
            onUpdate(path, { status: e.target.value as StageData["status"] })
          }
          className="rounded-lg px-3 py-1.5 text-xs font-bold outline-none"
          style={{
            backgroundColor: colors.bg,
            color: colors.fg,
            border: `1px solid ${colors.fg}`,
          }}
        >
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={() => onToggleHidden(path)}
            className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition hover:brightness-[0.95]"
            style={{
              backgroundColor: T.panelSoft,
              color: stage.isHidden ? T.warning : T.textMuted,
              border: `1px solid ${T.borderStrong}`,
            }}
            title={stage.isHidden ? "Показати" : "Сховати"}
          >
            {stage.isHidden ? <Eye size={13} /> : <EyeOff size={13} />}
            <span className="hidden sm:inline">
              {stage.isHidden ? "Показати" : "Сховати"}
            </span>
          </button>
          <button
            onClick={() => onRemove(path)}
            className="flex h-8 w-8 items-center justify-center rounded-lg transition hover:brightness-[0.95]"
            style={{ backgroundColor: T.dangerSoft, color: T.danger }}
            title="Видалити"
            aria-label="Видалити етап"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {stage.stage && !stage.customName && (
        <div className="text-[11px]" style={{ color: T.textMuted }}>
          Стандартна назва: <strong>{label}</strong>
        </div>
      )}

      {stage.status === "IN_PROGRESS" && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span
              className="text-[11px] font-semibold tracking-wide"
              style={{ color: T.textMuted }}
            >
              ПРОГРЕС
            </span>
            <span
              className="text-[12px] font-bold"
              style={{ color: T.accentPrimary }}
            >
              {stage.progress}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={stage.progress}
            onChange={(e) =>
              onUpdate(path, { progress: parseInt(e.target.value) })
            }
            className="w-full"
            style={{ accentColor: T.accentPrimary }}
          />
          <div
            className="h-1.5 w-full overflow-hidden rounded-full"
            style={{ backgroundColor: T.panelSoft }}
          >
            <div
              className="h-full rounded-full progress-fill-grow"
              style={{
                width: `${stage.progress}%`,
                backgroundColor: T.accentPrimary,
                boxShadow: `0 0 8px ${T.accentPrimary}55`,
              }}
            />
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Початок">
          <input
            type="date"
            value={stage.startDate}
            onChange={(e) => onUpdate(path, { startDate: e.target.value })}
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{
              backgroundColor: T.panelSoft,
              border: `1px solid ${T.borderStrong}`,
              color: T.textPrimary,
              colorScheme: "dark",
            }}
          />
        </Field>
        <Field label="Завершення">
          <input
            type="date"
            value={stage.endDate}
            onChange={(e) => onUpdate(path, { endDate: e.target.value })}
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{
              backgroundColor: T.panelSoft,
              border: `1px solid ${T.borderStrong}`,
              color: T.textPrimary,
              colorScheme: "dark",
            }}
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Відповідальний">
          <select
            value={stage.responsibleUserId ?? ""}
            onChange={(e) =>
              onUpdate(path, { responsibleUserId: e.target.value || null })
            }
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{
              backgroundColor: T.panelSoft,
              border: `1px solid ${T.borderStrong}`,
              color: T.textPrimary,
            }}
          >
            <option value="">— Не призначено —</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Бюджет, ₴">
          <input
            type="number"
            min="0"
            step="0.01"
            value={stage.allocatedBudget ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              onUpdate(path, {
                allocatedBudget: v === "" ? null : Number(v),
              });
            }}
            placeholder="не задано"
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{
              backgroundColor: T.panelSoft,
              border: `1px solid ${T.borderStrong}`,
              color: T.textPrimary,
            }}
          />
        </Field>
      </div>

      {budgetOverflow && (
        <div
          className="flex items-start gap-2 rounded-lg px-3 py-2 text-[12px]"
          style={{
            backgroundColor: T.warningSoft,
            color: T.warning,
            border: `1px solid ${T.warning}`,
          }}
        >
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <span>
            Сума бюджетів підетапів ({formatMoney(childBudgetSum)}) перевищує бюджет етапу
            ({formatMoney(stage.allocatedBudget!)})
          </span>
        </div>
      )}

      <Field label="Примітки">
        <textarea
          value={stage.notes}
          onChange={(e) => onUpdate(path, { notes: e.target.value })}
          rows={2}
          placeholder="Деталі по етапу…"
          className="w-full resize-none rounded-xl px-3 py-2.5 text-sm outline-none"
          style={{
            backgroundColor: T.panelSoft,
            border: `1px solid ${T.borderStrong}`,
            color: T.textPrimary,
          }}
        />
      </Field>

      {expanded && stage.children.length > 0 && (
        <div className="flex flex-col gap-3">
          {stage.children.map((child, i) => (
            <StageNode
              key={child.clientKey}
              stage={child}
              depth={depth + 1}
              path={[...path, i]}
              siblingCount={stage.children.length}
              candidates={candidates}
              onUpdate={onUpdate}
              onMove={onMove}
              onAddChild={onAddChild}
              onRemove={onRemove}
              onToggleHidden={onToggleHidden}
            />
          ))}
        </div>
      )}

      {canAddChild && (
        <button
          onClick={() => onAddChild(path)}
          className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold transition hover:brightness-[0.97]"
          style={{
            backgroundColor: T.panelSoft,
            color: T.accentPrimary,
            border: `1px dashed ${T.borderStrong}`,
          }}
        >
          <Plus size={14} /> Додати підетап
        </button>
      )}
    </div>
  );
}

function getAtPath(tree: StageData[], path: number[]): StageData | null {
  let curr: StageData | undefined;
  let arr = tree;
  for (const idx of path) {
    curr = arr[idx];
    if (!curr) return null;
    arr = curr.children;
  }
  return curr ?? null;
}

function displayLabel(s: Pick<StageData, "stage" | "customName">) {
  return stageDisplayName({ stage: s.stage, customName: s.customName || null });
}

function formatMoney(n: number) {
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: "UAH",
    maximumFractionDigits: 0,
  }).format(n);
}

function serialize(nodes: StageData[]): unknown[] {
  return nodes.map((n) => ({
    id: n.id,
    clientKey: n.clientKey,
    stage: n.stage,
    customName: n.customName.trim() || null,
    isHidden: n.isHidden,
    status: n.status,
    progress: n.progress,
    notes: n.notes || null,
    startDate: n.startDate || null,
    endDate: n.endDate || null,
    responsibleUserId: n.responsibleUserId,
    allocatedBudget: n.allocatedBudget,
    children: n.children.length > 0 ? serialize(n.children) : undefined,
  }));
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span
        className="text-[10px] font-bold tracking-wider"
        style={{ color: T.textMuted }}
      >
        {label.toUpperCase()}
      </span>
      {children}
    </label>
  );
}
