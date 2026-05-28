"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Check,
  Clock,
  Circle,
  EyeOff,
  GripVertical,
  Plus,
  Trash2,
  Pencil,
  Flame,
  Hammer,
  Package,
} from "lucide-react";
import { stageDisplayName, STAGE_STATUS_LABELS } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { tryEvaluateFormula } from "@/lib/formulas/eval";
import type { ProjectStage, StageStatus } from "@prisma/client";

const UNIT_OPTIONS = ["", "шт", "м", "м²", "м³", "кг", "т", "л", "пог.м", "год"];

export type StageRow = {
  id: string;
  parentStageId: string | null;
  sortOrder: number;
  stage: ProjectStage | null;
  customName: string | null;
  isHidden: boolean;
  status: StageStatus;
  progress: number;
  startDate: Date | string | null;
  endDate: Date | string | null;
  notes: string | null;
  responsibleUserId: string | null;
  responsibleName: string | null;
  allocatedBudget: number | null;
  unit: string | null;
  factUnit: string | null;
  planVolume: number | null;
  factVolume: number | null;
  planUnitPrice: number | null;
  factUnitPrice: number | null;
  planClientUnitPrice: number | null;
  factClientUnitPrice: number | null;
  planExpense: number;
  factExpense: number;
  planIncome: number;
  factIncome: number;
  costType: "LABOR" | "MATERIAL" | null;
};

export type StageInlineUpdate = Partial<{
  status: StageStatus;
  responsibleUserId: string | null;
  responsibleName: string | null;
  customName: string | null;
  unit: string | null;
  factUnit: string | null;
  planVolume: number | null;
  factVolume: number | null;
  planUnitPrice: number | null;
  factUnitPrice: number | null;
  planClientUnitPrice: number | null;
  factClientUnitPrice: number | null;
  notes: string | null;
  startDate: string | null;
  endDate: string | null;
}>;

export type ViewMode = "all" | "plan" | "fact" | "compare";

/** Позиція дропа відносно target-рядка під час d&d рядків. */
export type DropPosition = "before" | "child" | "after";

type StageTableProps = {
  stages: StageRow[];
  selectedStageId: string | null;
  onStageClick: (stageId: string) => void;
  onInlineUpdate: (stageId: string, data: StageInlineUpdate) => Promise<void>;
  onAddChild: (parentStageId: string | null) => Promise<void>;
  onDelete: (stageId: string) => Promise<void>;
  candidates: { id: string; name: string }[];
  showHidden?: boolean;
  /** Phase 3: id-и стейджів з непублікованими змінами (draft ≠ published). */
  dirtyStageIds?: Set<string>;
  /** Режим відображення колонок: усі / тільки план / тільки факт / порівняння. */
  viewMode?: ViewMode;
  /**
   * Перенесення етапу: dragged → target з позицією. UI-шар обчислює нові
   * parentStageId/sortOrder і дзвонить /move endpoint.
   */
  onMoveStage?: (
    draggedId: string,
    targetId: string,
    position: DropPosition,
  ) => Promise<void>;
  /**
   * Excel-mode: рендерить додаткові порожні рядки після даних щоб таблиця
   * виглядала як «справжній» аркуш Excel із сіткою. Клік по ghost-рядку
   * викликає onAddChild(null) (створення нового top-level етапу).
   */
  excelMode?: boolean;
};

export const STATUS_STYLE: Record<StageStatus, { bg: string; fg: string; icon: typeof Check }> = {
  COMPLETED: { bg: T.successSoft, fg: T.success, icon: Check },
  IN_PROGRESS: { bg: T.accentPrimarySoft, fg: T.accentPrimary, icon: Clock },
  PENDING: { bg: T.panelElevated, fg: T.textMuted, icon: Circle },
};

export type TreeNode = StageRow & { children: TreeNode[]; depth: number };

export function buildTree(rows: StageRow[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  rows.forEach((r) => byId.set(r.id, { ...r, children: [], depth: 0 }));
  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parentStageId && byId.has(node.parentStageId)) {
      byId.get(node.parentStageId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRec = (arr: TreeNode[]) => {
    arr.sort((a, b) => a.sortOrder - b.sortOrder);
    arr.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  const fixDepth = (node: TreeNode, depth: number) => {
    node.depth = depth;
    node.children.forEach((c) => fixDepth(c, depth + 1));
  };
  roots.forEach((r) => fixDepth(r, 0));
  return roots;
}

export function flattenVisible(roots: TreeNode[], expanded: Set<string>): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      out.push(n);
      if (n.children.length > 0 && expanded.has(n.id)) walk(n.children);
    }
  };
  walk(roots);
  return out;
}

// ---------- Column definitions ----------

type ColumnId =
  | "volume"
  | "unit"
  | "unitPrice"
  | "clientPrice"
  | "expense"
  | "income"
  | "result"
  | "margin"
  | "deviation";

const COLUMN_LABELS: Record<ColumnId, string> = {
  volume: "Обсяг",
  unit: "Од.",
  unitPrice: "Вартість",
  clientPrice: "Замовник",
  expense: "Витрати",
  income: "Надход.",
  result: "Результат",
  margin: "Маржа",
  deviation: "Відхил.",
};

const DEFAULT_COL_ORDER: ColumnId[] = [
  "volume",
  "unit",
  "unitPrice",
  "clientPrice",
  "expense",
  "income",
  "result",
];

// Compare-режим показує лише ключові метрики, кожну парами План↔Факт + дельта.
// Без unit/unitPrice/clientPrice — для зведеного порівняння це шум.
const COMPARE_METRICS: ColumnId[] = ["volume", "expense", "income", "result"];

// Для дельти витрат: додатний знак (факт > план) — це погано (червоний).
// Для решти метрик: додатний знак — добре (зелений).
function deltaColor(metric: ColumnId, delta: number): string {
  if (delta === 0) return T.textMuted;
  const goodWhenPositive = metric !== "expense";
  const isGood = goodWhenPositive ? delta > 0 : delta < 0;
  return isGood ? T.success : T.danger;
}

const STORAGE_KEYS = {
  plan: "metrum.stage-table.plan-cols",
  fact: "metrum.stage-table.fact-cols",
  widths: "metrum.stage-table.col-widths",
} as const;

const MIN_COL_WIDTH = 60;

function loadColWidths(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.widths);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed;
  } catch {
    return {};
  }
}

function loadOrder(key: string): ColumnId[] {
  if (typeof window === "undefined") return DEFAULT_COL_ORDER;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return DEFAULT_COL_ORDER;
    const parsed = JSON.parse(raw) as ColumnId[];
    const valid = parsed.filter((c) => DEFAULT_COL_ORDER.includes(c));
    if (valid.length !== DEFAULT_COL_ORDER.length) return DEFAULT_COL_ORDER;
    return valid;
  } catch {
    return DEFAULT_COL_ORDER;
  }
}

// ---------- Component ----------

