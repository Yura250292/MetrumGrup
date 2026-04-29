"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Download,
  Loader2,
  CircleDot,
  LayoutDashboard,
  List,
  CalendarDays,
  Archive,
  FolderPlus,
  Sparkles,
  FileSpreadsheet,
  Wallet,
  Scale,
  Clock,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrencyCompact } from "@/lib/utils";
import { EntryFormModal } from "./entry-form-modal";
import { OcrScanModal } from "./ocr-scan-modal";
import { EstimateUploadModal } from "./estimate-upload-modal";
import { ImportExcelModal } from "./import-excel-modal";
import { QuadrantCard } from "./quadrant-card";
import { SummaryStat, formatPercent, rawPercent } from "./summary-stat";
import { HeroBalance } from "./hero-balance";
import { QuickAddSplit } from "./quick-add-split";
import { useFinancingData } from "./use-financing-data";
import { TabOverview } from "./tab-overview";
import { TabOperations } from "./tab-operations";
import { TabCalendar } from "./tab-calendar";
import { TabArchive } from "./tab-archive";
import { TabScans } from "./tab-scans";
import { TabApprovals } from "./tab-approvals";
import { TabBudgetActual } from "./tab-budget-actual";
import { ExportMenu } from "./export-menu";
import { TabTimesheets } from "./tab-timesheets";
import { FolderEstimateCard } from "./folder-estimate-card";
import { TemplateConstructor } from "./template-constructor";
import { FilterBar } from "./filter-bar";
import { ProjectsFoldersSection } from "./projects-folders-section";
import type { ProjectOption, UserOption } from "./types";
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

export type { FinanceEntryDTO, FinanceSummaryDTO, ProjectOption } from "./types";

