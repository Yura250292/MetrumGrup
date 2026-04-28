import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ListTodo, AlertCircle, FlaskConical, Plus, FolderKanban } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FinancingView } from "./_components/financing-view";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import {
  assertCanAccessFirm,
  firmWhereForProject,
  isHomeFirmFor,
  getActiveRoleFromSession,
} from "@/lib/firm/scope";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";

export const dynamic = "force-dynamic";

export default async function AdminV2FinancingPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const sp = await searchParams;
  const projectId = sp.projectId;

  const { firmId } = await resolveFirmScopeForRequest(session);

  // Home-firm guard: користувач без прав на активну фірму — на дашборд.
  if (!isHomeFirmFor(session, firmId)) {
    redirect("/admin-v2");
  }

  // Per-firm role check: для shymilo93 на Group роль — HR (без доступу до Фінансування),
  // а на Studio — SUPER_ADMIN (повний доступ).
  const allowedRoles = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER"];
  const activeRole = getActiveRoleFromSession(session, firmId);
  if (!activeRole || !allowedRoles.includes(activeRole)) {
    redirect("/admin-v2");
  }
  const FIRM_PROJECT = firmWhereForProject(firmId);

  const [projects, users, activeProject, taskStats] = await Promise.all([
    prisma.project.findMany({
      where: { slug: { not: { startsWith: "temp-" } }, ...FIRM_PROJECT },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    }),
    prisma.user.findMany({
      where: {
        role: { in: ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER"] },
        ...(firmId ? { firmId } : {}),
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    projectId
      ? prisma.project.findUnique({
          where: { id: projectId },
          select: { id: true, title: true, isTestProject: true, firmId: true },
        })
      : Promise.resolve(null),
    projectId
      ? (async () => {
          const now = new Date();
          const [active, overdue] = await Promise.all([
            prisma.task.count({
              where: { projectId, isArchived: false, status: { isDone: false } },
            }),
            prisma.task.count({
              where: {
                projectId,
                isArchived: false,
                status: { isDone: false },
                dueDate: { lt: now },
              },
            }),
          ]);
          return { active, overdue };
        })()
      : Promise.resolve(null),
  ]);

  // 403 якщо користувач намагається відкрити фінанси чужої фірми за projectId
  if (activeProject) {
    assertCanAccessFirm(session, activeProject.firmId);
  }

  const canCreateProject =
    session.user.role === "SUPER_ADMIN" || session.user.role === "MANAGER";

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FolderKanban size={18} style={{ color: T.accentPrimary }} />
          <h1
            className="text-[18px] font-bold tracking-tight"
            style={{ color: T.textPrimary }}
          >
            Фінансування
          </h1>
          <span
            className="text-[11px]"
            style={{ color: T.textMuted }}
          >
            — одна база з Проєктами
          </span>
        </div>
        {canCreateProject && (
          <Link
            href="/admin-v2/projects/new"
            className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white transition active:scale-[0.97]"
            style={{ backgroundColor: T.accentPrimary }}
            title="Створити новий проєкт (з'явиться і тут, і у Проєктах)"
          >
            <Plus size={14} /> Новий проєкт
          </Link>
        )}
      </header>
      {activeProject && (
        <section
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3"
          style={{
            backgroundColor: T.panel,
            border: `1px solid ${T.borderSoft}`,
          }}
        >
          <div className="flex flex-wrap items-center gap-3">
            <span
              className="text-[10px] font-bold tracking-wider"
              style={{ color: T.textMuted }}
            >
              ПРОЄКТ
            </span>
            <span
              className="text-[15px] font-bold"
              style={{ color: T.textPrimary }}
            >
              {activeProject.title}
            </span>
            {activeProject.isTestProject && (
              <span
                className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide"
                style={{
                  backgroundColor: T.warningSoft,
                  color: T.warning,
                  border: `1px dashed ${T.warning}`,
                }}
                title="Тестовий проєкт — не рахується у KPI"
              >
                <FlaskConical size={11} /> ТЕСТ
              </span>
            )}
            {taskStats && (taskStats.active > 0 || taskStats.overdue > 0) && (
              <Link
                href={`/admin-v2/projects/${activeProject.id}?tab=tasks`}
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition hover:brightness-[0.95]"
                style={{
                  backgroundColor: T.panelElevated,
                  color: T.textPrimary,
                  border: `1px solid ${T.borderStrong}`,
                }}
                title="Перейти до задач проєкту"
              >
                <ListTodo size={12} /> {taskStats.active} активних
                {taskStats.overdue > 0 && (
                  <span
                    className="flex items-center gap-0.5 ml-1"
                    style={{ color: T.danger }}
                  >
                    <AlertCircle size={11} /> {taskStats.overdue}
                  </span>
                )}
              </Link>
            )}
          </div>
          <Link
            href={`/admin-v2/projects/${activeProject.id}`}
            className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white transition active:scale-[0.97]"
            style={{ backgroundColor: T.accentPrimary }}
          >
            До проєкту <ArrowRight size={14} />
          </Link>
        </section>
      )}
      <FinancingView
        projects={projects}
        users={users.map((u) => ({ id: u.id, name: u.name ?? "Без імені" }))}
        currentUserId={session.user.id}
        currentUserName={session.user.name ?? session.user.email ?? "Ви"}
      />
    </div>
  );
}