export function StageTable({
  stages,
  selectedStageId,
  onStageClick,
  onInlineUpdate,
  onAddChild,
  onDelete,
  candidates,
  showHidden = false,
  dirtyStageIds,
  viewMode = "all",
  onMoveStage,
  excelMode = false,
}: StageTableProps) {
  const showPlan = viewMode === "all" || viewMode === "plan";
  const showFact = viewMode === "all" || viewMode === "fact";
  const isCompare = viewMode === "compare";

  // Row d&d state
  const [rowDrag, setRowDrag] = useState<string | null>(null);
  const [rowDragOver, setRowDragOver] = useState<{
    id: string;
    position: DropPosition;
  } | null>(null);

  // Збираємо id-и нащадків переміщуваного — щоб блокувати дроп на них
  // (інакше відбудеться cycle і API поверне помилку).
  const rowDescendants = useMemo(() => {
    if (!rowDrag) return new Set<string>();
    const ids = new Set<string>([rowDrag]);
    let added = true;
    while (added) {
      added = false;
      for (const s of stages) {
        if (s.parentStageId && ids.has(s.parentStageId) && !ids.has(s.id)) {
          ids.add(s.id);
          added = true;
        }
      }
    }
    return ids;
  }, [rowDrag, stages]);
  const tree = useMemo(() => {
    const filtered = showHidden ? stages : stages.filter((s) => !s.isHidden);
    return buildTree(filtered);
  }, [stages, showHidden]);

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const ids = new Set<string>();
    const walk = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        if (n.children.length > 0) ids.add(n.id);
        walk(n.children);
      }
    };
    walk(tree);
    return ids;
  });

  // Persist column orders в localStorage. Init як DEFAULT, потім підвантажуємо
  // на mount — щоб уникнути SSR-CSR mismatch у hydration.
  const [planOrder, setPlanOrder] = useState<ColumnId[]>(DEFAULT_COL_ORDER);
  const [factOrder, setFactOrder] = useState<ColumnId[]>(DEFAULT_COL_ORDER);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlanOrder(loadOrder(STORAGE_KEYS.plan));
    setFactOrder(loadOrder(STORAGE_KEYS.fact));
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.plan, JSON.stringify(planOrder));
    } catch {}
  }, [planOrder]);
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.fact, JSON.stringify(factOrder));
    } catch {}
  }, [factOrder]);

  // Persist user-resized column widths (Excel-like drag-handle на правій межі th).
  // Init як {} → підвантажуємо у useEffect (як column orders, щоб уникнути SSR mismatch).
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setColWidths(loadColWidths());
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.widths, JSON.stringify(colWidths));
    } catch {}
  }, [colWidths]);
  const setColWidth = useCallback((key: string, w: number) => {
    setColWidths((prev) => {
      const clamped = Math.max(MIN_COL_WIDTH, Math.round(w));
      if (prev[key] === clamped) return prev;
      return { ...prev, [key]: clamped };
    });
  }, []);
  const widthFor = useCallback(
    (key: string, fallback: number) => colWidths[key] ?? fallback,
    [colWidths],
  );

  // Drag state
  const [drag, setDrag] = useState<{ group: "plan" | "fact"; id: ColumnId } | null>(null);
  const [dragOver, setDragOver] = useState<{ group: "plan" | "fact"; id: ColumnId } | null>(
    null,
  );
  const moveColumn = (group: "plan" | "fact", src: ColumnId, dst: ColumnId) => {
    const setter = group === "plan" ? setPlanOrder : setFactOrder;
    setter((prev) => {
      const fromIdx = prev.indexOf(src);
      const toIdx = prev.indexOf(dst);
      if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return prev;
      const next = [...prev];
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, src);
      return next;
    });
  };

  const visible = useMemo(() => flattenVisible(tree, expanded), [tree, expanded]);

  // Скільки `<td>` повинен мати ghost-рядок щоб не зруйнувати grid-розмітку
  // (Excel-mode). Підрахунок дзеркалить логіку рендеру header/body:
  //   3 фікс-колонки (Назва / Відповідальний / Статус) + columns × group(s) + 1 (Нотатка).
  // У compare-режимі кожна метрика = 3 колонки (План/Факт/Дельта).
  const ghostColCount = useMemo(() => {
    const base = 5; // name + responsible + status + startDate + endDate
    const notes = 1;
    if (isCompare) return base + COMPARE_METRICS.length * 3 + notes;
    const cols = (showPlan ? planOrder.length : 0) + (showFact ? factOrder.length : 0);
    return base + cols + notes;
  }, [isCompare, showPlan, showFact, planOrder.length, factOrder.length]);

  // Скільки порожніх рядків додавати в Excel-режимі.
  const GHOST_ROW_COUNT = 30;

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (visible.length === 0 && !excelMode) {
    return (
      <div
        className="rounded-lg border border-dashed p-6 text-center text-[12px]"
        style={{ borderColor: T.borderSoft, color: T.textMuted }}
      >
        Етапи не додано. Натисніть «Редагувати» щоб налаштувати структуру.
      </div>
    );
  }

  return (
    // overflowY: 'hidden' критичний — браузер інакше робить overflow-y: auto
    // (CSS spec quirk при overflow-x: auto), що перехоплює vertical-scroll
    // сторінки коли курсор над таблицею. Таблиця висока як content, vertical
    // scroll іде через сторінку — sticky-header при цьому стає липкою лише
    // поки контейнер у viewport.
    <div style={{ overflowX: "auto", overflowY: "hidden" }}>
      <table
        className="w-full text-[11px]"
        style={{
          minWidth: isCompare ? 1300 : 1600,
          borderCollapse: "collapse",
          border: `1px solid ${T.borderSoft}`,
        }}
      >
        <thead>
          <tr style={{ backgroundColor: T.panelSoft }}>
            <Th
              sticky
              width={200}
              rowSpan={2}
              stickyDivider
              colKey="name"
              getWidth={widthFor}
              onResize={setColWidth}
            >
              Назва
            </Th>
            <Th
              width={110}
              rowSpan={2}
              colKey="responsible"
              getWidth={widthFor}
              onResize={setColWidth}
            >
              Відповідальний
            </Th>
            <Th
              width={44}
              rowSpan={2}
              colKey="status"
              getWidth={widthFor}
              onResize={setColWidth}
              align="center"
            >
              <span title="Статус виконання" aria-label="Статус">
                ●
              </span>
            </Th>
            <Th
              width={120}
              rowSpan={2}
              colKey="startDate"
              getWidth={widthFor}
              onResize={setColWidth}
            >
              Дата початку
            </Th>
            <Th
              width={120}
              rowSpan={2}
              colKey="endDate"
              getWidth={widthFor}
              onResize={setColWidth}
            >
              Дата закінчення
            </Th>
            {isCompare ? (
              COMPARE_METRICS.map((metric) => (
                <ThGroup key={`cmp-${metric}`} colSpan={3} bg={T.panelSoft}>
                  {COLUMN_LABELS[metric]}
                </ThGroup>
              ))
            ) : (
              <>
                {showPlan && (
                  <ThGroup colSpan={planOrder.length} bg={T.accentPrimarySoft}>
                    План
                  </ThGroup>
                )}
                {showFact && (
                  <ThGroup colSpan={factOrder.length} bg={T.successSoft}>
                    Факт
                  </ThGroup>
                )}
              </>
            )}
            {!isCompare && (
              <>
                <Th
                  width={70}
                  rowSpan={2}
                  colKey="margin"
                  getWidth={widthFor}
                  onResize={setColWidth}
                >
                  {COLUMN_LABELS.margin}
                </Th>
                <Th
                  width={90}
                  rowSpan={2}
                  colKey="deviation"
                  getWidth={widthFor}
                  onResize={setColWidth}
                >
                  {COLUMN_LABELS.deviation}
                </Th>
              </>
            )}
            <Th
              width={140}
              rowSpan={2}
              colKey="comment"
              getWidth={widthFor}
              onResize={setColWidth}
            >
              Коментар
            </Th>
          </tr>
          <tr style={{ backgroundColor: T.panelSoft }}>
            {isCompare ? (
              COMPARE_METRICS.map((metric) => (
                <CompareSubHeaders key={`cmp-sub-${metric}`} />
              ))
            ) : (
              <>
                {showPlan &&
                  planOrder.map((id) => (
                    <DraggableHeader
                      key={`p-${id}`}
                      id={id}
                      group="plan"
                      drag={drag}
                      dragOver={dragOver}
                      setDrag={setDrag}
                      setDragOver={setDragOver}
                      moveColumn={moveColumn}
                      getWidth={widthFor}
                      onResize={setColWidth}
                    />
                  ))}
                {showFact &&
                  factOrder.map((id) => (
                    <DraggableHeader
                      key={`f-${id}`}
                      id={id}
                      group="fact"
                      drag={drag}
                      dragOver={dragOver}
                      setDrag={setDrag}
                      setDragOver={setDragOver}
                      moveColumn={moveColumn}
                      getWidth={widthFor}
                      onResize={setColWidth}
                    />
                  ))}
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {visible.map((node) => {
            const hasChildren = node.children.length > 0;
            const isExpanded = expanded.has(node.id);
            const isSelected = node.id === selectedStageId;
            const StatusIcon = STATUS_STYLE[node.status].icon;

            // Computed totals (volume × price). Якщо є MANUAL «довезення» —
            // API-агрегація може бути більшою; беремо max як display value.
            const planExpenseCalc = mul(node.planVolume, node.planUnitPrice);
            const planIncomeCalc = mul(node.planVolume, node.planClientUnitPrice);
            const factExpenseCalc = mul(node.factVolume, node.factUnitPrice);
            const factIncomeCalc = mul(node.factVolume, node.factClientUnitPrice);

            const planExpenseShow =
              planExpenseCalc > 0 ? Math.max(planExpenseCalc, node.planExpense) : node.planExpense;
            const planIncomeShow =
              planIncomeCalc > 0 ? Math.max(planIncomeCalc, node.planIncome) : node.planIncome;
            const factExpenseShow =
              factExpenseCalc > 0 ? Math.max(factExpenseCalc, node.factExpense) : node.factExpense;
            const factIncomeShow =
              factIncomeCalc > 0 ? Math.max(factIncomeCalc, node.factIncome) : node.factIncome;

            const planResult = planIncomeShow - planExpenseShow;
            const factResult = factIncomeShow - factExpenseShow;

            const renderPlanCell = (id: ColumnId) =>
              renderCell({
                id,
                kind: "plan",
                node,
                onInlineUpdate,
                expense: planExpenseShow,
                income: planIncomeShow,
                result: planResult,
              });
            const renderFactCell = (id: ColumnId) =>
              renderCell({
                id,
                kind: "fact",
                node,
                onInlineUpdate,
                expense: factExpenseShow,
                income: factIncomeShow,
                result: factResult,
              });

            const isDragSource = rowDrag === node.id;
            const isInvalidDropTarget = rowDescendants.has(node.id);
            const dropHere =
              rowDragOver?.id === node.id ? rowDragOver.position : null;
            // costType: легкий tint як підкладка + box-shadow inset зліва
            // як 3px кольорова смужка. Smysl смужки — швидко зчитувати тип
            // навіть боковим зором, не вчитуючись у назву.
            const costTint =
              node.costType === "LABOR"
                ? "rgba(34, 197, 94, 0.05)"
                : node.costType === "MATERIAL"
                  ? "rgba(59, 130, 246, 0.05)"
                  : "transparent";
            const costBar =
              node.costType === "LABOR"
                ? "inset 3px 0 0 0 rgb(34, 197, 94)"
                : node.costType === "MATERIAL"
                  ? "inset 3px 0 0 0 rgb(59, 130, 246)"
                  : "none";
            const rowBg = isDragSource
              ? T.warningSoft
              : dropHere === "child"
                ? T.accentPrimarySoft
                : isSelected
                  ? T.accentPrimarySoft
                  : costTint;

            return (
              <tr
                key={node.id}
                data-stage-id={node.id}
                onClick={() => onStageClick(node.id)}
                className="cursor-pointer transition"
                style={{
                  backgroundColor: rowBg,
                  boxShadow: costBar !== "none" ? costBar : undefined,
                  opacity: isDragSource ? 0.5 : node.isHidden ? 0.55 : 1,
                  borderTop:
                    dropHere === "before"
                      ? `2px solid ${T.accentPrimary}`
                      : undefined,
                  borderBottom:
                    dropHere === "after"
                      ? `2px solid ${T.accentPrimary}`
                      : undefined,
                }}
                onMouseEnter={(e) => {
                  if (rowDrag) return;
                  if (!isSelected)
                    e.currentTarget.style.backgroundColor = T.panelSoft;
                }}
                onMouseLeave={(e) => {
                  if (rowDrag) return;
                  if (!isSelected) e.currentTarget.style.backgroundColor = costTint;
                }}
                onDragOver={(e) => {
                  if (!rowDrag || !onMoveStage) return;
                  if (isInvalidDropTarget) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  const rect = e.currentTarget.getBoundingClientRect();
                  const y = e.clientY - rect.top;
                  const h = rect.height || 1;
                  const pos: DropPosition =
                    y < h * 0.25
                      ? "before"
                      : y > h * 0.75
                        ? "after"
                        : "child";
                  if (
                    !rowDragOver ||
                    rowDragOver.id !== node.id ||
                    rowDragOver.position !== pos
                  ) {
                    setRowDragOver({ id: node.id, position: pos });
                  }
                }}
                onDragLeave={(e) => {
                  // Тільки якщо реально вийшли — не реагувати на child enter.
                  const next = e.relatedTarget as Node | null;
                  if (next && e.currentTarget.contains(next)) return;
                  if (rowDragOver?.id === node.id) setRowDragOver(null);
                }}
                onDrop={async (e) => {
                  if (!rowDrag || !onMoveStage) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const dragged = rowDrag;
                  const target = node.id;
                  const position = rowDragOver?.position ?? "child";
                  setRowDrag(null);
                  setRowDragOver(null);
                  if (dragged === target) return;
                  if (rowDescendants.has(target)) return;
                  try {
                    await onMoveStage(dragged, target, position);
                  } catch (err) {
                    console.error("[stage-table] move failed", err);
                  }
                }}
                onDragEnd={() => {
                  // Безпечне прибирання state навіть якщо drop не відбувся.
                  setRowDrag(null);
                  setRowDragOver(null);
                }}
              >
                <Td
                  sticky
                  stickyDivider
                  style={{
                    paddingLeft: 8 + node.depth * 14,
                    backgroundColor: isSelected ? T.accentPrimarySoft : T.panel,
                    width: widthFor("name", 200),
                    maxWidth: widthFor("name", 200),
                    minWidth: widthFor("name", 200),
                    overflow: "hidden",
                  }}
                >
                  <NameCell
                    node={node}
                    hasChildren={hasChildren}
                    isExpanded={isExpanded}
                    canAddChild={node.depth < 2}
                    isDirty={dirtyStageIds?.has(node.id) ?? false}
                    onToggleExpand={() => toggleExpand(node.id)}
                    onRename={(v) => onInlineUpdate(node.id, { customName: v })}
                    onAddChild={() => onAddChild(node.id)}
                    onDelete={() => onDelete(node.id)}
                    canDrag={Boolean(onMoveStage)}
                    onDragHandleStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      try {
                        e.dataTransfer.setData("text/plain", node.id);
                      } catch {}
                      setRowDrag(node.id);
                    }}
                    onDragHandleEnd={() => {
                      setRowDrag(null);
                      setRowDragOver(null);
                    }}
                  />
                </Td>

                {/* Відповідальний — combobox: вибір зі списку юзерів АБО
                    вільний текст (підрядник без логіну). Backend сам зробить
                    fuzzy-match імені на існуючого юзера. */}
                <Td>
                  <ResponsibleCell
                    displayName={node.responsibleName}
                    candidates={candidates}
                    onCommit={(name) =>
                      onInlineUpdate(node.id, { responsibleName: name })
                    }
                  />
                </Td>

                {/* Статус — компактна точка з tooltip + іконкою для розрізнення */}
                <Td align="center">
                  <SelectCell
                    value={node.status}
                    options={(Object.keys(STAGE_STATUS_LABELS) as StageStatus[]).map((s) => ({
                      value: s,
                      label: STAGE_STATUS_LABELS[s],
                    }))}
                    display={
                      <span
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full transition"
                        style={{
                          backgroundColor: STATUS_STYLE[node.status].bg,
                          color: STATUS_STYLE[node.status].fg,
                        }}
                        title={STAGE_STATUS_LABELS[node.status]}
                        aria-label={`Статус: ${STAGE_STATUS_LABELS[node.status]}`}
                      >
                        <StatusIcon size={11} />
                      </span>
                    }
                    onCommit={(v) =>
                      onInlineUpdate(node.id, { status: v as StageStatus })
                    }
                  />
                </Td>

                {/* Дата початку */}
                <Td>
                  <DateCell
                    value={node.startDate}
                    onCommit={(v) => onInlineUpdate(node.id, { startDate: v })}
                  />
                </Td>

                {/* Дата закінчення */}
                <Td>
                  <DateCell
                    value={node.endDate}
                    onCommit={(v) => onInlineUpdate(node.id, { endDate: v })}
                  />
                </Td>

                {isCompare ? (
                  // Compare-режим: для кожної з 4 метрик — пара План|Факт + Δ.
                  COMPARE_METRICS.map((metric) => {
                    const planVal = compareValue(metric, "plan", node, {
                      planExpense: planExpenseShow,
                      planIncome: planIncomeShow,
                      planResult,
                      factExpense: factExpenseShow,
                      factIncome: factIncomeShow,
                      factResult,
                    });
                    const factVal = compareValue(metric, "fact", node, {
                      planExpense: planExpenseShow,
                      planIncome: planIncomeShow,
                      planResult,
                      factExpense: factExpenseShow,
                      factIncome: factIncomeShow,
                      factResult,
                    });
                    const delta =
                      planVal === null || factVal === null
                        ? null
                        : factVal - planVal;
                    return (
                      <BodyCellGroup
                        key={`cmp-${metric}`}
                        plan={renderPlanCell(metric)}
                        fact={renderFactCell(metric)}
                        delta={delta}
                        metric={metric}
                      />
                    );
                  })
                ) : (
                  <>
                    {showPlan &&
                      planOrder.map((id) => (
                        <BodyCell key={`p-${id}`} id={id}>
                          {renderPlanCell(id)}
                        </BodyCell>
                      ))}
                    {showFact &&
                      factOrder.map((id) => (
                        <BodyCell key={`f-${id}`} id={id}>
                          {renderFactCell(id)}
                        </BodyCell>
                      ))}
                  </>
                )}

                {!isCompare && (
                  <>
                    <BodyCell id="margin">{renderPlanCell("margin")}</BodyCell>
                    <BodyCell id="deviation">{renderPlanCell("deviation")}</BodyCell>
                  </>
                )}

                {/* Коментар */}
                <Td>
                  <NotesCell
                    value={node.notes ?? ""}
                    onCommit={(v) => onInlineUpdate(node.id, { notes: v || null })}
                  />
                </Td>
              </tr>
            );
          })}
          {excelMode &&
            Array.from({ length: GHOST_ROW_COUNT }).map((_, idx) => (
              <GhostRow
                key={`ghost-${idx}`}
                colCount={ghostColCount}
                rowIndex={visible.length + idx + 1}
                onActivate={() => onAddChild(null)}
              />
            ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Порожній рядок у Excel-режимі. Має таку ж кількість `<td>` що й дані,
 * тому grid (вертикальні лінії) ідеально вирівнюються. Клік активує
 * створення нового top-level етапу через існуючий `onAddChild(null)`.
 */
function GhostRow({
  colCount,
  rowIndex,
  onActivate,
}: {
  colCount: number;
  rowIndex: number;
  onActivate: () => void;
}) {
  return (
    <tr
      onClick={onActivate}
      className="cursor-pointer transition"
      style={{ height: 32 }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = T.panelSoft;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
      }}
      title="Натисніть щоб додати новий етап"
    >
      {Array.from({ length: colCount }).map((_, ci) => (
        <td
          key={ci}
          style={{
            padding: "4px 8px",
            borderRight: `1px solid ${T.borderSoft}`,
            borderBottom: `1px solid ${T.borderSoft}`,
            color: T.textMuted,
            fontSize: 11,
          }}
        >
          {ci === 0 ? (
            <span style={{ opacity: 0.45 }}>{rowIndex}</span>
          ) : null}
        </td>
      ))}
    </tr>
  );
}

// ---------- Cell renderers ----------

type RenderCtx = {
  id: ColumnId;
  kind: "plan" | "fact";
  node: TreeNode;
  onInlineUpdate: (id: string, data: StageInlineUpdate) => Promise<void>;
  expense: number;
  income: number;
  result: number;
};

function renderCell(ctx: RenderCtx): React.ReactNode {
  const { id, kind, node, onInlineUpdate } = ctx;
  const commit = (data: StageInlineUpdate) => onInlineUpdate(node.id, data);

  if (id === "volume") {
    return (
      <NumCell
        value={kind === "plan" ? node.planVolume : node.factVolume}
        onCommit={(v) => commit(kind === "plan" ? { planVolume: v } : { factVolume: v })}
        format="volume"
      />
    );
  }
  if (id === "unit") {
    const v = kind === "plan" ? node.unit : node.factUnit;
    return (
      <SelectCell
        value={v ?? ""}
        options={UNIT_OPTIONS.map((u) => ({
          value: u,
          label:
            u ||
            (kind === "fact" && node.unit ? `як план (${node.unit})` : "—"),
        }))}
        display={
          <span
            style={{
              color:
                v || (kind === "fact" && node.unit) ? T.textPrimary : T.textMuted,
            }}
          >
            {v ?? (kind === "fact" ? node.unit ?? "—" : "—")}
          </span>
        }
        onCommit={(val) =>
          commit(kind === "plan" ? { unit: val || null } : { factUnit: val || null })
        }
      />
    );
  }
  if (id === "unitPrice") {
    return (
      <NumCell
        value={kind === "plan" ? node.planUnitPrice : node.factUnitPrice}
        onCommit={(val) =>
          commit(kind === "plan" ? { planUnitPrice: val } : { factUnitPrice: val })
        }
        format="money"
      />
    );
  }
  if (id === "clientPrice") {
    return (
      <NumCell
        value={kind === "plan" ? node.planClientUnitPrice : node.factClientUnitPrice}
        onCommit={(val) =>
          commit(
            kind === "plan"
              ? { planClientUnitPrice: val }
              : { factClientUnitPrice: val },
          )
        }
        format="money"
      />
    );
  }
  if (id === "expense") return <ReadOnlyMoney value={ctx.expense} />;
  if (id === "income") return <ReadOnlyMoney value={ctx.income} />;
  if (id === "result") {
    return (
      <span style={{ color: ctx.result >= 0 ? T.success : T.danger }}>
        <ReadOnlyMoney value={ctx.result} signed />
      </span>
    );
  }
  if (id === "margin") {
    // Маржа% не залежить від plan/fact-сторони — рахуємо однакову на обох групах.
    // Беремо planIncome/planExpense як стабільну основу (бюджетна маржа).
    const inc = node.planIncome;
    const exp = node.planExpense;
    if (!inc || inc <= 0) return <span style={{ color: T.textMuted }}>—</span>;
    const pct = Math.round(((inc - exp) / inc) * 100);
    const color =
      pct >= 25 ? T.success : pct >= 15 ? T.warning : T.danger;
    return (
      <span style={{ color, fontWeight: 600 }}>{pct}%</span>
    );
  }
  if (id === "deviation") {
    // Відхилення = factExpense - planExpense. Додатне (перевитрата) — червоне.
    const dev = node.factExpense - node.planExpense;
    if (node.factExpense === 0 || dev === 0) {
      return <span style={{ color: T.textMuted }}>—</span>;
    }
    const color = dev > 0 ? T.danger : T.success;
    const sign = dev > 0 ? "+" : "";
    return (
      <span style={{ color, fontWeight: 600 }}>
        {sign}
        <ReadOnlyMoney value={Math.abs(dev)} />
      </span>
    );
  }
  return null;
}

function alignFor(id: ColumnId): "left" | "right" | "center" {
  if (id === "unit") return "center";
  return "right";
}

const READONLY_COLUMNS = new Set<ColumnId>([
  "expense",
  "income",
  "result",
  "margin",
  "deviation",
]);

function BodyCell({ id, children }: { id: ColumnId; children: React.ReactNode }) {
  // Readonly-колонки (Витрати / Надход. / Результат) — клік повністю
  // блокується, щоб не відкривався drawer і не було feel-of-edit, якого тут
  // немає. Drawer відкривається лише через клік по назві етапу або по
  // нейтральних частинах рядка (паддинг, відповідальний-cell padding тощо).
  const readOnly = READONLY_COLUMNS.has(id);
  return (
    <Td
      align={alignFor(id)}
      onClick={readOnly ? (e) => e.stopPropagation() : undefined}
    >
      {children}
    </Td>
  );
}

// ---------- Compare-режим: підзаголовки і трійка клітинок ----------

function CompareSubHeaders() {
  return (
    <>
      <th
        className="px-2 py-1.5 text-right text-[10px] font-medium select-none"
        style={{
          color: T.textMuted,
          border: `1px solid ${T.borderSoft}`,
          backgroundColor: T.accentPrimarySoft,
          width: 90,
        }}
      >
        План
      </th>
      <th
        className="px-2 py-1.5 text-right text-[10px] font-medium select-none"
        style={{
          color: T.textMuted,
          border: `1px solid ${T.borderSoft}`,
          backgroundColor: T.successSoft,
          width: 90,
        }}
      >
        Факт
      </th>
      <th
        className="px-2 py-1.5 text-right text-[10px] font-medium select-none"
        style={{
          color: T.textMuted,
          border: `1px solid ${T.borderSoft}`,
          backgroundColor: T.panelSoft,
          width: 80,
        }}
      >
        Δ
      </th>
    </>
  );
}

function BodyCellGroup({
  plan,
  fact,
  delta,
  metric,
}: {
  plan: React.ReactNode;
  fact: React.ReactNode;
  delta: number | null;
  metric: ColumnId;
}) {
  const align = alignFor(metric);
  return (
    <>
      <Td align={align}>{plan}</Td>
      <Td align={align}>{fact}</Td>
      <Td align={align}>
        <DeltaCell value={delta} metric={metric} />
      </Td>
    </>
  );
}

function DeltaCell({
  value,
  metric,
}: {
  value: number | null;
  metric: ColumnId;
}) {
  if (value === null || !Number.isFinite(value) || value === 0) {
    return <span style={{ color: T.textMuted }}>—</span>;
  }
  const color = deltaColor(metric, value);
  const sign = value > 0 ? "+" : "−";
  const abs = Math.abs(value);
  const formatted =
    metric === "volume"
      ? new Intl.NumberFormat("uk-UA", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 3,
        }).format(abs)
      : formatCurrency(abs);
  return (
    <span
      onClick={(e) => e.stopPropagation()}
      style={{ color, fontWeight: 600 }}
    >
      {sign}
      {formatted}
    </span>
  );
}

type CompareTotals = {
  planExpense: number;
  planIncome: number;
  planResult: number;
  factExpense: number;
  factIncome: number;
  factResult: number;
};

function compareValue(
  metric: ColumnId,
  kind: "plan" | "fact",
  node: TreeNode,
  totals: CompareTotals,
): number | null {
  if (metric === "volume") {
    return kind === "plan" ? node.planVolume ?? null : node.factVolume ?? null;
  }
  if (metric === "expense") {
    return kind === "plan" ? totals.planExpense : totals.factExpense;
  }
  if (metric === "income") {
    return kind === "plan" ? totals.planIncome : totals.factIncome;
  }
  if (metric === "result") {
    return kind === "plan" ? totals.planResult : totals.factResult;
  }
  return null;
}

// ---------- Header DnD ----------

function DraggableHeader({
  id,
  group,
  drag,
  dragOver,
  setDrag,
  setDragOver,
  moveColumn,
  getWidth,
  onResize,
}: {
  id: ColumnId;
  group: "plan" | "fact";
  drag: { group: "plan" | "fact"; id: ColumnId } | null;
  dragOver: { group: "plan" | "fact"; id: ColumnId } | null;
  setDrag: (v: { group: "plan" | "fact"; id: ColumnId } | null) => void;
  setDragOver: (v: { group: "plan" | "fact"; id: ColumnId } | null) => void;
  moveColumn: (group: "plan" | "fact", src: ColumnId, dst: ColumnId) => void;
  getWidth: (key: string, fallback: number) => number;
  onResize: (key: string, w: number) => void;
}) {
  const isDragging = drag?.group === group && drag.id === id;
  const isOver = dragOver?.group === group && dragOver.id === id && !isDragging;
  const colKey = `${group}-${id}`;
  const fallbackWidth = 85;
  const effectiveWidth = getWidth(colKey, fallbackWidth);
  return (
    <th
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        setDrag({ group, id });
      }}
      onDragOver={(e) => {
        if (drag?.group === group) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (!dragOver || dragOver.id !== id || dragOver.group !== group) {
            setDragOver({ group, id });
          }
        }
      }}
      onDragLeave={() => {
        if (dragOver?.group === group && dragOver.id === id) {
          setDragOver(null);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (drag?.group === group && drag.id !== id) {
          moveColumn(group, drag.id, id);
        }
        setDrag(null);
        setDragOver(null);
      }}
      onDragEnd={() => {
        setDrag(null);
        setDragOver(null);
      }}
      className="px-2 py-1.5 text-right text-[10px] font-medium select-none"
      style={{
        color: T.textMuted,
        cursor: "grab",
        opacity: isDragging ? 0.4 : 1,
        boxShadow: isOver ? `inset 2px 0 0 ${T.accentPrimary}` : undefined,
        border: `1px solid ${T.borderSoft}`,
        backgroundColor: isOver ? T.accentPrimarySoft : T.panelSoft,
        position: "relative",
        width: effectiveWidth,
        minWidth: effectiveWidth,
      }}
      title="Перетягни щоб поміняти порядок"
    >
      <span className="inline-flex items-center justify-end gap-1">
        <GripVertical size={9} style={{ color: T.textMuted, opacity: 0.6 }} />
        {COLUMN_LABELS[id]}
      </span>
      <ResizeHandle
        getCurrentWidth={() => getWidth(colKey, fallbackWidth)}
        onResize={(w) => onResize(colKey, w)}
      />
    </th>
  );
}

