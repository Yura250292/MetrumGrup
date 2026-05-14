"use client";

import { useMemo } from "react";
import type { StageStatus } from "@prisma/client";
import { stageDisplayName } from "@/lib/constants";
import { formatCurrencyCompact } from "@/lib/utils";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import {
  STATUS_STYLE,
  buildTree,
  flattenVisible,
  type StageRow,
  type StageInlineUpdate,
  type TreeNode,
} from "./stage-table";

type StageMobileListProps = {
  stages: StageRow[];
  selectedStageId: string | null;
  onStageClick: (stageId: string) => void;
  onInlineUpdate: (id: string, data: StageInlineUpdate) => Promise<void>;
  onAddChild: (parentStageId: string | null) => Promise<void>;
  onDelete: (stageId: string) => Promise<void>;
  showHidden?: boolean;
  dirtyStageIds?: Set<string>;
};

function mul(a: number | null, b: number | null): number {
  if (a == null || b == null) return 0;
  return a * b;
}

function nextStatus(s: StageStatus): StageStatus {
  if (s === "PENDING") return "IN_PROGRESS";
  if (s === "IN_PROGRESS") return "COMPLETED";
  return "PENDING";
}

/**
 * Будує hierarchical numbering: 1, 1.1, 1.2, 2, 2.1, etc.
 * Повертає Map id → "1.2.3"
 */
function buildNumbers(roots: TreeNode[]): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (nodes: TreeNode[], prefix: string) => {
    nodes.forEach((n, i) => {
      const num = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
      out.set(n.id, num);
      if (n.children.length > 0) walk(n.children, num);
    });
  };
  walk(roots, "");
  return out;
}

