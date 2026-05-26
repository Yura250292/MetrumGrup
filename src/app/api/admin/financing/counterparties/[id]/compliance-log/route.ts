import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  READ_ROLES,
  isAccessResponse,
  requireCounterpartyAccess,
} from "@/lib/counterparties/access";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const { id } = await ctx.params;
  const access = await requireCounterpartyAccess({
    session,
    counterpartyId: id,
    allowedRoles: READ_ROLES,
  });
  if (isAccessResponse(access)) return access;

  const checks = await prisma.counterpartyComplianceCheck.findMany({
    where: { counterpartyId: id },
    orderBy: { checkedAt: "desc" },
    take: 100,
    select: {
      id: true,
      source: true,
      resultSummary: true,
      success: true,
      errorMessage: true,
      checkedAt: true,
    },
  });

  return NextResponse.json({ checks });
}