// ---------- Name cell with inline rename + actions ----------

function NameCell({
  node,
  hasChildren,
  isExpanded,
  canAddChild,
  isDirty,
  onToggleExpand,
  onRename,
  onAddChild,
  onDelete,
  canDrag = false,
  onDragHandleStart,
  onDragHandleEnd,
}: {
  node: TreeNode;
  hasChildren: boolean;
  isExpanded: boolean;
  canAddChild: boolean;
  isDirty: boolean;
  onToggleExpand: () => void;
  onRename: (newName: string) => Promise<void> | void;
  onAddChild: () => Promise<void> | void;
  onDelete: () => Promise<void> | void;
  canDrag?: boolean;
  onDragHandleStart?: (e: React.DragEvent) => void;
  onDragHandleEnd?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const display = stageDisplayName(node);

  return (
    <div className="group/name flex items-center gap-1.5">
      {canDrag && (
        <span
          draggable
          onDragStart={(e) => {
            e.stopPropagation();
            onDragHandleStart?.(e);
          }}
          onDragEnd={() => onDragHandleEnd?.()}
          onClick={(e) => e.stopPropagation()}
          className="flex h-6 w-5 flex-shrink-0 cursor-grab items-center justify-center rounded transition hover:opacity-100 active:cursor-grabbing"
          title="Перетягнути етап (на інший = всередину; на верх/низ рядка = поряд)"
          style={{
            color: T.textMuted,
            opacity: 0.45,
            backgroundColor: T.panelSoft,
            border: `1px solid ${T.borderSoft}`,
          }}
        >
          <GripVertical size={14} />
        </span>
      )}
      {isDirty && (
        <span
          title="Непубліковані зміни — натисни «Опублікувати у фінансування»"
          className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full"
          style={{ backgroundColor: T.warning }}
        />
      )}
      {hasChildren ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
          className="flex h-4 w-4 items-center justify-center rounded hover:bg-black/5"
          style={{ color: T.textMuted }}
          aria-label={isExpanded ? "Згорнути підетапи" : "Розгорнути підетапи"}
        >
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
      ) : (
        <span className="inline-block h-4 w-4" />
      )}
      {node.costType === "LABOR" && (
        <span
          className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded"
          style={{
            backgroundColor: "rgba(34,197,94,0.14)",
            color: "rgb(22,163,74)",
          }}
          title="Робота (LABOR)"
          aria-label="Робота"
        >
          <Hammer size={10} />
        </span>
      )}
      {node.costType === "MATERIAL" && (
        <span
          className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded"
          style={{
            backgroundColor: "rgba(59,130,246,0.14)",
            color: "rgb(37,99,235)",
          }}
          title="Матеріал (MATERIAL)"
          aria-label="Матеріал"
        >
          <Package size={10} />
        </span>
      )}
      {editing ? (
        <input
          autoFocus
          defaultValue={node.customName ?? display}
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== (node.customName ?? display)) {
              void onRename(v);
            }
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setEditing(false);
          }}
          className="flex-1 rounded border px-1.5 py-0.5 text-[12px] outline-none"
          style={{
            backgroundColor: T.panel,
            borderColor: T.borderAccent,
            color: T.textPrimary,
            fontWeight: node.depth === 0 ? 600 : 500,
          }}
        />
      ) : (
        // Клік по назві ⇒ drawer (через propagation до <tr onClick>).
        // Inline-rename доступний через олівчик праворуч або подвійний клік.
        <span
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          className="min-w-0 flex-1 truncate text-left transition"
          style={{
            color: node.status === "PENDING" ? T.textSecondary : T.textPrimary,
            fontWeight: node.depth === 0 ? 600 : 500,
            cursor: "pointer",
          }}
          title={`${display} — клік щоб відкрити деталі, подвійний клік щоб перейменувати`}
        >
          {display}
        </span>
      )}
      {node.isHidden && <EyeOff size={11} style={{ color: T.textMuted }} />}
      {/* Actions — show on row hover. hidden→flex (не opacity), щоб не займали
          місце у flex коли невидимі — інакше колонка "Назва" завжди ширша
          ніж потрібно через зарезервоване місце під 3 кнопки. */}
      <span className="ml-1 hidden items-center gap-0.5 group-hover/name:flex">
        {canAddChild && (
          <ActionIcon
            title="Додати підетап"
            onClick={(e) => {
              e.stopPropagation();
              void onAddChild();
            }}
          >
            <Plus size={12} />
          </ActionIcon>
        )}
        <ActionIcon
          title="Перейменувати"
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
        >
          <Pencil size={11} />
        </ActionIcon>
        <ActionIcon
          title="Видалити"
          danger
          onClick={(e) => {
            e.stopPropagation();
            if (
              confirm(
                `Видалити «${display}»${
                  node.children.length
                    ? ` разом з ${node.children.length} підетапом(и)?`
                    : "?"
                }`,
              )
            ) {
              void onDelete();
            }
          }}
        >
          <Trash2 size={11} />
        </ActionIcon>
      </span>
    </div>
  );
}

