import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";

export const runtime = "nodejs";

const READ_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER"];

/**
 * Find the latest CLIENT+INTERNAL estimate pair stored directly in a folder.
 * Used by the financing view to show a summary card when user opens the folder.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!READ_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { searchParams } = new URL(request.url);
  const folderId = searchParams.get("folderId");
  if (!folderId) {
    return NextResponse.json({ error: "folderId обов'язковий" }, { status: 400 });
  }

  const latest = await prisma.estimate.findFirst({
    where: {
      folderId,
      role: { in: ["CLIENT", "INTERNAL"] },
      estimateGroupId: { not: null },
    },
    orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    select: { estimateGroupId: true, version: true },
  });

  if (!latest?.estimateGroupId) {
    return NextResponse.json({ pair: null });
  }

  const groupEstimates = await prisma.estimate.findMany({
    where: {
      estimateGroupId: latest.estimateGroupId,
      version: latest.version,
    },
    select: {
      id: true,
      role: true,
      title: true,
      totalAmount: true,
      createdAt: true,
      _count: { select: { items: true } },
    },
  });

  const client = groupEstimates.find((e) => e.role === "CLIENT");
  const internal = groupEstimates.find((e) => e.role === "INTERNAL");

  const clientTotal = client ? Number(client.totalAmount) : 0;
  const internalTotal = internal ? Number(internal.totalAmount) : 0;

  return NextResponse.json({
    pair: {
      groupId: latest.estimateGroupId,
      version: latest.version,
      client: client
        ? {
            id: client.id,
            title: client.title,
            totalAmount: clientTotal,
            itemCount: client._count.items,
            createdAt: client.createdAt,
          }
        : null,
      internal: internal
        ? {
            id: internal.id,
            title: internal.title,
            totalAmount: internalTotal,
            itemCount: internal._count.items,
            createdAt: internal.createdAt,
          }
        : null,
      profit: clientTotal - internalTotal,
      profitPercent: internalTotal > 0 ? ((clientTotal - internalTotal) / internalTotal) * 100 : 0,
    },
  });
}
