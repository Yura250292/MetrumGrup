import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse, FOREMAN_REPORT_REVIEWERS } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";
import { upsertSupplierMaterial } from "@/lib/foreman/upsert-supplier-material";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { firmId: activeFirmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, activeFirmId);
  if (!role || !FOREMAN_REPORT_REVIEWERS.includes(role)) return forbiddenResponse();

  // Safe Finance Migration: дозволяємо approver-у обрати "було оплачено
  // на місці" → ACTUAL_EXPENSE. За замовч. COMMITTED_EXPENSE.
  let approveNature: "COMMITTED_EXPENSE" | "ACTUAL_EXPENSE" = "COMMITTED_EXPENSE";
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.financeNature === "ACTUAL_EXPENSE") {
      approveNature = "ACTUAL_EXPENSE";
    } else if (body?.entryIntent === "ACTUAL") {
      approveNature = "ACTUAL_EXPENSE";
    }
  } catch {
    // empty body OK
  }

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

  // Phase 2 (supplier-debt): MATERIAL items мають бути привʼязані до постачальника,
  // інакше факт не агрегуватиметься як борг. Менеджеру повертаємо 422 зі списком
  // items що потребують ручної привʼязки — UI відкриває диалог вибору/створення.
  // LABOR і OTHER пропускаються (необовʼязково мати постачальника).
  const SUPPLIER_REQUIRED: ReadonlyArray<string> = ["MATERIAL", "SUBCONTRACT"];
  const missingSupplierItems = report.items.filter(
    (i) => SUPPLIER_REQUIRED.includes(i.costType) && !i.counterpartyId,
  );
  if (missingSupplierItems.length > 0) {
    return NextResponse.json(
      {
        error: "Supplier required",
        message:
          "Для матеріалів і субпідряду треба вибрати постачальника, перш ніж затверджувати звіт.",
        pendingItems: missingSupplierItems.map((i) => ({
          id: i.id,
          title: i.title,
          costType: i.costType,
          supplierGuess: i.supplierGuess,
        })),
      },
      { status: 422 },
    );
  }

  const occurredAt = report.occurredAt;
  const folderId = report.project.folderId ?? null;
  const reviewerId = session.user.id;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const financeEntryIds: string[] = [];

      for (const item of report.items) {
        const category = item.costType === "LABOR" ? "Робота" : "Матеріали";
        const baseDescription = [
          item.unit && item.quantity ? `${item.quantity} ${item.unit}` : null,
          item.unitPrice ? `${item.unitPrice} грн/${item.unit ?? "од"}` : null,
        ]
          .filter(Boolean)
          .join(" × ");
        const description = [baseDescription || null, item.managerNote || null]
          .filter(Boolean)
          .join(" · ");

        // Safe Finance Migration Phase 5.5: per-item rule:
        //   1) item.financeIntent (явне рішення менеджера у UI) — пріоритет.
        //   2) body-level intent (approveNature) — fallback для bulk-approve.
        //   3) default COMMITTED_EXPENSE.
        // ACTUAL_EXPENSE → status=PAID (запис не має лежати у боргах
        // постачальника). COMMITTED_EXPENSE → status=APPROVED.
        const itemNature: "COMMITTED_EXPENSE" | "ACTUAL_EXPENSE" =
          item.financeIntent === "ACTUAL"
            ? "ACTUAL_EXPENSE"
            : item.financeIntent === "COMMITTED"
              ? "COMMITTED_EXPENSE"
              : approveNature;
        const itemStatus: "APPROVED" | "PAID" =
          itemNature === "ACTUAL_EXPENSE" ? "PAID" : "APPROVED";

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
            // Safe Finance Migration Phase 5.5: copy costCode з item у FE —
            // менеджер вибирає при review, budget-matrix агрегує по статті.
            costCodeId: item.costCodeId,
            source: "FOREMAN_REPORT",
            isDerived: false,
            status: itemStatus,
            approvedAt: new Date(),
            approvedById: reviewerId,
            ...(itemStatus === "PAID" ? { paidAt: new Date() } : {}),
            createdById: report.createdById,
            updatedById: reviewerId,
            foremanReportItemId: item.id,
            // Phase 2: переносимо постачальника на FinanceEntry — це критично для
            // агрегацій боргу (counterparty-dossier рахує SUM unpaid expenses).
            counterpartyId: item.counterpartyId,
            financeNature: itemNature,
          },
          select: { id: true },
        });
        financeEntryIds.push(entry.id);

        // Phase 3: оновлюємо довідник матеріалів цього постачальника +
        // детектимо подорожчання. Лише для MATERIAL items з прив'язаним постачальником
        // і unitPrice — інші типи (LABOR/OVERHEAD) не мають сенсу як "матеріал".
        if (
          item.costType === "MATERIAL" &&
          item.counterpartyId &&
          item.unitPrice &&
          report.firmId
        ) {
          const result = await upsertSupplierMaterial(tx, {
            counterpartyId: item.counterpartyId,
            firmId: report.firmId,
            title: item.title,
            unit: item.unit,
            unitPrice: item.unitPrice,
            occurredAt,
            sourceReportId: report.id,
            sourceItemId: item.id,
          });
          if (result?.priceIncrease) {
            await tx.foremanReportItem.update({
              where: { id: item.id },
              data: {
                priceIncreaseFlag: true,
                previousUnitPrice: result.previousUnitPrice,
              },
            });
          }
        }

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
