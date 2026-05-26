"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Wallet } from "lucide-react";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { STAGE_LABELS } from "@/lib/constants";
import { StatusBadge } from "./projects-cards";
import { FolderCard } from "@/components/folders/FolderCard";
import type { FolderItem } from "@/hooks/useFolders";
import type { ProjectRow } from "./projects-types";

type DebtSummary = { outstanding: number; supplierCount: number };

function useSupplierDebtsSummary(projectIds: string[]): Map<string, DebtSummary> {
  const [data, setData] = useState<Map<string, DebtSummary>>(new Map());

  useEffect(() => {
    if (projectIds.length === 0) return;
    const ids = projectIds.join(",");
    const ctrl = new AbortController();
    fetch(`/api/admin/projects/supplier-debts-summary?ids=${ids}`, {
      cache: "no-store",
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j?.data) return;
        const m = new Map<string, DebtSummary>();
        for (const [k, v] of Object.entries(j.data as Record<string, DebtSummary>)) {
          m.set(k, v);
        }
        setData(m);
      })
      .catch(() => {});
    return () => ctrl.abort();
    // join, бо порівняння Array<string> через === завжди false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectIds.join(",")]);

  return data;
}

export function ProjectsTable({
  projects,
  folders = [],
  isSuperAdmin,
  onRenameFolder,
  onDeleteFolder,
  onMoveFolder,
}: {
  projects: ProjectRow[];
  folders?: FolderItem[];
  isSuperAdmin?: boolean;
  onRenameFolder?: (id: string, name: string) => void;
  onDeleteFolder?: (id: string) => void;
  onMoveFolder?: (id: string) => void;
}) {
  const router = useRouter();
  const debtMap = useSupplierDebtsSummary(projects.map((p) => p.id));

  const columns: Column<ProjectRow>[] = [
    {
      key: "title",
      label: "Назва",
      sortable: true,
      sortValue: (p) => p.title.toLowerCase(),
      render: (p) => (
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md overflow-hidden"
            style={{ backgroundColor: T.panelElevated }}
          >
            {p.extra.coverImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.extra.coverImage} alt="" className="h-full w-full object-cover" />
            ) : (
              <Building2 size={16} style={{ color: T.textMuted }} />
            )}
          </div>
          <span className="font-medium truncate" style={{ color: T.textPrimary }}>
            {p.title}
          </span>
        </div>
      ),
    },
    {
      key: "client",
      label: "Клієнт",
      sortable: true,
      sortValue: (p) => p.client.name.toLowerCase(),
      hideOnMobile: true,
      render: (p) => <span style={{ color: T.textSecondary }}>{p.client.name}</span>,
    },
    {
      key: "manager",
      label: "Менеджер",
      sortable: true,
      sortValue: (p) => (p.manager?.name ?? "").toLowerCase(),
      hideOnMobile: true,
      render: (p) => (
        <span style={{ color: T.textSecondary }}>{p.manager?.name ?? "—"}</span>
      ),
    },
    {
      key: "status",
      label: "Статус",
      sortable: true,
      sortValue: (p) => p.status,
      render: (p) => <StatusBadge status={p.status} />,
    },
    {
      key: "stage",
      label: "Етап",
      sortable: true,
      sortValue: (p) => p.stageProgress,
      hideOnMobile: true,
      render: (p) => {
        const color =
          p.stageProgress >= 80
            ? T.success
            : p.stageProgress >= 30
              ? T.accentPrimary
              : T.warning;
        return (
        <div className="flex items-center gap-2 min-w-[140px]">
          <div
            className="h-1.5 flex-1 overflow-hidden rounded-full"
            style={{ backgroundColor: T.panelSoft }}
          >
            <div
              className="h-full rounded-full progress-fill-grow"
              style={{
                width: `${p.stageProgress}%`,
                backgroundColor: color,
                boxShadow: `0 0 8px ${color}55`,
              }}
            />
          </div>
          <span className="text-[11px] w-8 text-right" style={{ color: T.textMuted }}>
            {p.stageProgress}%
          </span>
        </div>
        );
      },
    },
    {
      key: "budget",
      label: "Бюджет",
      sortable: true,
      sortValue: (p) => p.totalBudget,
      className: "text-right",
      render: (p) => (
        <span className="tabular-nums" style={{ color: T.textPrimary }}>
          {formatCurrency(p.totalBudget)}
        </span>
      ),
    },
    {
      key: "paid",
      label: "Оплачено",
      sortable: true,
      sortValue: (p) => (p.totalBudget > 0 ? p.totalPaid / p.totalBudget : 0),
      hideOnMobile: true,
      className: "text-right",
      render: (p) => {
        const pct = p.totalBudget > 0 ? Math.round((p.totalPaid / p.totalBudget) * 100) : 0;
        return (
          <div className="flex flex-col items-end gap-0.5">
            <span className="tabular-nums text-[13px]" style={{ color: T.textPrimary }}>
              {formatCurrency(p.totalPaid)}
            </span>
            <span className="tabular-nums text-[10px]" style={{ color: T.textMuted }}>
              {pct}%
            </span>
          </div>
        );
      },
    },
    {
      key: "supplierDebt",
      label: "Борг постач.",
      sortable: true,
      sortValue: (p) => debtMap.get(p.id)?.outstanding ?? 0,
      hideOnMobile: true,
      className: "text-right",
      render: (p) => {
        const d = debtMap.get(p.id);
        const outstanding = d?.outstanding ?? 0;
        if (outstanding <= 0) {
          return (
            <span className="text-[11px]" style={{ color: T.textMuted }}>
              —
            </span>
          );
        }
        return (
          <Link
            href={`/admin-v2/projects/${p.id}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex flex-col items-end gap-0 hover:underline"
            title={`${d?.supplierCount ?? 0} постачальник(и)`}
          >
            <span
              className="tabular-nums text-[13px] font-semibold inline-flex items-center gap-1"
              style={{ color: T.danger }}
            >
              <Wallet size={11} /> {formatCurrency(outstanding)}
            </span>
            <span className="text-[10px]" style={{ color: T.textMuted }}>
              {d?.supplierCount ?? 0} постач.
            </span>
          </Link>
        );
      },
    },
    {
      key: "deadline",
      label: "Дедлайн",
      sortable: true,
      sortValue: (p) => p.extra.expectedEndDate?.getTime() ?? Number.MAX_SAFE_INTEGER,
      hideOnMobile: true,
      render: (p) => (
        <span style={{ color: T.textSecondary }}>
          {p.extra.expectedEndDate ? formatDateShort(p.extra.expectedEndDate) : "—"}
        </span>
      ),
    },
    {
      key: "team",
      label: "Команда",
      render: (p) => (
        <span style={{ color: T.textSecondary }}>
          {p.team.length}
          <span className="ml-1 text-[10px]" style={{ color: T.textMuted }}>
            {p.team.length === 1 ? "учасник" : "учасн."}
          </span>
        </span>
      ),
    },
  ];

  const rowClassName = (p: ProjectRow): string | undefined => {
    if (p.isTestProject) return "opacity-55";
    if (p.status === "CANCELLED") return "opacity-60";
    return undefined;
  };

  return (
    <div className="flex flex-col gap-3">
      {folders.length > 0 && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5">
          {folders.map((f) => (
            <FolderCard
              key={f.id}
              folder={f}
              href={`/admin-v2/projects?folderId=${f.id}`}
              onRename={onRenameFolder}
              onDelete={onDeleteFolder}
              onMove={onMoveFolder}
              bypassLocks={isSuperAdmin}
            />
          ))}
        </div>
      )}
    <DataTable
      data={projects}
      columns={columns}
      searchable
      stickyHeader
      searchPlaceholder="Пошук проєктів..."
      searchFn={(p, q) =>
        p.title.toLowerCase().includes(q) ||
        p.client.name.toLowerCase().includes(q) ||
        (p.manager?.name.toLowerCase().includes(q) ?? false) ||
        (p.address?.toLowerCase().includes(q) ?? false)
      }
      emptyMessage="Немає проєктів у цій папці"
      onRowClick={(p) => router.push(`/admin-v2/projects/${p.id}`)}
      rowClassName={rowClassName}
      mobileCardRenderer={(p) => (
        <Link href={`/admin-v2/projects/${p.id}`} className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold" style={{ color: T.textPrimary }}>
              {p.title}
            </span>
            <div className="flex items-center gap-1.5">
              {p.isTestProject && (
                <span
                  className="rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wide"
                  style={{
                    backgroundColor: T.warningSoft,
                    color: T.warning,
                    border: `1px dashed ${T.warning}`,
                  }}
                >
                  ТЕСТ
                </span>
              )}
              <StatusBadge status={p.status} />
            </div>
          </div>
          <div className="flex items-center justify-between text-[12px]">
            <span style={{ color: T.textSecondary }}>{p.client.name}</span>
            <span className="tabular-nums" style={{ color: T.textPrimary }}>
              {formatCurrency(p.totalBudget)}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span style={{ color: T.textMuted }}>{STAGE_LABELS[p.currentStage]}</span>
            <span style={{ color: T.textMuted }}>
              {p.extra.expectedEndDate ? formatDateShort(p.extra.expectedEndDate) : "—"}
            </span>
          </div>
        </Link>
      )}
    />
    </div>
  );
}
