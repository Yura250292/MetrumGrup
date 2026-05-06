import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { prisma } from "@/lib/prisma";
import { getForemanGetUrl } from "@/lib/foreman/r2";
import { ForemanShell } from "../../_components/foreman-shell";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ reportId: string }>;
}

const STATUS_META: Record<
  string,
  { label: string; classes: string; description: string }
> = {
  DRAFT: {
    label: "Чернетка",
    classes: "bg-zinc-700 text-zinc-200",
    description: "Звіт ще не надіслано — можна продовжити редагування.",
  },
  PENDING_APPROVAL: {
    label: "На перевірці",
    classes: "bg-amber-500/20 text-amber-300",
    description: "Менеджер ще не переглянув цей звіт.",
  },
  APPROVED: {
    label: "Підтверджено",
    classes: "bg-emerald-500/20 text-emerald-300",
    description: "Звіт затверджено — суми записано у фактичні витрати проекту.",
  },
  REJECTED: {
    label: "Відхилено",
    classes: "bg-rose-500/20 text-rose-300",
    description: "Менеджер відхилив звіт. Можна створити новий.",
  },
  CANCELLED: {
    label: "Скасовано",
    classes: "bg-zinc-800 text-zinc-500",
    description: "Чернетку скасовано виконробом.",
  },
};

const COST_TYPE_LABELS: Record<string, string> = {
  MATERIAL: "МАТ",
  LABOR: "РОБ",
  SUBCONTRACT: "ПДР",
  EQUIPMENT: "ТЕХ",
  OVERHEAD: "НАК",
  OTHER: "ІНШ",
};

const COST_TYPE_CLASSES: Record<string, string> = {
  MATERIAL: "bg-emerald-500/15 text-emerald-400",
  LABOR: "bg-blue-500/15 text-blue-400",
  SUBCONTRACT: "bg-violet-500/15 text-violet-400",
  EQUIPMENT: "bg-amber-500/15 text-amber-400",
  OVERHEAD: "bg-zinc-700/50 text-zinc-300",
  OTHER: "bg-zinc-700/50 text-zinc-300",
};

