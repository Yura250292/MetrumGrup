import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { auditLog } from "@/lib/audit";
import { FINANCE_CATEGORY_LABELS } from "@/lib/constants";
import {
  isHomeFirmFor,
  getActiveRoleFromSession,
  firmIdForNewEntity,
  DEFAULT_FIRM_ID,
  assertCanAccessFirm,
} from "@/lib/firm/scope";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";

export const runtime = "nodejs";

const WRITE_ROLES = new Set(["SUPER_ADMIN", "MANAGER", "FINANCIER"]);
const VALID_KIND = new Set(["PLAN", "FACT"]);
const VALID_TYPE = new Set(["INCOME", "EXPENSE"]);
const VALID_STATUS = new Set(["DRAFT", "PENDING", "APPROVED", "PAID"]);

type IncomingRow = {
  occurredAt: string | null;
  title: string;
  amount: number;
  category: string;
  counterparty: string | null;
  description: string | null;
};

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { firmId: activeFirmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, activeFirmId)) return forbiddenResponse();
  const role = getActiveRoleFromSession(session, activeFirmId);
  if (!role || !WRITE_ROLES.has(role)) return forbiddenResponse();

  let body: {
    kind?: string;
    type?: string;
    status?: string;
    projectId?: string | null;
    folderId?: string | null;
    rows?: IncomingRow[];
    fallbackDate?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Невалідний JSON" }, { status: 400 });
  }

  const kind = body.kind && VALID_KIND.has(body.kind) ? body.kind : null;
  const type = body.type && VALID_TYPE.has(body.type) ? body.type : null;
  const status =
    body.status && VALID_STATUS.has(body.status)
      ? (body.status as "DRAFT" | "PENDING" | "APPROVED" | "PAID")
      : "DRAFT";
  const rows = Array.isArray(body.rows) ? body.rows : [];

  if (!kind || !type) {
    return NextResponse.json(
      { error: "Невалідні kind/type" },
      { status: 400 },
    );
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: "Немає рядків для імпорту" }, { status: 400 });
  }
  if (rows.length > 1000) {
    return NextResponse.json(
      { error: "Забагато рядків за раз (макс 1000)" },
      { status: 400 },
    );
  }

  const fallbackDate =
    body.fallbackDate && /^\d{4}-\d{2}-\d{2}$/.test(body.fallbackDate)
      ? new Date(body.fallbackDate)
      : new Date();

  // Validate project + firm scope
  const projectId =
    typeof body.projectId === "string" && body.projectId.trim()
      ? body.projectId.trim()
      : null;
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

  const folderId =
    typeof body.folderId === "string" && body.folderId.trim()
      ? body.folderId.trim()
      : null;

  const entryFirmId = projectFirmId ?? firmIdForNewEntity(session, DEFAULT_FIRM_ID);

  // Build records — keep only those with valid amount/title/category for the type
  const data = rows
    .map((r): {
      type: "INCOME" | "EXPENSE";
      kind: "PLAN" | "FACT";
      amount: number;
      currency: string;
      occurredAt: Date;
      projectId: string | null;
      firmId: string | null;
      category: string;
      title: string;
      description: string | null;
      counterparty: string | null;
      status: "DRAFT" | "PENDING" | "APPROVED" | "PAID";
      source: "MANUAL";
      folderId: string | null;
      createdById: string;
    } | null => {
      if (!r || typeof r !== "object") return null;
      const title = typeof r.title === "string" ? r.title.trim() : "";
      if (!title) return null;
      const amount = Number(r.amount);
      if (!Number.isFinite(amount) || amount <= 0) return null;
      if (!FINANCE_CATEGORY_LABELS[r.category]) return null;
      const occurredAt =
        typeof r.occurredAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.occurredAt)
          ? new Date(r.occurredAt)
          : fallbackDate;
      if (Number.isNaN(occurredAt.getTime())) return null;
      return {
        type: type as "INCOME" | "EXPENSE",
        kind: kind as "PLAN" | "FACT",
        amount: Math.round(amount * 100) / 100,
        currency: "UAH",
        occurredAt,
        projectId,
        firmId: entryFirmId,
        category: r.category,
        title: title.slice(0, 200),
        description:
          typeof r.description === "string" && r.description.trim()
            ? r.description.trim().slice(0, 1000)
            : null,
        counterparty:
          typeof r.counterparty === "string" && r.counterparty.trim()
            ? r.counterparty.trim().slice(0, 200)
            : null,
        status,
        source: "MANUAL",
        folderId,
        createdById: session.user.id,
      };
    })
    .filter(<T>(x: T | null): x is T => x !== null);

  if (data.length === 0) {
    return NextResponse.json(
      { error: "Жоден рядок не пройшов валідацію" },
      { status: 400 },
    );
  }

  const result = await prisma.financeEntry.createMany({ data });

  await auditLog({
    userId: session.user.id,
    action: "CREATE",
    entity: "FinanceEntry",
    entityId: "bulk",
    newData: {
      bulkImport: true,
      kind,
      type,
      count: result.count,
      projectId,
      folderId,
    },
  });

  return NextResponse.json(
    { count: result.count, skipped: rows.length - data.length },
    { status: 201 },
  );
}
