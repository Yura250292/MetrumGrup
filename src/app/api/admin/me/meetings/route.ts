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

  const since = new Date();
  since.setDate(since.getDate() - 14);

  // Firm-scope: meeting завжди має projectId (required), тож скоупимо через project.firmId.
  const firmFilter: { project?: { firmId: string } } = firmId
    ? { project: { firmId } }
    : {};

  const meetings = await prisma.meeting.findMany({
    where: {
      recordedAt: { gte: since },
      ...(isSuper
        ? firmFilter
        : {
            AND: [
              firmFilter,
              {
                OR: [
                  { createdById: uid },
                  {
                    project: {
                      OR: [
                        { managerId: uid },
                        { members: { some: { userId: uid, isActive: true } } },
                        { isInternal: true },
                      ],
                    },
                  },
                ],
              },
            ],
          }),
    },
    orderBy: { recordedAt: "desc" },
    take: 8,
    select: {
      id: true,
      title: true,
      status: true,
      recordedAt: true,
      audioDurationMs: true,
      projectId: true,
      project: { select: { id: true, title: true } },
      summary: true,
    },
  });

  return NextResponse.json({ data: { items: meetings } });
}
