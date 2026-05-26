import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { isValidTokenShape } from "@/lib/procurement/tokens";
import { calcBidTotalPrice } from "@/lib/procurement/pricing";
import { submitBidSchema } from "@/lib/procurement/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  return fwd.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;
  // Stricter rate-limit on writes.
  const rl = rateLimit(req, { windowMs: 60_000, max: 10, key: `public-rfq-bid:${token}` });
  if (!rl.ok) return rateLimitResponse(rl);

  if (!isValidTokenShape(token)) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  const parsed = submitBidSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid-body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const recipient = await prisma.rFQRecipient.findUnique({
    where: { accessToken: token },
    include: {
      rfq: {
        select: {
          id: true,
          status: true,
          deadline: true,
          purchaseRequest: {
            select: {
              items: { select: { id: true, qty: true } },
            },
          },
        },
      },
    },
  });
  if (!recipient) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }
  const { rfq } = recipient;
  if (rfq.status !== "SENT" && rfq.status !== "COLLECTING") {
    return NextResponse.json(
      { error: "rfq-not-open", status: rfq.status },
      { status: 410 },
    );
  }
  if (rfq.deadline.getTime() < Date.now()) {
    return NextResponse.json(
      { error: "deadline-passed", deadline: rfq.deadline },
      { status: 410 },
    );
  }

  // Validate all bid items reference real PR items.
  const itemMap = new Map(rfq.purchaseRequest.items.map((it) => [it.id, it.qty]));
  for (const bi of body.items) {
    if (!itemMap.has(bi.purchaseRequestItemId)) {
      return NextResponse.json(
        { error: "invalid-item", purchaseRequestItemId: bi.purchaseRequestItemId },
        { status: 400 },
      );
    }
  }

  const totalPrice = calcBidTotalPrice(
    body.items.map((bi) => ({
      qty: itemMap.get(bi.purchaseRequestItemId) as Prisma.Decimal,
      unitPrice: bi.unitPrice,
    })),
  );

  const ip = clientIp(req);

  const { bidId } = await prisma.$transaction(async (tx) => {
    // Upsert bid by unique (rfqId, counterpartyId).
    const existing = await tx.bid.findUnique({
      where: {
        rfqId_counterpartyId: {
          rfqId: recipient.rfqId,
          counterpartyId: recipient.counterpartyId,
        },
      },
      select: { id: true },
    });
    let bid;
    if (existing) {
      bid = await tx.bid.update({
        where: { id: existing.id },
        data: {
          status: "SUBMITTED",
          totalPrice,
          currency: body.currency,
          paymentTerms: body.paymentTerms ?? null,
          deliveryTermsDays: body.deliveryTermsDays ?? null,
          validUntil: body.validUntil ?? null,
          notes: body.notes ?? null,
          submittedAt: new Date(),
          submittedFromIp: ip,
        },
        select: { id: true },
      });
      await tx.bidItem.deleteMany({ where: { bidId: existing.id } });
    } else {
      bid = await tx.bid.create({
        data: {
          rfqId: recipient.rfqId,
          counterpartyId: recipient.counterpartyId,
          status: "SUBMITTED",
          totalPrice,
          currency: body.currency,
          paymentTerms: body.paymentTerms ?? null,
          deliveryTermsDays: body.deliveryTermsDays ?? null,
          validUntil: body.validUntil ?? null,
          notes: body.notes ?? null,
          submittedAt: new Date(),
          submittedFromIp: ip,
        },
        select: { id: true },
      });
    }
    await tx.bidItem.createMany({
      data: body.items.map((bi) => ({
        bidId: bid.id,
        purchaseRequestItemId: bi.purchaseRequestItemId,
        unitPrice: new Prisma.Decimal(bi.unitPrice),
        deliveryDate: bi.deliveryDate ?? null,
        alternativeOfferDescription: bi.alternativeOfferDescription ?? null,
        alternativeOfferPrice:
          bi.alternativeOfferPrice == null
            ? null
            : new Prisma.Decimal(bi.alternativeOfferPrice),
        notes: bi.notes ?? null,
      })),
    });
    await tx.rFQRecipient.update({
      where: { id: recipient.id },
      data: { bidSubmittedAt: new Date() },
    });
    // Auto-transition SENT → COLLECTING на першому біді.
    if (rfq.status === "SENT") {
      await tx.rFQ.update({
        where: { id: rfq.id },
        data: { status: "COLLECTING" },
      });
    }
    // Audit trail для public submit живе у Bid.submittedFromIp + Bid.submittedAt.
    // Системний AuditLog запис потребує валідного User FK — додаткове логування
    // публічних подій реалізуємо у Phase B через окремий PublicEventLog.
    return { bidId: bid.id };
  });

  // TODO Phase B: notifyUsers([PR.requestedById], { kind: BID_RECEIVED }).
  return NextResponse.json({ ok: true, bidId });
}
