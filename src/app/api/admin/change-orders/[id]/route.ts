import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";
import { maskCostImpact } from "@/lib/change-orders/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function loadCO(id: string, firmId: string | null) {
  return prisma.changeOrder.findFirst({
    where: { id, firmId: firmId ?? undefined },
    include: {
      project: { select: { id: true, title: true, address: true } },
      requestedBy: { select: { id: true, name: true, email: true } },
      pmApprovedBy: { select: { id: true, name: true } },
      adminApprovedBy: { select: { id: true, name: true } },
      clientApprovedBy: { select: { id: true, name: true } },
      rejectedBy: { select: { id: true, name: true } },
      cancelledBy: { select: { id: true, name: true } },
      items: {
        include: { costCode: { select: { id: true, code: true, name: true } } },
        orderBy: { sortOrder: "asc" },
      },
      attachments: {
        include: { uploadedBy: { select: { id: true, name: true } } },
        orderBy: { uploadedAt: "desc" },
      },
      transitions: {
        include: { actor: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function GET(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const { firmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, firmId);
  if (!role) return forbiddenResponse();

  const { id } = await ctx.params;
  const co = await loadCO(id, firmId);
  if (!co) return NextResponse.json({ error: "not-found" }, { status: 404 });

  const serialized = {
    ...co,
    costImpact: Number(co.costImpact),
    items: co.items.map((it) => ({
      ...it,
      qty: Number(it.qty),
      unitPrice: Number(it.unitPrice),
      totalPrice: Number(it.totalPrice),
    })),
  };
  return NextResponse.json(maskCostImpact(serialized, role));
}

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const { firmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, firmId);
  if (!role) return forbiddenResponse();

  const { id } = await ctx.params;
  const co = await prisma.changeOrder.findFirst({
    where: { id, firmId: firmId ?? undefined },
    select: { status: true, requestedById: true },
  });
  if (!co) return NextResponse.json({ error: "not-found" }, { status: 404 });
  if (co.status !== "DRAFT") {
    return NextResponse.json(
      { error: "edit-not-allowed", reason: "only DRAFT editable" },
      { status: 409 },
    );
  }

  const body = (await req.json()) as {
    title?: string;
    description?: string;
    reasonFromClient?: string | null;
    scheduleImpactDays?: number;
    items?: Array<{
      costCodeId: string;
      description: string;
      unit: string;
      qty: number;
      unitPrice: number;
      sign: 1 | -1;
      sortOrder?: number;
    }>;
  };

  await prisma.$transaction(async (tx) => {
    const updateData: Prisma.ChangeOrderUpdateInput = {};
    if (body.title !== undefined) updateData.title = body.title.trim();
    if (body.description !== undefined)
      updateData.description = body.description.trim();
    if (body.reasonFromClient !== undefined)
      updateData.reasonFromClient = body.reasonFromClient?.trim() || null;
    if (body.scheduleImpactDays !== undefined)
      updateData.scheduleImpactDays = body.scheduleImpactDays;

    if (body.items) {
      const costImpact = body.items.reduce(
        (sum, it) =>
          sum +
          (it.sign === 1 ? 1 : -1) * Number(it.qty) * Number(it.unitPrice),
        0,
      );
      updateData.costImpact = new Prisma.Decimal(costImpact.toFixed(2));
      await tx.changeOrderItem.deleteMany({ where: { changeOrderId: id } });
      await tx.changeOrderItem.createMany({
        data: body.items.map((it, idx) => ({
          changeOrderId: id,
          costCodeId: it.costCodeId,
          description: it.description,
          unit: it.unit,
          qty: new Prisma.Decimal(it.qty),
          unitPrice: new Prisma.Decimal(it.unitPrice),
          totalPrice: new Prisma.Decimal(
            (it.sign === 1 ? 1 : -1) * Number(it.qty) * Number(it.unitPrice),
          ),
          sign: it.sign,
          sortOrder: it.sortOrder ?? idx,
        })),
      });
    }

    await tx.changeOrder.update({ where: { id }, data: updateData });
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const { firmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, firmId);
  if (!role) return forbiddenResponse();

  const { id } = await ctx.params;
  const co = await prisma.changeOrder.findFirst({
    where: { id, firmId: firmId ?? undefined },
    select: { status: true },
  });
  if (!co) return NextResponse.json({ error: "not-found" }, { status: 404 });
  if (co.status !== "DRAFT") {
    return NextResponse.json(
      { error: "delete-not-allowed" },
      { status: 409 },
    );
  }

  await prisma.changeOrder.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
