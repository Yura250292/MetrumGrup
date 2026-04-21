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
  if (!projectId) {
    return NextResponse.json({ error: "projectId обов'язковий" }, { status: 400 });
  }

  const latestPair = await prisma.estimate.findFirst({
    where: {
      projectId,
      role: { in: ["CLIENT", "INTERNAL"] },
      estimateGroupId: { not: null },
    },
    orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    select: {
      estimateGroupId: true,
      version: true,
    },
  });

  if (!latestPair?.estimateGroupId) {
    return NextResponse.json({ pair: null });
  }

  const groupEstimates = await prisma.estimate.findMany({
    where: {
      estimateGroupId: latestPair.estimateGroupId,
      version: latestPair.version,
    },
    select: {
      id: true,
      role: true,
      title: true,
      totalAmount: true,
    },
  });

  return NextResponse.json({
    pair: {
      groupId: latestPair.estimateGroupId,
      version: latestPair.version,
      client: groupEstimates.find((e) => e.role === "CLIENT") ?? null,
      internal: groupEstimates.find((e) => e.role === "INTERNAL") ?? null,
    },
  });
}
