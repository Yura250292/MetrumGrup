import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";
import { cancelPurchaseOrderSchema } from "@/lib/procurement/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CANCEL_ROLES = new Set(["MANAGER", "SUPER_ADMIN"]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const { firmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, firmId);
  if (!role || !CANCEL_ROLES.has(role)) return forbiddenResponse();

  const parsed = cancelPurchaseOrderSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid-body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { reason } = parsed.data;

  const po = await prisma.purchaseOrder.findFirst({
    where: { id, firmId: firmId ?? undefined },
    select: { id: true, status: true },
  });
  if (!po) return NextResponse.json({ error: "not-found" }, { status: 404 });
  if (po.status === "DELIVERED" || po.status === "CANCELLED") {
    return NextResponse.json(
      { error: "not-cancellable", status: po.status },
      { status: 409 },
    );
  }

  const updated = await prisma.purchaseOrder.update({
    where: { id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelReason: reason,
    },
    select: { id: true, status: true, cancelledAt: true },
  });
  return NextResponse.json(updated);
}
