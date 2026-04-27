import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { createKB2Form, KB2Error } from "@/lib/financing/kb2-service";

export const runtime = "nodejs";

const READ_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER"];
const WRITE_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER"];

const COST_TYPES = ["MATERIAL", "LABOR", "SUBCONTRACT", "EQUIPMENT", "OVERHEAD", "OTHER"] as const;

const itemSchema = z.object({
  estimateItemId: z.string().nullable().optional(),
  description: z.string().min(1),
  unit: z.string().min(1),
  totalQty: z.coerce.number().nonnegative(),
  unitPrice: z.coerce.number().nonnegative(),
  completedQty: z.coerce.number().nonnegative(),
  costCodeId: z.string().nullable().optional(),
  costType: z.enum(COST_TYPES).nullable().optional(),
  sortOrder: z.coerce.number().int().nonnegative().optional(),
});

const createSchema = z.object({
  estimateId: z.string().nullable().optional(),
  counterpartyId: z.string().nullable().optional(),
  periodFrom: z.string().min(8),
  periodTo: z.string().min(8),
  retentionPercent: z.coerce.number().min(0).max(100).nullable().optional(),
  notes: z.string().nullable().optional(),
  items: z.array(itemSchema).min(1, "Жодної позиції"),
});

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!READ_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { id: projectId } = await ctx.params;
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const items = await prisma.kB2Form.findMany({
    where: {
      projectId,
      ...(status ? { status: status as never } : {}),
    },
    include: {
      counterparty: { select: { id: true, name: true } },
      estimate: { select: { id: true, number: true, title: true } },
      _count: { select: { items: true, retentions: true } },
    },
    orderBy: [{ periodTo: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
  return NextResponse.json({ data: items });
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!WRITE_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { id: projectId } = await ctx.params;
  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const form = await createKB2Form(
      {
        projectId,
        estimateId: parsed.data.estimateId ?? null,
        counterpartyId: parsed.data.counterpartyId ?? null,
        periodFrom: new Date(parsed.data.periodFrom),
        periodTo: new Date(parsed.data.periodTo),
        retentionPercent: parsed.data.retentionPercent ?? null,
        notes: parsed.data.notes ?? null,
        items: parsed.data.items,
      },
      session.user.id,
    );
    return NextResponse.json({ data: form }, { status: 201 });
  } catch (e) {
    if (e instanceof KB2Error) {
      return NextResponse.json({ error: e.message }, { status: e.statusHint });
    }
    console.error("[kb2/POST] error:", e);
    return NextResponse.json({ error: "Помилка створення КБ-2в" }, { status: 500 });
  }
}
