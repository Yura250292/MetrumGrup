import { NextRequest, NextResponse } from "next/server";
import { Prisma, type Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { InventoryWriteOffSchema } from "@/lib/schemas/receipt";

const WRITE_OFF_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "ENGINEER"];

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ itemId: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!WRITE_OFF_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { itemId } = await ctx.params;
  const body = await request.json().catch(() => null);
  const parsed = InventoryWriteOffSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Невалідне тіло запиту", details: parsed.error.format() }, { status: 400 });
  }

  const item = await prisma.inventoryItem.findUnique({
    where: { id: itemId },
    include: { warehouse: { select: { id: true, projectId: true } } },
  });
  if (!item) return NextResponse.json({ error: "Інвентарну позицію не знайдено" }, { status: 404 });

  const writeOffQty = new Prisma.Decimal(parsed.data.quantity);
  if (writeOffQty.gt(item.quantity)) {
    return NextResponse.json({ error: "Кількість для списання перевищує залишок" }, { status: 422 });
  }

  const targetProjectId = parsed.data.projectId ?? item.warehouse.projectId ?? null;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.inventoryItem.update({
        where: { id: itemId },
        data: { quantity: { decrement: writeOffQty } },
      });
      const tr = await tx.inventoryTransaction.create({
        data: {
          type: "WRITE_OFF",
          quantity: writeOffQty,
          inventoryItemId: itemId,
          projectId: targetProjectId,
          createdById: session.user.id,
          notes: parsed.data.notes,
        },
      });
      return { item: updated, transaction: tr };
    });
    return NextResponse.json({ data: result });
  } catch (err) {
    console.error("[inventory/write-off] error:", err);
    return NextResponse.json({ error: "Не вдалося списати" }, { status: 500 });
  }
}
