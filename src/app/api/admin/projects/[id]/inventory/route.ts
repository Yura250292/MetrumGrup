import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";

const READ_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER"];

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!READ_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { id: projectId } = await ctx.params;

  const warehouses = await prisma.warehouse.findMany({
    where: { projectId, isActive: true },
    include: {
      inventoryItems: {
        include: {
          material: { select: { id: true, name: true, sku: true, unit: true, basePrice: true, category: true } },
        },
        orderBy: { material: { name: "asc" } },
      },
    },
  });

  let totalValue = 0;
  let totalItems = 0;
  let lowStock = 0;

  for (const wh of warehouses) {
    for (const inv of wh.inventoryItems) {
      totalItems += 1;
      const qty = Number(inv.quantity);
      const price = Number(inv.material.basePrice);
      totalValue += qty * price;
      if (qty <= Number(inv.minQuantity)) lowStock += 1;
    }
  }

  return NextResponse.json({
    data: {
      warehouses,
      kpi: { totalValue, totalItems, lowStock },
    },
  });
}