const TABS = [
  { key: "overview", label: "Огляд", shortLabel: "Огляд", icon: LayoutDashboard },
  { key: "budget", label: "План vs Факт", shortLabel: "План/Факт", icon: Scale },
  { key: "timesheets", label: "ЗП і табелі", shortLabel: "Табелі", icon: Clock },
  { key: "approvals", label: "На погодженні", shortLabel: "Погодж.", icon: CircleDot },
  { key: "operations", label: "Операції", shortLabel: "Операції", icon: List },
  { key: "scans", label: "Скани чеків", shortLabel: "Скани", icon: Sparkles },
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
  isSuperAdmin = false,
  activeFirm,
}: {
  scope?: { id: string; title: string };
  projects: ProjectOption[];
  users?: UserOption[];
  currentUserId: string;
  currentUserName: string;
  isSuperAdmin?: boolean;
  activeFirm?: { id: string; name: string; brandColor: string };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const folderId = scope ? null : (searchParams.get("folderId") ?? null);

  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showOcrScan, setShowOcrScan] = useState(false);
  const [showEstimateUpload, setShowEstimateUpload] = useState(false);

  const { data: folders = [] } = useFolders("FINANCE", folderId);
  const { data: detailData } = useFolderDetail(folderId);
  const folderBreadcrumbs = detailData?.breadcrumbs ?? [];

  const isRootView = !scope && !folderId;
  const systemBlocks = isRootView ? folders.filter((f) => f.isSystem) : [];
  const nonSystemFolders = isRootView ? folders.filter((f) => !f.isSystem) : folders;

  const [moveEntryId, setMoveEntryId] = useState<string | null>(null);
  const [moveFolderId, setMoveFolderId] = useState<string | null>(null);
  const [createFolderParentId, setCreateFolderParentId] = useState<string | null>(null);
  const [importPreset, setImportPreset] = useState<
    { kind: "PLAN" | "FACT"; type: "INCOME" | "EXPENSE" | "AUTO" } | null
  >(null);

  const createFolderMutation = useCreateFolder();
  const updateFolderMutation = useUpdateFolder();
  const deleteFolderMutation = useDeleteFolder();
  const moveItemsMutation = useMoveItems();

  // Папки під "Проєкти" — це FINANCE-mirror PROJECT-папок. Будь-яка зміна
  // (rename/move/delete) має застосовуватись до source PROJECT-папки, щоб
  // mirror-сінк автоматично пробросив зміни сюди.
  const resolveSourceId = (id: string): string => {
    const f = folders.find((x) => x.id === id);
    return f?.mirroredFromId ?? id;
  };

  const handleRenameFolder = (id: string, name: string) =>
    updateFolderMutation.mutate(
      { id: resolveSourceId(id), name },
      {
        onSuccess: () => router.refresh(),
        onError: (err) => alert(err instanceof Error ? err.message : "Помилка перейменування"),
      },
    );

  const handleDeleteFolder = (id: string) => {
    if (!confirm("Видалити папку? Записи повернуться в корінь.")) return;
    deleteFolderMutation.mutate(resolveSourceId(id), {
      onSuccess: () => router.refresh(),
      onError: (err) => alert(err instanceof Error ? err.message : "Помилка видалення"),
    });
  };

  const moveFolder = moveFolderId
    ? folders.find((f) => f.id === moveFolderId) ?? null
    : null;
  const moveFolderSourceId = moveFolder
    ? moveFolder.mirroredFromId ?? moveFolder.id
    : null;
  const moveFolderDomain = moveFolder?.mirroredFromId ? "PROJECT" : "FINANCE";

  const handleMoveFolderSubmit = (targetParentId: string | null) => {
    if (!moveFolderSourceId) return;
    updateFolderMutation.mutate(
      { id: moveFolderSourceId, parentId: targetParentId },
      {
        onSuccess: () => {
          setMoveFolderId(null);
          router.refresh();
        },
        onError: (err) => alert(err instanceof Error ? err.message : "Помилка переміщення"),
      },
    );
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
    handleFlipToFact,
    handleExport,
    editing,
    setEditing,
    createPreset,
    setCreatePreset,
    quadrantEntries,
  } = data;

  // Deep-link: /admin-v2/financing?new=INCOME|EXPENSE[&kind=PLAN|FACT]
  // Used by dashboard Finance quick-access widget. One-shot per URL change.
  const newParam = searchParams.get("new");
  const kindParam = searchParams.get("kind");
  const consumedNewRef = useRef<string | null>(null);
  useEffect(() => {
    if (!newParam) {
      consumedNewRef.current = null;
      return;
    }
    const token = `${newParam}:${kindParam ?? ""}:${folderId ?? ""}`;
    if (consumedNewRef.current === token) return;
    const type = newParam === "INCOME" ? "INCOME" : newParam === "EXPENSE" ? "EXPENSE" : null;
    if (!type) return;
    const kind = kindParam === "PLAN" ? "PLAN" : "FACT";
    consumedNewRef.current = token;
    setCreatePreset({ kind, type, folderId: folderId ?? undefined });
    // Strip the one-shot params so reloads/back-nav don't keep reopening.
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("new");
    sp.delete("kind");
    const qs = sp.toString();
    router.replace(qs ? `/admin-v2/financing?${qs}` : "/admin-v2/financing", { scroll: false });
  }, [newParam, kindParam, folderId, router, searchParams, setCreatePreset]);

  const planBalance = summary.plan.income.sum - summary.plan.expense.sum;
  const factBalance = summary.balance;

  return (
    <div className="flex flex-col gap-4 sm:gap-6 pb-20 sm:pb-0">
      {/* Breadcrumbs (if inside a folder) */}
      {!scope && folderBreadcrumbs.length > 0 && (
        <FolderBreadcrumb
          breadcrumbs={folderBreadcrumbs}
          basePath="/admin-v2/financing"
          rootLabel="Усі фінанси"
        />
      )}

      {/* Hero — global */}
      {!scope && (
        <section className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1 min-w-0">
              <h1
                className="text-2xl sm:text-3xl md:text-[32px] font-bold tracking-tight"
                style={{ color: T.textPrimary }}
              >
                Фінансування
              </h1>
              <p className="text-[12px] sm:text-[13px] hidden sm:block" style={{ color: T.textSecondary }}>
                Журнал планових і фактичних грошових операцій
              </p>
            </div>
            <div className="flex gap-2 flex-shrink-0 items-center">
              <button
                onClick={() => setShowEstimateUpload(true)}
                title="Завантажити кошторис"
                className="hidden sm:flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-semibold transition hover:brightness-110 text-white"
                style={{ backgroundColor: T.accentPrimary }}
              >
                <FileSpreadsheet size={13} />
                Кошторис
              </button>
              <button
                onClick={() => setShowOcrScan(true)}
                title="Сканувати чек"
                className="hidden sm:flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-semibold transition hover:brightness-110 text-white"
                style={{ backgroundColor: T.accentPrimary }}
              >
                <Sparkles size={13} />
                Scan AI
              </button>
              {folderId && (
                <div className="hidden sm:block">
                  <QuickAddSplit onPick={(p) => setCreatePreset(p)} />
                </div>
              )}
              <ExportMenu onExport={handleExport} exporting={exporting} disabled={loading} />
            </div>
          </div>

          {/* Hero balance with dual radial */}
          <HeroBalance summary={summary} />

          {/* Mobile actions row */}
          <div className="flex sm:hidden flex-wrap gap-2">
            <button
              onClick={() => setShowEstimateUpload(true)}
              className="flex-1 min-w-[120px] flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-bold text-white transition hover:brightness-110"
              style={{ backgroundColor: T.accentPrimary }}
            >
              <FileSpreadsheet size={13} />
              Кошторис
            </button>
            <button
              onClick={() => setShowOcrScan(true)}
              className="flex-1 min-w-[120px] flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-bold text-white transition hover:brightness-110"
              style={{ backgroundColor: T.accentPrimary }}
            >
              <Sparkles size={13} />
              Scan AI
            </button>
            {folderId && (
              <div className="w-full">
                <QuickAddSplit onPick={(p) => setCreatePreset(p)} compact />
              </div>
            )}
          </div>

          {!folderId && (
            <p className="text-[11px]" style={{ color: T.textMuted }}>
              Ручні записи додавайте всередині проекту або папки
            </p>
          )}
        </section>
      )}

      {/* Hero — project scoped */}
      {scope && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold truncate" style={{ color: T.textPrimary }}>
                Фінансування
              </h2>
              <p className="text-[12px] truncate" style={{ color: T.textMuted }}>
                {scope.title}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <QuickAddSplit onPick={(p) => setCreatePreset(p)} compact />
              <ExportMenu onExport={handleExport} exporting={exporting} disabled={loading} compact />
            </div>
          </div>

          {/* Hero balance with dual radial — also shown in scoped view */}
          <HeroBalance summary={summary} />

          {/* AI actions row */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setShowEstimateUpload(true)}
              className="flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[11px] sm:text-xs font-bold text-white transition hover:brightness-110"
              style={{ backgroundColor: T.accentPrimary }}
            >
              <FileSpreadsheet size={12} />
              Кошторис
            </button>
            <button
              onClick={() => setShowOcrScan(true)}
              className="flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[11px] sm:text-xs font-bold text-white transition hover:brightness-110"
              style={{ backgroundColor: T.accentPrimary }}
            >
              <Sparkles size={12} />
              Scan чек з AI
            </button>
          </div>
        </section>
      )}

      {/* Template constructor — inside system folders (Постійні витрати, Витрати офісу) */}
      {!scope && folderId && detailData?.folder?.isSystem && (
        <TemplateConstructor
          folderId={folderId}
          folderName={detailData.folder.name}
          onEntryCreated={() => loadData()}
        />
      )}

      {/* Estimate pair card — when inside a non-system folder */}
      {!scope && folderId && detailData?.folder && !detailData.folder.isSystem && (
        <FolderEstimateCard
          folderId={folderId}
          folderName={detailData.folder.name}
          onUploadClick={() => setShowEstimateUpload(true)}
        />
      )}

      {/* Finance Folders (below Hero) */}
      {!scope && (
        <section className="flex flex-col gap-3">
          {/* Root view: structural blocks (expandable) */}
          {isRootView && systemBlocks.length > 0 && (
            <div className="flex flex-col gap-3">
              {systemBlocks.map((block) => (
                <ExpandableBlockCard
                  key={block.id}
                  folder={block}
                  basePath="/admin-v2/financing"
                  defaultOpen
                  hideActions
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

          {/* Projects section (collapsible + search + favorites) */}
          {nonSystemFolders.length > 0 && (
            <ProjectsFoldersSection
              folders={nonSystemFolders}
              basePath="/admin-v2/financing"
              onRename={handleRenameFolder}
              onDelete={handleDeleteFolder}
              onMove={(id) => setMoveFolderId(id)}
              bypassLocks={isSuperAdmin}
            />
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
        </section>
      )}

      {/* Tabs — underline indicator, horizontal scroll on mobile */}
      <nav
        className="flex gap-0 overflow-x-auto -mx-1 px-1 scrollbar-none border-b"
        style={{ borderColor: T.borderSoft }}
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.key;
          const Icon = tab.icon;
          const pendingCount =
            tab.key === "approvals"
              ? entries.filter((e) => e.status === "PENDING" && !e.isArchived).length
              : 0;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="relative flex items-center gap-2 whitespace-nowrap px-3 sm:px-4 py-2.5 text-[12.5px] sm:text-[13px] font-semibold transition-colors flex-shrink-0 -mb-px"
              style={{
                color: active ? T.accentPrimary : T.textMuted,
                borderBottom: `2px solid ${active ? T.accentPrimary : "transparent"}`,
              }}
            >
              <Icon size={14} />
              <span>{tab.shortLabel}</span>
              {pendingCount > 0 && (
                <span
                  className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1.5 rounded-full text-[10px] font-bold text-white"
                  style={{ backgroundColor: T.warning }}
                >
                  {pendingCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Summary KPIs */}
      {activeTab === "operations" && (
        <section
          className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 rounded-2xl p-4"
          style={{
            backgroundColor: T.panel,
            border: `1px solid ${T.borderSoft}`,
            boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
          }}
        >
          <SummaryStat
            label="План баланс"
            value={formatCurrencyCompact(planBalance)}
            accent={planBalance >= 0 ? T.accentPrimary : T.warning}
          />
          <SummaryStat
            label="Факт баланс"
            value={formatCurrencyCompact(factBalance)}
            accent={factBalance >= 0 ? T.success : T.danger}
            icon={<Wallet size={11} />}
            emphasis="hero"
          />
          <SummaryStat
            label="План → факт (доходи)"
            value={formatPercent(summary.fact.income.sum, summary.plan.income.sum)}
            accent={T.accentPrimary}
            ringPct={rawPercent(summary.fact.income.sum, summary.plan.income.sum)}
            hint={`${formatCurrencyCompact(summary.fact.income.sum)} / ${formatCurrencyCompact(summary.plan.income.sum)}`}
          />
          <SummaryStat
            label="План → факт (витрати)"
            value={formatPercent(summary.fact.expense.sum, summary.plan.expense.sum)}
            accent={T.warning}
            ringPct={rawPercent(summary.fact.expense.sum, summary.plan.expense.sum)}
            hint={`${formatCurrencyCompact(summary.fact.expense.sum)} / ${formatCurrencyCompact(summary.plan.expense.sum)}`}
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

      {/* Tab content — wrapped with key so each switch replays the slide-down */}
      <div key={activeTab} className="animate-slide-in-down flex flex-col gap-4 sm:gap-6">
        {activeTab === "overview" && (
          <TabOverview
            entries={entries}
            summary={summary}
            loading={loading}
            error={error}
            quadrantEntries={quadrantEntries}
            scope={scope}
            onAdd={(preset) => setCreatePreset(preset)}
            onImport={(preset) =>
              setImportPreset({ kind: preset.kind, type: preset.type })
            }
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
            onFlipToFact={handleFlipToFact}
          />
        )}

        {activeTab === "budget" && (
          <TabBudgetActual scope={scope} projects={projects} />
        )}

        {activeTab === "timesheets" && (
          <TabTimesheets scope={scope} projects={projects} />
        )}

        {activeTab === "approvals" && (
          <TabApprovals
            entries={entries}
            loading={loading}
            error={error}
            onEdit={(e) => setEditing(e)}
            onRefresh={() => loadData()}
          />
        )}

        {activeTab === "scans" && (
          <TabScans
            entries={entries}
            loading={loading}
            error={error}
            onEdit={(e) => setEditing(e)}
          />
        )}

        {activeTab === "calendar" && (
          <TabCalendar entries={entries} loading={loading} scope={scope} />
        )}

        {activeTab === "archive" && (
          <TabArchive
            scope={scope}
            projects={projects}
            users={users}
            onEdit={(e) => setEditing(e)}
          />
        )}
      </div>

      {/* Move finance entry to folder dialog (modal — lives outside animated wrapper) */}
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

      {/* Move folder dialog — для mirror-папок маршрутизуємо на source PROJECT */}
      <MoveToFolderDialog
        open={moveFolderId !== null}
        onClose={() => setMoveFolderId(null)}
        domain={moveFolderDomain}
        currentFolderId={moveFolder?.parentId ?? null}
        excludeSubtreeOf={moveFolderSourceId ?? undefined}
        itemCount={1}
        title="Перемістити папку"
        loading={updateFolderMutation.isPending}
        onMove={handleMoveFolderSubmit}
      />

      {/* OCR Scan modal */}
      {showOcrScan && (
        <OcrScanModal
          projects={projects}
          scope={scope}
          folderContext={
            folderId && detailData?.folder
              ? { id: folderId, name: detailData.folder.name }
              : null
          }
          onClose={() => setShowOcrScan(false)}
          onCreated={() => loadData()}
        />
      )}

      {/* Estimate upload modal */}
      {showEstimateUpload && (
        <EstimateUploadModal
          projects={projects}
          scope={scope}
          folderContext={
            folderId && detailData?.folder
              ? { id: folderId, name: detailData.folder.name }
              : null
          }
          onClose={() => setShowEstimateUpload(false)}
          onCreated={() => loadData()}
        />
      )}

      {/* Excel import modal — AI-розпізнавання рядків з xlsx/csv */}
      {importPreset && (
        <ImportExcelModal
          preset={importPreset}
          projects={projects}
          scope={scope}
          folderContext={
            folderId && detailData?.folder
              ? { id: folderId, name: detailData.folder.name }
              : null
          }
          onClose={() => setImportPreset(null)}
          onImported={(count, _skipped, duplicates) => {
            loadData();
            setImportPreset(null);
            const msg = duplicates > 0
              ? `Імпортовано ${count}. Пропущено дублів: ${duplicates}.`
              : `Імпортовано ${count} запис(ів).`;
            // Простий toast через нативний alert (узгоджено з рештою модулю).
            alert(msg);
          }}
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
          activeFirm={activeFirm}
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
