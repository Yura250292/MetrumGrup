import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  requireForeman,
  assertForemanCanAccessProject,
  forbiddenResponse,
  unauthorizedResponse,
} from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { nextNumber } from "@/lib/procurement/numbering";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  projectId: z.string().cuid(),
  neededBy: z.string().min(1).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  items: z
    .array(
      z.object({
        description: z.string().trim().min(2).max(500),
        qty: z.coerce.number().positive(),
        unit: z.string().trim().min(1).max(20),
      }),
    )
    .min(1)
    .max(50),
});

/**
 * Foreman-scoped PurchaseRequest creation. Завжди створюється у статусі DRAFT.
 * Менеджер далі обробляє через /admin-v2/procurement (RFQ → bids → PO).
 *
 * RBAC: тільки FOREMAN, тільки для своїх призначених проектів.
 */
export async function POST(req: NextRequest) {
  let session, firmId;
  try {
    ({ session, firmId } = await requireForeman());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") return forbiddenResponse();
    return unauthorizedResponse();
  }

  if (!firmId) return forbiddenResponse();

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Bad request", message: "Невалідні параметри" },
      { status: 400 },
    );
  }
  const body = parsed.data;

  try {
    await assertForemanCanAccessProject(session.user.id, firmId, body.projectId);
  } catch {
    return forbiddenResponse();
  }

  let neededBy: Date | null = null;
  if (body.neededBy) {
    const d = new Date(body.neededBy);
    if (isNaN(d.getTime())) {
      return NextResponse.json(
        { error: "Bad request", message: "Невалідна дата" },
        { status: 400 },
      );
    }
    neededBy = d;
  }

  const created = await prisma.$transaction(async (tx) => {
    const internalNumber = await nextNumber(tx, "PR", firmId);
    return tx.purchaseRequest.create({
      data: {
        firmId,
        projectId: body.projectId,
        requestedById: session.user.id,
        neededBy,
        notes: body.notes ?? null,
        internalNumber,
        status: "DRAFT",
        items: {
          create: body.items.map((it, idx) => ({
            description: it.description,
            qty: new Prisma.Decimal(it.qty),
            unit: it.unit,
            sortOrder: idx,
          })),
        },
      },
      select: { id: true, internalNumber: true },
    });
  });

  return NextResponse.json(created, { status: 201 });
}
