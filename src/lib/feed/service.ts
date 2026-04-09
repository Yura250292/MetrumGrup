import { prisma } from "@/lib/prisma";

export type FeedKind =
  | "completion_act"
  | "photo_report"
  | "estimate_approved"
  | "comment"
  | "chat_message";

export type FeedActor = {
  id: string;
  name: string;
  avatar: string | null;
};

export type FeedProject = {
  id: string;
  title: string;
  slug: string;
};

export type FeedItem = {
  id: string;
  kind: FeedKind;
  title: string;
  subtitle: string | null;
  createdAt: Date;
  project: FeedProject | null;
  actor: FeedActor | null;
  link: string;
  preview?: string;
  amount?: number;
};

const MENTION_REGEX = /<@[a-z0-9_-]+>/gi;

function previewBody(body: string, maxLength = 120): string {
  return body.replace(MENTION_REGEX, "@…").trim().slice(0, maxLength);
}

export async function listFeed(opts: { limit?: number } = {}): Promise<{
  items: FeedItem[];
  nextCursor: string | null;
}> {
  const limit = opts.limit ?? 20;
  const fetchLimit = Math.max(limit * 2, 10); // pull extra from each source

  const [completionActs, photoReports, approvedEstimates, comments, chatMessages] =
    await Promise.all([
      prisma.completionAct.findMany({
        take: fetchLimit,
        orderBy: { createdAt: "desc" },
        include: {
          project: { select: { id: true, title: true, slug: true } },
        },
      }),
      prisma.photoReport.findMany({
        take: fetchLimit,
        orderBy: { createdAt: "desc" },
        include: {
          project: { select: { id: true, title: true, slug: true } },
          createdBy: { select: { id: true, name: true, avatar: true } },
          _count: { select: { images: true } },
        },
      }),
      prisma.estimate.findMany({
        where: { status: "APPROVED", approvedAt: { not: null } },
        take: fetchLimit,
        orderBy: { approvedAt: "desc" },
        include: {
          project: { select: { id: true, title: true, slug: true } },
          createdBy: { select: { id: true, name: true, avatar: true } },
        },
      }),
      prisma.comment.findMany({
        where: { deletedAt: null },
        take: fetchLimit,
        orderBy: { createdAt: "desc" },
        include: {
          author: { select: { id: true, name: true, avatar: true } },
        },
      }),
      prisma.chatMessage.findMany({
        where: {
          deletedAt: null,
          conversation: { type: { in: ["PROJECT", "ESTIMATE"] } },
        },
        take: fetchLimit,
        orderBy: { createdAt: "desc" },
        include: {
          author: { select: { id: true, name: true, avatar: true } },
          conversation: {
            include: {
              project: { select: { id: true, title: true, slug: true } },
              estimate: {
                select: {
                  id: true,
                  number: true,
                  project: { select: { id: true, title: true, slug: true } },
                },
              },
            },
          },
        },
      }),
    ]);

  // Resolve project lookups for ESTIMATE comments in one batch
  const estimateCommentIds = comments
    .filter((c) => c.entityType === "ESTIMATE")
    .map((c) => c.entityId);
  const estimateProjectMap = new Map<
    string,
    { id: string; title: string; slug: string }
  >();
  if (estimateCommentIds.length > 0) {
    const estimates = await prisma.estimate.findMany({
      where: { id: { in: estimateCommentIds } },
      select: {
        id: true,
        project: { select: { id: true, title: true, slug: true } },
      },
    });
    for (const e of estimates) {
      if (e.project) estimateProjectMap.set(e.id, e.project);
    }
  }

  // For PROJECT comments, just look up the project
  const projectCommentIds = comments
    .filter((c) => c.entityType === "PROJECT")
    .map((c) => c.entityId);
  const projectMap = new Map<
    string,
    { id: string; title: string; slug: string }
  >();
  if (projectCommentIds.length > 0) {
    const projects = await prisma.project.findMany({
      where: { id: { in: projectCommentIds } },
      select: { id: true, title: true, slug: true },
    });
    for (const p of projects) projectMap.set(p.id, p);
  }

  const items: FeedItem[] = [];

  for (const act of completionActs) {
    items.push({
      id: `completion_act:${act.id}`,
      kind: "completion_act",
      title: `Акт виконаних робіт №${act.number}`,
      subtitle: act.title,
      createdAt: act.createdAt,
      project: act.project,
      actor: null,
      link: `/admin/projects/${act.projectId}`,
      amount: Number(act.amount),
    });
  }

  for (const report of photoReports) {
    items.push({
      id: `photo_report:${report.id}`,
      kind: "photo_report",
      title: report.title,
      subtitle: `${report._count.images} фото`,
      createdAt: report.createdAt,
      project: report.project,
      actor: report.createdBy,
      link: `/admin/projects/${report.projectId}`,
    });
  }

  for (const est of approvedEstimates) {
    items.push({
      id: `estimate_approved:${est.id}`,
      kind: "estimate_approved",
      title: `Кошторис ${est.number} затверджено`,
      subtitle: est.title,
      createdAt: est.approvedAt ?? est.updatedAt,
      project: est.project,
      actor: est.createdBy,
      link: `/admin/estimates/${est.id}`,
      amount: Number(est.finalClientPrice ?? est.finalAmount),
    });
  }

  for (const c of comments) {
    let project: FeedProject | null = null;
    let link = "/admin";
    if (c.entityType === "PROJECT") {
      project = projectMap.get(c.entityId) ?? null;
      link = `/admin/projects/${c.entityId}`;
    } else if (c.entityType === "ESTIMATE") {
      project = estimateProjectMap.get(c.entityId) ?? null;
      link = `/admin/estimates/${c.entityId}`;
    }
    items.push({
      id: `comment:${c.id}`,
      kind: "comment",
      title:
        c.entityType === "PROJECT"
          ? "Коментар до проєкту"
          : "Коментар до кошторису",
      subtitle: null,
      createdAt: c.createdAt,
      project,
      actor: c.author,
      link,
      preview: previewBody(c.body),
    });
  }

  for (const msg of chatMessages) {
    const conv = msg.conversation;
    let project: FeedProject | null = null;
    let titleText = "Повідомлення в каналі";
    if (conv.type === "PROJECT" && conv.project) {
      project = conv.project;
      titleText = `Чат проєкту: ${conv.project.title}`;
    } else if (conv.type === "ESTIMATE" && conv.estimate) {
      project = conv.estimate.project;
      titleText = `Чат кошторису ${conv.estimate.number}`;
    }
    items.push({
      id: `chat_message:${msg.id}`,
      kind: "chat_message",
      title: titleText,
      subtitle: null,
      createdAt: msg.createdAt,
      project,
      actor: msg.author,
      link: `/admin/chat/${msg.conversationId}`,
      preview: previewBody(msg.body),
    });
  }

  items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const sliced = items.slice(0, limit);
  const nextCursor =
    items.length > limit ? sliced[sliced.length - 1].createdAt.toISOString() : null;

  return { items: sliced, nextCursor };
}
