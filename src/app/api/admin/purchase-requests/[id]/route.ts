import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";
import { updatePurchaseRequestSchema } from "@/lib/procurement/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const READ_ROLES = new Set([
  "MANAGER",
  "ENGINEER",
  "SUPER_ADMIN",
  "FINANCIER",
]);
const EDIT_ROLES = new Set(["MANAGER", "ENGINEER", "SUPER_ADMIN"]);

async function loadOrForbidden(
  id: string,
  firmId: string | null,
): Promise<NonNullable<Awaited<ReturnType<typeof prisma.purchaseRequest.findFirst>>> | null> {
  return prisma.purchaseRequest.findFirst({
    where: { id, firmId: firmId ?? undefined },
  });
}

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

  const pr = await prisma.purchaseRequest.findFirst({
    where: { id, firmId: firmId ?? undefined },
    include: {
      project: { select: { id: true, title: true } },
      requestedBy: { select: { id: true, name: true } },
      items: { orderBy: { sortOrder: "asc" } },
      rfqs: {
        select: {
          id: true,
          internalNumber: true,
          status: true,
          deadline: true,
          _count: { select: { recipients: true, bids: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!pr) return NextResponse.json({ error: "not-found" }, { status: 404 });

  return NextResponse.json({
    id: pr.id,
    internalNumber: pr.internalNumber,
    status: pr.status,
    neededBy: pr.neededBy,
    estimatedBudget: pr.estimatedBudget?.toString() ?? null,
    notes: pr.notes,
    project: pr.project,
    requestedBy: pr.requestedBy,
    createdAt: pr.createdAt,
    items: pr.items.map((it) => ({
      id: it.id,
      description: it.description,
      qty: it.qty.toString(),
      unit: it.unit,
      costCodeId: it.costCodeId,
      specifications: it.specifications,
      sortOrder: it.sortOrder,
    })),
    rfqs: pr.rfqs.map((r) => ({
      id: r.id,
      internalNumber: r.internalNumber,
      status: r.status,
      deadline: r.deadline,
      recipientCount: r._count.recipients,
      bidCount: r._count.bids,
    })),
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const { firmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, firmId);
  if (!role || !EDIT_ROLES.has(role)) return forbiddenResponse();

  const existing = await loadOrForbidden(id, firmId);
  if (!existing) return NextResponse.json({ error: "not-found" }, { status: 404 });
  if (existing.status !== "DRAFT") {
    return NextResponse.json({ error: "not-editable", status: existing.status }, { status: 409 });
  }
  if (role !== "SUPER_ADMIN" && existing.requestedById !== session.user.id && role !== "MANAGER") {
    return forbiddenResponse();
  }

  const parsed = updatePurchaseRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid-body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const updateData: Prisma.PurchaseRequestUpdateInput = {};
  if (body.neededBy !== undefined) updateData.neededBy = body.neededBy ?? null;
  if (body.notes !== undefined) updateData.notes = body.notes ?? null;
  if (body.estimatedBudget !== undefined) {
    updateData.estimatedBudget =
      body.estimatedBudget == null ? null : new Prisma.Decimal(body.estimatedBudget);
  }
  if (body.projectId !== undefined) {
    if (body.projectId) {
      const ok = await prisma.project.findFirst({
        where: { id: body.projectId, firmId: firmId ?? undefined },
        select: { id: true },
      });
      if (!ok) return forbiddenResponse();
      updateData.project = { connect: { id: body.projectId } };
    } else {
      updateData.project = { disconnect: true };
    }
  }

  await prisma.$transaction(async (tx) => {
    if (body.items) {
      await tx.purchaseRequestItem.deleteMany({ where: { requestId: id } });
      await tx.purchaseRequestItem.createMany({
        data: body.items.map((it, idx) => ({
          requestId: id,
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
      });
    }
    if (Object.keys(updateData).length > 0) {
      await tx.purchaseRequest.update({ where: { id }, data: updateData });
    }
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const { firmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, firmId);
  if (!role || !EDIT_ROLES.has(role)) return forbiddenResponse();

  const existing = await loadOrForbidden(id, firmId);
  if (!existing) return NextResponse.json({ error: "not-found" }, { status: 404 });
  if (existing.status !== "DRAFT") {
    return NextResponse.json({ error: "not-deletable", status: existing.status }, { status: 409 });
  }
  if (role !== "SUPER_ADMIN" && existing.requestedById !== session.user.id) {
    return forbiddenResponse();
  }
  await prisma.purchaseRequest.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