function ActionIcon({
  children,
  onClick,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex h-5 w-5 items-center justify-center rounded transition hover:brightness-95"
      style={{
        color: danger ? T.danger : T.textMuted,
        backgroundColor: T.panelSoft,
      }}
    >
      {children}
    </button>
  );
}

// ---------- Helpers ----------

function mul(a: number | null | undefined, b: number | null | undefined): number {
  if (a === null || a === undefined || b === null || b === undefined) return 0;
  return Number(a) * Number(b);
}

function ReadOnlyMoney({ value, signed = false }: { value: number; signed?: boolean }) {
  if (!Number.isFinite(value) || value === 0) {
    return (
      <span onClick={(e) => e.stopPropagation()} style={{ color: T.textMuted }}>
        —
      </span>
    );
  }
  const formatted = formatCurrency(Math.abs(value));
  const prefix = signed && value < 0 ? "−" : "";
  // stopPropagation — щоб клік по readonly-сумі не відкривав drawer.
  return <span onClick={(e) => e.stopPropagation()}>{prefix + formatted}</span>;
}

function NumCell({
  value,
  onCommit,
  format,
}: {
  value: number | null | undefined;
  onCommit: (v: number | null) => void | Promise<void>;
  format: "money" | "volume";
}) {
  const [editing, setEditing] = useState(false);
  const [formulaError, setFormulaError] = useState<string | null>(null);
  if (editing) {
    return (
      <input
        autoFocus
        // type="text" замість number, щоб приймати `=2*3` формули. inputMode
        // лишає мобільний keypad числовим, тому UX на телефоні не страждає.
        type="text"
        inputMode="decimal"
        defaultValue={value ?? ""}
        onClick={(e) => e.stopPropagation()}
        onBlur={(e) => {
          const raw = e.target.value.trim();
          let parsed: number | null = null;
          let err: string | null = null;
          if (raw === "") {
            parsed = null;
          } else if (raw.startsWith("=")) {
            try {
              const evaluated = tryEvaluateFormula(raw);
              if (evaluated === null) parsed = Number(raw);
              else parsed = evaluated;
              if (parsed !== null && parsed < 0) {
                err = "Результат < 0";
                parsed = (value ?? null);
              }
            } catch (ex) {
              err = ex instanceof Error ? ex.message : "Невалідна формула";
              parsed = value ?? null;
            }
          } else {
            const n = Number(raw.replace(",", "."));
            parsed = Number.isFinite(n) ? n : (value ?? null);
          }
          if (err) {
            setFormulaError(err);
            setTimeout(() => setFormulaError(null), 3000);
          }
          if (parsed !== (value ?? null)) void onCommit(parsed);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setEditing(false);
        }}
        title="Підтримує формули: =100*1.2, =(50+30)/2, =ROUND(1.23,1)"
        className="w-full rounded border px-1.5 py-0.5 text-right text-[12px] outline-none"
        style={{
          backgroundColor: T.panel,
          borderColor: T.borderAccent,
          color: T.textPrimary,
        }}
      />
    );
  }
  if (formulaError) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
          setFormulaError(null);
        }}
        title={formulaError}
        className="w-full text-right text-[11px] underline"
        style={{ color: T.danger }}
      >
        формула?
      </button>
    );
  }
  const display =
    value === null || value === undefined || value === 0
      ? "—"
      : format === "money"
        ? formatCurrency(value)
        : new Intl.NumberFormat("uk-UA", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 3,
          }).format(value);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      className="w-full text-right transition hover:underline"
      style={{
        color:
          value === null || value === undefined || value === 0
            ? T.textMuted
            : T.textPrimary,
      }}
    >
      {display}
    </button>
  );
}

