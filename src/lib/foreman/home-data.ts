import { prisma } from "@/lib/prisma";
import type { ActiveProjectInfo } from "@/app/foreman/_components/v2/active-project-card";
import type { TodaySectionData } from "@/app/foreman/_components/v2/today-section";

/**
 * Picks the "active project" for foreman home — most-recently assigned project
 * with status=ACTIVE in the active firm, joined with its current stage record.
 * Returns null if foreman has no active projects.
 */
export async function getActiveProjectForForeman(
  userId: string,
  firmId: string | null,
): Promise<ActiveProjectInfo | null> {
  const membership = await prisma.projectMember.findFirst({
    where: {
      userId,
      roleInProject: "FOREMAN",
      isActive: true,
      project: {
        firmId: firmId ?? undefined,
        status: "ACTIVE",
      },
    },
    orderBy: { joinedAt: "desc" },
    include: {
      project: {
        select: {
          id: true,
          slug: true,
          title: true,
          address: true,
          currentStageRecordId: true,
        },
      },
    },
  });

  if (!membership) return null;
  const p = membership.project;

  let stageName: string | null = null;
  let daysLeft: number | null = null;
  if (p.currentStageRecordId) {
    const stage = await prisma.projectStageRecord.findUnique({
      where: { id: p.currentStageRecordId },
      select: { stage: true, customName: true, endDate: true },
    });
    if (stage) {
      stageName = stage.customName ?? stageToLabel(stage.stage);
      if (stage.endDate) {
        const ms = stage.endDate.getTime() - Date.now();
        daysLeft = Math.ceil(ms / (1000 * 60 * 60 * 24));
      }
    }
  }

  return {
    id: p.id,
    code: p.slug ?? null,
    title: p.title,
    address: p.address ?? null,
    stageName,
    daysLeft,
  };
}

/**
 * Best-effort "сьогодні" snapshot. Tasks = in-progress stage records for
 * active project. Crew = foreman's team count (TeamMember). Weather = null
 * (no weather provider wired yet — UI hides the tile gracefully).
 */
export async function getTodaySnapshot(
  userId: string,
  firmId: string | null,
  activeProjectId: string | null,
): Promise<TodaySectionData> {
  const [stages, teamMembership] = await Promise.all([
    activeProjectId
      ? prisma.projectStageRecord.findMany({
          where: {
            projectId: activeProjectId,
            status: { in: ["IN_PROGRESS", "PENDING"] },
            isHidden: false,
            kind: "STAGE",
          },
          select: { id: true, stage: true, customName: true, status: true },
          orderBy: [{ sortOrder: "asc" }],
          take: 5,
        })
      : Promise.resolve([]),
    prisma.teamMember.findFirst({
      where: { userId },
      include: {
        team: {
          select: {
            id: true,
            name: true,
            _count: { select: { members: true } },
          },
        },
      },
    }),
  ]);

  const inProgress = stages.filter((s) => s.status === "IN_PROGRESS");
  const tasksCount = inProgress.length > 0 ? inProgress.length : stages.length;
  const tasksHint =
    inProgress[0]?.customName ??
    (inProgress[0]?.stage ? stageToLabel(inProgress[0].stage) : null) ??
    stages[0]?.customName ??
    (stages[0]?.stage ? stageToLabel(stages[0].stage) : null);

  const crewTotal = teamMembership?.team?._count.members ?? 0;
  // Без табелю — припускаємо що всі присутні. P2: інтеграція з табелем.
  const crewPresent = crewTotal;
  const crewName = teamMembership?.team?.name ?? null;

  void firmId;
  return {
    tasksCount,
    tasksHint,
    crewPresent,
    crewTotal,
    crewName,
    weather: null,
  };
}

function stageToLabel(stage: string | null | undefined): string | null {
  if (!stage) return null;
  const MAP: Record<string, string> = {
    DESIGN: "Проєктування",
    PREPARATION: "Підготовка",
    DEMOLITION: "Демонтаж",
    ROUGH: "Чорнові роботи",
    ENGINEERING: "Інженерні мережі",
    FINISH: "Чистові роботи",
    FACADE: "Фасадні роботи",
    LANDSCAPE: "Благоустрій",
    HANDOVER: "Здача обʼєкту",
  };
  return MAP[stage] ?? stage;
}
