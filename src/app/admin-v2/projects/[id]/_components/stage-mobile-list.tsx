"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  MoreVertical,
  Plus,
  Trash2,
  Pencil,
} from "lucide-react";
import type { StageStatus } from "@prisma/client";
import { STAGE_STATUS_LABELS, stageDisplayName } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";
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

const MAX_DEPTH_FOR_CHILDREN = 2;

function mul(a: number | null, b: number | null): number {
  if (a == null || b == null) return 0;
  return a * b;
}

export function StageMobileList({
  stages,
  selectedStageId,
  onStageClick,
  onInlineUpdate,
  onAddChild,
  onDelete,
  showHidden = false,
  dirtyStageIds,
}: StageMobileListProps) {
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

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
    <div className="flex flex-col gap-2">
      {visible.map((node) => (
        <StageCard
          key={node.id}
          node={node}
          isSelected={node.id === selectedStageId}
          isExpanded={expanded.has(node.id)}
          isDirty={dirtyStageIds?.has(node.id) ?? false}
          onToggle={() => toggle(node.id)}
          onClick={() => onStageClick(node.id)}
          onStatusChange={(s) => onInlineUpdate(node.id, { status: s })}
          onRename={(name) => onInlineUpdate(node.id, { customName: name })}
          onAddChild={() => onAddChild(node.id)}
          onDelete={() => onDelete(node.id)}
        />
      ))}
    </div>
  );
}

type StageCardProps = {
  node: TreeNode;
  isSelected: boolean;
  isExpanded: boolean;
  isDirty: boolean;
  onToggle: () => void;
  onClick: () => void;
  onStatusChange: (s: StageStatus) => Promise<void>;
  onRename: (name: string) => Promise<void>;
  onAddChild: () => Promise<void>;
  onDelete: () => Promise<void>;
};

function StageCard({
  node,
  isSelected,
  isExpanded,
  isDirty,
  onToggle,
  onClick,
  onStatusChange,
  onRename,
  onAddChild,
  onDelete,
}: StageCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const hasChildren = node.children.length > 0;
  const StatusIcon = STATUS_STYLE[node.status].icon;
  const displayName = stageDisplayName(node);

  // Plan/Fact totals (volume × price), with MANUAL "довезення" max() like StageTable
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
  const margin =
    planIncome > 0 ? Math.round((planResult / planIncome) * 100) : null;

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: Event) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    window.addEventListener("touchstart", handler);
    return () => {
      window.removeEventListener("mousedown", handler);
      window.removeEventListener("touchstart", handler);
    };
  }, [menuOpen]);

  const indent = 8 + node.depth * 14;
  const fontWeight = node.depth === 0 ? 600 : 500;

  return (
    <div
      className="relative rounded-lg border"
      style={{
        backgroundColor: isSelected ? T.accentPrimarySoft : T.panel,
        borderColor: isSelected ? T.borderAccent : T.borderSoft,
        borderLeft:
          node.depth > 0 ? `2px solid ${T.borderSoft}` : undefined,
      }}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex w-full flex-col gap-1.5 p-2.5 text-left"
        style={{ paddingLeft: indent }}
      >
        <div className="flex items-start gap-1.5">
          {hasChildren ? (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggle();
                }
              }}
              className="-ml-0.5 mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded hover:brightness-95"
              style={{ color: T.textMuted }}
              aria-label={isExpanded ? "Згорнути" : "Розгорнути"}
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
          ) : (
            <span className="w-5 flex-shrink-0" />
          )}

          {isDirty && (
            <span
              className="mt-1.5 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full"
              style={{ backgroundColor: T.warning }}
              title="Непубліковані зміни"
            />
          )}

          <span
            className="min-w-0 flex-1 truncate text-[13px] leading-tight"
            style={{ color: T.textPrimary, fontWeight }}
          >
            {displayName}
          </span>

          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }
            }}
            className="-mr-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded hover:brightness-95"
            style={{ color: T.textMuted }}
            aria-label="Дії"
          >
            <MoreVertical size={15} />
          </span>
        </div>

        <div
          className="flex items-center justify-between gap-2 text-[11px]"
          style={{ color: T.textMuted, paddingLeft: 22 }}
        >
          <span className="truncate">{node.responsibleName ?? "—"}</span>
          <span className="flex-shrink-0">
            {planResult !== 0 && margin !== null ? `Маржа ${margin}%` : ""}
          </span>
        </div>

        <div
          className="flex flex-wrap items-center gap-2 text-[11px]"
          style={{ paddingLeft: 22 }}
        >
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              const next = nextStatus(node.status);
              void onStatusChange(next);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                void onStatusChange(nextStatus(node.status));
              }
            }}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium"
            style={{
              backgroundColor: STATUS_STYLE[node.status].bg,
              color: STATUS_STYLE[node.status].fg,
            }}
            title="Тап щоб змінити статус"
          >
            <StatusIcon size={11} />
            {STAGE_STATUS_LABELS[node.status]}
          </span>
          {planExpense > 0 || planIncome > 0 ? (
            <span style={{ color: T.textSecondary }}>
              План:&nbsp;{formatCurrency(planIncome - planExpense)}
            </span>
          ) : null}
          {factExpense > 0 || factIncome > 0 ? (
            <span style={{ color: T.textSecondary }}>
              Факт:&nbsp;{formatCurrency(factIncome - factExpense)}
            </span>
          ) : null}
        </div>
      </button>

      {menuOpen && (
        <div
          ref={menuRef}
          className="absolute right-2 top-10 z-20 flex min-w-[180px] flex-col rounded-lg border shadow-lg"
          style={{
            backgroundColor: T.panel,
            borderColor: T.borderSoft,
          }}
        >
          <MenuItem
            icon={<Pencil size={13} />}
            label="Перейменувати"
            onClick={() => {
              const next = window.prompt(
                "Нова назва етапу:",
                node.customName ?? displayName,
              );
              if (next != null && next.trim() !== "") {
                void onRename(next.trim());
              }
              setMenuOpen(false);
            }}
          />
          {node.depth < MAX_DEPTH_FOR_CHILDREN && (
            <MenuItem
              icon={<Plus size={13} />}
              label="Додати підетап"
              onClick={() => {
                void onAddChild();
                setMenuOpen(false);
              }}
            />
          )}
          <MenuItem
            icon={<Trash2 size={13} />}
            label="Видалити"
            danger
            onClick={() => {
              if (
                window.confirm(`Видалити етап «${displayName}»?`)
              ) {
                void onDelete();
              }
              setMenuOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 text-left text-[12px] transition hover:brightness-95"
      style={{
        color: danger ? T.danger : T.textPrimary,
        backgroundColor: T.panel,
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function nextStatus(s: StageStatus): StageStatus {
  if (s === "PENDING") return "IN_PROGRESS";
  if (s === "IN_PROGRESS") return "COMPLETED";
  return "PENDING";
}