function ResponsibleCell({
  displayName,
  candidates,
  onCommit,
}: {
  displayName: string | null;
  candidates: { id: string; name: string }[];
  onCommit: (name: string | null) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  // Унікальний id для datalist щоб не конфліктував між instances.
  const [listId] = useState(
    () => `users-${Math.random().toString(36).slice(2, 8)}`,
  );
  if (editing) {
    return (
      <>
        <input
          autoFocus
          defaultValue={displayName ?? ""}
          list={listId}
          placeholder="Імʼя або підрядник"
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v !== (displayName ?? "")) void onCommit(v || null);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setEditing(false);
          }}
          className="w-full rounded border px-1.5 py-0.5 text-[11px] outline-none"
          style={{
            backgroundColor: T.panel,
            borderColor: T.borderAccent,
            color: T.textPrimary,
          }}
        />
        <datalist id={listId}>
          {candidates.map((c) => (
            <option key={c.id} value={c.name} />
          ))}
        </datalist>
      </>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      className="w-full text-left transition hover:underline"
      style={{ color: displayName ? T.textPrimary : T.textMuted }}
    >
      {displayName ?? "—"}
    </button>
  );
}

function DateCell({
  value,
  onCommit,
}: {
  value: Date | string | null;
  onCommit: (v: string | null) => void | Promise<void>;
}) {
  const iso = value
    ? typeof value === "string"
      ? value.split("T")[0]
      : new Date(value).toISOString().split("T")[0]
    : "";
  return (
    <input
      type="date"
      defaultValue={iso}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => {
        const v = e.target.value || null;
        if (v !== (iso || null)) void onCommit(v);
      }}
      className="w-full rounded border px-1.5 py-0.5 text-[11px] outline-none"
      style={{
        backgroundColor: T.panel,
        borderColor: T.borderSoft,
        color: iso ? T.textPrimary : T.textMuted,
        colorScheme: "dark",
      }}
    />
  );
}

