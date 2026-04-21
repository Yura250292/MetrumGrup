"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Users,
  Briefcase,
  TrendingUp,
  ChevronsUpDown,
  ArrowDown,
  ArrowUp,
  ExternalLink,
  FileText,
  FileSpreadsheet,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency } from "@/lib/utils";

type SerializedItem = {
  id: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  sortOrder: number;
};

type Match = {
  clientItem: SerializedItem | null;
  internalItem: SerializedItem | null;
  diff: number;
  diffPercent: number;
  matchConfidence: number;
};

type CompareData = {
  groupId: string;
  version: number;
  project: { id: string; title: string; slug: string };
  client: {
    id: string;
    title: string;
    number: string;
    totalAmount: number;
    items: SerializedItem[];
  } | null;
  internal: {
    id: string;
    title: string;
    number: string;
    totalAmount: number;
    items: SerializedItem[];
  } | null;
  matches: Match[];
  summary: {
    clientTotal: number;
    internalTotal: number;
    profit: number;
    profitPercent: number;
    unmatchedClient: number;
    unmatchedInternal: number;
    matchedCount: number;
  };
};

type SortMode = "order" | "diff-desc" | "diff-asc" | "percent-desc" | "percent-asc";

export function EstimateCompareView({ groupId }: { groupId: string }) {
  const [data, setData] = useState<CompareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("order");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/estimates/compare/${groupId}`, { cache: "no-store" });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `HTTP ${res.status}`);
        }
        const json = await res.json();
        setData(json);
      } catch (err: any) {
        setError(err?.message ?? "Помилка завантаження");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [groupId]);

  const sortedMatches = useMemo(() => {
    if (!data) return [];
    const sorted = [...data.matches];
    switch (sortMode) {
      case "diff-desc":
        sorted.sort((a, b) => b.diff - a.diff);
        break;
      case "diff-asc":
        sorted.sort((a, b) => a.diff - b.diff);
        break;
      case "percent-desc":
        sorted.sort((a, b) => b.diffPercent - a.diffPercent);
        break;
      case "percent-asc":
        sorted.sort((a, b) => a.diffPercent - b.diffPercent);
        break;
      default:
        sorted.sort((a, b) => {
          const aOrder = a.clientItem?.sortOrder ?? a.internalItem?.sortOrder ?? 9999;
          const bOrder = b.clientItem?.sortOrder ?? b.internalItem?.sortOrder ?? 9999;
          return aOrder - bOrder;
        });
    }
    return sorted;
  }, [data, sortMode]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin" style={{ color: T.accentPrimary }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <AlertCircle size={32} style={{ color: T.danger }} />
        <span style={{ color: T.danger }}>{error}</span>
        <Link
          href="/admin-v2/financing"
          className="text-[12px] font-medium"
          style={{ color: T.accentPrimary }}
        >
          ← Назад до Фінансування
        </Link>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="flex flex-col gap-4 sm:gap-6 p-4 sm:p-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[12px]" style={{ color: T.textMuted }}>
        <Link
          href="/admin-v2/financing"
          className="flex items-center gap-1 hover:opacity-80"
          style={{ color: T.accentPrimary }}
        >
          <ArrowLeft size={12} /> Фінансування
        </Link>
        <span>/</span>
        <Link
          href={`/admin-v2/projects/${data.project.slug ?? data.project.id}`}
          className="hover:opacity-80"
          style={{ color: T.accentPrimary }}
        >
          {data.project.title}
        </Link>
        <span>/</span>
        <span>Порівняння кошторисів</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold" style={{ color: T.textPrimary }}>
            Порівняння кошторисів
          </h1>
          <p className="text-[13px] mt-1" style={{ color: T.textMuted }}>
            {data.project.title} · версія {data.version}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/admin-v2/financing?projectId=${data.project.id}`}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold"
            style={{ backgroundColor: T.panelElevated, color: T.textPrimary, border: `1px solid ${T.borderStrong}` }}
          >
            <ExternalLink size={13} />
            Відкрити у Фінансуванні
          </Link>
        </div>
      </div>

      {/* Export toolbar — separate buttons per estimate */}
      <div
        className="flex flex-col sm:flex-row gap-3 p-3 rounded-xl"
        style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}` }}
      >
        {data.client && (
          <ExportGroup
            label="Кошторис клієнта"
            estimateId={data.client.id}
            color={T.success}
            icon={<Users size={13} />}
          />
        )}
        {data.internal && (
          <ExportGroup
            label="Кошторис Metrum"
            estimateId={data.internal.id}
            color={T.danger}
            icon={<Briefcase size={13} />}
          />
        )}
      </div>

      {/* Sync info banner */}
      <div
        className="flex items-start gap-2 rounded-xl p-3 text-[12px]"
        style={{
          backgroundColor: T.accentPrimarySoft,
          border: `1px solid ${T.accentPrimary}30`,
          color: T.accentPrimary,
        }}
      >
        <ExternalLink size={14} className="flex-shrink-0 mt-0.5" />
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold">Записи синхронізовано з Фінансуванням</span>
          <span className="text-[11px]" style={{ color: T.textSecondary }}>
            Кошторис Metrum → План витрати проекту · Кошторис клієнта → План доходи.
            Далі додавайте фактичні витрати (чеки) — вони порівняються з планом автоматично.
          </span>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard
          label="Клієнт"
          value={data.summary.clientTotal}
          icon={<Users size={14} />}
          color={T.success}
        />
        <SummaryCard
          label="Metrum"
          value={data.summary.internalTotal}
          icon={<Briefcase size={14} />}
          color={T.danger}
        />
        <SummaryCard
          label="Прибуток"
          value={data.summary.profit}
          icon={<TrendingUp size={14} />}
          color={T.accentPrimary}
          subtitle={`${data.summary.profitPercent.toFixed(1)}%`}
        />
        <div
          className="rounded-2xl p-4 flex flex-col gap-1"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
            СПІВСТАВЛЕНО
          </span>
          <span className="text-lg font-bold" style={{ color: T.textPrimary }}>
            {data.summary.matchedCount} / {data.summary.matchedCount + data.summary.unmatchedClient + data.summary.unmatchedInternal}
          </span>
          <span className="text-[10px]" style={{ color: T.textMuted }}>
            {data.summary.unmatchedClient > 0 && `${data.summary.unmatchedClient} лише у клієнті`}
            {data.summary.unmatchedClient > 0 && data.summary.unmatchedInternal > 0 && " · "}
            {data.summary.unmatchedInternal > 0 && `${data.summary.unmatchedInternal} лише у Metrum`}
          </span>
        </div>
      </div>

      {/* Sort controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
          СОРТУВАННЯ:
        </span>
        <SortChip active={sortMode === "order"} onClick={() => setSortMode("order")} label="За порядком" icon={<ChevronsUpDown size={11} />} />
        <SortChip active={sortMode === "diff-desc"} onClick={() => setSortMode("diff-desc")} label="Різниця ↓" icon={<ArrowDown size={11} />} />
        <SortChip active={sortMode === "diff-asc"} onClick={() => setSortMode("diff-asc")} label="Різниця ↑" icon={<ArrowUp size={11} />} />
        <SortChip active={sortMode === "percent-desc"} onClick={() => setSortMode("percent-desc")} label="% ↓" icon={<ArrowDown size={11} />} />
        <SortChip active={sortMode === "percent-asc"} onClick={() => setSortMode("percent-asc")} label="% ↑" icon={<ArrowUp size={11} />} />
      </div>

      {/* Comparison table */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        {/* Desktop header */}
        <div
          className="hidden lg:grid gap-2 px-4 py-3 border-b"
          style={{
            gridTemplateColumns: "40px 1fr 80px 120px 1fr 120px 120px 80px",
            borderColor: T.borderSoft,
            backgroundColor: T.panelElevated,
          }}
        >
          <HeaderCell label="#" />
          <HeaderCell label="Позиція клієнта" />
          <HeaderCell label="Од · К-ть" align="center" />
          <HeaderCell label="Клієнт (сума)" align="right" />
          <HeaderCell label="Позиція Metrum" />
          <HeaderCell label="Metrum (сума)" align="right" />
          <HeaderCell label="Різниця" align="right" />
          <HeaderCell label="%" align="right" />
        </div>

        <div className="max-h-[70vh] overflow-y-auto">
          {sortedMatches.length === 0 ? (
            <div className="py-16 text-center" style={{ color: T.textMuted }}>
              Немає даних для порівняння
            </div>
          ) : (
            sortedMatches.map((m, idx) => (
              <ComparisonRow key={`${m.clientItem?.id ?? "null"}-${m.internalItem?.id ?? "null"}-${idx}`} match={m} index={idx} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  color,
  subtitle,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  subtitle?: string;
}) {
  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-1"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div className="flex items-center gap-1.5">
        <span style={{ color }}>{icon}</span>
        <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
          {label}
        </span>
      </div>
      <span className="text-lg sm:text-xl font-bold" style={{ color }}>
        {formatCurrency(value)}
      </span>
      {subtitle && (
        <span className="text-[11px] font-semibold" style={{ color: T.textMuted }}>
          {subtitle}
        </span>
      )}
    </div>
  );
}

function ExportGroup({
  label,
  estimateId,
  color,
  icon,
}: {
  label: string;
  estimateId: string;
  color: string;
  icon: React.ReactNode;
}) {
  const [downloading, setDownloading] = useState<"excel" | "pdf" | null>(null);

  async function handleExport(format: "excel" | "pdf") {
    setDownloading(format);
    try {
      const res = await fetch(`/api/admin/estimates/${estimateId}/export?format=${format}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ext = format === "excel" ? "xlsx" : "pdf";
      a.download = `estimate-${estimateId}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err?.message ?? "Помилка експорту");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="flex items-center gap-2 flex-1">
      <span className="flex items-center gap-1.5 text-[12px] font-bold flex-shrink-0" style={{ color }}>
        {icon}
        {label}:
      </span>
      <button
        onClick={() => handleExport("excel")}
        disabled={downloading !== null}
        className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-50"
        style={{ backgroundColor: T.panel, color: T.textPrimary, border: `1px solid ${T.borderStrong}` }}
      >
        {downloading === "excel" ? (
          <Loader2 size={11} className="animate-spin" />
        ) : (
          <FileSpreadsheet size={11} />
        )}
        Excel
      </button>
      <button
        onClick={() => handleExport("pdf")}
        disabled={downloading !== null}
        className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-50"
        style={{ backgroundColor: T.panel, color: T.textPrimary, border: `1px solid ${T.borderStrong}` }}
      >
        {downloading === "pdf" ? (
          <Loader2 size={11} className="animate-spin" />
        ) : (
          <FileText size={11} />
        )}
        PDF
      </button>
    </div>
  );
}

function SortChip({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition"
      style={{
        backgroundColor: active ? T.accentPrimarySoft : T.panelSoft,
        color: active ? T.accentPrimary : T.textMuted,
        border: `1px solid ${active ? T.accentPrimary : T.borderSoft}`,
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function HeaderCell({
  label,
  align = "left",
}: {
  label: string;
  align?: "left" | "center" | "right";
}) {
  const justify = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  return (
    <div className={`flex items-center ${justify}`}>
      <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
        {label}
      </span>
    </div>
  );
}

function ComparisonRow({ match, index }: { match: Match; index: number }) {
  const { clientItem, internalItem, diff, diffPercent } = match;
  const isZebra = index % 2 === 1;
  const isUnmatched = !clientItem || !internalItem;
  const diffColor = diff > 0 ? T.success : diff < 0 ? T.danger : T.textMuted;

  return (
    <>
      {/* Desktop row */}
      <div
        className="hidden lg:grid gap-2 px-4 py-3 border-b items-start"
        style={{
          gridTemplateColumns: "40px 1fr 80px 120px 1fr 120px 120px 80px",
          borderColor: T.borderSoft,
          backgroundColor: isZebra ? T.panelSoft : "transparent",
        }}
      >
        <div className="text-[11px] font-mono" style={{ color: T.textMuted }}>
          {index + 1}
        </div>
        <div className="text-[12px] min-w-0" style={{ color: clientItem ? T.textPrimary : T.textMuted }}>
          {clientItem ? (
            clientItem.description
          ) : (
            <em style={{ color: T.danger }}>— тільки в Metrum</em>
          )}
        </div>
        <div className="text-[11px] text-center" style={{ color: T.textMuted }}>
          {clientItem
            ? `${clientItem.unit} · ${clientItem.quantity}`
            : internalItem
              ? `${internalItem.unit} · ${internalItem.quantity}`
              : "—"}
        </div>
        <div className="text-[12px] text-right font-semibold" style={{ color: clientItem ? T.success : T.textMuted }}>
          {clientItem ? formatCurrency(clientItem.amount) : "—"}
        </div>
        <div className="text-[12px] min-w-0" style={{ color: internalItem ? T.textPrimary : T.textMuted }}>
          {internalItem ? (
            internalItem.description
          ) : (
            <em style={{ color: T.warning }}>— тільки у клієнті</em>
          )}
        </div>
        <div className="text-[12px] text-right font-semibold" style={{ color: internalItem ? T.danger : T.textMuted }}>
          {internalItem ? formatCurrency(internalItem.amount) : "—"}
        </div>
        <div className="text-[12px] text-right font-bold" style={{ color: diffColor }}>
          {diff > 0 ? "+" : ""}
          {formatCurrency(Math.abs(diff))}
        </div>
        <div className="text-[11px] text-right" style={{ color: diffColor }}>
          {!isUnmatched ? `${diffPercent.toFixed(0)}%` : "—"}
        </div>
      </div>

      {/* Mobile card */}
      <div
        className="lg:hidden border-b px-4 py-3 flex flex-col gap-1.5"
        style={{
          borderColor: T.borderSoft,
          backgroundColor: isZebra ? T.panelSoft : "transparent",
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-mono" style={{ color: T.textMuted }}>
            #{index + 1}
          </span>
          <span className="text-[13px] font-bold" style={{ color: diffColor }}>
            {diff > 0 ? "+" : ""}
            {formatCurrency(Math.abs(diff))}
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <div className="text-[11px]" style={{ color: T.textMuted }}>
            <Users size={10} className="inline mr-1" />
            {clientItem ? clientItem.description : <em style={{ color: T.danger }}>— тільки в Metrum</em>}
          </div>
          {clientItem && (
            <div className="text-[13px] font-semibold text-right" style={{ color: T.success }}>
              {formatCurrency(clientItem.amount)}
            </div>
          )}
          <div className="text-[11px]" style={{ color: T.textMuted }}>
            <Briefcase size={10} className="inline mr-1" />
            {internalItem ? internalItem.description : <em style={{ color: T.warning }}>— тільки у клієнті</em>}
          </div>
          {internalItem && (
            <div className="text-[13px] font-semibold text-right" style={{ color: T.danger }}>
              {formatCurrency(internalItem.amount)}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
