import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireForeman,
  forbiddenResponse,
  unauthorizedResponse,
} from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { visibleEstimateItemsWhere } from "@/lib/foreman/visible-items";
import type { CostType } from "@prisma/client";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Structured-звіт виконроба (P6).
 *
 * Блок 1 — фактичні обсяги по роботах кошторису → ForemanReportProgress
 *   (зі snapshot-полями unit/plannedQty/unitPrice на момент запису).
 * Блок 2 — додаткові роботи (не з кошторису) → ForemanReportItem
 *   (itemType=EXTRA, pmDecision=PENDING).
 *
 * Replace-стратегія для обох блоків. Дозволено лише у DRAFT / NEEDS_REVISION.
 * Cost-items legacy-флоу (itemType≠EXTRA) не чіпаємо.
 */
const Body = z.object({
  progress: z
    .array(
      z.object({
        estimateItemId: z.string().min(1),
        quantityActual: z.number().nonnegative(),
        note: z.string().max(1000).nullable().optional(),
      }),
    )
    .default([]),
  extras: z
    .array(
      z.object({
        title: z.string().min(1).max(500),
        unit: z.string().max(50).nullable().optional(),
        quantity: z.number().nonnegative().nullable().optional(),
        costType: z
          .enum(["MATERIAL", "LABOR", "SUBCONTRACT", "EQUIPMENT", "OVERHEAD", "OTHER"])
          .default("LABOR"),
        note: z.string().max(500).nullable().optional(),
      }),
    )
    .default([]),
});

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

  const report = await prisma.foremanReport.findFirst({
    where: { id, createdById: session.user.id, firmId: firmId ?? undefined },
    select: { id: true, status: true, projectId: true },
  });
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (report.status !== "DRAFT" && report.status !== "NEEDS_REVISION") {
    return NextResponse.json(
      { error: "Conflict", message: "Звіт уже надіслано — редагування неможливе" },
      { status: 409 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad request", message: "Невалідні дані" }, { status: 400 });
  }

  // Валідація: усі estimateItemId мають бути видимі цьому виконробу у цьому проєкті.
  const progressItemIds = [...new Set(parsed.data.progress.map((p) => p.estimateItemId))];
  let snapshotById = new Map<
    string,
    { unit: string; quantity: unknown; unitPrice: unknown }
  >();
  if (progressItemIds.length > 0) {
    const allowed = await prisma.estimateItem.findMany({
      where: {
        AND: [
          visibleEstimateItemsWhere(report.projectId, session.user.id),
          { id: { in: progressItemIds } },
        ],
      },
      select: { id: true, unit: true, quantity: true, unitPrice: true },
    });
    snapshotById = new Map(
      allowed.map((i) => [i.id, { unit: i.unit, quantity: i.quantity, unitPrice: i.unitPrice }]),
    );
    const missing = progressItemIds.filter((pid) => !snapshotById.has(pid));
    if (missing.length > 0) {
      return NextResponse.json(
        { error: "Forbidden", message: "Деякі роботи недоступні для звіту", missing },
        { status: 403 },
      );
    }
  }

  await prisma.$transaction([
    // Блок 1 — progress (replace).
    prisma.foremanReportProgress.deleteMany({ where: { reportId: id } }),
    prisma.foremanReportProgress.createMany({
      data: parsed.data.progress.map((p, idx) => {
        const snap = snapshotById.get(p.estimateItemId);
        return {
          reportId: id,
          estimateItemId: p.estimateItemId,
          quantityActual: p.quantityActual,
          unitSnapshot: snap?.unit ?? null,
          quantityPlannedSnapshot: (snap?.quantity as never) ?? null,
          unitPriceSnapshot: (snap?.unitPrice as never) ?? null,
          note: p.note ?? null,
          sortOrder: idx,
        };
      }),
    }),
    // Блок 2 — EXTRA items (replace лише EXTRA, не чіпаємо legacy cost-items).
    prisma.foremanReportItem.deleteMany({ where: { reportId: id, itemType: "EXTRA" } }),
    prisma.foremanReportItem.createMany({
      data: parsed.data.extras.map((x, idx) => ({
        reportId: id,
        itemType: "EXTRA" as const,
        pmDecision: "PENDING" as const,
        costType: x.costType as CostType,
        title: x.title.trim(),
        nameOverride: x.title.trim(),
        unit: x.unit?.trim() || null,
        unitOverride: x.unit?.trim() || null,
        quantity: x.quantity ?? null,
        amount: 0, // фактична собівартість рахується PM/approve через amountCalculated
        managerNote: x.note ?? null,
        sortOrder: idx,
      })),
    }),
    prisma.foremanReport.update({ where: { id }, data: { updatedAt: new Date() } }),
  ]);

  return NextResponse.json({ ok: true });
}
