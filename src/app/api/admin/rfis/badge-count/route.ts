import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { forbiddenResponse, unauthorizedResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/// Returns count of open + overdue RFIs in current firm scope. Used by nav
/// badge. Polling every 60s on the client.
export async function GET(_req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const { firmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, firmId);
  if (!role) return forbiddenResponse();

  const now = new Date();
  const [open, overdue] = await Promise.all([
    prisma.rFI.count({
      where: { firmId: firmId ?? undefined, status: { in: ["OPEN", "IN_PROGRESS"] } },
    }),
    prisma.rFI.count({
      where: {
        firmId: firmId ?? undefined,
        status: { in: ["OPEN", "IN_PROGRESS"] },
        dueAt: { lte: now, not: null },
      },
    }),
  ]);
  return NextResponse.json({ open, overdue });
}
