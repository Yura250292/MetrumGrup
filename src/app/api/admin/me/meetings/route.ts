import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role === "CLIENT") {
    return NextResponse.json({ data: { items: [] } });
  }

  const uid = session.user.id;
  const { firmId } = await resolveFirmScopeForRequest(session);
  const activeRole = getActiveRoleFromSession(session, firmId);
  const isSuper = activeRole === "SUPER_ADMIN";
  if (!isSuper) {
    return NextResponse.json({ data: { items: [] } });
  }

  const since = new Date();
  since.setDate(since.getDate() - 14);

  // Скоуп через Meeting.firmId — наради тепер не привʼязуються до проєкту.
  const firmFilter = firmId ? { firmId } : {};

  const meetings = await prisma.meeting.findMany({
    where: {
      recordedAt: { gte: since },
      ...firmFilter,
      // Не-SUPER_ADMIN бачить лише свої наради; firm-scope вже фільтрує по фірмі.
      ...(isSuper ? {} : { createdById: uid }),
    },
    orderBy: { recordedAt: "desc" },
    take: 8,
    select: {
      id: true,
      title: true,
      status: true,
      recordedAt: true,
      audioDurationMs: true,
      summary: true,
    },
  });

  return NextResponse.json({ data: { items: meetings } });
}
