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
  q: z.string().trim().optional(),
  take: z.coerce.number().int().positive().max(50).default(20),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
});

function normalize(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/**
 * Foreman-доступний search by SUPPLIER counterparties у власній фірмі.
 * Не повертає чутливі поля (IBAN, банк-реквізити) — лише id/name/type/edrpou.
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
    return NextResponse.json(
      { error: "Невірні параметри" },
      { status: 400 },
    );
  }
  const { q, take } = parsed.data;

  const items = await prisma.counterparty.findMany({
    where: {
      isActive: true,
      ...(firmId ? { firmId } : {}),
      // SUPPLIER та CONTRACTOR — типові ролі для foreman кейсів. CLIENT приховуємо
      // (foreman не вибирає клієнта проєкту як постачальника).
      OR: [{ roles: { has: "SUPPLIER" } }, { roles: { has: "CONTRACTOR" } }, { roles: { isEmpty: true } }],
      ...(q
        ? {
            AND: [
              {
                OR: [
                  { name: { contains: q, mode: "insensitive" } },
                  { edrpou: { contains: q, mode: "insensitive" } },
                ],
              },
            ],
          }
        : {}),
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    take,
    select: {
      id: true,
      name: true,
      type: true,
      edrpou: true,
      roles: true,
    },
  });

  return NextResponse.json({ data: items });
}

/**
 * Швидке створення нового постачальника прямо з foreman kiosk-у. Idempotent:
 * якщо вже є counterparty з таким імʼям у цій фірмі — повертаємо її.
 * Усі створені тут counterparty одразу мітяться `roles=[SUPPLIER]`.
 */
export async function POST(request: NextRequest) {
  let session, firmId;
  try {
    ({ session, firmId } = await requireForeman());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") return forbiddenResponse();
    return unauthorizedResponse();
  }
  void session;

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Назва обовʼязкова" },
      { status: 400 },
    );
  }
  const name = normalize(parsed.data.name);
  if (!firmId) {
    return NextResponse.json(
      { error: "Foreman не привʼязаний до фірми" },
      { status: 400 },
    );
  }

  const existing = await prisma.counterparty.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      firmId,
    },
  });
  if (existing) {
    // Якщо існуючий не позначений SUPPLIER — додаємо роль (одна юрособа може водночас
    // бути CLIENT/SUPPLIER, тож просто merge у масив).
    if (!existing.roles.includes("SUPPLIER")) {
      const updated = await prisma.counterparty.update({
        where: { id: existing.id },
        data: { roles: { push: "SUPPLIER" } },
      });
      return NextResponse.json({ data: updated, reused: true });
    }
    return NextResponse.json({ data: existing, reused: true });
  }

  const created = await prisma.counterparty.create({
    data: {
      name,
      type: "LEGAL",
      roles: ["SUPPLIER"],
      isActive: true,
      firmId,
    },
  });
  return NextResponse.json({ data: created, reused: false }, { status: 201 });
}
