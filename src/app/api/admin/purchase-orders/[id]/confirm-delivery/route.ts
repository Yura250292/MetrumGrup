import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";
import { confirmDeliverySchema } from "@/lib/procurement/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONFIRM_ROLES = new Set(["MANAGER", "SUPER_ADMIN", "FOREMAN"]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const { firmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, firmId);
  if (!role || !CONFIRM_ROLES.has(role)) return forbiddenResponse();

  const parsed = confirmDeliverySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid-body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { deliveredAt, fullyDelivered, notes } = parsed.data;

  const po = await prisma.purchaseOrder.findFirst({
    where: { id, firmId: firmId ?? undefined },
    select: {
      id: true,
      status: true,
      firmId: true,
      projectId: true,
      counterpartyId: true,
      totalAmount: true,
      currency: true,
      internalNumber: true,
      counterparty: { select: { name: true } },
    },
  });
  if (!po) return NextResponse.json({ error: "not-found" }, { status: 404 });
  if (po.status === "CANCELLED" || po.status === "DELIVERED") {
    return NextResponse.json(
      { error: "not-confirmable", status: po.status },
      { status: 409 },
    );
  }

  const nowFinal = fullyDelivered;
  const updated = await prisma.purchaseOrder.update({
    where: { id },
    data: {
      status: nowFinal ? "DELIVERED" : "PARTIALLY_DELIVERED",
      actualDeliveredAt: nowFinal ? deliveredAt : po.status === "PARTIALLY_DELIVERED" ? undefined : null,
      paymentTerms: notes ?? undefined,
    },
    select: { id: true, status: true, actualDeliveredAt: true },
  });

  // Finance sync: on full delivery, materialise a FACT EXPENSE entry tied to
  // this PO. Idempotent — skip if an entry already exists for this PO.
  if (nowFinal) {
    try {
      const existing = await prisma.financeEntry.findFirst({
        where: {
          source: "PURCHASE_ORDER",
          description: { contains: `PO:${po.id}` },
        },
        select: { id: true },
      });
      if (!existing) {
        await prisma.financeEntry.create({
          data: {
            occurredAt: deliveredAt,
            kind: "FACT",
            type: "EXPENSE",
            amount: po.totalAmount,
            currency: po.currency,
            projectId: po.projectId,
            firmId: po.firmId,
            counterpartyId: po.counterpartyId,
            counterparty: po.counterparty?.name ?? null,
            category: "Закупівлі",
            subcategory: "Поставка матеріалів",
            title: `PO ${po.internalNumber}`,
            description: `PO:${po.id} delivery confirmed`,
            source: "PURCHASE_ORDER",
            status: "APPROVED",
            approvedAt: new Date(),
            approvedById: session.user.id,
            createdById: session.user.id,
            isDerived: true,
          },
        });
      }
    } catch (err) {
      // Finance sync failure does not roll back the delivery confirmation —
      // log and surface in audit; manual reconciliation possible.
      console.error("[confirm-delivery] finance sync failed:", err);
    }
  }

  return NextResponse.json(updated);
}
