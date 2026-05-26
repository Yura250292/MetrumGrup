import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { isValidTokenShape } from "@/lib/procurement/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public, no-auth: ВСЯ авторизація через bearer-токен у path. Знаючи 1 токен
 * не можна вгадати інший (256 біт ентропії в RFQRecipient.accessToken).
 * Невалідна форма / неіснуючий токен → 404 (anti-enumeration).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;
  const rl = rateLimit(req, { windowMs: 60_000, max: 50, key: `public-rfq:${token}` });
  if (!rl.ok) return rateLimitResponse(rl);

  if (!isValidTokenShape(token)) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  const recipient = await prisma.rFQRecipient.findUnique({
    where: { accessToken: token },
    include: {
      counterparty: { select: { id: true, name: true } },
      rfq: {
        include: {
          purchaseRequest: {
            include: {
              firm: { select: { id: true, name: true, legalName: true } },
              items: {
                orderBy: { sortOrder: "asc" },
                select: {
                  id: true,
                  description: true,
                  qty: true,
                  unit: true,
                  specifications: true,
                  sortOrder: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!recipient) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  // Best-effort: марк viewedAt при першому перегляді (не блокує respond).
  if (!recipient.viewedAt) {
    prisma.rFQRecipient
      .update({ where: { id: recipient.id }, data: { viewedAt: new Date() } })
      .catch(() => {});
  }

  const existingBid = await prisma.bid.findUnique({
    where: {
      rfqId_counterpartyId: {
        rfqId: recipient.rfqId,
        counterpartyId: recipient.counterpartyId,
      },
    },
    include: { items: true },
  });

  return NextResponse.json({
    rfq: {
      id: recipient.rfq.id,
      internalNumber: recipient.rfq.internalNumber,
      status: recipient.rfq.status,
      deadline: recipient.rfq.deadline,
    },
    firm: recipient.rfq.purchaseRequest.firm
      ? {
          id: recipient.rfq.purchaseRequest.firm.id,
          name:
            recipient.rfq.purchaseRequest.firm.legalName ??
            recipient.rfq.purchaseRequest.firm.name,
        }
      : null,
    supplier: recipient.counterparty,
    items: recipient.rfq.purchaseRequest.items.map((it) => ({
      id: it.id,
      description: it.description,
      qty: it.qty.toString(),
      unit: it.unit,
      specifications: it.specifications,
      sortOrder: it.sortOrder,
    })),
    alreadyBid: existingBid
      ? {
          id: existingBid.id,
          status: existingBid.status,
          submittedAt: existingBid.submittedAt,
          currency: existingBid.currency,
          totalPrice: existingBid.totalPrice.toString(),
          paymentTerms: existingBid.paymentTerms,
          deliveryTermsDays: existingBid.deliveryTermsDays,
          validUntil: existingBid.validUntil,
          notes: existingBid.notes,
          items: existingBid.items.map((it) => ({
            purchaseRequestItemId: it.purchaseRequestItemId,
            unitPrice: it.unitPrice.toString(),
            deliveryDate: it.deliveryDate,
            alternativeOfferDescription: it.alternativeOfferDescription,
            alternativeOfferPrice: it.alternativeOfferPrice?.toString() ?? null,
            notes: it.notes,
          })),
        }
      : null,
  });
}
