import { NextRequest, NextResponse } from "next/server";
import { Prisma, type PurchaseRequestStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";
import { nextNumber } from "@/lib/procurement/numbering";
import { createPurchaseRequestSchema } from "@/lib/procurement/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CREATE_ROLES = new Set(["MANAGER", "ENGINEER", "SUPER_ADMIN"]);
const READ_ROLES = new Set([
  "MANAGER",
  "ENGINEER",
  "SUPER_ADMIN",
  "FINANCIER",
]);

const VALID_STATUSES = new Set<PurchaseRequestStatus>([
  "DRAFT",
  "RFQ_SENT",
  "BIDS_COLLECTED",
  "PO_ISSUED",
  "CLOSED",
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
  const statusParam = url.searchParams.get("status");
  const status =
    statusParam && VALID_STATUSES.has(statusParam as PurchaseRequestStatus)
      ? (statusParam as PurchaseRequestStatus)
      : undefined;
  const limit = Math.min(
    Number.parseInt(url.searchParams.get("limit") ?? "100", 10) || 100,
    500,
  );

  const requests = await prisma.purchaseRequest.findMany({
    where: {
      firmId: firmId ?? undefined,
      ...(projectId ? { projectId } : {}),
      ...(status ? { status } : {}),
    },
    include: {
      project: { select: { id: true, title: true } },
      requestedBy: { select: { id: true, name: true } },
      _count: { select: { items: true, rfqs: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({
    requests: requests.map((r) => ({
      id: r.id,
      internalNumber: r.internalNumber,
      status: r.status,
      neededBy: r.neededBy,
      estimatedBudget: r.estimatedBudget?.toString() ?? null,
      project: r.project,
      requestedBy: r.requestedBy,
      itemCount: r._count.items,
      rfqCount: r._count.rfqs,
      createdAt: r.createdAt,
    })),
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const { firmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, firmId);
  if (!role || !CREATE_ROLES.has(role) || !firmId) return forbiddenResponse();

  const parsed = createPurchaseRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid-body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const body = parsed.data;

  if (body.projectId) {
    const project = await prisma.project.findFirst({
      where: { id: body.projectId, firmId },
      select: { id: true },
    });
    if (!project) return forbiddenResponse();
  }

  const created = await prisma.$transaction(async (tx) => {
    const internalNumber = await nextNumber(tx, "PR", firmId);
    return tx.purchaseRequest.create({
      data: {
        firmId,
        projectId: body.projectId ?? null,
        requestedById: session.user.id,
        neededBy: body.neededBy ?? null,
        estimatedBudget:
          body.estimatedBudget == null
            ? null
            : new Prisma.Decimal(body.estimatedBudget),
        notes: body.notes ?? null,
        internalNumber,
        items: {
          create: body.items.map((it, idx) => ({
            description: it.description.trim(),
            qty: new Prisma.Decimal(it.qty),
            unit: it.unit.trim(),
            costCodeId: it.costCodeId ?? null,
            specifications:
              it.specifications == null
                ? Prisma.JsonNull
                : (it.specifications as Prisma.InputJsonValue),
            sortOrder: it.sortOrder ?? idx,
          })),
        },
      },
      select: { id: true, internalNumber: true, status: true },
    });
  });

  return NextResponse.json(created, { status: 201 });
}