export function StageMobileList({
  stages,
  selectedStageId,
  onStageClick,
  onInlineUpdate,
  showHidden = false,
  dirtyStageIds,
}: StageMobileListProps) {
  const tree = useMemo(() => {
    const filtered = showHidden ? stages : stages.filter((s) => !s.isHidden);
    return buildTree(filtered);
  }, [stages, showHidden]);

  const numbers = useMemo(() => buildNumbers(tree), [tree]);

  // Mobile: завжди розгорнуто (компактна таблиця показує все).
  // Експандер не потрібен — структура читається через № і indent.
  const expanded = useMemo(() => {
    const ids = new Set<string>();
    const walk = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        ids.add(n.id);
        walk(n.children);
      }
    };
    walk(tree);
    return ids;
  }, [tree]);

  const visible = useMemo(() => flattenVisible(tree, expanded), [tree, expanded]);

  if (visible.length === 0) {
    return (
      <div
        className="rounded-lg border border-dashed p-6 text-center text-[12px]"
        style={{ borderColor: T.borderSoft, color: T.textMuted }}
      >
        Етапи не додано. Натисніть «Додати етап» щоб почати.
      </div>
    );
  }

  return (
    <div
      className="-mx-4 overflow-x-auto border-y sm:mx-0 sm:rounded-lg sm:border"
      style={{ backgroundColor: T.panel, borderColor: T.borderSoft }}
    >
      <table
        className="w-full text-[10.5px]"
        style={{
          borderCollapse: "separate",
          borderSpacing: 0,
          color: T.textPrimary,
        }}
      >
        <thead>
          <tr
            className="text-[9px] font-bold uppercase tracking-wider"
            style={{ color: T.textMuted, backgroundColor: T.panelSoft }}
          >
            <th
              className="sticky left-0 z-[2] px-1.5 py-2 text-left"
              style={{
                backgroundColor: T.panelSoft,
                borderRight: `1px solid ${T.borderSoft}`,
                minWidth: 150,
                maxWidth: 180,
              }}
            >
              №&nbsp;Назва
            </th>
            <th className="px-1.5 py-2 text-center" style={{ minWidth: 28 }}>
              Ст.
            </th>
            <th className="px-1.5 py-2 text-right tabular-nums" style={{ minWidth: 60 }}>
              План
            </th>
            <th className="px-1.5 py-2 text-right tabular-nums" style={{ minWidth: 60 }}>
              Факт
            </th>
            <th className="px-1.5 py-2 text-right" style={{ minWidth: 40 }}>
              %
            </th>
            <th className="px-1.5 py-2 text-left" style={{ minWidth: 80 }}>
              Відп.
            </th>
          </tr>
        </thead>
        <tbody>
          {visible.map((node, i) => (
            <Row
              key={node.id}
              node={node}
              number={numbers.get(node.id) ?? ""}
              isSelected={node.id === selectedStageId}
              isDirty={dirtyStageIds?.has(node.id) ?? false}
              onClick={() => onStageClick(node.id)}
              onCycleStatus={() =>
                onInlineUpdate(node.id, { status: nextStatus(node.status) })
              }
              isLast={i === visible.length - 1}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

type RowProps = {
  node: TreeNode;
  number: string;
  isSelected: boolean;
  isDirty: boolean;
  onClick: () => void;
  onCycleStatus: () => Promise<void>;
  isLast: boolean;
};

function Row({
  node,
  number,
  isSelected,
  isDirty,
  onClick,
  onCycleStatus,
  isLast,
}: RowProps) {
  const StatusIcon = STATUS_STYLE[node.status].icon;
  const displayName = stageDisplayName(node);

  const planExpenseCalc = mul(node.planVolume, node.planUnitPrice);
  const factExpenseCalc = mul(node.factVolume, node.factUnitPrice);
  const planIncomeCalc = mul(node.planVolume, node.planClientUnitPrice);
  const factIncomeCalc = mul(node.factVolume, node.factClientUnitPrice);
  const planExpense =
    planExpenseCalc > 0 ? Math.max(planExpenseCalc, node.planExpense) : node.planExpense;
  const factExpense =
    factExpenseCalc > 0 ? Math.max(factExpenseCalc, node.factExpense) : node.factExpense;
  const planIncome =
    planIncomeCalc > 0 ? Math.max(planIncomeCalc, node.planIncome) : node.planIncome;
  const factIncome =
    factIncomeCalc > 0 ? Math.max(factIncomeCalc, node.factIncome) : node.factIncome;
  const planResult = planIncome - planExpense;
  const factResult = factIncome - factExpense;

  const indent = node.depth * 8;
  const fontWeight = node.depth === 0 ? 700 : node.depth === 1 ? 500 : 400;
  const rowBg = isSelected
    ? T.accentPrimarySoft
    : node.depth === 0
      ? T.panelSoft
      : T.panel;
  const borderTop = `1px solid ${T.borderSoft}`;
  const cellStyle: React.CSSProperties = {
    backgroundColor: rowBg,
    borderTop,
    borderBottom: isLast ? `1px solid ${T.borderSoft}` : undefined,
  };

  return (
    <tr
      onClick={onClick}
      className="cursor-pointer transition active:brightness-95"
    >
      <td
        className="sticky left-0 z-[1] px-1.5 py-1.5"
        style={{
          ...cellStyle,
          borderRight: `1px solid ${T.borderSoft}`,
          maxWidth: 180,
        }}
      >
        <div className="flex items-center gap-1" style={{ paddingLeft: indent }}>
          {isDirty && (
            <span
              className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full"
              style={{ backgroundColor: T.warning }}
              title="Непубліковані зміни"
            />
          )}
          <span
            className="flex-shrink-0 tabular-nums"
            style={{ color: T.textMuted, fontWeight: 600, minWidth: 18 }}
          >
            {number}
          </span>
          <span
            className="min-w-0 flex-1 truncate"
            style={{ color: T.textPrimary, fontWeight }}
            title={displayName}
          >
            {displayName}
          </span>
        </div>
      </td>
      <td className="px-1 py-1.5 text-center" style={cellStyle}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void onCycleStatus();
          }}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full"
          style={{
            backgroundColor: STATUS_STYLE[node.status].bg,
            color: STATUS_STYLE[node.status].fg,
          }}
          title="Тап щоб змінити статус"
        >
          <StatusIcon size={11} />
        </button>
      </td>
      <td
        className="px-1.5 py-1.5 text-right tabular-nums"
        style={{ ...cellStyle, color: T.textSecondary }}
      >
        {planResult !== 0 ? formatCurrencyCompact(planResult) : "—"}
      </td>
      <td
        className="px-1.5 py-1.5 text-right tabular-nums"
        style={{
          ...cellStyle,
          color: factResult === 0 ? T.textMuted : factResult >= 0 ? T.success : T.danger,
        }}
      >
        {factResult !== 0 ? formatCurrencyCompact(factResult) : "—"}
      </td>
      <td
        className="px-1.5 py-1.5 text-right tabular-nums"
        style={{ ...cellStyle, color: T.textSecondary }}
      >
        {node.progress > 0 ? `${node.progress}%` : "—"}
      </td>
      <td
        className="px-1.5 py-1.5"
        style={{ ...cellStyle, color: T.textMuted }}
      >
        <span className="block truncate" style={{ maxWidth: 90 }}>
          {node.responsibleName ?? "—"}
        </span>
      </td>
    </tr>
  );
}
