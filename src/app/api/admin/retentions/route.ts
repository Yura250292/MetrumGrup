import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";

export const runtime = "nodejs";

const READ_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER"];

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!READ_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const status = searchParams.get("status");

  const items = await prisma.retentionRecord.findMany({
    where: {
      ...(projectId ? { form: { projectId } } : {}),
      ...(status ? { status: status as never } : {}),
    },
    include: {
      form: {
        select: {
          id: true,
          number: true,
          projectId: true,
          counterparty: { select: { id: true, name: true } },
          project: { select: { id: true, title: true, slug: true } },
        },
      },
      releasedFinanceEntry: { select: { id: true, status: true, paidAt: true } },
    },
    orderBy: [{ status: "asc" }, { releaseDate: "asc" }],
    take: 200,
  });
  return NextResponse.json({ data: items });
}
