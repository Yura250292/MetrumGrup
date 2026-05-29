import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import {
  ArrowRight,
  ExternalLink,
  FileText,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  Sparkles,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function V2PreviewHubPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { firmId } = await resolveFirmScopeForRequest(session);

  const sampleProjects = await prisma.project.findMany({
    where: firmId ? { firmId } : undefined,
    select: { id: true, slug: true, title: true, status: true, isTestProject: true },
    orderBy: { updatedAt: "desc" },
    take: 6,
  });

  const generalRoutes = [
    {
      href: "/admin-v2/dashboard-v2",
      icon: LayoutDashboard,
      title: "Робочий стіл v2",
      sub: "5 KPI · Watchlist топ-проєктів · Cross-project ризики · Швидкі дії",
      tone: "primary" as const,
    },
    {
      href: "/admin-v2/estimates-v2",
      icon: FileText,
      title: "Кошториси v2",
      sub: "Status-фільтри · Avg margin · AI-згенеровано dark accent · Risk markers",
      tone: "violet" as const,
    },
  ];

  return (
    <div className="flex flex-col gap-6 pb-12">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider"
              style={{ backgroundColor: T.violet, color: "#FFFFFF" }}
            >
              <Sparkles size={11} />
              V2 PREVIEW HUB
            </span>
          </div>
          <h1
            className="text-[24px] font-bold leading-tight"
            style={{ color: T.textPrimary }}
          >
            Спробувати нову версію інтерфейсу
          </h1>
          <p className="text-[13px] mt-1 max-w-xl" style={{ color: T.textSecondary }}>
            Нижче — список preview-маршрутів за новим дизайном. Це read-only
            варіанти існуючих сторінок: дані реальні, але дії (Edit, Завершити, тощо)
            ведуть на стандартні сторінки. Якщо щось подобається — скажи, і
            доопрацюю функціонал.
          </p>
        </div>
        <Link
          href="/admin-v2"
          className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-semibold flex-shrink-0"
          style={{
            backgroundColor: T.panel,
            border: `1px solid ${T.borderSoft}`,
            color: T.textSecondary,
          }}
        >
          ← Повернутись
        </Link>
      </header>

      <section>
        <h2
          className="text-[12px] font-bold tracking-wider mb-3"
          style={{ color: T.textMuted }}
        >
          ЗАГАЛЬНІ СТОРІНКИ
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {generalRoutes.map((r) => (
            <Link
              key={r.href}
              href={r.href}
              className="group relative overflow-hidden rounded-2xl p-5 transition hover:brightness-95"
              style={{
                backgroundColor: T.panel,
                border: `1px solid ${T.borderSoft}`,
              }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-xl flex-shrink-0"
                  style={{
                    backgroundColor:
                      r.tone === "violet" ? T.violetSoft : T.accentPrimarySoft,
                  }}
                >
                  <r.icon
                    size={20}
                    style={{
                      color: r.tone === "violet" ? T.violet : T.accentPrimary,
                    }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3
                      className="text-[15px] font-bold"
                      style={{ color: T.textPrimary }}
                    >
                      {r.title}
                    </h3>
                    <ExternalLink
                      size={12}
                      style={{ color: T.textMuted }}
                      className="opacity-0 group-hover:opacity-100 transition"
                    />
                  </div>
                  <p
                    className="text-[12px] mt-1"
                    style={{ color: T.textSecondary }}
                  >
                    {r.sub}
                  </p>
                  <div
                    className="text-[10px] font-mono mt-2 truncate"
                    style={{ color: T.textMuted }}
                  >
                    {r.href}
                  </div>
                </div>
                <ArrowRight
                  size={16}
                  style={{ color: T.textMuted }}
                  className="self-center flex-shrink-0 group-hover:translate-x-1 transition"
                />
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2
          className="text-[12px] font-bold tracking-wider mb-3"
          style={{ color: T.textMuted }}
        >
          СТОРІНКИ КОНКРЕТНОГО ПРОЄКТУ
        </h2>
        <p className="text-[12px] mb-3" style={{ color: T.textSecondary }}>
          Обери проєкт, щоб побачити його у v2-вигляді — повна деталь і вкладка
          Етапи з Gantt-таймлайном.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {sampleProjects.length === 0 && (
            <div
              className="rounded-xl p-5 text-[12px] text-center"
              style={{
                backgroundColor: T.panel,
                border: `1px solid ${T.borderSoft}`,
                color: T.textMuted,
              }}
            >
              Проєктів у твоїй фірмі немає. Створи через «Новий проєкт» — тоді
              зʼявляться v2-preview лінки.
            </div>
          )}
          {sampleProjects.map((p) => (
            <article
              key={p.id}
              className="rounded-xl p-4"
              style={{
                backgroundColor: T.panel,
                border: `1px solid ${T.borderSoft}`,
                opacity: p.isTestProject ? 0.7 : 1,
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="text-[10px] font-bold tracking-wider tabular-nums"
                  style={{ color: T.textMuted }}
                >
                  PRJ-{p.slug.toUpperCase().slice(0, 8)}
                </span>
                {p.isTestProject && (
                  <span
                    className="rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider"
                    style={{ backgroundColor: T.warningSoft, color: T.warning }}
                  >
                    ТЕСТ
                  </span>
                )}
              </div>
              <h3
                className="text-[14px] font-bold leading-tight truncate"
                style={{ color: T.textPrimary }}
                title={p.title}
              >
                {p.title}
              </h3>
              <div className="flex flex-col gap-1.5 mt-3">
                <Link
                  href={`/admin-v2/projects/${p.id}/v2`}
                  className="group flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-semibold transition hover:brightness-95"
                  style={{
                    backgroundColor: T.accentPrimarySoft,
                    color: T.accentPrimary,
                  }}
                >
                  <FolderKanban size={14} />
                  Деталь проєкту v2
                  <ArrowRight
                    size={12}
                    className="ml-auto group-hover:translate-x-0.5 transition"
                  />
                </Link>
                <Link
                  href={`/admin-v2/projects/${p.id}/stages-v2`}
                  className="group flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-semibold transition hover:brightness-95"
                  style={{
                    backgroundColor: T.successSoft,
                    color: T.success,
                  }}
                >
                  <ListChecks size={14} />
                  Етапи + Gantt v2
                  <ArrowRight
                    size={12}
                    className="ml-auto group-hover:translate-x-0.5 transition"
                  />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section
        className="rounded-2xl p-5"
        style={{
          backgroundColor: T.panelSoft,
          border: `1px dashed ${T.borderSoft}`,
        }}
      >
        <h2
          className="text-[12px] font-bold tracking-wider mb-2"
          style={{ color: T.textMuted }}
        >
          ЩО ПРАЦЮЄ І НІ
        </h2>
        <ul
          className="text-[12px] flex flex-col gap-1.5"
          style={{ color: T.textSecondary }}
        >
          <li className="flex items-start gap-2">
            <span style={{ color: T.success }}>✓</span>
            <span>
              <strong style={{ color: T.textPrimary }}>Працює:</strong> рендер з
              реальними даними, фільтри (URL-параметри), кольорове кодування,
              навігація між сторінками, RBAC (canViewFinance, firm scope).
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span style={{ color: T.warning }}>⚠</span>
            <span>
              <strong style={{ color: T.textPrimary }}>Поки не реалізовано:</strong>{" "}
              Edit/Save форми, кнопки «Завершити» / «Опублікувати», AI-помічник,
              chart-візуалізації (cashflow area, margin bars).
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span style={{ color: T.sky }}>i</span>
            <span>
              <strong style={{ color: T.textPrimary }}>Стара версія:</strong>{" "}
              Усі стандартні маршрути (без -v2) працюють як і раніше — нічого не
              зламано.
            </span>
          </li>
        </ul>
      </section>
    </div>
  );
}
