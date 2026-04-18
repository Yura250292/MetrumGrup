import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return unauthorizedResponse();
    if (session.user.role === "CLIENT") {
      return NextResponse.json({
        data: {
          counts: { assigned: 0, overdue: 0, dueToday: 0, completed: 0, unread: 0 },
          recent: [],
          upcoming: [],
        },
      });
    }

    const uid = session.user.id;
    const now = new Date();
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const baseAssigned = {
      isArchived: false,
      assignees: { some: { userId: uid } },
    } as const;

    const [assignedTotal, overdue, dueToday, completed, unread, upcoming] =
      await Promise.all([
        prisma.task.count({
          where: { ...baseAssigned, status: { isDone: false } },
        }),
        prisma.task.count({
          where: {
            ...baseAssigned,
            status: { isDone: false },
            dueDate: { lt: now },
          },
        }),
        prisma.task.count({
          where: {
            ...baseAssigned,
            status: { isDone: false },
            dueDate: { gte: startOfToday, lte: endOfToday },
          },
        }),
        prisma.task.count({
          where: {
            ...baseAssigned,
            status: { isDone: true },
            completedAt: { gte: new Date(now.getTime() - 7 * 24 * 3600 * 1000) },
          },
        }),
        prisma.notification.count({
          where: { userId: uid, isRead: false },
        }),
        prisma.task.findMany({
          where: { ...baseAssigned, status: { isDone: false }, dueDate: { gte: now } },
          include: {
            project: { select: { id: true, title: true } },
            status: true,
          },
          orderBy: { dueDate: "asc" },
          take: 10,
        }),
      ]);

    const recentNotifications = await prisma.notification.findMany({
      where: { userId: uid },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    return NextResponse.json({
      data: {
        counts: {
          assigned: assignedTotal,
          overdue,
          dueToday,
          completed,
          unread,
        },
        upcoming,
        recent: recentNotifications,
      },
    });
  } catch (err) {
    console.error("[me/dashboard] error:", err);
    return NextResponse.json(
      { error: "Помилка сервера" },
      { status: 500 }
    );
  }
}
