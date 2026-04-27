import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";

export const runtime = "nodejs";

const APPROVER_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER"];

const schema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
  approve: z.boolean().default(true),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!APPROVER_ROLES.includes(session.user.role)) return forbiddenResponse();

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { ids, approve } = parsed.data;

  // Skip rows already linked to a finance entry — those are immutable.
  const result = await prisma.timesheet.updateMany({
    where: { id: { in: ids }, financeEntryId: null },
    data: approve
      ? { approvedAt: new Date(), approvedById: session.user.id }
      : { approvedAt: null, approvedById: null },
  });

  return NextResponse.json({ updated: result.count, requested: ids.length });
}
