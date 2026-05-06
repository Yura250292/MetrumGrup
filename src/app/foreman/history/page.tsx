import Link from "next/link";
import { auth } from "@/lib/auth";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { prisma } from "@/lib/prisma";
import { ForemanShell } from "../_components/foreman-shell";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, { label: string; classes: string }> = {
  DRAFT: { label: "Чернетка", classes: "bg-zinc-700 text-zinc-200" },
  PENDING_APPROVAL: { label: "На перевірці", classes: "bg-amber-500/20 text-amber-300" },
  APPROVED: { label: "Підтверджено", classes: "bg-emerald-500/20 text-emerald-300" },
  REJECTED: { label: "Відхилено", classes: "bg-rose-500/20 text-rose-300" },
  CANCELLED: { label: "Скасовано", classes: "bg-zinc-800 text-zinc-500" },
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
    <ForemanShell title="Мої звіти" backHref="/foreman">
      {sp.submitted && (
        <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/40 text-emerald-200 px-4 py-3 mb-4 text-sm">
          ✅ Звіт надіслано на перевірку менеджеру
        </div>
      )}

      {reports.length === 0 ? (
        <div className="mt-8 rounded-2xl bg-zinc-900 border border-zinc-800 p-6 text-center">
          <div className="text-5xl mb-3">📭</div>
          <div className="text-lg font-semibold mb-2">Поки немає звітів</div>
          <Link href="/foreman/report/folder" className="text-emerald-400 underline text-sm">
            Створити перший
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {reports.map((r) => {
            const total = r.items.reduce((sum, it) => sum + Number(it.amount), 0);
            const status = STATUS_LABELS[r.status] ?? { label: r.status, classes: "bg-zinc-800" };
            // DRAFT → продовжити редагувати у review screen.
            // Інші → read-only сторінка деталей.
            const href =
              r.status === "DRAFT"
                ? `/foreman/report/project/${r.project.id}/review/${r.id}`
                : `/foreman/history/${r.id}`;
            return (
              <li key={r.id}>
                <Link
                  href={href}
                  className="block rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-emerald-500 active:scale-[0.99] transition p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm text-zinc-500">{formatDate(r.occurredAt)}</div>
                      <div className="font-semibold text-white">{r.project.title}</div>
                    </div>
                    <span className={`text-xs font-semibold uppercase rounded-full px-3 py-1 ${status.classes}`}>
                      {status.label}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="text-sm text-zinc-400">
                      {r.items.length} {r.items.length === 1 ? "позиція" : "позицій"} · переглянути ›
                    </div>
                    <div className="font-bold text-emerald-400">{total.toFixed(2)} грн</div>
                  </div>
                  {r.status === "REJECTED" && r.rejectionReason && (
                    <div className="text-sm text-rose-300 bg-rose-500/10 rounded-lg px-3 py-2">
                      Причина: {r.rejectionReason}
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </ForemanShell>
  );
}
