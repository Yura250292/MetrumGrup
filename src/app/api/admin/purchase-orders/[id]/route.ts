import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  unauthorizedResponse,
  forbiddenResponse,
  canViewFinance,
} from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const READ_ROLES = new Set([
  "MANAGER",
  "ENGINEER",
  "SUPER_ADMIN",
  "FINANCIER",
]);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const { firmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, firmId);
  if (!role || !READ_ROLES.has(role)) return forbiddenResponse();

  const po = await prisma.purchaseOrder.findFirst({
    where: { id, firmId: firmId ?? undefined },
    include: {
      project: { select: { id: true, title: true } },
      counterparty: { select: { id: true, name: true, email: true, edrpou: true } },
      createdBy: { select: { id: true, name: true } },
      winningBid: {
        include: {
          items: {
            include: {
              purchaseRequestItem: {
                select: { id: true, description: true, qty: true, unit: true, costCodeId: true },
              },
            },
          },
          rfq: {
            select: {
              id: true,
              internalNumber: true,
              purchaseRequest: { select: { id: true, internalNumber: true } },
            },
          },
        },
      },
    },
  });
  if (!po) return NextResponse.json({ error: "not-found" }, { status: 404 });

  const reveal = canViewFinance(role);
  return NextResponse.json({
    id: po.id,
    internalNumber: po.internalNumber,
    status: po.status,
    project: po.project,
    counterparty: po.counterparty,
    createdBy: po.createdBy,
    currency: po.currency,
    totalAmount: reveal ? po.totalAmount.toString() : null,
    issuedAt: po.issuedAt,
    deliveryDueAt: po.deliveryDueAt,
    actualDeliveredAt: po.actualDeliveredAt,
    pdfUrl: po.pdfUrl,
    paymentTerms: po.paymentTerms,
    cancelledAt: po.cancelledAt,
    cancelReason: po.cancelReason,
    createdAt: po.createdAt,
    rfq: po.winningBid.rfq,
    items: po.winningBid.items.map((it) => ({
      description: it.purchaseRequestItem.description,
      qty: it.purchaseRequestItem.qty.toString(),
      unit: it.purchaseRequestItem.unit,
      costCodeId: it.purchaseRequestItem.costCodeId,
      unitPrice: reveal ? it.unitPrice.toString() : null,
      deliveryDate: it.deliveryDate,
      alternativeOfferDescription: it.alternativeOfferDescription,
      alternativeOfferPrice: reveal
        ? it.alternativeOfferPrice?.toString() ?? null
        : null,
      notes: it.notes,
    })),
    redacted: !reveal,
  });
}
