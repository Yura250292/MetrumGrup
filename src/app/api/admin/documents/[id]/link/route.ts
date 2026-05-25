import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  unauthorizedResponse,
  forbiddenResponse,
  FINANCE_ROLES,
} from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";

export const runtime = "nodejs";

/**
 * Cascade Link → FinanceEntry створює фінансовий запис із сумою.
 * Згідно з memory project_metrum_finance_access_rule: ТІЛЬКИ SUPER_ADMIN.
 */
const LINK_ROLES: Role[] = FINANCE_ROLES;

const bodySchema = z.object({
  /** Тип цільової сутності. Phase A підтримує FINANCE_ENTRY; інші — placeholder для Phase B. */
  entityType: z.enum(["FINANCE_ENTRY"]),
  /** Override полів для FinanceEntry (якщо людина виправила під час review). */
  overrides: z
    .object({
      amount: z.number().positive().optional(),
      currency: z.string().optional(),
      occurredAt: z.string().optional(),
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      projectId: z.string().optional().nullable(),
      counterpartyId: z.string().optional().nullable(),
      costCodeId: z.string().optional().nullable(),
      category: z.string().optional(),
      invoiceNumber: z.string().optional(),
    })
    .partial()
    .optional(),
});

type ExtractedDataShape = {
  amountTotal?: number;
  currency?: string;
  documentDate?: string;
  documentNumber?: string;
  counterparty?: { name?: string; edrpou?: string };
  autoLink?: {
    counterpartyId?: string | null;
    projectId?: string | null;
  };
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!LINK_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!firmId) return forbiddenResponse();

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірне тіло", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const doc = await prisma.incomingDocument.findFirst({
    where: { id, firmId },
  });
  if (!doc) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  if (doc.status === "LINKED" || doc.status === "ARCHIVED") {
    return NextResponse.json(
      { error: `Документ уже у статусі ${doc.status}` },
      { status: 409 },
    );
  }

  const extracted = (doc.extractedData ?? {}) as ExtractedDataShape;
  const overrides = parsed.data.overrides ?? {};

  const amount = overrides.amount ?? extracted.amountTotal;
  if (!amount || amount <= 0) {
    return NextResponse.json(
      { error: "Не вказана сума (amount)" },
      { status: 400 },
    );
  }

  const occurredAtSource = overrides.occurredAt ?? extracted.documentDate;
  const occurredAt = occurredAtSource ? new Date(occurredAtSource) : new Date();
  if (Number.isNaN(occurredAt.getTime())) {
    return NextResponse.json({ error: "Невалідна дата" }, { status: 400 });
  }

  const counterpartyId =
    overrides.counterpartyId !== undefined
      ? overrides.counterpartyId
      : extracted.autoLink?.counterpartyId ?? null;
  const projectId =
    overrides.projectId !== undefined
      ? overrides.projectId
      : extracted.autoLink?.projectId ?? null;
  const costCodeId =
    overrides.costCodeId !== undefined ? overrides.costCodeId : null;
  const title =
    overrides.title ??
    extracted.counterparty?.name ??
    doc.originalFileName ??
    `Документ ${doc.id}`;
  const invoiceNumber = overrides.invoiceNumber ?? extracted.documentNumber ?? undefined;
  const currency = overrides.currency ?? extracted.currency ?? "UAH";

  const created = await prisma.$transaction(async (tx) => {
    const finance = await tx.financeEntry.create({
      data: {
        firmId,
        occurredAt,
        kind: "FACT",
        type: "EXPENSE",
        amount: new Prisma.Decimal(amount),
        currency,
        category: overrides.category ?? "Документ",
        title,
        description: overrides.description ?? `Створено з документа ${doc.originalFileName}`,
        counterparty: extracted.counterparty?.name ?? null,
        counterpartyId,
        projectId,
        costCodeId,
        invoiceNumber,
        source: "DOCUMENT_INBOX",
        status: "DRAFT",
        createdById: session.user.id,
      },
      select: { id: true, amount: true, currency: true, occurredAt: true },
    });

    await tx.incomingDocument.update({
      where: { id: doc.id },
      data: {
        status: "LINKED",
        linkedEntityType: "FINANCE_ENTRY",
        linkedEntityId: finance.id,
        reviewedById: doc.reviewedById ?? session.user.id,
        reviewedAt: doc.reviewedAt ?? new Date(),
      },
    });

    return finance;
  });

  return NextResponse.json({
    financeEntry: created,
    documentId: doc.id,
    status: "LINKED",
  });
}
