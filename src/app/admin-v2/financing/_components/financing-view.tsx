"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Download,
  Loader2,
  Search,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Wallet,
  Filter,
  CircleDot,
  LayoutDashboard,
  List,
  CalendarDays,
  Archive,
  Plus,
  FolderPlus,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils";
import { FINANCE_CATEGORIES } from "@/lib/constants";
import { EntryFormModal } from "./entry-form-modal";
import { QuadrantCard } from "./quadrant-card";
import { SummaryStat, formatPercent } from "./summary-stat";
import { FilterSelect, FilterInput } from "./filter-controls";
import { useFinancingData } from "./use-financing-data";
import { TabOverview } from "./tab-overview";
import { TabOperations } from "./tab-operations";
import { TabCalendar } from "./tab-calendar";
import { TabArchive } from "./tab-archive";
import { FilterBar } from "./filter-bar";
import type { ProjectOption, UserOption } from "./types";
import { FolderCard } from "@/components/folders/FolderCard";
import { FolderBreadcrumb } from "@/components/folders/FolderBreadcrumb";
import { CreateFolderDialog } from "@/components/folders/CreateFolderDialog";
import { MoveToFolderDialog } from "@/components/folders/MoveToFolderDialog";
import { ExpandableBlockCard } from "@/components/folders/ExpandableBlockCard";
import {
  useFolders,
  useFolderDetail,
  useCreateFolder,
  useUpdateFolder,
  useDeleteFolder,
  useMoveItems,
} from "@/hooks/useFolders";
import type { FolderItem } from "@/hooks/useFolders";

export type { FinanceEntryDTO, FinanceSummaryDTO, ProjectOption } from "./types";

