"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Check, Clock, Circle, EyeOff } from "lucide-react";
import { stageDisplayName, STAGE_STATUS_LABELS } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { ProjectStage, StageStatus } from "@prisma/client";

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
  planVolume: number | null;
  factVolume: number | null;
  planExpense: number;
  factExpense: number;
  planIncome: number;
  factIncome: number;
};

type StageTableProps = {
  stages: StageRow[];
  selectedStageId: string | null;
  onStageClick: (stageId: string) => void;
  onInlineUpdate: (
    stageId: string,
    data: { status?: StageStatus; responsibleUserId?: string | null },
  ) => Promise<void>;
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
      const parent = byId.get(node.parentStageId)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRec = (arr: TreeNode[]) => {
    arr.sort((a, b) => a.sortOrder - b.sortOrder);
    arr.forEach((n) => {
      n.depth = arr === roots ? 0 : n.depth;
      sortRec(n.children);
    });
  };
  sortRec(roots);
  // Recompute depth top-down (sortRec не знає parent.depth для дітей коли був скинутий).
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
      if (n.children.length > 0 && expanded.has(n.id)) {
        walk(n.children);
      }
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
  const [editing, setEditing] = useState<{
    stageId: string;
    field: "status" | "responsible";
  } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const tree = useMemo(() => {
    const filtered = showHidden ? stages : stages.filter((s) => !s.isHidden);
    return buildTree(filtered);
  }, [stages, showHidden]);

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    // По дефолту — всі parents розгорнуті.
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
        style={{ minWidth: 1280 }}
      >
        <thead>
          <tr style={{ backgroundColor: T.panelSoft }}>
            <Th sticky width={280}>
              Назва
            </Th>
            <Th width={140}>Відповідальний</Th>
            <Th width={110}>Статус</Th>
            <Th width={70}>Од.</Th>
            <ThGroup colSpan={5} bg={T.accentPrimarySoft}>
              План
            </ThGroup>
            <ThGroup colSpan={4} bg={T.successSoft}>
              Факт
            </ThGroup>
          </tr>
          <tr style={{ backgroundColor: T.panelSoft }}>
            <Th sticky />
            <Th />
            <Th />
            <Th />
            <ThSub>Обсяг</ThSub>
            <ThSub>Бюджет</ThSub>
            <ThSub>Витрати</ThSub>
            <ThSub>Надходження</ThSub>
            <ThSub>Результат</ThSub>
            <ThSub>Обсяг</ThSub>
            <ThSub>Витрати</ThSub>
            <ThSub>Надходження</ThSub>
            <ThSub>Результат</ThSub>
          </tr>
        </thead>
        <tbody>
          {visible.map((node) => {
            const hasChildren = node.children.length > 0;
            const isExpanded = expanded.has(node.id);
            const isSelected = node.id === selectedStageId;
            const planResult = (node.planIncome ?? 0) - (node.planExpense ?? 0);
            const factResult = (node.factIncome ?? 0) - (node.factExpense ?? 0);
            const StatusIcon = STATUS_STYLE[node.status].icon;
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
                        {isExpanded ? (
                          <ChevronDown size={12} />
                        ) : (
                          <ChevronRight size={12} />
                        )}
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
                    {node.isHidden && (
                      <EyeOff size={11} style={{ color: T.textMuted }} />
                    )}
                  </div>
                </Td>
                <Td>
                  {editing?.stageId === node.id && editing.field === "responsible" ? (
                    <select
                      autoFocus
                      defaultValue={node.responsibleUserId ?? ""}
                      disabled={savingId === node.id}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={() => setEditing(null)}
                      onChange={async (e) => {
                        const value = e.target.value || null;
                        if (value !== node.responsibleUserId) {
                          setSavingId(node.id);
                          await onInlineUpdate(node.id, { responsibleUserId: value });
                          setSavingId(null);
                        }
                        setEditing(null);
                      }}
                      className="w-full rounded border px-1.5 py-0.5 text-[11px] outline-none"
                      style={{
                        backgroundColor: T.panel,
                        borderColor: T.borderAccent,
                        color: T.textPrimary,
                      }}
                    >
                      <option value="">—</option>
                      {candidates.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing({ stageId: node.id, field: "responsible" });
                      }}
                      className="text-left transition hover:underline"
                      style={{ color: node.responsibleName ? T.textPrimary : T.textMuted }}
                    >
                      {node.responsibleName ?? "—"}
                    </button>
                  )}
                </Td>
                <Td>
                  {editing?.stageId === node.id && editing.field === "status" ? (
                    <select
                      autoFocus
                      defaultValue={node.status}
                      disabled={savingId === node.id}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={() => setEditing(null)}
                      onChange={async (e) => {
                        const value = e.target.value as StageStatus;
                        if (value !== node.status) {
                          setSavingId(node.id);
                          await onInlineUpdate(node.id, { status: value });
                          setSavingId(null);
                        }
                        setEditing(null);
                      }}
                      className="rounded border px-1.5 py-0.5 text-[11px] outline-none"
                      style={{
                        backgroundColor: T.panel,
                        borderColor: T.borderAccent,
                        color: T.textPrimary,
                      }}
                    >
                      {(Object.keys(STAGE_STATUS_LABELS) as StageStatus[]).map((s) => (
                        <option key={s} value={s}>
                          {STAGE_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing({ stageId: node.id, field: "status" });
                      }}
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition hover:brightness-95"
                      style={{
                        backgroundColor: STATUS_STYLE[node.status].bg,
                        color: STATUS_STYLE[node.status].fg,
                      }}
                    >
                      <StatusIcon size={10} />
                      {STAGE_STATUS_LABELS[node.status]}
                    </button>
                  )}
                </Td>
                <Td>
                  <span style={{ color: node.unit ? T.textPrimary : T.textMuted }}>
                    {node.unit ?? "—"}
                  </span>
                </Td>
                <Td align="right">{volumeOrDash(node.planVolume)}</Td>
                <Td align="right">{moneyOrDash(node.allocatedBudget)}</Td>
                <Td align="right">{moneyOrDash(node.planExpense)}</Td>
                <Td align="right">{moneyOrDash(node.planIncome)}</Td>
                <Td align="right" accent={planResult >= 0 ? T.success : T.danger}>
                  {moneyOrDash(planResult)}
                </Td>
                <Td align="right">{volumeOrDash(node.factVolume)}</Td>
                <Td align="right">{moneyOrDash(node.factExpense)}</Td>
                <Td align="right">{moneyOrDash(node.factIncome)}</Td>
                <Td align="right" accent={factResult >= 0 ? T.success : T.danger}>
                  {moneyOrDash(factResult)}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function moneyOrDash(value: number | null | undefined) {
  if (value === null || value === undefined || value === 0) {
    return <span style={{ color: T.textMuted }}>—</span>;
  }
  return formatCurrency(value);
}

function volumeOrDash(value: number | null | undefined) {
  if (value === null || value === undefined || value === 0) {
    return <span style={{ color: T.textMuted }}>—</span>;
  }
  // Без зайвих десяткових нулів — 12.5 або 100, не 100.000.
  return new Intl.NumberFormat("uk-UA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value);
}

function Th({
  children,
  width,
  sticky,
}: {
  children?: React.ReactNode;
  width?: number;
  sticky?: boolean;
}) {
  return (
    <th
      className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider"
      style={{
        color: T.textMuted,
        width,
        position: sticky ? "sticky" : undefined,
        left: sticky ? 0 : undefined,
        backgroundColor: sticky ? T.panelSoft : undefined,
        zIndex: sticky ? 2 : undefined,
        borderBottom: `1px solid ${T.borderSoft}`,
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
  align?: "left" | "right";
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
