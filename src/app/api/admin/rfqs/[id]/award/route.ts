import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";
import { nextNumber } from "@/lib/procurement/numbering";
import { awardBidSchema } from "@/lib/procurement/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AWARD_ROLES = new Set(["MANAGER", "SUPER_ADMIN"]);

/**
 * Атомарний award. У одній транзакції:
 *  1. PO.create(winningBidId — unique → P2002 при double-click)
 *  2. bid.WON + awardedAt/awardedById
 *  3. інші біди RFQ → LOST
 *  4. RFQ.CLOSED + closedAt/closedById
 *  5. PR.PO_ISSUED
 *  6. AuditLog
 *
 * Email-нотифікації — Phase B (TODO нижче).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: rfqId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const { firmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, firmId);
  if (!role || !AWARD_ROLES.has(role) || !firmId) return forbiddenResponse();

  const parsed = awardBidSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid-body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { bidId, justification } = parsed.data;

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const bid = await tx.bid.findFirst({
          where: { id: bidId, rfqId },
          include: {
            rfq: {
              select: {
                id: true,
                status: true,
                purchaseRequestId: true,
                purchaseRequest: {
                  select: { id: true, firmId: true, projectId: true, status: true },
                },
              },
            },
          },
        });
        if (!bid) throw new HandlerError("not-found", 404);
        if (bid.rfq.purchaseRequest.firmId !== firmId) {
          throw new HandlerError("forbidden", 403);
        }
        if (bid.status !== "SUBMITTED") {
          throw new HandlerError("bid-not-submitted", 409);
        }
        if (bid.rfq.status !== "SENT" && bid.rfq.status !== "COLLECTING") {
          throw new HandlerError("rfq-not-open", 409, { status: bid.rfq.status });
        }
        if (bid.rfq.purchaseRequest.status !== "RFQ_SENT") {
          throw new HandlerError("pr-not-rfq-sent", 409, {
            status: bid.rfq.purchaseRequest.status,
          });
        }

        const poNumber = await nextNumber(tx, "PO", firmId);
        const po = await tx.purchaseOrder.create({
          data: {
            firmId,
            projectId: bid.rfq.purchaseRequest.projectId,
            winningBidId: bid.id,
            counterpartyId: bid.counterpartyId,
            totalAmount: bid.totalPrice,
            currency: bid.currency,
            internalNumber: poNumber,
            createdById: session.user.id,
            status: "DRAFT",
          },
          select: { id: true, internalNumber: true, status: true, totalAmount: true },
        });
        await tx.bid.update({
          where: { id: bid.id },
          data: {
            status: "WON",
            awardedAt: new Date(),
            awardedById: session.user.id,
          },
        });
        await tx.bid.updateMany({
          where: {
            rfqId: bid.rfqId,
            id: { not: bid.id },
            status: { in: ["SUBMITTED", "DRAFT"] },
          },
          data: { status: "LOST" },
        });
        await tx.rFQ.update({
          where: { id: bid.rfqId },
          data: {
            status: "CLOSED",
            closedAt: new Date(),
            closedById: session.user.id,
          },
        });
        await tx.purchaseRequest.update({
          where: { id: bid.rfq.purchaseRequestId },
          data: { status: "PO_ISSUED" },
        });
        await tx.auditLog.create({
          data: {
            userId: session.user.id,
            action: "PROCUREMENT_AWARDED",
            entity: "PurchaseOrder",
            entityId: po.id,
            newData: {
              rfqId: bid.rfqId,
              bidId: bid.id,
              counterpartyId: bid.counterpartyId,
              totalAmount: bid.totalPrice.toString(),
              justification,
            },
          },
        });
        return po;
      },
      { isolationLevel: "Serializable", timeout: 10_000 },
    );

    // TODO Phase B: email winner/losers + finance-sync.

    return NextResponse.json(
      {
        id: result.id,
        internalNumber: result.internalNumber,
        status: result.status,
        totalAmount: result.totalAmount.toString(),
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof HandlerError) {
      return NextResponse.json(
        { error: err.code, ...(err.extras ?? {}) },
        { status: err.status },
      );
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // winningBidId @unique — повторний award того ж біда.
      return NextResponse.json(
        { error: "already-awarded", message: "Цей бід уже призначений переможцем" },
        { status: 409 },
      );
    }
    throw err;
  }
}

class HandlerError extends Error {
  constructor(
    public code: string,
    public status: number,
    public extras?: Record<string, unknown>,
  ) {
    super(code);
  }
}
