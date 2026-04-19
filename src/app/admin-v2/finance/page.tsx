"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Loader2,
  Calculator,
  ArrowRight,
  FileText,
  AlertCircle,
  FolderPlus,
  FolderInput,
} from "lucide-react";
import { ESTIMATE_STATUS_LABELS } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { EstimateStatus } from "@prisma/client";
import { FolderCard } from "@/components/folders/FolderCard";
import { FolderBreadcrumb } from "@/components/folders/FolderBreadcrumb";
import { CreateFolderDialog } from "@/components/folders/CreateFolderDialog";
import { MoveToFolderDialog } from "@/components/folders/MoveToFolderDialog";
import {
  useFolders,
  useFolderDetail,
  useCreateFolder,
  useUpdateFolder,
  useDeleteFolder,
  useMoveItems,
} from "@/hooks/useFolders";

type Estimate = {
  id: string;
  number: string;
  title: string;
  status: string;
  totalAmount: number;
  finalAmount: number;
  project: { title: string; client: { name: string } };
};

const FILTERS = [
  { value: "FINANCE_REVIEW", label: "На розгляді" },
  { value: "APPROVED", label: "Затверджені" },
  { value: "", label: "Всі" },
];

export default function AdminV2FinancePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const folderId = searchParams.get("folderId") ?? null;

  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("FINANCE_REVIEW");
  const [showCreate, setShowCreate] = useState(false);
  const [moveEstimateId, setMoveEstimateId] = useState<string | null>(null);

  const { data: folders = [] } = useFolders("ESTIMATE", folderId);
  const { data: detailData } = useFolderDetail(folderId);
  const breadcrumbs = detailData?.breadcrumbs ?? [];

  const createMutation = useCreateFolder();
  const updateMutation = useUpdateFolder();
  const deleteMutation = useDeleteFolder();
  const moveMutation = useMoveItems();

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter) params.set("status", filter);
    if (folderId) params.set("folderId", folderId);
    fetch(`/api/admin/estimates?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setEstimates(data.data || []);
        setLoading(false);
      });
  }, [filter, folderId]);

  const totalReview = estimates.filter((e) => e.status === "FINANCE_REVIEW").length;
  const totalApproved = estimates.filter((e) => e.status === "APPROVED").length;
  const totalSum = estimates.reduce((sum, e) => sum + Number(e.finalAmount || 0), 0);

  return (
    <div className="flex flex-col gap-8">
      {/* Hero */}
      <section className="flex flex-col gap-2">
        <span
          className="text-[11px] font-bold tracking-wider"
          style={{ color: T.textMuted }}
        >
          ФІНАНСОВИЙ ОБЛІК
        </span>
        <h1
          className="text-3xl md:text-4xl font-bold tracking-tight"
          style={{ color: T.textPrimary }}
        >
          Фінансовий огляд кошторисів
        </h1>
        <p className="text-[15px]" style={{ color: T.textSecondary }}>
          Налаштуйте рентабельність, податки та логістику для кожного кошторису
        </p>
      </section>

      {/* KPI strip */}
      <section className="grid grid-cols-3 gap-3 sm:gap-4">
        <KpiCard label="НА РОЗГЛЯДІ" value={String(totalReview)} accent={T.warning} />
        <KpiCard label="ЗАТВЕРДЖЕНІ" value={String(totalApproved)} accent={T.success} />
        <KpiCard
          label="ЗАГАЛЬНА СУМА"
          value={formatCurrency(totalSum)}
          accent={T.accentPrimary}
        />
      </section>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = filter === f.value;
          return (
            <button
              key={f.value || "all"}
              onClick={() => setFilter(f.value)}
              className="rounded-full px-4 py-2 text-xs font-semibold transition"
              style={{
                backgroundColor: active ? T.accentPrimary : T.panelElevated,
                color: active ? "#FFFFFF" : T.textSecondary,
                border: `1px solid ${active ? T.accentPrimary : T.borderStrong}`,
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Folders */}
      {breadcrumbs.length > 0 && (
        <FolderBreadcrumb
          breadcrumbs={breadcrumbs}
          basePath="/admin-v2/finance"
          rootLabel="Усі кошториси"
        />
      )}

      {folders.length > 0 && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {folders.map((f) => (
            <FolderCard
              key={f.id}
              folder={f}
              href={`/admin-v2/finance?folderId=${f.id}`}
              onRename={(id, name) =>
                updateMutation.mutate({ id, name }, { onSuccess: () => router.refresh() })
              }
              onDelete={(id) => {
                if (!confirm("Видалити папку? Кошториси повернуться в корінь.")) return;
                deleteMutation.mutate(id, { onSuccess: () => router.refresh() });
              }}
            />
          ))}
        </div>
      )}

      <button
        onClick={() => setShowCreate(true)}
        className="flex items-center gap-2 text-[12px] font-semibold transition hover:opacity-80"
        style={{ color: T.accentPrimary }}
      >
        <FolderPlus size={14} /> Нова папка
      </button>

      <CreateFolderDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSubmit={(data) => {
          createMutation.mutate(
            { domain: "ESTIMATE", name: data.name, parentId: folderId, color: data.color },
            { onSuccess: () => { setShowCreate(false); router.refresh(); } },
          );
        }}
        loading={createMutation.isPending}
      />

      <MoveToFolderDialog
        open={!!moveEstimateId}
        onClose={() => setMoveEstimateId(null)}
        domain="ESTIMATE"
        currentFolderId={folderId}
        itemCount={1}
        loading={moveMutation.isPending}
        onMove={(targetFolderId) => {
          if (!moveEstimateId) return;
          moveMutation.mutate(
            { domain: "ESTIMATE", itemIds: [moveEstimateId], targetFolderId },
            { onSuccess: () => { setMoveEstimateId(null); router.refresh(); window.location.reload(); } },
          );
        }}
      />

      {/* List */}
      <section
        className="overflow-hidden rounded-2xl"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        {loading ? (
          <div
            className="flex items-center justify-center gap-2 py-12 text-sm"
            style={{ color: T.textMuted }}
          >
            <Loader2 size={16} className="animate-spin" /> Завантажуємо…
          </div>
        ) : estimates.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <AlertCircle size={32} style={{ color: T.textMuted }} />
            <span className="text-[14px] font-semibold" style={{ color: T.textPrimary }}>
              Немає кошторисів
            </span>
            <span className="text-[12px]" style={{ color: T.textMuted }}>
              За поточним фільтром нічого не знайдено
            </span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr style={{ backgroundColor: T.panelSoft }}>
                  <Th>НОМЕР</Th>
                  <Th>НАЗВА</Th>
                  <Th>ПРОЄКТ / КЛІЄНТ</Th>
                  <Th>СТАТУС</Th>
                  <Th align="right">БАЗОВА СУМА</Th>
                  <Th align="right">ФІНАЛЬНА</Th>
                  <Th align="right">ДІЯ</Th>
                </tr>
              </thead>
              <tbody>
                {estimates.map((e, i) => (
                  <tr
                    key={e.id}
                    style={{
                      backgroundColor: i % 2 === 1 ? T.panelSoft : "transparent",
                      borderTop: `1px solid ${T.borderSoft}`,
                    }}
                  >
                    <td
                      className="px-4 py-3.5 text-[12px] font-medium"
                      style={{ color: T.textMuted }}
                    >
                      {e.number}
                    </td>
                    <td
                      className="px-4 py-3.5 text-[13px] font-semibold max-w-md truncate"
                      style={{ color: T.textPrimary }}
                    >
                      {e.title}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-[12px] font-medium" style={{ color: T.textSecondary }}>
                        {e.project?.title}
                      </div>
                      <div className="text-[10px]" style={{ color: T.textMuted }}>
                        {e.project?.client?.name}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={e.status as EstimateStatus} />
                    </td>
                    <td
                      className="px-4 py-3.5 text-right text-[12px]"
                      style={{ color: T.textSecondary }}
                    >
                      {formatCurrency(Number(e.totalAmount))}
                    </td>
                    <td
                      className="px-4 py-3.5 text-right text-[13px] font-semibold"
                      style={{ color: e.finalAmount > 0 ? T.success : T.textMuted }}
                    >
                      {e.finalAmount > 0 ? formatCurrency(Number(e.finalAmount)) : "—"}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setMoveEstimateId(e.id)}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold transition hover:opacity-80"
                          style={{
                            backgroundColor: T.panelElevated,
                            color: T.textMuted,
                          }}
                          title="Перемістити в папку"
                        >
                          <FolderInput size={11} />
                        </button>
                        <Link
                          href={`/admin-v2/finance/configure/${e.id}`}
                          className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-semibold"
                          style={{
                            backgroundColor: T.accentPrimarySoft,
                            color: T.accentPrimary,
                            border: `1px solid ${T.accentPrimary}`,
                          }}
                        >
                          {e.status === "FINANCE_REVIEW" ? "Налаштувати" : "Переглянути"}
                          <ArrowRight size={11} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Templates link */}
      <Link
        href="/admin-v2/finance/templates"
        className="flex items-center justify-between rounded-2xl p-5 transition hover:brightness-[0.97]"
        style={{
          backgroundColor: T.panelElevated,
          border: `1px solid ${T.borderAccent}`,
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: T.accentPrimarySoft }}
          >
            <FileText size={20} style={{ color: T.accentPrimary }} />
          </div>
          <div className="flex flex-col gap-0">
            <span className="text-sm font-bold" style={{ color: T.textPrimary }}>
              Шаблони фінансових налаштувань
            </span>
            <span className="text-[11px]" style={{ color: T.textMuted }}>
              Швидко застосовуйте типові комбінації податків і рентабельності
            </span>
          </div>
        </div>
        <ArrowRight size={18} style={{ color: T.accentPrimary }} />
      </Link>
    </div>
  );
}

function KpiCard({
  label,
  value,
  accent = T.textPrimary,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div
      className="flex flex-col gap-0.5 rounded-xl sm:rounded-2xl p-3 sm:p-5 min-w-0 overflow-hidden"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <span className="text-[9px] sm:text-[10px] font-bold tracking-wider truncate" style={{ color: T.textMuted }}>
        {label}
      </span>
      <span className="text-lg sm:text-2xl font-bold mt-0.5 sm:mt-1 truncate" style={{ color: accent }}>
        {value}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: EstimateStatus }) {
  const label = ESTIMATE_STATUS_LABELS[status] ?? status;
  const colors: Record<string, { bg: string; fg: string }> = {
    DRAFT: { bg: T.panelElevated, fg: T.textMuted },
    SENT: { bg: T.accentPrimarySoft, fg: T.accentPrimary },
    APPROVED: { bg: T.successSoft, fg: T.success },
    REJECTED: { bg: T.dangerSoft, fg: T.danger },
    REVISION: { bg: T.warningSoft, fg: T.warning },
    ENGINEER_REVIEW: { bg: T.warningSoft, fg: T.warning },
    FINANCE_REVIEW: { bg: T.warningSoft, fg: T.warning },
  };
  const c = colors[status] ?? colors.DRAFT;
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide"
      style={{ backgroundColor: c.bg, color: c.fg }}
    >
      {label}
    </span>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className="px-4 py-3 text-[10px] font-bold tracking-wider"
      style={{ color: T.textMuted, textAlign: align }}
    >
      {children}
    </th>
  );
}
