import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireForeman,
  forbiddenResponse,
  unauthorizedResponse,
} from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const querySchema = z.object({
  q: z.string().trim().min(1).optional(),
  take: z.coerce.number().int().positive().max(20).default(8),
});

/**
 * Read-only autocomplete по історії цін матеріалів у поточній firm виконроба.
 * Використовується в /foreman/tools/estimator для підказки реальної ціни,
 * яку постачальник виставляв востаннє. Не повертає чутливих фінансових деталей —
 * лише назва, одиниця, остання ціна, дата і назва постачальника.
 *
 * НЕ переробляти існуючий /api/admin/financing/supplier-materials —
 * FOREMAN не входить у список ролей того ендпоінта (RBAC фінансів STRICT).
 */
export async function GET(request: NextRequest) {
  let firmId: string | null;
  try {
    ({ firmId } = await requireForeman());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") return forbiddenResponse();
    return unauthorizedResponse();
  }

  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Невірні параметри" }, { status: 400 });
  }
  const { q, take } = parsed.data;

  // Foreman без firmId — повертаємо порожній список замість 400, щоб клієнт
  // міг тихо показати "Немає історії цін", а ручний ввід ціни лишався робочим.
  if (!firmId) {
    return NextResponse.json({ data: [] });
  }

  const where = q
    ? {
        firmId,
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { nameKey: { contains: q.toLowerCase() } },
        ],
      }
    : { firmId };

  const items = await prisma.supplierMaterial.findMany({
    where,
    orderBy: [{ lastSeenAt: "desc" }],
    take,
    select: {
      id: true,
      name: true,
      unit: true,
      lastPrice: true,
      lastSeenAt: true,
      counterparty: { select: { name: true } },
    },
  });

  return NextResponse.json({
    data: items.map((m) => ({
      id: m.id,
      name: m.name,
      unit: m.unit,
      lastPrice: m.lastPrice ? Number(m.lastPrice) : null,
      lastSeenAt: m.lastSeenAt,
      supplier: m.counterparty?.name ?? null,
    })),
  });
}
