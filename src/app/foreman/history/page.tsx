import Link from "next/link";
import { FileText, CheckCircle2 } from "lucide-react";
import { auth } from "@/lib/auth";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { prisma } from "@/lib/prisma";
import { LightShell } from "../_components/v2/light-shell";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, { label: string; classes: string }> = {
  DRAFT: { label: "Чернетка", classes: "bg-slate-100 text-slate-700" },
  PENDING_APPROVAL: { label: "На перевірці", classes: "bg-amber-100 text-amber-700" },
  NEEDS_REVISION: { label: "На доопрацюванні", classes: "bg-orange-100 text-orange-700" },
  APPROVED: { label: "Підтверджено", classes: "bg-emerald-100 text-emerald-700" },
  REJECTED: { label: "Відхилено", classes: "bg-rose-100 text-rose-700" },
  CANCELLED: { label: "Скасовано", classes: "bg-slate-100 text-slate-500" },
};

function formatDate(d: Date) {
  return d.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" });
}

interface PageProps {
  searchParams: Promise<{ submitted?: string }>;
}

export default async function ForemanHistoryPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user) return null;
  const { firmId } = await resolveFirmScopeForRequest(session);

  const reports = await prisma.foremanReport.findMany({
    where: {
      createdById: session.user.id,
      firmId: firmId ?? undefined,
    },
    include: {
      project: { select: { id: true, title: true } },
      items: { select: { amount: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <LightShell title="Мої звіти" backHref="/foreman">
      {sp.submitted && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-2.5 mb-3 text-sm flex items-center gap-2 font-semibold">
          <CheckCircle2 size={16} />
          Звіт надіслано на перевірку менеджеру
        </div>
      )}

      {reports.length === 0 ? (
        <div className="mt-6 rounded-2xl bg-white border border-slate-200 p-8 text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
            <FileText size={22} className="text-slate-500" />
          </div>
          <div className="text-base font-semibold text-slate-700 mb-2">
            Поки немає звітів
          </div>
          <Link
            href="/foreman/report/folder"
            className="inline-block text-indigo-600 font-semibold text-sm"
          >
            Створити перший
          </Link>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {reports.map((r) => {
            const total = r.items.reduce((sum, it) => sum + Number(it.amount), 0);
            const status = STATUS_LABELS[r.status] ?? {
              label: r.status,
              classes: "bg-slate-100 text-slate-700",
            };
            const href =
              r.status === "DRAFT"
                ? `/foreman/report/project/${r.project.id}/review/${r.id}`
                : `/foreman/history/${r.id}`;
            return (
              <li key={r.id}>
                <Link
                  href={href}
                  className="block rounded-2xl bg-white border border-slate-200 active:scale-[0.99] transition p-3.5 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] text-slate-500">{formatDate(r.occurredAt)}</div>
                      <div className="font-semibold text-slate-900 truncate">
                        {r.project.title}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-extrabold uppercase rounded-full px-2.5 py-1 shrink-0 ${status.classes}`}
                    >
                      {status.label}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="text-[12px] text-slate-500">
                      {r.items.length}{" "}
                      {r.items.length === 1 ? "позиція" : "позицій"} · переглянути ›
                    </div>
                    <div className="font-bold text-slate-900 tabular-nums">
                      {total.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} ₴
                    </div>
                  </div>
                  {r.status === "REJECTED" && r.rejectionReason && (
                    <div className="text-[12px] text-rose-700 bg-rose-50 rounded-lg px-3 py-2">
                      Причина: {r.rejectionReason}
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </LightShell>
  );
}