const TABS = [
  { key: "overview", label: "Огляд", shortLabel: "Огляд", icon: LayoutDashboard },
  { key: "operations", label: "Операції", shortLabel: "Операції", icon: List },
  { key: "calendar", label: "Платіжний календар", shortLabel: "Календар", icon: CalendarDays },
  { key: "archive", label: "Архів", shortLabel: "Архів", icon: Archive },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function FinancingView({
  scope,
  projects,
  users = [],
  currentUserId,
  currentUserName,
}: {
  scope?: { id: string; title: string };
  projects: ProjectOption[];
  users?: UserOption[];
  currentUserId: string;
  currentUserName: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const folderId = scope ? null : (searchParams.get("folderId") ?? null);

  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);

  const { data: folders = [] } = useFolders("FINANCE", folderId);
  const { data: detailData } = useFolderDetail(folderId);
  const folderBreadcrumbs = detailData?.breadcrumbs ?? [];

  const isRootView = !scope && !folderId;
  const systemBlocks = isRootView ? folders.filter((f) => f.isSystem) : [];
  const nonSystemFolders = isRootView ? folders.filter((f) => !f.isSystem) : folders;

  const [moveEntryId, setMoveEntryId] = useState<string | null>(null);
  const [createFolderParentId, setCreateFolderParentId] = useState<string | null>(null);

  const createFolderMutation = useCreateFolder();
  const updateFolderMutation = useUpdateFolder();
  const deleteFolderMutation = useDeleteFolder();
  const moveItemsMutation = useMoveItems();

  const handleRenameFolder = (id: string, name: string) =>
    updateFolderMutation.mutate({ id, name }, { onSuccess: () => router.refresh() });

  const handleDeleteFolder = (id: string) => {
    if (!confirm("Видалити папку? Записи повернуться в корінь.")) return;
    deleteFolderMutation.mutate(id, { onSuccess: () => router.refresh() });
  };

  const data = useFinancingData({ scope, folderId });

  const {
    entries,
    summary,
    loading,
    error,
    exporting,
    filters,
    setFilters,
    resetFilters,
    loadData,
    handleSave,
    handleStatusChange,
    handleArchive,
    handleDelete,
    handleExport,
    editing,
    setEditing,
    createPreset,
    setCreatePreset,
    quadrantEntries,
  } = data;

  const planBalance = summary.plan.income.sum - summary.plan.expense.sum;
  const factBalance = summary.balance;

  const quickAddPresets = [
    { label: "Факт Витрата", kind: "FACT" as const, type: "EXPENSE" as const, color: T.danger },
    { label: "Факт Дохід", kind: "FACT" as const, type: "INCOME" as const, color: T.success },
    { label: "План Витрата", kind: "PLAN" as const, type: "EXPENSE" as const, color: T.warning },
    { label: "План Дохід", kind: "PLAN" as const, type: "INCOME" as const, color: T.accentPrimary },
  ];

  return (
    <div className="flex flex-col gap-4 sm:gap-6 pb-20 sm:pb-0">
      {/* Finance Folders */}
      {!scope && (
        <>
          {folderBreadcrumbs.length > 0 && (
            <FolderBreadcrumb
              breadcrumbs={folderBreadcrumbs}
              basePath="/admin-v2/financing"
              rootLabel="Усі фінанси"
            />
          )}

          {/* Root view: structural blocks (expandable) */}
          {isRootView && systemBlocks.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
              {systemBlocks.map((block) => (
                <ExpandableBlockCard
                  key={block.id}
                  folder={block}
                  basePath="/admin-v2/financing"
                  onCreateChildFolder={(parentId) => {
                    setCreateFolderParentId(parentId);
                    setShowCreateFolder(true);
                  }}
                  onCreateEntry={(blockId) =>
                    setCreatePreset({
                      kind: "FACT",
                      type: "EXPENSE",
                      folderId: blockId,
                      folderName: block.name,
                    })
                  }
                  onRenameChild={handleRenameFolder}
                  onDeleteChild={handleDeleteFolder}
                />
              ))}
            </div>
          )}

          {/* User-created folders grid */}
          {nonSystemFolders.length > 0 && (
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              {nonSystemFolders.map((f: FolderItem) => (
                <FolderCard
                  key={f.id}
                  folder={f}
                  href={`/admin-v2/financing?folderId=${f.id}`}
                  showFinanceIndicators
                  onRename={handleRenameFolder}
                  onDelete={handleDeleteFolder}
                />
              ))}
            </div>
          )}

          <button
            onClick={() => {
              setCreateFolderParentId(folderId);
              setShowCreateFolder(true);
            }}
            className="flex items-center gap-2 text-[12px] font-semibold transition hover:opacity-80 self-start"
            style={{ color: T.accentPrimary }}
          >
            <FolderPlus size={14} /> Нова папка
          </button>

          <CreateFolderDialog
            open={showCreateFolder}
            onClose={() => {
              setShowCreateFolder(false);
              setCreateFolderParentId(null);
            }}
            onSubmit={(d) => {
              createFolderMutation.mutate(
                {
                  domain: "FINANCE",
                  name: d.name,
                  parentId: createFolderParentId ?? folderId,
                  color: d.color,
                },
                {
                  onSuccess: () => {
                    setShowCreateFolder(false);
                    setCreateFolderParentId(null);
                    router.refresh();
                  },
                },
              );
            }}
            loading={createFolderMutation.isPending}
          />
        </>
      )}

      {/* Hero — global */}
      {!scope && (
        <section className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1 min-w-0">
              <h1
                className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight"
                style={{ color: T.textPrimary }}
              >
                Фінансування
              </h1>
              <p className="text-[12px] sm:text-[13px] hidden sm:block" style={{ color: T.textSecondary }}>
                Журнал планових і фактичних грошових операцій
              </p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={handleExport}
                disabled={exporting || loading}
                className="flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-semibold disabled:opacity-50"
                style={{
                  backgroundColor: T.panelElevated,
                  color: T.textPrimary,
                  border: `1px solid ${T.borderStrong}`,
                }}
              >
                {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                <span className="hidden sm:inline">Excel</span>
              </button>
            </div>
          </div>

          {/* Quick add: 2x2 grid on mobile, row on desktop */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
            {quickAddPresets.map((p) => (
              <button
                key={`${p.kind}:${p.type}`}
                onClick={() => setCreatePreset({ kind: p.kind, type: p.type })}
                className="flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[11px] sm:text-xs font-bold text-white transition hover:brightness-110"
                style={{ backgroundColor: p.color }}
              >
                <Plus size={12} />
                {p.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Hero — project scoped */}
      {scope && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold truncate" style={{ color: T.textPrimary }}>
                Фінансування
              </h2>
              <p className="text-[12px] truncate" style={{ color: T.textMuted }}>
                {scope.title}
              </p>
            </div>
            <button
              onClick={handleExport}
              disabled={exporting || loading}
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold disabled:opacity-50 flex-shrink-0"
              style={{
                backgroundColor: T.panelElevated,
                color: T.textPrimary,
                border: `1px solid ${T.borderStrong}`,
              }}
            >
              {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              <span className="hidden sm:inline">Excel</span>
            </button>
          </div>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
            {quickAddPresets.map((p) => (
              <button
                key={`${p.kind}:${p.type}`}
                onClick={() => setCreatePreset({ kind: p.kind, type: p.type })}
                className="flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-[10px] sm:text-xs font-bold text-white transition hover:brightness-110"
                style={{ backgroundColor: p.color }}
              >
                <Plus size={11} />
                {p.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Tabs — horizontal scroll on mobile */}
      <nav
        className="flex gap-1 overflow-x-auto rounded-xl p-1 -mx-1 px-1 scrollbar-none"
        style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}` }}
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.key;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 sm:px-4 py-2 sm:py-2.5 text-[12px] sm:text-[13px] font-semibold transition flex-shrink-0"
              style={{
                backgroundColor: active ? T.panel : "transparent",
                color: active ? T.accentPrimary : T.textMuted,
                border: active ? `1px solid ${T.borderSoft}` : "1px solid transparent",
                boxShadow: active ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              }}
            >
              <Icon size={14} />
              <span className="sm:inline">{tab.shortLabel}</span>
            </button>
          );
        })}
      </nav>

      {/* Summary KPIs */}
      {(activeTab === "overview" || activeTab === "operations") && (
        <section
          className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 rounded-2xl p-3 sm:p-4"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <SummaryStat
            label="ПЛАН БАЛАНС"
            value={formatCurrencyCompact(planBalance)}
            accent={planBalance >= 0 ? T.accentPrimary : T.warning}
            icon={<CircleDot size={12} />}
          />
          <SummaryStat
            label="ФАКТ БАЛАНС"
            value={formatCurrencyCompact(factBalance)}
            accent={factBalance >= 0 ? T.success : T.danger}
            icon={<Wallet size={12} />}
          />
          <SummaryStat
            label="ПЛАН (ДОХ.)"
            value={formatPercent(summary.fact.income.sum, summary.plan.income.sum)}
            accent={T.textPrimary}
          />
          <SummaryStat
            label="ПЛАН (ВИТР.)"
            value={formatPercent(summary.fact.expense.sum, summary.plan.expense.sum)}
            accent={T.textPrimary}
          />
        </section>
      )}

      {/* Filters */}
      {(activeTab === "overview" || activeTab === "operations") && (
        <FilterBar
          filters={filters}
          setFilters={setFilters}
          resetFilters={resetFilters}
          projects={projects}
          users={users}
          scope={scope}
        />
      )}

      {/* Tab content */}
      {activeTab === "overview" && (
        <TabOverview
          entries={entries}
          summary={summary}
          loading={loading}
          error={error}
          quadrantEntries={quadrantEntries}
          scope={scope}
          onAdd={(preset) => setCreatePreset(preset)}
          onEdit={(e) => setEditing(e)}
          onArchive={handleArchive}
          onDelete={handleDelete}
          onMoveToFolder={!scope ? (e) => setMoveEntryId(e.id) : undefined}
          onSwitchTab={setActiveTab}
          setFilters={setFilters}
        />
      )}

      {activeTab === "operations" && (
        <TabOperations
          entries={entries}
          loading={loading}
          error={error}
          scope={scope}
          filters={filters}
          setFilters={setFilters}
          onEdit={(e) => setEditing(e)}
          onArchive={handleArchive}
          onDelete={handleDelete}
          onMoveToFolder={!scope ? (e) => setMoveEntryId(e.id) : undefined}
        />
      )}

      {/* Move finance entry to folder dialog */}
      <MoveToFolderDialog
        open={!!moveEntryId}
        onClose={() => setMoveEntryId(null)}
        domain="FINANCE"
        currentFolderId={folderId}
        itemCount={1}
        loading={moveItemsMutation.isPending}
        onMove={(targetFolderId) => {
          if (!moveEntryId) return;
          moveItemsMutation.mutate(
            { domain: "FINANCE", itemIds: [moveEntryId], targetFolderId },
            {
              onSuccess: () => {
                setMoveEntryId(null);
                loadData();
              },
            },
          );
        }}
      />

      {activeTab === "calendar" && (
        <TabCalendar entries={entries} loading={loading} />
      )}

      {activeTab === "archive" && (
        <TabArchive
          scope={scope}
          projects={projects}
          users={users}
          onEdit={(e) => setEditing(e)}
        />
      )}

      {/* Entry form modal */}
      {(createPreset || editing) && (
        <EntryFormModal
          mode={editing ? "edit" : "create"}
          initial={editing}
          preset={createPreset ?? undefined}
          projects={projects}
          scope={scope}
          folderContext={
            folderId && detailData?.folder
              ? { id: folderId, name: detailData.folder.name }
              : null
          }
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          onClose={() => {
            setCreatePreset(null);
            setEditing(null);
          }}
          onSave={handleSave}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}
