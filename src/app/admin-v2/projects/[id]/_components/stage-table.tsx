"use client";

import { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";
import { stageDisplayName, STAGE_STATUS_LABELS } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
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
}>;

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
};

const STATUS_STYLE: Record<StageStatus, { bg: string; fg: string; icon: typeof Check }> = {
  COMPLETED: { bg: T.successSoft, fg: T.success, icon: Check },
  IN_PROGRESS: { bg: T.accentPrimarySoft, fg: T.accentPrimary, icon: Clock },
  PENDING: { bg: T.panelElevated, fg: T.textMuted, icon: Circle },
};

type TreeNode = StageRow & { children: TreeNode[]; depth: number };

function buildTree(rows: StageRow[]): TreeNode[] {
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

function flattenVisible(roots: TreeNode[], expanded: Set<string>): TreeNode[] {
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
  | "result";

const COLUMN_LABELS: Record<ColumnId, string> = {
  volume: "Обсяг",
  unit: "Од.",
  unitPrice: "Вартість",
  clientPrice: "Замовник",
  expense: "Витрати",
  income: "Надход.",
  result: "Результат",
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

const STORAGE_KEYS = {
  plan: "metrum.stage-table.plan-cols",
  fact: "metrum.stage-table.fact-cols",
} as const;

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
}: StageTableProps) {
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

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (visible.length === 0) {
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
        className="w-full text-[12px]"
        style={{
          minWidth: 1900,
          borderCollapse: "collapse",
          border: `1px solid ${T.borderSoft}`,
        }}
      >
        <thead>
          <tr style={{ backgroundColor: T.panelSoft }}>
            <Th sticky width={260} rowSpan={2} stickyDivider>
              Назва
            </Th>
            <Th width={140} rowSpan={2}>
              Відповідальний
            </Th>
            <Th width={110} rowSpan={2}>
              Статус
            </Th>
            <ThGroup colSpan={planOrder.length} bg={T.accentPrimarySoft}>
              План
            </ThGroup>
            <ThGroup colSpan={factOrder.length} bg={T.successSoft}>
              Факт
            </ThGroup>
            <Th width={170} rowSpan={2}>
              Коментар
            </Th>
          </tr>
          <tr style={{ backgroundColor: T.panelSoft }}>
            {planOrder.map((id) => (
              <DraggableHeader
                key={`p-${id}`}
                id={id}
                group="plan"
                drag={drag}
                dragOver={dragOver}
                setDrag={setDrag}
                setDragOver={setDragOver}
                moveColumn={moveColumn}
              />
            ))}
            {factOrder.map((id) => (
              <DraggableHeader
                key={`f-${id}`}
                id={id}
                group="fact"
                drag={drag}
                dragOver={dragOver}
                setDrag={setDrag}
                setDragOver={setDragOver}
                moveColumn={moveColumn}
              />
            ))}
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

            return (
              <tr
                key={node.id}
                onClick={() => onStageClick(node.id)}
                className="cursor-pointer transition"
                style={{
                  backgroundColor: isSelected ? T.accentPrimarySoft : "transparent",
                  opacity: node.isHidden ? 0.55 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = T.panelSoft;
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <Td
                  sticky
                  stickyDivider
                  style={{
                    paddingLeft: 12 + node.depth * 18,
                    backgroundColor: isSelected ? T.accentPrimarySoft : T.panel,
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

                {/* Статус */}
                <Td>
                  <SelectCell
                    value={node.status}
                    options={(Object.keys(STAGE_STATUS_LABELS) as StageStatus[]).map((s) => ({
                      value: s,
                      label: STAGE_STATUS_LABELS[s],
                    }))}
                    display={
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style={{
                          backgroundColor: STATUS_STYLE[node.status].bg,
                          color: STATUS_STYLE[node.status].fg,
                        }}
                      >
                        <StatusIcon size={10} />
                        {STAGE_STATUS_LABELS[node.status]}
                      </span>
                    }
                    onCommit={(v) =>
                      onInlineUpdate(node.id, { status: v as StageStatus })
                    }
                  />
                </Td>

                {/* План — динамічний порядок */}
                {planOrder.map((id) => (
                  <BodyCell key={`p-${id}`} id={id}>
                    {renderPlanCell(id)}
                  </BodyCell>
                ))}

                {/* Факт — динамічний порядок */}
                {factOrder.map((id) => (
                  <BodyCell key={`f-${id}`} id={id}>
                    {renderFactCell(id)}
                  </BodyCell>
                ))}

                {/* Коментар */}
                <Td>
                  <TextCell
                    value={node.notes ?? ""}
                    onCommit={(v) => onInlineUpdate(node.id, { notes: v || null })}
                  />
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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
  return null;
}

function alignFor(id: ColumnId): "left" | "right" | "center" {
  if (id === "unit") return "center";
  return "right";
}

function BodyCell({ id, children }: { id: ColumnId; children: React.ReactNode }) {
  return <Td align={alignFor(id)}>{children}</Td>;
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
}: {
  id: ColumnId;
  group: "plan" | "fact";
  drag: { group: "plan" | "fact"; id: ColumnId } | null;
  dragOver: { group: "plan" | "fact"; id: ColumnId } | null;
  setDrag: (v: { group: "plan" | "fact"; id: ColumnId } | null) => void;
  setDragOver: (v: { group: "plan" | "fact"; id: ColumnId } | null) => void;
  moveColumn: (group: "plan" | "fact", src: ColumnId, dst: ColumnId) => void;
}) {
  const isDragging = drag?.group === group && drag.id === id;
  const isOver = dragOver?.group === group && dragOver.id === id && !isDragging;
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
      className="px-3 py-1.5 text-right text-[10px] font-medium select-none"
      style={{
        color: T.textMuted,
        cursor: "grab",
        opacity: isDragging ? 0.4 : 1,
        boxShadow: isOver ? `inset 2px 0 0 ${T.accentPrimary}` : undefined,
        border: `1px solid ${T.borderSoft}`,
        backgroundColor: isOver ? T.accentPrimarySoft : T.panelSoft,
      }}
      title="Перетягни щоб поміняти порядок"
    >
      <span className="inline-flex items-center justify-end gap-1">
        <GripVertical size={9} style={{ color: T.textMuted, opacity: 0.6 }} />
        {COLUMN_LABELS[id]}
      </span>
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
}) {
  const [editing, setEditing] = useState(false);
  const display = stageDisplayName(node);

  return (
    <div className="group/name flex items-center gap-1.5">
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
        >
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
      ) : (
        <span className="inline-block h-4 w-4" />
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
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          className="min-w-0 flex-1 truncate text-left transition hover:underline"
          style={{
            color: node.status === "PENDING" ? T.textSecondary : T.textPrimary,
            fontWeight: node.depth === 0 ? 600 : 500,
          }}
          title={display}
        >
          {display}
        </button>
      )}
      {node.isHidden && <EyeOff size={11} style={{ color: T.textMuted }} />}
      {/* Actions — show on row hover */}
      <span className="ml-1 flex items-center gap-0.5 opacity-0 transition group-hover/name:opacity-100">
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
    return <span style={{ color: T.textMuted }}>—</span>;
  }
  const formatted = formatCurrency(Math.abs(value));
  const prefix = signed && value < 0 ? "−" : "";
  return <span>{prefix + formatted}</span>;
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
  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        inputMode="decimal"
        defaultValue={value ?? ""}
        step={format === "volume" ? "0.001" : "0.01"}
        min={0}
        onClick={(e) => e.stopPropagation()}
        onBlur={(e) => {
          const raw = e.target.value;
          const parsed = raw === "" ? null : Number(raw);
          if (parsed !== (value ?? null)) void onCommit(parsed);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-full rounded border px-1.5 py-0.5 text-right text-[12px] outline-none"
        style={{
          backgroundColor: T.panel,
          borderColor: T.borderAccent,
          color: T.textPrimary,
        }}
      />
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

// ---------- Static cells ----------

function Th({
  children,
  width,
  sticky,
  rowSpan,
  stickyDivider,
}: {
  children?: React.ReactNode;
  width?: number;
  sticky?: boolean;
  rowSpan?: number;
  stickyDivider?: boolean;
}) {
  return (
    <th
      rowSpan={rowSpan}
      className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider"
      style={{
        color: T.textMuted,
        width,
        position: sticky ? "sticky" : undefined,
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
      className="px-3 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider"
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
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  accent?: string;
  sticky?: boolean;
  stickyDivider?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <td
      className="px-3 py-2 align-middle"
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
