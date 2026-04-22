import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Globe, Plus, Image as ImageIcon } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

export const dynamic = "force-dynamic";

export default async function AdminV2PortfolioPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const projects = await prisma.portfolioProject.findMany({
    orderBy: { sortOrder: "asc" },
  });

  const publishedCount = projects.filter((p) => p.isPublished).length;

  return (
    <div className="flex flex-col gap-8">
      {/* Hero */}
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
            ПУБЛІЧНИЙ САЙТ
          </span>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight" style={{ color: T.textPrimary }}>
            Портфоліо
          </h1>
          <p className="text-[15px]" style={{ color: T.textSecondary }}>
            {projects.length} проєктів · {publishedCount} опубліковано
          </p>
        </div>
        <Link
          href="/admin-v2/cms/portfolio"
          className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white transition hover:brightness-95"
          style={{ backgroundColor: T.accentPrimary }}
        >
          <Plus size={16} /> Додати проєкт
        </Link>
      </section>

      {/* Grid */}
      {projects.length === 0 ? (
        <EmptyState />
      ) : (
        <section className="grid grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
          {projects.map((p) => (
            <div
              key={p.id}
              className="overflow-hidden rounded-2xl"
              style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
            >
              <div
                className="aspect-video flex items-center justify-center"
                style={{ backgroundColor: T.panelElevated }}
              >
                {p.coverImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.coverImage} alt={p.title} className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon size={32} style={{ color: T.textMuted }} />
                )}
              </div>
              <div className="flex flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-[14px] font-semibold truncate" style={{ color: T.textPrimary }}>
                    {p.title}
                  </h3>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold flex-shrink-0"
                    style={{
                      backgroundColor: p.isPublished ? T.successSoft : T.panelElevated,
                      color: p.isPublished ? T.success : T.textMuted,
                    }}
                  >
                    {p.isPublished ? "Опубліковано" : "Чернетка"}
                  </span>
                </div>
                <p className="text-[11px]" style={{ color: T.textMuted }}>
                  {p.category}
                </p>
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
        <Globe size={28} style={{ color: T.accentPrimary }} />
      </div>
      <span className="text-[15px] font-semibold" style={{ color: T.textPrimary }}>
        Немає проєктів у портфоліо
      </span>
      <span className="text-[12px]" style={{ color: T.textMuted }}>
        Додайте виконані проєкти для публічного сайту
      </span>
    </div>
  );
}
