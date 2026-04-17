import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateShort } from "@/lib/utils";
import { Plus, FileText, Newspaper } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Чернетка",
  PUBLISHED: "Опубліковано",
  ARCHIVED: "Архів",
};

export default async function AdminV2NewsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const articles = await prisma.newsArticle.findMany({
    include: { createdBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  const publishedCount = articles.filter((a) => a.status === "PUBLISHED").length;

  return (
    <div className="flex flex-col gap-8">
      {/* Hero */}
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
            ПУБЛІЧНИЙ САЙТ
          </span>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight" style={{ color: T.textPrimary }}>
            Новини та акції
          </h1>
          <p className="text-[15px]" style={{ color: T.textSecondary }}>
            {articles.length} статей · {publishedCount} опубліковано
          </p>
        </div>
        <Link
          href="/admin/cms/news"
          className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white transition hover:brightness-95"
          style={{ backgroundColor: T.accentPrimary }}
        >
          <Plus size={16} /> Додати
        </Link>
      </section>

      {articles.length === 0 ? (
        <EmptyState />
      ) : (
        <section className="flex flex-col gap-2">
          {articles.map((a) => (
            <div
              key={a.id}
              className="flex items-start justify-between gap-3 rounded-2xl p-5"
              style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
            >
              <div
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: T.accentPrimarySoft }}
              >
                <Newspaper size={18} style={{ color: T.accentPrimary }} />
              </div>
              <div className="flex flex-1 flex-col gap-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[14px] font-semibold truncate" style={{ color: T.textPrimary }}>
                    {a.title}
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold flex-shrink-0"
                    style={{
                      backgroundColor:
                        a.status === "PUBLISHED"
                          ? T.successSoft
                          : a.status === "ARCHIVED"
                            ? T.panelElevated
                            : T.warningSoft,
                      color:
                        a.status === "PUBLISHED"
                          ? T.success
                          : a.status === "ARCHIVED"
                            ? T.textMuted
                            : T.warning,
                    }}
                  >
                    {STATUS_LABELS[a.status] ?? a.status}
                  </span>
                </div>
                <span className="text-[11px]" style={{ color: T.textMuted }}>
                  {a.createdBy.name} · {formatDateShort(a.createdAt)}
                </span>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-2xl py-16 text-center"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <div
        className="flex h-14 w-14 items-center justify-center rounded-full"
        style={{ backgroundColor: T.accentPrimarySoft }}
      >
        <FileText size={28} style={{ color: T.accentPrimary }} />
      </div>
      <span className="text-[15px] font-semibold" style={{ color: T.textPrimary }}>
        Немає новин
      </span>
      <span className="text-[12px]" style={{ color: T.textMuted }}>
        Додайте першу статтю для публічного сайту
      </span>
    </div>
  );
}