function formatDate(d: Date) {
  return d.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDateTime(d: Date) {
  return d.toLocaleString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatNum(n: number | string | null) {
  if (n === null || n === undefined || n === "") return "—";
  const num = typeof n === "number" ? n : parseFloat(String(n).replace(",", "."));
  if (!isFinite(num)) return String(n);
  return num.toLocaleString("uk-UA", { maximumFractionDigits: 3 });
}

export default async function ForemanHistoryDetailPage({ params }: PageProps) {
  const { reportId } = await params;
  const session = await auth();
  if (!session?.user) return null;
  const { firmId } = await resolveFirmScopeForRequest(session);

  const report = await prisma.foremanReport.findFirst({
    where: {
      id: reportId,
      createdById: session.user.id,
      firmId: firmId ?? undefined,
    },
    include: {
      project: { select: { id: true, title: true } },
      items: { orderBy: { sortOrder: "asc" } },
      attachments: { orderBy: { createdAt: "asc" } },
      reviewedBy: { select: { id: true, name: true } },
    },
  });

  if (!report) notFound();

  const status = STATUS_META[report.status] ?? {
    label: report.status,
    classes: "bg-zinc-800",
    description: "",
  };

  const total = report.items.reduce((s, it) => s + Number(it.amount), 0);
  const totalLabor = report.items
    .filter((i) => i.costType === "LABOR")
    .reduce((s, i) => s + Number(i.amount), 0);
  const totalMaterial = report.items
    .filter((i) => i.costType === "MATERIAL")
    .reduce((s, i) => s + Number(i.amount), 0);
  const totalOther = total - totalLabor - totalMaterial;

  // Signed URLs для preview attachments
  const attachments = await Promise.all(
    report.attachments.map(async (a) => ({
      id: a.id,
      originalName: a.originalName,
      mimeType: a.mimeType,
      size: a.size,
      previewUrl: await getForemanGetUrl(a.r2Key, 600).catch(() => null),
    })),
  );

  return (
    <ForemanShell title={report.project.title} backHref="/foreman/history">
      <div className="space-y-4 pb-8">
        {/* Header card */}
        <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span
              className={`text-xs font-semibold uppercase rounded-full px-3 py-1 ${status.classes}`}
            >
              {status.label}
            </span>
            <span className="text-xs text-zinc-500">
              Дата: {formatDate(report.occurredAt)}
            </span>
          </div>
          <div className="text-xs text-zinc-400">{status.description}</div>

          {report.submittedAt && (
            <div className="text-xs text-zinc-500">
              Надіслано: {formatDateTime(report.submittedAt)}
            </div>
          )}
          {report.reviewedAt && (
            <div className="text-xs text-zinc-500">
              Переглянуто: {formatDateTime(report.reviewedAt)}
              {report.reviewedBy ? ` · ${report.reviewedBy.name}` : ""}
            </div>
          )}
          {report.rejectionReason && (
            <div className="text-sm text-rose-300 bg-rose-500/10 rounded-lg px-3 py-2 border border-rose-500/30">
              <span className="font-semibold">Причина відхилення:</span> {report.rejectionReason}
            </div>
          )}
        </div>

        {/* Totals */}
        <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-2">
          {totalMaterial > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Матеріали</span>
              <span className="font-semibold tabular-nums">{formatNum(totalMaterial)} грн</span>
            </div>
          )}
          {totalLabor > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Робота</span>
              <span className="font-semibold tabular-nums">{formatNum(totalLabor)} грн</span>
            </div>
          )}
          {totalOther > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Інше</span>
              <span className="font-semibold tabular-nums">{formatNum(totalOther)} грн</span>
            </div>
          )}
          <div className="flex justify-between text-base pt-2 border-t border-zinc-800">
            <span className="font-bold">Всього</span>
            <span className="font-bold text-emerald-400 tabular-nums">{formatNum(total)} грн</span>
          </div>
        </div>

        {/* Raw text */}
        {report.rawText && (
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4">
            <div className="text-xs font-semibold uppercase text-zinc-500 mb-2">
              Оригінальний текст
            </div>
            <pre className="text-xs whitespace-pre-wrap text-zinc-300 font-mono leading-relaxed">
              {report.rawText}
            </pre>
          </div>
        )}

        {/* Attachments */}
        {attachments.length > 0 && (
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4">
            <div className="text-xs font-semibold uppercase text-zinc-500 mb-3">
              Прикріплені файли ({attachments.length})
            </div>
            <div className="grid grid-cols-2 gap-2">
              {attachments.map((a) => (
                <a
                  key={a.id}
                  href={a.previewUrl ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-lg overflow-hidden bg-zinc-950 border border-zinc-800 hover:border-emerald-500 transition"
                >
                  {a.mimeType.startsWith("image/") && a.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- presigned R2 URL
                    <img
                      src={a.previewUrl}
                      alt={a.originalName}
                      className="w-full h-28 object-cover"
                    />
                  ) : (
                    <div className="h-28 flex items-center justify-center text-3xl">
                      {a.mimeType.includes("pdf") ? "📄" : "📊"}
                    </div>
                  )}
                  <div className="px-2 py-1.5 text-[11px] truncate">{a.originalName}</div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Items */}
        {report.items.length > 0 && (
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden">
            <div className="px-4 py-2.5 text-xs font-semibold uppercase text-zinc-500 border-b border-zinc-800">
              Позиції ({report.items.length})
            </div>
            <ul className="divide-y divide-zinc-800">
              {report.items.map((it, idx) => {
                const badge = COST_TYPE_LABELS[it.costType] ?? "?";
                const badgeClass = COST_TYPE_CLASSES[it.costType] ?? "bg-zinc-700/50 text-zinc-300";
                const qtyUnit = it.quantity
                  ? `${formatNum(Number(it.quantity))}${it.unit ? ` ${it.unit}` : ""}`
                  : "";
                return (
                  <li key={it.id} className="flex items-start gap-2 px-3 py-2.5">
                    <span className="text-xs text-zinc-500 font-mono w-5 shrink-0 pt-0.5">
                      {idx + 1}
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase rounded px-1.5 py-0.5 shrink-0 mt-0.5 ${badgeClass}`}
                    >
                      {badge}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white leading-tight">{it.title}</div>
                      {qtyUnit && (
                        <div className="text-[11px] text-zinc-500 mt-0.5 tabular-nums">
                          {qtyUnit}
                          {it.unitPrice ? ` × ${formatNum(Number(it.unitPrice))} грн` : ""}
                        </div>
                      )}
                    </div>
                    <span className="text-sm font-bold text-emerald-400 shrink-0 tabular-nums whitespace-nowrap">
                      {formatNum(Number(it.amount))} грн
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Resume editing for DRAFT (rare path — typically DRAFT card links to review directly) */}
        {report.status === "DRAFT" && (
          <Link
            href={`/foreman/report/project/${report.project.id}/review/${report.id}`}
            className="block w-full text-center min-h-[64px] rounded-2xl bg-emerald-500 text-white text-lg font-semibold py-4 active:scale-[0.99] transition"
          >
            Продовжити редагування
          </Link>
        )}

        {/* Action for REJECTED — start a new report on same project */}
        {report.status === "REJECTED" && (
          <Link
            href={`/foreman/report/project/${report.project.id}`}
            className="block w-full text-center min-h-[64px] rounded-2xl bg-emerald-500 text-white text-lg font-semibold py-4 active:scale-[0.99] transition"
          >
            Створити новий звіт по цьому проекту
          </Link>
        )}
      </div>
    </ForemanShell>
  );
}
