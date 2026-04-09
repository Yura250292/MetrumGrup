import { prisma } from "@/lib/prisma";
import { ProjectStage, ProjectStatus } from "@prisma/client";

export type TeamMember = {
  id: string;
  name: string;
  avatar: string | null;
  role: string;
};

export type ProjectWithAggregations = {
  id: string;
  title: string;
  slug: string;
  status: ProjectStatus;
  currentStage: ProjectStage;
  stageProgress: number;
  totalBudget: number;
  totalPaid: number;
  address: string | null;
  startDate: Date | null;
  updatedAt: Date;
  client: { name: string };
  manager: TeamMember | null;
  team: TeamMember[];
  commentCount: number;
  unreadChatCount: number;
  lastActivityAt: Date;
};

export async function listProjectsWithAggregations(
  currentUserId: string
): Promise<ProjectWithAggregations[]> {
  const [projects, commentCounts] = await Promise.all([
    prisma.project.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        client: { select: { name: true } },
        manager: { select: { id: true, name: true, avatar: true, role: true } },
        conversation: {
          include: {
            participants: {
              include: {
                user: {
                  select: { id: true, name: true, avatar: true, role: true },
                },
              },
            },
          },
        },
      },
    }),
    prisma.comment.groupBy({
      by: ["entityId"],
      where: { entityType: "PROJECT", deletedAt: null },
      _count: { _all: true },
    }),
  ]);

  const commentCountMap = new Map(
    commentCounts.map((c) => [c.entityId, c._count._all])
  );

  return Promise.all(
    projects.map(async (project) => {
      // Build team: manager + chat participants (deduped by user.id)
      const teamMap = new Map<string, TeamMember>();
      if (project.manager) {
        teamMap.set(project.manager.id, project.manager);
      }
      if (project.conversation) {
        for (const p of project.conversation.participants) {
          if (!teamMap.has(p.user.id)) {
            teamMap.set(p.user.id, p.user);
          }
        }
      }

      // Unread chat count for the current user (0 if no conversation or not a participant)
      let unreadChatCount = 0;
      let lastChatMessageAt: Date | null = project.conversation?.lastMessageAt ?? null;
      if (project.conversation) {
        const myParticipation = project.conversation.participants.find(
          (p) => p.userId === currentUserId
        );
        if (myParticipation) {
          const lastReadAt = myParticipation.lastReadAt ?? new Date(0);
          unreadChatCount = await prisma.chatMessage.count({
            where: {
              conversationId: project.conversation.id,
              deletedAt: null,
              authorId: { not: currentUserId },
              createdAt: { gt: lastReadAt },
            },
          });
        }
      }

      const lastActivityCandidates: Date[] = [project.updatedAt];
      if (lastChatMessageAt) lastActivityCandidates.push(lastChatMessageAt);
      const lastActivityAt = new Date(
        Math.max(...lastActivityCandidates.map((d) => d.getTime()))
      );

      return {
        id: project.id,
        title: project.title,
        slug: project.slug,
        status: project.status,
        currentStage: project.currentStage,
        stageProgress: project.stageProgress,
        totalBudget: Number(project.totalBudget),
        totalPaid: Number(project.totalPaid),
        address: project.address,
        startDate: project.startDate,
        updatedAt: project.updatedAt,
        client: { name: project.client.name },
        manager: project.manager,
        team: Array.from(teamMap.values()),
        commentCount: commentCountMap.get(project.id) ?? 0,
        unreadChatCount,
        lastActivityAt,
      };
    })
  );
}
