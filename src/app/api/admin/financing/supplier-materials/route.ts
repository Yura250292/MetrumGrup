import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { isHomeFirmFor } from "@/lib/firm/scope";

export const runtime = "nodejs";

const ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER", "HR"];

const querySchema = z.object({
  counterpartyId: z.string().trim().min(1),
  /// Якщо true — також тягне priceHistory (до 50 останніх) для побудови mini-chart.
  withHistory: z.coerce.boolean().default(false),
});

/**
 * Довідник матеріалів конкретного постачальника + опційна price-history.
 * Доступ — той самий що для counterparties (READ_ROLES).
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!ROLES.includes(session.user.role)) return forbiddenResponse();

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, firmId)) return forbiddenResponse();

  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні параметри", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { counterpartyId, withHistory } = parsed.data;

  // Скоуп через counterparty.firmId — counterparty-dossier гарантує isHomeFirm.
  const cp = await prisma.counterparty.findUnique({
    where: { id: counterpartyId },
    select: { id: true, firmId: true },
  });
  if (!cp) {
    return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  }
  if (cp.firmId && firmId && cp.firmId !== firmId) {
    return forbiddenResponse();
  }

  const materials = await prisma.supplierMaterial.findMany({
    where: { counterpartyId },
    orderBy: [{ lastSeenAt: "desc" }, { name: "asc" }],
    take: 200,
    include: withHistory
      ? {
          priceHistory: {
            orderBy: { observedAt: "desc" },
            take: 50,
            select: { id: true, price: true, unit: true, observedAt: true },
          },
        }
      : undefined,
  });

  return NextResponse.json({ data: materials });
}
