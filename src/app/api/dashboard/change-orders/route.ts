import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse } from "@/lib/auth-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const userId = session.user.id;
  // Projects where current user is the registered client (Project.clientId).
  const projects = await prisma.project.findMany({
    where: { clientId: userId },
    select: { id: true },
  });
  const projectIds = projects.map((p) => p.id);
  if (projectIds.length === 0) return NextResponse.json({ orders: [] });

  const orders = await prisma.changeOrder.findMany({
    where: { projectId: { in: projectIds } },
    include: {
      project: { select: { id: true, title: true } },
      requestedBy: { select: { name: true } },
      _count: { select: { items: true } },
    },
    orderBy: { requestedAt: "desc" },
  });

  return NextResponse.json({
    orders: orders.map((co) => ({
      id: co.id,
      number: co.number,
      project: co.project,
      type: co.type,
      title: co.title,
      description: co.description,
      status: co.status,
      // Клієнт бачить вартість — це його умови.
      costImpact: Number(co.costImpact),
      scheduleImpactDays: co.scheduleImpactDays,
      requestedAt: co.requestedAt,
      requestedByName: co.requestedBy.name,
      itemCount: co._count.items,
      pdfUrl: co.pdfUrl,
    })),
  });
}
