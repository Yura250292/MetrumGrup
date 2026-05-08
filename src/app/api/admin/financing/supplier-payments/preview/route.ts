import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import {
  isHomeFirmFor,
  firmIdForNewEntity,
  DEFAULT_FIRM_ID,
} from "@/lib/firm/scope";
import { previewSupplierAllocation } from "@/lib/finance/supplier-allocation";

export const runtime = "nodejs";

const ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER"];

const querySchema = z.object({
  counterpartyId: z.string().trim().min(1),
  amount: z.coerce.number().positive(),
  projectId: z.string().trim().optional(),
});

/**
 * Read-only preview FIFO-плану для UI: користувач вводить суму і бачить, що
 * саме буде покрито перед натисканням "Створити платіж".
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!ROLES.includes(session.user.role)) return forbiddenResponse();

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, firmId)) return forbiddenResponse();

  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні параметри", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { counterpartyId, amount, projectId } = parsed.data;
  const entryFirmId = firmId ?? firmIdForNewEntity(session, DEFAULT_FIRM_ID);

  const cp = await prisma.counterparty.findUnique({
    where: { id: counterpartyId },
    select: { id: true, firmId: true },
  });
  if (!cp) {
    return NextResponse.json({ error: "Постачальника не знайдено" }, { status: 404 });
  }
  if (cp.firmId && cp.firmId !== entryFirmId) {
    return forbiddenResponse();
  }

  const plan = await previewSupplierAllocation({
    counterpartyId,
    firmId: entryFirmId,
    amount,
    projectId: projectId ?? null,
  });

  return NextResponse.json({
    data: {
      lines: plan.lines.map((l) => ({
        financeEntryId: l.financeEntryId,
        occurredAt: l.occurredAt,
        title: l.title,
        projectId: l.projectId,
        outstandingBefore: l.outstandingBefore.toString(),
        allocate: l.allocate.toString(),
        outstandingAfter: l.outstandingAfter.toString(),
        willBecomePaid: l.willBecomePaid,
      })),
      totalAllocated: plan.totalAllocated.toString(),
      unallocated: plan.unallocated.toString(),
    },
  });
}
