import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

/**
 * Personal tasks for the current user across all projects they have access to.
 * Used by /admin-v2/me dashboard.
 *
 * CLIENT role returns empty array since tasks are never visible to clients.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return unauthorizedResponse();
    if (session.user.role === "CLIENT") {
      return NextResponse.json({ data: { items: [] } });
    }

    const url = new URL(request.url);
    const scope = url.searchParams.get("scope") ?? "assigned"; // assigned|created|watching|all
    const includeCompleted = url.searchParams.get("includeCompleted") === "true";
    const projectIdsRaw = url.searchParams.get("projectIds");

    const uid = session.user.id;
    const baseWhere: Record<string, unknown> = {
      isArchived: false,
      ...(includeCompleted
        ? {}
        : {
            status: {
              isDone: false,
            },
          }),
      ...(projectIdsRaw
        ? { projectId: { in: projectIdsRaw.split(",").filter(Boolean) } }
        : {}),
    };

    let where;
    if (scope === "created") {
      where = { ...baseWhere, createdById: uid };
    } else if (scope === "watching") {
      where = { ...baseWhere, watchers: { some: { userId: uid } } };
    } else if (scope === "all") {
      where = {
        ...baseWhere,
        OR: [
          { createdById: uid },
          { assignees: { some: { userId: uid } } },
          { watchers: { some: { userId: uid } } },
        ],
      };
    } else {
      where = { ...baseWhere, assignees: { some: { userId: uid } } };
    }

    const tasks = await prisma.task.findMany({
      where,
      include: {
        project: { select: { id: true, title: true } },
        status: true,
        stage: { select: { id: true, stage: true } },
        createdBy: { select: { id: true, name: true, avatar: true } },
        assignees: {
          include: { user: { select: { id: true, name: true, avatar: true } } },
        },
        watchers: { select: { userId: true } },
        labels: { include: { label: true } },
        checklist: {
          where: { isDone: false },
          orderBy: { position: "asc" },
          take: 1,
          select: { id: true, content: true },
        },
        incomingDeps: {
          where: { predecessor: { status: { isDone: false } } },
          select: { id: true },
        },
        outgoingDeps: {
          where: { successor: { status: { isDone: false } } },
          select: { id: true },
        },
        _count: { select: { checklist: true, subtasks: true } },
      },
      orderBy: [
        { dueDate: { sort: "asc", nulls: "last" } },
        { priority: "desc" },
      ],
      take: 200,
    });

    // Flatten to shape expected by UI — pull counts out of relation arrays.
    const items = tasks.map((t) => ({
      ...t,
      firstUndoneChecklistItem: t.checklist[0]?.content ?? null,
      incomingDepsCount: t.incomingDeps.length,
      outgoingDepsCount: t.outgoingDeps.length,
      // Keep only watcher user IDs on client for lightweight checks.
      watchers: t.watchers.map((w) => ({ userId: w.userId })),
      // Remove the raw relation arrays we just summarized.
      checklist: undefined,
      incomingDeps: undefined,
      outgoingDeps: undefined,
    }));

    return NextResponse.json({ data: { items } });
  } catch (err) {
    console.error("[me/tasks] error:", err);
    return NextResponse.json(
      { error: "Помилка сервера" },
      { status: 500 }
    );
  }
}
