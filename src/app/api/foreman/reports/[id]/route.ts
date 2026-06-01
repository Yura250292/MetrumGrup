import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireForeman,
  forbiddenResponse,
  unauthorizedResponse,
} from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import type { CostType } from "@prisma/client";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const PatchBody = z.object({
  items: z.array(
    z.object({
      costType: z.enum(["MATERIAL", "LABOR", "SUBCONTRACT", "EQUIPMENT", "OVERHEAD", "OTHER"]),
      title: z.string().min(1).max(500),
      unit: z.string().max(50).nullable().optional(),
      quantity: z.number().nonnegative().nullable().optional(),
      unitPrice: z.number().nonnegative().nullable().optional(),
      amount: z.number().positive(),
      currency: z.string().min(3).max(3).default("UAH"),
      sortOrder: z.number().int().nonnegative().default(0),
      counterpartyId: z.string().min(1).nullable().optional(),
      supplierGuess: z.string().max(200).nullable().optional(),
    }),
  ),
});

async function loadOwnedReport(id: string, userId: string, firmId: string | null) {
  return prisma.foremanReport.findFirst({
    where: {
      id,
      createdById: userId,
      firmId: firmId ?? undefined,
    },
    select: { id: true, status: true },
  });
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  let session, firmId;
  try {
    ({ session, firmId } = await requireForeman());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") return forbiddenResponse();
    return unauthorizedResponse();
  }

  const report = await prisma.foremanReport.findFirst({
    where: { id, createdById: session.user.id, firmId: firmId ?? undefined },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      project: { select: { id: true, title: true } },
    },
  });
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ report });
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  let session, firmId;
  try {
    ({ session, firmId } = await requireForeman());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") return forbiddenResponse();
    return unauthorizedResponse();
  }

  const existing = await loadOwnedReport(id, session.user.id, firmId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.status !== "DRAFT" && existing.status !== "NEEDS_REVISION") {
    return NextResponse.json(
      { error: "Conflict", message: "Звіт уже надіслано — редагування неможливе" },
      { status: 409 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad request", message: "Невалідні дані" }, { status: 400 });
  }

  // Replace strategy: delete old items, create new
  await prisma.$transaction([
    prisma.foremanReportItem.deleteMany({ where: { reportId: id } }),
    prisma.foremanReportItem.createMany({
      data: parsed.data.items.map((it, idx) => ({
        reportId: id,
        costType: it.costType as CostType,
        title: it.title.trim(),
        unit: it.unit?.trim() || null,
        quantity: it.quantity ?? null,
        unitPrice: it.unitPrice ?? null,
        amount: it.amount,
        currency: it.currency || "UAH",
        sortOrder: it.sortOrder ?? idx,
        counterpartyId: it.counterpartyId ?? null,
        supplierGuess: it.supplierGuess ?? null,
      })),
    }),
    prisma.foremanReport.update({ where: { id }, data: { updatedAt: new Date() } }),
  ]);

  return NextResponse.json({ ok: true });
}
