import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import { ScanLine, Plus, FileText, CheckCircle2, XCircle, Clock } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { ReceiptScanStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<ReceiptScanStatus, string> = {
  PENDING: "На погодженні",
  APPROVED: "Підтверджено",
  REJECTED: "Відхилено",
  CANCELLED: "Скасовано",
};

const STATUS_COLOR: Record<ReceiptScanStatus, string> = {
  PENDING: T.warning,
  APPROVED: T.success,
  REJECTED: T.danger,
  CANCELLED: T.textMuted,
};

export default async function AdminV2ReceiptsListPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const scans = await prisma.receiptScan.findMany({
    take: 50,
    orderBy: { createdAt: "desc" },
    include: {
      project: { select: { id: true, title: true, slug: true } },
      createdBy: { select: { id: true, name: true } },
      _count: { select: { lineItems: true } },
    },
  });

  const pendingCount = scans.filter((s) => s.status === "PENDING").length;
  const approvedTotal = scans
    .filter((s) => s.status === "APPROVED")
    .reduce((sum, s) => sum + Number(s.totalAmount ?? 0), 0);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
          СКАН НАКЛАДНИХ
        </span>
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight" style={{ color: T.textPrimary }}>
            Накладні (скан)
          </h1>
          <Link
            href="/admin-v2/receipts/scan"
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium"
            style={{ backgroundColor: T.accentPrimary, color: "white" }}
          >
            <Plus size={16} />
            Сканувати накладну
          </Link>
        </div>
        <p className="text-[15px]" style={{ color: T.textSecondary }}>
          {scans.length} сканів · {pendingCount} очікують підтвердження
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <KpiCard label="ВСЬОГО СКАНІВ" value={String(scans.length)} sub="за останні 50" />
        <KpiCard
          label="ОЧІКУЮТЬ"
          value={String(pendingCount)}
          sub="треба підтвердити"
          accent={pendingCount > 0 ? T.warning : T.success}
        />
        <KpiCard
          label="ПІДТВЕРДЖЕНО (∑)"
          value={formatCurrency(approvedTotal)}
          sub="загальна сума"
          accent={T.accentPrimary}
        />
      </section>

      <section
        className="overflow-hidden rounded-2xl"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        {scans.length === 0 ? (
          <EmptyState />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: T.panelSoft, color: T.textMuted }}>
                <th className="px-4 py-3 text-left text-[11px] font-bold tracking-wider">Дата</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold tracking-wider">Постачальник</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold tracking-wider">Проєкт</th>
                <th className="px-4 py-3 text-right text-[11px] font-bold tracking-wider">Сума</th>
                <th className="px-4 py-3 text-center text-[11px] font-bold tracking-wider">Позицій</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold tracking-wider">Статус</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold tracking-wider">Автор</th>
              </tr>
            </thead>
            <tbody>
              {scans.map((s, idx) => (
                <tr
                  key={s.id}
                  className={`hover:bg-black/[0.02] dark:hover:bg-white/[0.04] ${idx < 20 ? "data-table-row-enter" : ""}`}
                  style={{
                    borderTop: `1px solid ${T.borderSoft}`,
                    ...(idx < 20 ? { animationDelay: `${idx * 30}ms` } : {}),
                  }}
                >
                  <td className="px-4 py-3" style={{ color: T.textSecondary }}>
                    <Link href={`/admin-v2/receipts/${s.id}`} className="hover:underline">
                      {new Date(s.createdAt).toLocaleDateString("uk-UA")}
                    </Link>
                  </td>
                  <td className="px-4 py-3" style={{ color: T.textPrimary }}>
                    <Link href={`/admin-v2/receipts/${s.id}`} className="hover:underline">
                      {s.supplier ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3" style={{ color: T.textSecondary }}>
                    {s.project.title}
                  </td>
                  <td className="px-4 py-3 text-right font-mono" style={{ color: T.textPrimary }}>
                    {s.totalAmount ? formatCurrency(Number(s.totalAmount)) : "—"}
                  </td>
                  <td className="px-4 py-3 text-center" style={{ color: T.textSecondary }}>
                    {s._count.lineItems}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
                      style={{ color: STATUS_COLOR[s.status], backgroundColor: STATUS_COLOR[s.status] + "1A" }}
                    >
                      <StatusIcon status={s.status} />
                      {STATUS_LABEL[s.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3" style={{ color: T.textMuted }}>
                    {s.createdBy.name}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: string;
}) {
  return (
    <div
      className="flex flex-col gap-1 rounded-2xl p-4 sm:p-5"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
        {label}
      </span>
      <span className="text-2xl font-bold" style={{ color: accent ?? T.textPrimary }}>
        {value}
      </span>
      <span className="text-xs" style={{ color: T.textMuted }}>
        {sub}
      </span>
    </div>
  );
}

function StatusIcon({ status }: { status: ReceiptScanStatus }) {
  if (status === "APPROVED") return <CheckCircle2 size={12} />;
  if (status === "REJECTED" || status === "CANCELLED") return <XCircle size={12} />;
  return <Clock size={12} />;
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full"
        style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
      >
        <FileText size={20} />
      </div>
      <p className="text-base font-medium" style={{ color: T.textPrimary }}>
        Поки що немає сканів
      </p>
      <p className="text-sm" style={{ color: T.textMuted }}>
        Натисніть «Сканувати накладну», щоб додати першу
      </p>
      <Link
        href="/admin-v2/receipts/scan"
        className="mt-2 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium"
        style={{ backgroundColor: T.accentPrimary, color: "white" }}
      >
        <ScanLine size={16} />
        Сканувати
      </Link>
    </div>
  );
}
