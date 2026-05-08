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
  /// Опційно — обмежити одним постачальником. Якщо не задано — вертає всі матеріали
  /// у scope активної фірми (для каталогу).
  counterpartyId: z.string().trim().min(1).optional(),
  /// Якщо true — також тягне priceHistory (до 50 останніх) для побудови mini-chart.
  withHistory: z.coerce.boolean().default(false),
  /// Пошук по назві матеріалу (case-insensitive).
  q: z.string().trim().optional(),
  take: z.coerce.number().int().positive().max(1000).default(500),
});

/**
 * Довідник матеріалів. Дві типові форми використання:
 *   - `counterpartyId=X` — у дос'є постачальника (тільки його матеріали)
 *   - без counterpartyId — у каталозі /admin-v2/catalogs/suppliers
 *     (всі матеріали від усіх постачальників фірми)
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
  const { counterpartyId, withHistory, q, take } = parsed.data;

  if (counterpartyId) {
    // Скоуп через counterparty.firmId.
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
  }

  const materials = await prisma.supplierMaterial.findMany({
    where: {
      ...(counterpartyId ? { counterpartyId } : {}),
      ...(firmId ? { firmId } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { nameKey: { contains: q.toLowerCase(), mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ lastSeenAt: "desc" }, { name: "asc" }],
    take,
    include: {
      counterparty: counterpartyId
        ? false
        : { select: { id: true, name: true } },
      priceHistory: withHistory
        ? {
            orderBy: { observedAt: "desc" },
            take: 50,
            select: { id: true, price: true, unit: true, observedAt: true },
          }
        : false,
    },
  });

  return NextResponse.json({ data: materials });
}
