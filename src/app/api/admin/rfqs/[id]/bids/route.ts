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
import { composeBidScore } from "@/lib/procurement/pricing";

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

  const rfq = await prisma.rFQ.findFirst({
    where: {
      id,
      purchaseRequest: { firmId: firmId ?? undefined },
    },
    select: {
      id: true,
      internalNumber: true,
      status: true,
      deadline: true,
      purchaseRequest: {
        select: {
          id: true,
          internalNumber: true,
          items: {
            orderBy: { sortOrder: "asc" },
            select: { id: true, description: true, qty: true, unit: true },
          },
        },
      },
      bids: {
        where: { status: { in: ["SUBMITTED", "WON", "LOST"] } },
        include: {
          counterparty: { select: { id: true, name: true } },
          items: true,
        },
      },
    },
  });
  if (!rfq) return NextResponse.json({ error: "not-found" }, { status: 404 });

  const reveal = canViewFinance(role);
  const totalBids = rfq.bids.length;

  // Ранги по ціні (asc) і доставці (deliveryTermsDays asc, null → останнє).
  const byPrice = [...rfq.bids].sort((a, b) =>
    a.totalPrice.comparedTo(b.totalPrice),
  );
  const priceRank = new Map<string, number>();
  byPrice.forEach((b, i) => priceRank.set(b.id, i + 1));

  const byDelivery = [...rfq.bids].sort((a, b) => {
    const av = a.deliveryTermsDays ?? Number.POSITIVE_INFINITY;
    const bv = b.deliveryTermsDays ?? Number.POSITIVE_INFINITY;
    return av - bv;
  });
  const deliveryRank = new Map<string, number>();
  byDelivery.forEach((b, i) => deliveryRank.set(b.id, i + 1));

  const bids = rfq.bids.map((b) => {
    const score = composeBidScore({
      priceRank: priceRank.get(b.id) ?? 1,
      deliveryRank: deliveryRank.get(b.id) ?? 1,
      rating: null, // Counterparty rating (Phase B — підтягувати з CounterpartyReview агрегата)
      totalBids,
    });
    return {
      id: b.id,
      counterparty: b.counterparty,
      status: b.status,
      submittedAt: b.submittedAt,
      currency: b.currency,
      deliveryTermsDays: b.deliveryTermsDays,
      paymentTerms: b.paymentTerms,
      validUntil: b.validUntil,
      totalPrice: reveal ? b.totalPrice.toString() : null,
      score: reveal ? score.score : null,
      priceRank: priceRank.get(b.id) ?? 1,
      deliveryRank: deliveryRank.get(b.id) ?? 1,
      items: b.items.map((it) => ({
        purchaseRequestItemId: it.purchaseRequestItemId,
        unitPrice: reveal ? it.unitPrice.toString() : null,
        deliveryDate: it.deliveryDate,
        alternativeOfferDescription: it.alternativeOfferDescription,
        alternativeOfferPrice: reveal
          ? it.alternativeOfferPrice?.toString() ?? null
          : null,
        notes: it.notes,
      })),
    };
  });

  return NextResponse.json({
    rfq: {
      id: rfq.id,
      internalNumber: rfq.internalNumber,
      status: rfq.status,
      deadline: rfq.deadline,
      purchaseRequest: {
        id: rfq.purchaseRequest.id,
        internalNumber: rfq.purchaseRequest.internalNumber,
        items: rfq.purchaseRequest.items.map((it) => ({
          id: it.id,
          description: it.description,
          qty: it.qty.toString(),
          unit: it.unit,
        })),
      },
    },
    bids,
    redacted: !reveal,
  });
}
