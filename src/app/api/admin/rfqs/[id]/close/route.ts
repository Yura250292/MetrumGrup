import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CLOSE_ROLES = new Set(["MANAGER", "SUPER_ADMIN"]);

/**
 * Manual close без award. PR залишається у RFQ_SENT (можна створити новий RFQ).
 * Усі непідтверджені біди → WITHDRAWN, щоб не плутати з LOST.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: rfqId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const { firmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, firmId);
  if (!role || !CLOSE_ROLES.has(role)) return forbiddenResponse();

  const rfq = await prisma.rFQ.findFirst({
    where: { id: rfqId, purchaseRequest: { firmId: firmId ?? undefined } },
    select: { id: true, status: true },
  });
  if (!rfq) return NextResponse.json({ error: "not-found" }, { status: 404 });
  if (rfq.status === "CLOSED") {
    return NextResponse.json({ error: "already-closed" }, { status: 409 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.bid.updateMany({
      where: { rfqId, status: { in: ["DRAFT", "SUBMITTED"] } },
      data: { status: "WITHDRAWN" },
    });
    await tx.rFQ.update({
      where: { id: rfqId },
      data: { status: "CLOSED", closedAt: new Date(), closedById: session.user.id },
    });
  });

  return NextResponse.json({ ok: true });
}
