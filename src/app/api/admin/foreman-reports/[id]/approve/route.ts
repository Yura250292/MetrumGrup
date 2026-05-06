import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse, FOREMAN_REPORT_REVIEWERS } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { firmId: activeFirmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, activeFirmId);
  if (!role || !FOREMAN_REPORT_REVIEWERS.includes(role)) return forbiddenResponse();

  const report = await prisma.foremanReport.findFirst({
    where: { id, firmId: activeFirmId ?? undefined },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      attachments: true,
      project: { select: { id: true, folderId: true, firmId: true } },
    },
  });

  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (report.status === "APPROVED") {
    // Idempotent: вже approved → повернути існуючі FinanceEntry
    const entries = await prisma.financeEntry.findMany({
      where: { foremanReportItemId: { in: report.items.map((i) => i.id) } },
      select: { id: true },
    });
    return NextResponse.json({ ok: true, financeEntryIds: entries.map((e) => e.id), alreadyApproved: true });
  }

  if (report.status !== "PENDING_APPROVAL") {
    return NextResponse.json(
      { error: "Conflict", message: "Звіт не у статусі очікування" },
      { status: 409 },
    );
  }

  if (report.items.length === 0) {
    return NextResponse.json({ error: "Bad request", message: "Звіт без позицій" }, { status: 400 });
  }

  // Cross-firm protection: проект має бути в activeFirm
  if (report.project.firmId && activeFirmId && report.project.firmId !== activeFirmId) {
    return forbiddenResponse();
  }

  const occurredAt = report.occurredAt;
  const folderId = report.project.folderId ?? null;
  const reviewerId = session.user.id;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const financeEntryIds: string[] = [];

      for (const item of report.items) {
        const category = item.costType === "LABOR" ? "Робота" : "Матеріали";
        const description = [
          item.unit && item.quantity ? `${item.quantity} ${item.unit}` : null,
          item.unitPrice ? `${item.unitPrice} грн/${item.unit ?? "од"}` : null,
        ]
          .filter(Boolean)
          .join(" × ");

        const entry = await tx.financeEntry.create({
          data: {
            occurredAt,
            kind: "FACT",
            type: "EXPENSE",
            amount: item.amount,
            currency: item.currency,
            projectId: report.projectId,
            firmId: report.firmId,
            folderId,
            category,
            title: item.title,
            description: description || null,
            costType: item.costType,
            source: "FOREMAN_REPORT",
            isDerived: false,
            status: "APPROVED",
            approvedAt: new Date(),
            approvedById: reviewerId,
            createdById: report.createdById,
            updatedById: reviewerId,
            foremanReportItemId: item.id,
          },
          select: { id: true },
        });
        financeEntryIds.push(entry.id);

        // Скопіювати attachments звіту → FinanceEntryAttachment (той самий r2Key)
        if (report.attachments.length > 0) {
          await tx.financeEntryAttachment.createMany({
            data: report.attachments.map((a) => ({
              entryId: entry.id,
              r2Key: a.r2Key,
              originalName: a.originalName,
              mimeType: a.mimeType,
              size: a.size,
              uploadedById: a.uploadedById,
            })),
          });
        }
      }

      await tx.foremanReport.update({
        where: { id: report.id },
        data: {
          status: "APPROVED",
          reviewedAt: new Date(),
          reviewedById: reviewerId,
        },
      });

      return { financeEntryIds };
    });

    return NextResponse.json({ ok: true, financeEntryIds: result.financeEntryIds });
  } catch (e) {
    // Idempotent guard: якщо хтось одночасно approve-ив, foremanReportItemId
    // вже використано — це не помилка для користувача.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const existing = await prisma.financeEntry.findMany({
        where: { foremanReportItemId: { in: report.items.map((i) => i.id) } },
        select: { id: true },
      });
      return NextResponse.json({ ok: true, financeEntryIds: existing.map((x) => x.id), alreadyApproved: true });
    }
    console.error("[admin/foreman-reports/approve] error:", e);
    return NextResponse.json({ error: "Server", message: "Не вдалось затвердити звіт" }, { status: 500 });
  }
}
