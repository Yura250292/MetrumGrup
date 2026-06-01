import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  unauthorizedResponse,
  forbiddenResponse,
  FOREMAN_REPORT_REVIEWERS,
} from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession, assertCanAccessFirm } from "@/lib/firm/scope";

export const runtime = "nodejs";

const PatchBody = z.object({
  quantityActual: z.number().nonnegative().optional(),
  estimateItemId: z.string().min(1).optional(),
});

interface Ctx {
  params: Promise<{ id: string; progressId: string }>;
}

/**
 * PATCH /api/admin/foreman-reports/[id]/progress/[progressId] (P7).
 *
 * PM коригує фактичний обсяг або переприв'язує progress-рядок до іншої роботи
 * кошторису. Доступно у будь-якому статусі крім APPROVED.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { firmId: activeFirmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, activeFirmId);
  if (!role || !FOREMAN_REPORT_REVIEWERS.includes(role)) return forbiddenResponse();

  const { id, progressId } = await ctx.params;
  const progress = await prisma.foremanReportProgress.findFirst({
    where: { id: progressId, reportId: id },
    include: { report: { select: { id: true, status: true, firmId: true, projectId: true } } },
  });
  if (!progress) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  assertCanAccessFirm(session, progress.report.firmId);

  if (progress.report.status === "APPROVED") {
    return NextResponse.json(
      { error: "Conflict", message: "Звіт затверджено — обсяги вже зафіксовані." },
      { status: 409 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad request", details: parsed.error.flatten() }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.quantityActual !== undefined) data.quantityActual = parsed.data.quantityActual;

  // Переприв'язка до іншої роботи — нова робота має бути у тому ж проєкті;
  // оновлюємо snapshots під нову позицію.
  if (parsed.data.estimateItemId !== undefined) {
    const target = await prisma.estimateItem.findUnique({
      where: { id: parsed.data.estimateItemId },
      select: { id: true, unit: true, quantity: true, unitPrice: true, estimate: { select: { projectId: true } } },
    });
    if (!target || target.estimate?.projectId !== progress.report.projectId) {
      return NextResponse.json(
        { error: "Bad request", message: "Робота не належить проєкту звіту" },
        { status: 400 },
      );
    }
    data.estimateItemId = target.id;
    data.unitSnapshot = target.unit;
    data.quantityPlannedSnapshot = target.quantity;
    data.unitPriceSnapshot = target.unitPrice;
  }

  const updated = await prisma.foremanReportProgress.update({
    where: { id: progressId },
    data,
  });

  return NextResponse.json({ data: updated });
}

/**
 * DELETE — PM прибирає помилковий progress-рядок (крім APPROVED).
 */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { firmId: activeFirmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, activeFirmId);
  if (!role || !FOREMAN_REPORT_REVIEWERS.includes(role)) return forbiddenResponse();

  const { id, progressId } = await ctx.params;
  const progress = await prisma.foremanReportProgress.findFirst({
    where: { id: progressId, reportId: id },
    include: { report: { select: { status: true, firmId: true } } },
  });
  if (!progress) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  assertCanAccessFirm(session, progress.report.firmId);
  if (progress.report.status === "APPROVED") {
    return NextResponse.json(
      { error: "Conflict", message: "Звіт затверджено." },
      { status: 409 },
    );
  }

  await prisma.foremanReportProgress.delete({ where: { id: progressId } });
  return NextResponse.json({ ok: true });
}
