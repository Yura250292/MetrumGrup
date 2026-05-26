import { NextRequest, NextResponse } from "next/server";
import { type PurchaseOrderStatus } from "@prisma/client";
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

const VALID_STATUSES = new Set<PurchaseOrderStatus>([
  "DRAFT",
  "SENT",
  "CONFIRMED",
  "PARTIALLY_DELIVERED",
  "DELIVERED",
  "CANCELLED",
]);

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const { firmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, firmId);
  if (!role || !READ_ROLES.has(role)) return forbiddenResponse();

  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const counterpartyId = url.searchParams.get("counterpartyId");
  const statusParam = url.searchParams.get("status");
  const status =
    statusParam && VALID_STATUSES.has(statusParam as PurchaseOrderStatus)
      ? (statusParam as PurchaseOrderStatus)
      : undefined;
  const limit = Math.min(
    Number.parseInt(url.searchParams.get("limit") ?? "100", 10) || 100,
    500,
  );

  const reveal = canViewFinance(role);
  const orders = await prisma.purchaseOrder.findMany({
    where: {
      firmId: firmId ?? undefined,
      ...(projectId ? { projectId } : {}),
      ...(counterpartyId ? { counterpartyId } : {}),
      ...(status ? { status } : {}),
    },
    include: {
      project: { select: { id: true, title: true } },
      counterparty: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({
    orders: orders.map((po) => ({
      id: po.id,
      internalNumber: po.internalNumber,
      status: po.status,
      project: po.project,
      counterparty: po.counterparty,
      currency: po.currency,
      totalAmount: reveal ? po.totalAmount.toString() : null,
      deliveryDueAt: po.deliveryDueAt,
      actualDeliveredAt: po.actualDeliveredAt,
      pdfUrl: po.pdfUrl,
      createdAt: po.createdAt,
    })),
    redacted: !reveal,
  });
}
