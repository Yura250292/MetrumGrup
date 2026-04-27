import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";

export const runtime = "nodejs";

const READ_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER"];

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!READ_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { id } = await ctx.params;
  const form = await prisma.kB2Form.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, title: true, slug: true } },
      counterparty: true,
      estimate: { select: { id: true, number: true, title: true } },
      items: { orderBy: { sortOrder: "asc" } },
      retentions: { orderBy: { releaseDate: "asc" } },
      financeEntry: { select: { id: true, status: true, amount: true } },
      createdBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
    },
  });
  if (!form) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  return NextResponse.json({ data: form });
}
