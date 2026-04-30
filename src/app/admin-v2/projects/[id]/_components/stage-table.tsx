"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Check, Clock, Circle, EyeOff } from "lucide-react";
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
  candidates: { id: string; name: string }[];
  showHidden?: boolean;
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

export function StageTable({
  stages,
  selectedStageId,
  onStageClick,
  onInlineUpdate,
  candidates,
  showHidden = false,
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
    <div className="overflow-x-auto">
      <table
        className="w-full border-collapse text-[12px]"
        style={{ minWidth: 1900 }}
      >
        <thead>
          <tr style={{ backgroundColor: T.panelSoft }}>
            <Th sticky width={260} rowSpan={2}>
              Назва
            </Th>
            <Th width={140} rowSpan={2}>
              Відповідальний
            </Th>
            <Th width={110} rowSpan={2}>
              Статус
            </Th>
            <ThGroup colSpan={7} bg={T.accentPrimarySoft}>
              План
            </ThGroup>
            <ThGroup colSpan={7} bg={T.successSoft}>
              Факт
            </ThGroup>
            <Th width={170} rowSpan={2}>
              Коментар
            </Th>
          </tr>
          <tr style={{ backgroundColor: T.panelSoft }}>
            <ThSub>Обсяг</ThSub>
            <ThSub>Од.</ThSub>
            <ThSub>Вартість</ThSub>
            <ThSub>Замовник</ThSub>
            <ThSub>Витрати</ThSub>
            <ThSub>Надход.</ThSub>
            <ThSub>Результат</ThSub>
            <ThSub>Обсяг</ThSub>
            <ThSub>Од.</ThSub>
            <ThSub>Вартість</ThSub>
            <ThSub>Замовник</ThSub>
            <ThSub>Витрати</ThSub>
            <ThSub>Надход.</ThSub>
            <ThSub>Результат</ThSub>
          </tr>
        </thead>
        <tbody>
          {visible.map((node) => {
            const hasChildren = node.children.length > 0;
            const isExpanded = expanded.has(node.id);
            const isSelected = node.id === selectedStageId;
            const StatusIcon = STATUS_STYLE[node.status].icon;

            // Computed: показуємо volume × unitPrice якщо обидва задані;
            // інакше беремо API-агрегацію (включає MANUAL «довезення»).
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

            return (
              <tr
                key={node.id}
                onClick={() => onStageClick(node.id)}
                className="cursor-pointer transition"
                style={{
                  backgroundColor: isSelected ? T.accentPrimarySoft : "transparent",
                  borderBottom: `1px solid ${T.borderSoft}`,
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
                  style={{
                    paddingLeft: 12 + node.depth * 18,
                    backgroundColor: isSelected ? T.accentPrimarySoft : T.panel,
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    {hasChildren ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(node.id);
                        }}
                        className="flex h-4 w-4 items-center justify-center rounded hover:bg-black/5"
                        style={{ color: T.textMuted }}
                      >
                        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      </button>
                    ) : (
                      <span className="inline-block h-4 w-4" />
                    )}
                    <span
                      className="truncate font-medium"
                      style={{
                        color: node.status === "PENDING" ? T.textSecondary : T.textPrimary,
                        fontWeight: node.depth === 0 ? 600 : 500,
                      }}
                      title={stageDisplayName(node)}
                    >
                      {stageDisplayName(node)}
                    </span>
                    {node.isHidden && <EyeOff size={11} style={{ color: T.textMuted }} />}
                  </div>
                </Td>

                {/* Відповідальний */}
                <Td>
                  <SelectCell
                    value={node.responsibleUserId ?? ""}
                    options={[
                      { value: "", label: "—" },
                      ...candidates.map((c) => ({ value: c.id, label: c.name })),
                    ]}
                    display={node.responsibleName ?? "—"}
                    onCommit={(v) =>
                      onInlineUpdate(node.id, { responsibleUserId: v || null })
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

                {/* План: 7 колонок */}
                <Td align="right">
                  <NumCell
                    value={node.planVolume}
                    onCommit={(v) => onInlineUpdate(node.id, { planVolume: v })}
                    format="volume"
                  />
                </Td>
                <Td align="center">
                  <SelectCell
                    value={node.unit ?? ""}
                    options={UNIT_OPTIONS.map((u) => ({ value: u, label: u || "—" }))}
                    display={
                      <span style={{ color: node.unit ? T.textPrimary : T.textMuted }}>
                        {node.unit ?? "—"}
                      </span>
                    }
                    onCommit={(v) => onInlineUpdate(node.id, { unit: v || null })}
                  />
                </Td>
                <Td align="right">
                  <NumCell
                    value={node.planUnitPrice}
                    onCommit={(v) => onInlineUpdate(node.id, { planUnitPrice: v })}
                    format="money"
                  />
                </Td>
                <Td align="right">
                  <NumCell
                    value={node.planClientUnitPrice}
                    onCommit={(v) => onInlineUpdate(node.id, { planClientUnitPrice: v })}
                    format="money"
                  />
                </Td>
                <Td align="right">
                  <ReadOnlyMoney value={planExpenseShow} />
                </Td>
                <Td align="right">
                  <ReadOnlyMoney value={planIncomeShow} />
                </Td>
                <Td align="right" accent={planResult >= 0 ? T.success : T.danger}>
                  <ReadOnlyMoney value={planResult} signed />
                </Td>

                {/* Факт: 7 колонок */}
                <Td align="right">
                  <NumCell
                    value={node.factVolume}
                    onCommit={(v) => onInlineUpdate(node.id, { factVolume: v })}
                    format="volume"
                  />
                </Td>
                <Td align="center">
                  <SelectCell
                    value={node.factUnit ?? ""}
                    options={UNIT_OPTIONS.map((u) => ({
                      value: u,
                      label: u || (node.unit ? `як план (${node.unit})` : "—"),
                    }))}
                    display={
                      <span
                        style={{
                          color:
                            node.factUnit || node.unit ? T.textPrimary : T.textMuted,
                        }}
                      >
                        {node.factUnit ?? node.unit ?? "—"}
                      </span>
                    }
                    onCommit={(v) => onInlineUpdate(node.id, { factUnit: v || null })}
                  />
                </Td>
                <Td align="right">
                  <NumCell
                    value={node.factUnitPrice}
                    onCommit={(v) => onInlineUpdate(node.id, { factUnitPrice: v })}
                    format="money"
                  />
                </Td>
                <Td align="right">
                  <NumCell
                    value={node.factClientUnitPrice}
                    onCommit={(v) => onInlineUpdate(node.id, { factClientUnitPrice: v })}
                    format="money"
                  />
                </Td>
                <Td align="right">
                  <ReadOnlyMoney value={factExpenseShow} />
                </Td>
                <Td align="right">
                  <ReadOnlyMoney value={factIncomeShow} />
                </Td>
                <Td align="right" accent={factResult >= 0 ? T.success : T.danger}>
                  <ReadOnlyMoney value={factResult} signed />
                </Td>

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
        color: value === null || value === undefined || value === 0 ? T.textMuted : T.textPrimary,
      }}
    >
      {display}
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

function Th({
  children,
  width,
  sticky,
  rowSpan,
}: {
  children?: React.ReactNode;
  width?: number;
  sticky?: boolean;
  rowSpan?: number;
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
        backgroundColor: sticky ? T.panelSoft : undefined,
        zIndex: sticky ? 2 : undefined,
        borderBottom: `1px solid ${T.borderSoft}`,
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
        borderBottom: `1px solid ${T.borderSoft}`,
      }}
    >
      {children}
    </th>
  );
}

function ThSub({ children }: { children: React.ReactNode }) {
  return (
    <th
      className="px-3 py-1.5 text-right text-[10px] font-medium"
      style={{
        color: T.textMuted,
        borderBottom: `1px solid ${T.borderSoft}`,
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
  style,
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  accent?: string;
  sticky?: boolean;
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
        ...style,
      }}
    >
      {children}
    </td>
  );
}
