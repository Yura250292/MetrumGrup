import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";

export const runtime = "nodejs";

const READ_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER"];

/**
 * Lightweight list of project's estimates with their items — used by KB-2 form
 * to pick line items for the act. Returns only what the form needs.
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!READ_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { id: projectId } = await ctx.params;
  const { searchParams } = new URL(request.url);
  const onlyApproved = searchParams.get("onlyApproved") !== "false"; // default true

  const estimates = await prisma.estimate.findMany({
    where: {
      projectId,
      ...(onlyApproved ? { status: "APPROVED" } : {}),
    },
    select: {
      id: true,
      number: true,
      title: true,
      status: true,
      finalClientPrice: true,
      items: {
        select: {
          id: true,
          description: true,
          unit: true,
          quantity: true,
          unitPrice: true,
          priceWithMargin: true,
          useCustomMargin: true,
          sortOrder: true,
          costCodeId: true,
          costType: true,
        },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: estimates });
}
