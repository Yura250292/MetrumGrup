"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  Users,
  Briefcase,
  TrendingUp,
  FileSpreadsheet,
  FileText,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency } from "@/lib/utils";

type PairInfo = {
  groupId: string;
  version: number;
  client: {
    id: string;
    title: string;
    totalAmount: number;
    itemCount: number;
    createdAt: string;
  } | null;
  internal: {
    id: string;
    title: string;
    totalAmount: number;
    itemCount: number;
    createdAt: string;
  } | null;
  profit: number;
  profitPercent: number;
};

export function FolderEstimateCard({
  folderId,
  folderName,
  onUploadClick,
}: {
  folderId: string;
  folderName: string;
  onUploadClick: () => void;
}) {
  const [pair, setPair] = useState<PairInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/admin/estimates/pair-for-folder?folderId=${folderId}`)
      .then((r) => (r.ok ? r.json() : { pair: null }))
      .then((data) => {
        if (alive) setPair(data.pair);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [folderId]);

  async function handleExport(estimateId: string, format: "excel" | "pdf") {
    setDownloading(`${estimateId}-${format}`);
    try {
      const res = await fetch(`/api/admin/estimates/${estimateId}/export?format=${format}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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

  if (loading) {
    return (
      <div
        className="rounded-2xl p-4 flex items-center gap-2"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}`, color: T.textMuted }}
      >
        <Loader2 size={14} className="animate-spin" />
        <span className="text-[12px]">Перевірка кошторисів…</span>
      </div>
    );
  }

  // No pair yet — show CTA to upload
  if (!pair || (!pair.client && !pair.internal)) {
    return (
      <button
        onClick={onUploadClick}
        className="w-full rounded-2xl p-4 flex items-center gap-3 transition hover:brightness-105 text-left"
        style={{
          backgroundColor: T.accentPrimarySoft,
          border: `1px dashed ${T.accentPrimary}50`,
        }}
      >
        <div
          className="flex items-center justify-center rounded-xl h-11 w-11 flex-shrink-0"
          style={{ backgroundColor: T.accentPrimary, color: "#fff" }}
        >
          <Sparkles size={20} />
        </div>
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <span className="text-[14px] font-bold" style={{ color: T.accentPrimary }}>
            Завантажити кошториси для {folderName}
          </span>
          <span className="text-[11px]" style={{ color: T.textSecondary }}>
            2 файли (Клієнт + Metrum) — AI розпізнає, створить порівняння та план витрат
          </span>
        </div>
        <ChevronRight size={16} style={{ color: T.accentPrimary }} />
      </button>
    );
  }

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between gap-2 px-4 py-3 border-b"
        style={{ borderColor: T.borderSoft, backgroundColor: T.panelElevated }}
      >
        <div className="flex items-center gap-2">
          <FileSpreadsheet size={14} style={{ color: T.accentPrimary }} />
          <span className="text-[13px] font-bold" style={{ color: T.textPrimary }}>
            Кошторис
          </span>
          {pair.version > 1 && (
            <span
              className="rounded-md px-1.5 py-0.5 text-[9px] font-bold"
              style={{ backgroundColor: T.panelSoft, color: T.textMuted }}
            >
              v{pair.version}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onUploadClick}
            className="text-[11px] font-semibold"
            style={{ color: T.accentPrimary }}
          >
            Оновити
          </button>
          <Link
            href={`/admin-v2/estimates/compare/${pair.groupId}`}
            className="flex items-center gap-1 rounded-lg px-3 py-1 text-[11px] font-bold text-white"
            style={{ backgroundColor: T.accentPrimary }}
          >
            Порівняння
            <ChevronRight size={11} />
          </Link>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4">
        {pair.client && (
          <EstimateSide
            icon={<Users size={14} />}
            label="Клієнт"
            amount={pair.client.totalAmount}
            itemCount={pair.client.itemCount}
            color={T.success}
            onExportExcel={() => handleExport(pair.client!.id, "excel")}
            onExportPdf={() => handleExport(pair.client!.id, "pdf")}
            downloadingKey={downloading}
            estimateId={pair.client.id}
          />
        )}
        {pair.internal && (
          <EstimateSide
            icon={<Briefcase size={14} />}
            label="Metrum (собівартість)"
            amount={pair.internal.totalAmount}
            itemCount={pair.internal.itemCount}
            color={T.danger}
            onExportExcel={() => handleExport(pair.internal!.id, "excel")}
            onExportPdf={() => handleExport(pair.internal!.id, "pdf")}
            downloadingKey={downloading}
            estimateId={pair.internal.id}
          />
        )}
        {pair.client && pair.internal && (
          <div
            className="rounded-xl p-3 flex flex-col gap-1"
            style={{ backgroundColor: T.accentPrimarySoft, border: `1px solid ${T.accentPrimary}30` }}
          >
            <div className="flex items-center gap-1.5">
              <TrendingUp size={14} style={{ color: T.accentPrimary }} />
              <span className="text-[10px] font-bold tracking-wider" style={{ color: T.accentPrimary }}>
                ПРИБУТОК
              </span>
            </div>
            <span className="text-[18px] font-bold" style={{ color: T.accentPrimary }}>
              {pair.profit >= 0 ? "+" : ""}
              {formatCurrency(pair.profit)}
            </span>
            <span className="text-[11px]" style={{ color: T.textMuted }}>
              {pair.profitPercent.toFixed(1)}% маржа
            </span>
          </div>
        )}
      </div>

      {/* Info footer */}
      <div
        className="flex items-center gap-2 px-4 py-2 text-[10px]"
        style={{ backgroundColor: T.panelSoft, color: T.textMuted }}
      >
        ℹ️ Metrum-кошторис автоматично синхронізовано у План витрат цієї папки. Факт-витрати додавайте як чеки — вони порівняються з планом.
      </div>
    </div>
  );
}

function EstimateSide({
  icon,
  label,
  amount,
  itemCount,
  color,
  onExportExcel,
  onExportPdf,
  downloadingKey,
  estimateId,
}: {
  icon: React.ReactNode;
  label: string;
  amount: number;
  itemCount: number;
  color: string;
  onExportExcel: () => void;
  onExportPdf: () => void;
  downloadingKey: string | null;
  estimateId: string;
}) {
  const xlsxBusy = downloadingKey === `${estimateId}-excel`;
  const pdfBusy = downloadingKey === `${estimateId}-pdf`;
  return (
    <div
      className="rounded-xl p-3 flex flex-col gap-1.5"
      style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}` }}
    >
      <div className="flex items-center gap-1.5">
        <span style={{ color }}>{icon}</span>
        <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
          {label}
        </span>
      </div>
      <span className="text-[18px] font-bold" style={{ color }}>
        {formatCurrency(amount)}
      </span>
      <span className="text-[11px]" style={{ color: T.textMuted }}>
        {itemCount} поз.
      </span>
      <div className="flex gap-1 mt-1">
        <button
          onClick={onExportExcel}
          disabled={xlsxBusy || pdfBusy}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold disabled:opacity-50 flex-1"
          style={{ backgroundColor: T.panel, color: T.textPrimary, border: `1px solid ${T.borderStrong}` }}
        >
          {xlsxBusy ? <Loader2 size={10} className="animate-spin" /> : <FileSpreadsheet size={10} />}
          Excel
        </button>
        <button
          onClick={onExportPdf}
          disabled={xlsxBusy || pdfBusy}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold disabled:opacity-50 flex-1"
          style={{ backgroundColor: T.panel, color: T.textPrimary, border: `1px solid ${T.borderStrong}` }}
        >
          {pdfBusy ? <Loader2 size={10} className="animate-spin" /> : <FileText size={10} />}
          PDF
        </button>
      </div>
    </div>
  );
}
