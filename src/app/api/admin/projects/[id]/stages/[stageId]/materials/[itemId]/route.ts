import { NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { assertCanAccessFirm } from "@/lib/firm/scope";

async function loadAndAssert(
  projectId: string,
  stageId: string,
  itemId: string,
  session: Session | null,
) {
  if (!session?.user) return { error: unauthorizedResponse() };
  if (
    session.user.role !== "SUPER_ADMIN" &&
    session.user.role !== "MANAGER" &&
    session.user.role !== "ENGINEER"
  ) {
    return { error: forbiddenResponse() };
  }
  const stage = await prisma.projectStageRecord.findUnique({
    where: { id: stageId },
    select: {
      id: true,
      projectId: true,
      project: { select: { firmId: true } },
    },
  });
  if (!stage || stage.projectId !== projectId) {
    return {
      error: NextResponse.json({ error: "Етап не знайдено" }, { status: 404 }),
    };
  }
  try {
    assertCanAccessFirm(session, stage.project.firmId);
  } catch {
    return { error: forbiddenResponse() };
  }
  const item = await prisma.estimateItem.findUnique({
    where: { id: itemId },
    select: { id: true, estimate: { select: { projectId: true } } },
  });
  if (!item || item.estimate.projectId !== projectId) {
    return {
      error: NextResponse.json({ error: "Матеріал не знайдено" }, { status: 404 }),
    };
  }
  return { ok: true } as const;
}

/** Видалити матеріал з етапу. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; stageId: string; itemId: string }> },
) {
  const { id: projectId, stageId, itemId } = await params;
  const session = await auth();
  const check = await loadAndAssert(projectId, stageId, itemId, session);
  if ("error" in check) return check.error;

  await prisma.estimateItem.delete({ where: { id: itemId } });
  return NextResponse.json({ success: true });
}

/** Оновити кількість/ціну/постачальника матеріалу. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stageId: string; itemId: string }> },
) {
  const { id: projectId, stageId, itemId } = await params;
  const session = await auth();
  const check = await loadAndAssert(projectId, stageId, itemId, session);
  if ("error" in check) return check.error;

  const body = await request.json();
  const data: {
    description?: string;
    unit?: string;
    quantity?: number;
    unitPrice?: number;
    amount?: number;
    priceSource?: string | null;
  } = {};

  if (typeof body.name === "string" && body.name.trim()) {
    data.description = body.name.trim();
  }
  if (typeof body.unit === "string" && body.unit.trim()) {
    data.unit = body.unit.trim();
  }
  if (body.planQty !== undefined) {
    const n = Number(body.planQty);
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: "Невірна кількість" }, { status: 400 });
    }
    data.quantity = n;
  }
  if (body.planPrice !== undefined) {
    const n = Number(body.planPrice);
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: "Невірна ціна" }, { status: 400 });
    }
    data.unitPrice = n;
  }
  if (body.supplier !== undefined) {
    data.priceSource =
      typeof body.supplier === "string" && body.supplier.trim()
        ? body.supplier.trim()
        : null;
  }

  // Re-compute amount if qty or price змінилось
  if (data.quantity !== undefined || data.unitPrice !== undefined) {
    const current = await prisma.estimateItem.findUnique({
      where: { id: itemId },
      select: { quantity: true, unitPrice: true },
    });
    if (current) {
      const q = data.quantity ?? Number(current.quantity);
      const p = data.unitPrice ?? Number(current.unitPrice);
      data.amount = q * p;
    }
  }

  await prisma.estimateItem.update({
    where: { id: itemId },
    data,
  });

  return NextResponse.json({ success: true });
}