function SelectCell({
  value,
  options,
  display,
  onCommit,
}: {
  value: string;
  options: { value: string; label: string }[];
  display: React.ReactNode;
  onCommit: (v: string) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <select
        autoFocus
        defaultValue={value}
        onClick={(e) => e.stopPropagation()}
        onBlur={() => setEditing(false)}
        onChange={(e) => {
          const v = e.target.value;
          if (v !== value) void onCommit(v);
          setEditing(false);
        }}
        className="w-full rounded border px-1.5 py-0.5 text-[11px] outline-none"
        style={{
          backgroundColor: T.panel,
          borderColor: T.borderAccent,
          color: T.textPrimary,
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      className="w-full text-left transition hover:underline"
    >
      {display}
    </button>
  );
}

function TextCell({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (v: string) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <textarea
        autoFocus
        defaultValue={value}
        rows={2}
        onClick={(e) => e.stopPropagation()}
        onBlur={(e) => {
          const v = e.target.value;
          if (v !== value) void onCommit(v);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-full rounded border px-1.5 py-1 text-[11px] outline-none"
        style={{
          backgroundColor: T.panel,
          borderColor: T.borderAccent,
          color: T.textPrimary,
        }}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      className="block w-full text-left transition hover:underline"
      title={value || "Додати коментар"}
    >
      {value ? (
        <span className="line-clamp-2" style={{ color: T.textSecondary, fontSize: 11 }}>
          {value}
        </span>
      ) : (
        <span style={{ color: T.textMuted }}>—</span>
      )}
    </button>
  );
}

type AiNoteParsed = {
  /** Notes без `[AI: ...]` префіксу — призначене для відображення в editor. */
  display: string;
  /** Distilled metadata extracted from [AI: ...] tag. */
  priority: "HIGH" | "MEDIUM" | "LOW" | null;
  hours: number | null;
};

function parseAiNote(raw: string): AiNoteParsed {
  if (!raw) return { display: "", priority: null, hours: null };
  const match = raw.match(/\[AI:\s*([^\]]+)\]/);
  if (!match) return { display: raw, priority: null, hours: null };

  const body = match[1];
  let priority: "HIGH" | "MEDIUM" | "LOW" | null = null;
  if (/висок/i.test(body)) priority = "HIGH";
  else if (/середн/i.test(body)) priority = "MEDIUM";
  else if (/низьк/i.test(body)) priority = "LOW";

  let hours: number | null = null;
  const hMatch = body.match(/~?(\d+(?:[.,]\d+)?)\s*год/);
  if (hMatch) hours = Number(hMatch[1].replace(",", "."));

  // display = raw без [AI:…] (з очищенням обрамляючих \n).
  const display = raw.replace(/\[AI:[^\]]+\]/g, "").replace(/^\s*\n+|\n+\s*$/g, "").trim();
  return { display, priority, hours };
}

const PRIORITY_STYLE: Record<
  NonNullable<AiNoteParsed["priority"]>,
  { bg: string; fg: string; label: string }
> = {
  HIGH: { bg: "rgba(239,68,68,0.12)", fg: "rgb(220,38,38)", label: "Високий пріоритет" },
  MEDIUM: { bg: "rgba(245,158,11,0.12)", fg: "rgb(180,83,9)", label: "Середній пріоритет" },
  LOW: { bg: "rgba(100,116,139,0.12)", fg: "rgb(71,85,105)", label: "Низький пріоритет" },
};

function NotesCell({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (v: string) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const parsed = parseAiNote(value);

  if (editing) {
    return (
      <textarea
        autoFocus
        defaultValue={value}
        rows={2}
        onClick={(e) => e.stopPropagation()}
        onBlur={(e) => {
          const v = e.target.value;
          if (v !== value) void onCommit(v);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-full rounded border px-1.5 py-1 text-[11px] outline-none"
        style={{
          backgroundColor: T.panel,
          borderColor: T.borderAccent,
          color: T.textPrimary,
        }}
      />
    );
  }

  const hasAi = parsed.priority || parsed.hours !== null;
  const hasText = parsed.display.length > 0;

  if (!hasAi && !hasText) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        className="block w-full text-left transition hover:underline"
        title="Додати коментар"
        aria-label="Додати коментар до етапу"
      >
        <span style={{ color: T.textMuted }}>—</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      className="flex w-full flex-wrap items-center gap-1 text-left transition"
      title={value}
      aria-label="Редагувати коментар"
    >
      {parsed.priority && (
        <span
          className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-none"
          style={{
            backgroundColor: PRIORITY_STYLE[parsed.priority].bg,
            color: PRIORITY_STYLE[parsed.priority].fg,
          }}
          title={PRIORITY_STYLE[parsed.priority].label}
        >
          <Flame size={9} />
          {parsed.priority === "HIGH"
            ? "High"
            : parsed.priority === "MEDIUM"
              ? "Med"
              : "Low"}
        </span>
      )}
      {parsed.hours !== null && (
        <span
          className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-none"
          style={{
            backgroundColor: "rgba(59,130,246,0.10)",
            color: "rgb(37,99,235)",
          }}
          title="Очікуваний час (людино-години)"
        >
          <Clock size={9} />
          {parsed.hours}г
        </span>
      )}
      {hasText && (
        <span
          className="line-clamp-1 min-w-0 flex-1"
          style={{ color: T.textSecondary, fontSize: 11 }}
        >
          {parsed.display}
        </span>
      )}
    </button>
  );
}

// ---------- Static cells ----------

/**
 * Drag-handle на правій межі th для Excel-like resize. Mousedown захоплює
 * стартовий X та ширину, mousemove оновлює state у реальному часі, mouseup
 * відписується. Body cursor=col-resize + user-select=none на час drag,
 * щоб не виділявся текст.
 */
function ResizeHandle({
  getCurrentWidth,
  onResize,
}: {
  getCurrentWidth: () => number;
  onResize: (newWidth: number) => void;
}) {
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = getCurrentWidth();
    const onMove = (ev: MouseEvent) => {
      onResize(startWidth + (ev.clientX - startX));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  };
  return (
    <span
      onMouseDown={onMouseDown}
      onClick={(e) => e.stopPropagation()}
      onDragStart={(e) => e.preventDefault()}
      title="Перетягни щоб змінити ширину"
      style={{
        position: "absolute",
        top: 0,
        right: -3,
        width: 6,
        height: "100%",
        cursor: "col-resize",
        userSelect: "none",
        zIndex: 3,
      }}
    />
  );
}

function Th({
  children,
  width,
  sticky,
  rowSpan,
  stickyDivider,
  colKey,
  onResize,
  getWidth,
  align = "left",
}: {
  children?: React.ReactNode;
  width?: number;
  sticky?: boolean;
  rowSpan?: number;
  stickyDivider?: boolean;
  /** Якщо передано — вмикає resize-handle і узгоджує ширину з parent state. */
  colKey?: string;
  onResize?: (key: string, w: number) => void;
  getWidth?: (key: string, fallback: number) => number;
  align?: "left" | "center" | "right";
}) {
  const fallback = width ?? 120;
  const effectiveWidth =
    colKey && getWidth ? getWidth(colKey, fallback) : width;
  const resizable = Boolean(colKey && onResize && getWidth);
  return (
    <th
      rowSpan={rowSpan}
      className={`px-2 py-1.5 text-${align} text-[10px] font-bold uppercase tracking-wider`}
      style={{
        color: T.textMuted,
        width: effectiveWidth,
        minWidth: effectiveWidth,
        position: sticky ? "sticky" : "relative",
        left: sticky ? 0 : undefined,
        backgroundColor: sticky ? T.panelSoft : T.panelSoft,
        zIndex: sticky ? 2 : undefined,
        border: `1px solid ${T.borderSoft}`,
        borderRight: stickyDivider
          ? `2px solid ${T.borderSoft}`
          : `1px solid ${T.borderSoft}`,
        verticalAlign: "middle",
      }}
    >
      {children}
      {resizable && (
        <ResizeHandle
          getCurrentWidth={() => getWidth!(colKey!, fallback)}
          onResize={(w) => onResize!(colKey!, w)}
        />
      )}
    </th>
  );
}

function ThGroup({
  children,
  colSpan,
  bg,
}: {
  children: React.ReactNode;
  colSpan: number;
  bg: string;
}) {
  return (
    <th
      colSpan={colSpan}
      className="px-2 py-1 text-center text-[10px] font-bold uppercase tracking-wider"
      style={{
        color: T.textPrimary,
        backgroundColor: bg,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  accent,
  sticky,
  stickyDivider,
  style,
  onClick,
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  accent?: string;
  sticky?: boolean;
  stickyDivider?: boolean;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent<HTMLTableCellElement>) => void;
}) {
  return (
    <td
      onClick={onClick}
      className="px-2 py-1.5 align-middle"
      style={{
        textAlign: align,
        color: accent ?? T.textPrimary,
        position: sticky ? "sticky" : undefined,
        left: sticky ? 0 : undefined,
        zIndex: sticky ? 1 : undefined,
        border: `1px solid ${T.borderSoft}`,
        borderRight: stickyDivider
          ? `2px solid ${T.borderSoft}`
          : `1px solid ${T.borderSoft}`,
        ...style,
      }}
    >
      {children}
    </td>
  );
}
