import { auth } from "@/lib/auth";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { prisma } from "@/lib/prisma";
import { LightShell } from "./_components/v2/light-shell";
import { HomeContent } from "./_components/v2/home-content";
import { getActiveProjectForForeman, getTodaySnapshot } from "@/lib/foreman/home-data";

export const dynamic = "force-dynamic";

export default async function ForemanHomePage() {
  const session = await auth();
  const userName = session?.user?.name?.split(" ")[0] ?? "Виконроб";
  const { firmId } = await resolveFirmScopeForRequest(session);
  const userId = session?.user?.id;

  const [pending, activeProject, hasAnyProject] = await Promise.all([
    userId
      ? prisma.foremanReport.count({
          where: {
            createdById: userId,
            status: { in: ["PENDING_APPROVAL", "NEEDS_REVISION"] },
            firmId: firmId ?? undefined,
          },
        })
      : Promise.resolve(0),
    userId ? getActiveProjectForForeman(userId, firmId) : Promise.resolve(null),
    userId
      ? prisma.projectMember.findFirst({
          where: {
            userId,
            roleInProject: "FOREMAN",
            isActive: true,
            project: { firmId: firmId ?? undefined },
          },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  const today = userId
    ? await getTodaySnapshot(userId, firmId, activeProject?.id ?? null)
    : {
        tasksCount: 0,
        tasksHint: null,
        crewPresent: 0,
        crewTotal: 0,
        crewName: null,
        weather: null,
      };

  return (
    <LightShell isRoot showLogout>
      <HomeContent
        userName={userName}
        pending={pending}
        activeProject={activeProject}
        today={today}
        hasAnyProject={!!hasAnyProject}
      />
    </LightShell>
  );
}
