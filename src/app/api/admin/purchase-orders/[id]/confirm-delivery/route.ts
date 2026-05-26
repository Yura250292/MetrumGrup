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
    select: { id: true, status: true },
  });
  if (!po) return NextResponse.json({ error: "not-found" }, { status: 404 });
  if (po.status === "CANCELLED" || po.status === "DELIVERED") {
    return NextResponse.json(
      { error: "not-confirmable", status: po.status },
      { status: 409 },
    );
  }

  const updated = await prisma.purchaseOrder.update({
    where: { id },
    data: {
      status: fullyDelivered ? "DELIVERED" : "PARTIALLY_DELIVERED",
      actualDeliveredAt: fullyDelivered ? deliveredAt : po.status === "PARTIALLY_DELIVERED" ? undefined : null,
      paymentTerms: notes ?? undefined,
    },
    select: { id: true, status: true, actualDeliveredAt: true },
  });

  // TODO Phase B: finance-sync. На DELIVERED — створити FinanceEntry FACT.
  return NextResponse.json(updated);
}
