import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { auditLog } from "@/lib/audit";
import { FINANCE_CATEGORY_LABELS } from "@/lib/constants";
import {
  parseListParams,
  expandFolderFilter,
  computeSummary,
  FINANCE_ENTRY_SELECT,
} from "@/lib/financing/queries";
import { notifyFinanceApprovers } from "@/lib/financing/notify-approval";
import {
  assertCanAccessFirm,
  firmIdForNewEntity,
  DEFAULT_FIRM_ID,
  isHomeFirmFor,
  getActiveRoleFromSession,
} from "@/lib/firm/scope";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";

export const runtime = "nodejs";

const READ_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER"];
const WRITE_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER"];

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  try {
    const { searchParams } = new URL(request.url);
    const { firmId } = await resolveFirmScopeForRequest(session);
    if (!isHomeFirmFor(session, firmId)) return forbiddenResponse();
    // Role перевіряємо у контексті активної фірми (per-firm role).
    const activeRole = getActiveRoleFromSession(session, firmId);
    if (!activeRole || !READ_ROLES.includes(activeRole)) return forbiddenResponse();
    const filters = parseListParams(searchParams, firmId);
    const where = await expandFolderFilter(filters);

    const [data, summary] = await Promise.all([
      prisma.financeEntry.findMany({
        where,
        select: FINANCE_ENTRY_SELECT,
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        take: 500,
      }),
      computeSummary(where),
    ]);

    return NextResponse.json({ data, summary });
  } catch (error) {
    console.error("[financing/GET] error:", error);
    return NextResponse.json({ error: "Помилка завантаження операцій" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  // Home-firm guard + per-firm role.
  const { firmId: activeFirmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, activeFirmId)) return forbiddenResponse();
  const activeRole = getActiveRoleFromSession(session, activeFirmId);
  if (!activeRole || !WRITE_ROLES.includes(activeRole)) return forbiddenResponse();

  try {
    const body = await request.json();

    const type = body.type === "INCOME" || body.type === "EXPENSE" ? body.type : null;
    const kind = body.kind === "PLAN" || body.kind === "FACT" ? body.kind : "FACT";
    const amountNum = Number(body.amount);
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const category =
      typeof body.category === "string" && FINANCE_CATEGORY_LABELS[body.category]
        ? body.category
        : null;
    const occurredAt = body.occurredAt ? new Date(body.occurredAt) : null;
    const projectId =
      body.projectId === null || body.projectId === "" || body.projectId === undefined
        ? null
        : String(body.projectId);

    if (!type || !Number.isFinite(amountNum) || amountNum <= 0 || !title || !category || !occurredAt || Number.isNaN(occurredAt.getTime())) {
      return NextResponse.json(
        { error: "Обов'язкові поля: тип, сума (>0), категорія, назва, дата" },
        { status: 400 }
      );
    }

    let projectFirmId: string | null = null;
    if (projectId) {
      const exists = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, firmId: true },
      });
      if (!exists) {
        return NextResponse.json({ error: "Проєкт не існує" }, { status: 400 });
      }
      projectFirmId = exists.firmId ?? null;
      try {
        assertCanAccessFirm(session, projectFirmId);
      } catch {
        return forbiddenResponse();
      }
    }

    // Stamp firmId з АКТИВНОЇ фірми (cookie/session). Якщо запис привʼязано
    // до проекту — узгоджуємо з firmId проекту (захист від cross-firm leak).
    const entryFirmId =
      projectFirmId ??
      activeFirmId ??
      firmIdForNewEntity(session, DEFAULT_FIRM_ID);

    const folderId =
      typeof body.folderId === "string" && body.folderId.trim()
        ? body.folderId.trim()
        : null;

    const validStatuses = ["DRAFT", "PENDING", "APPROVED", "PAID"] as const;
    const status =
      typeof body.status === "string" && validStatuses.includes(body.status as (typeof validStatuses)[number])
        ? (body.status as (typeof validStatuses)[number])
        : "DRAFT";

    // New axis fields (Phase 1.A1 + A2). All optional and validated only if
    // a non-empty string is supplied; existing legacy fields stay untouched.
    const validCostTypes = ["MATERIAL", "LABOR", "SUBCONTRACT", "EQUIPMENT", "OVERHEAD", "OTHER"] as const;
    type CostTypeKey = (typeof validCostTypes)[number];
    const costCodeId =
      typeof body.costCodeId === "string" && body.costCodeId.trim() ? body.costCodeId.trim() : null;
    const costType =
      typeof body.costType === "string" && validCostTypes.includes(body.costType as CostTypeKey)
        ? (body.costType as CostTypeKey)
        : null;
    const counterpartyId =
      typeof body.counterpartyId === "string" && body.counterpartyId.trim()
        ? body.counterpartyId.trim()
        : null;

    // Resolve denormalised counterparty string from FK if provided.
    let counterpartyName: string | null =
      typeof body.counterparty === "string" && body.counterparty.trim() ? body.counterparty.trim() : null;
    if (counterpartyId) {
      const cp = await prisma.counterparty.findUnique({
        where: { id: counterpartyId },
        select: { id: true, name: true, firmId: true },
      });
      if (!cp) {
        return NextResponse.json({ error: "Контрагент не існує" }, { status: 400 });
      }
      // Не дозволяємо прив'язувати контрагента чужої фірми до запису.
      if (cp.firmId && entryFirmId && cp.firmId !== entryFirmId) {
        return NextResponse.json(
          { error: "Контрагент належить іншій фірмі" },
          { status: 400 },
        );
      }
      counterpartyName = cp.name;
    }

    if (costCodeId) {
      const cc = await prisma.costCode.findUnique({
        where: { id: costCodeId },
        select: { id: true },
      });
      if (!cc) {
        return NextResponse.json({ error: "Статтю витрат не знайдено" }, { status: 400 });
      }
    }

    const entry = await prisma.financeEntry.create({
      data: {
        type,
        kind,
        amount: amountNum,
        currency: typeof body.currency === "string" && body.currency ? body.currency : "UAH",
        occurredAt,
        projectId,
        firmId: entryFirmId,
        category,
        subcategory:
          typeof body.subcategory === "string" && body.subcategory.trim() ? body.subcategory.trim() : null,
        title,
        description: typeof body.description === "string" ? body.description : null,
        counterparty: counterpartyName,
        counterpartyId,
        costCodeId,
        costType,
        createdById: session.user.id,
        folderId,
        status,
      },
      select: FINANCE_ENTRY_SELECT,
    });

    if (status === "PENDING") {
      notifyFinanceApprovers(
        {
          id: entry.id,
          title: entry.title,
          type: entry.type,
          amount: entry.amount as unknown as number,
          counterparty: entry.counterparty,
          projectTitle: entry.project?.title ?? null,
        },
        session.user.id,
      ).catch(() => {});
    }

    await auditLog({
      userId: session.user.id,
      action: "CREATE",
      entity: "FinanceEntry",
      entityId: entry.id,
      projectId: entry.projectId ?? undefined,
      newData: { type: entry.type, kind: entry.kind, amount: Number(entry.amount), category: entry.category, title: entry.title },
    });

    return NextResponse.json({ data: entry }, { status: 201 });
  } catch (error) {
    console.error("[financing/POST] error:", error);
    return NextResponse.json({ error: "Помилка створення операції" }, { status: 500 });
  }
}
