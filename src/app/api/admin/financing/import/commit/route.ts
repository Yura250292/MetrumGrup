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
  counterpartyId?: string | null;
  description: string | null;
  /** Опціонально: для AUTO режиму може відрізнятися від preset.type. */
  type?: "INCOME" | "EXPENSE";
};

type ResolvedRow = {
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
  counterpartyId: string | null;
  status: "DRAFT" | "PENDING" | "APPROVED" | "PAID";
  source: "MANUAL";
  folderId: string | null;
  createdById: string;
  /** SHA-подібний рядок для дедуплікації (не зберігається у БД). */
  fingerprint: string;
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
    /** Якщо true — пропускаємо рядки що дублюють існуючі FinanceEntry. */
    skipDuplicates?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Невалідний JSON" }, { status: 400 });
  }

  const kind = body.kind && VALID_KIND.has(body.kind) ? (body.kind as "PLAN" | "FACT") : null;
  // type може бути "AUTO" — у такому випадку очікуємо per-row type у кожному рядку.
  const presetType =
    body.type && VALID_TYPE.has(body.type)
      ? (body.type as "INCOME" | "EXPENSE")
      : body.type === "AUTO"
        ? "AUTO"
        : null;
  const status =
    body.status && VALID_STATUS.has(body.status)
      ? (body.status as "DRAFT" | "PENDING" | "APPROVED" | "PAID")
      : "DRAFT";
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const skipDuplicates = body.skipDuplicates !== false; // default true

  if (!kind || !presetType) {
    return NextResponse.json({ error: "Невалідні kind/type" }, { status: 400 });
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

  // Validate + materialize
  const resolved: ResolvedRow[] = [];
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const title = typeof r.title === "string" ? r.title.trim() : "";
    if (!title) continue;
    const amount = Number(r.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    if (!FINANCE_CATEGORY_LABELS[r.category]) continue;
    const occurredAt =
      typeof r.occurredAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.occurredAt)
        ? new Date(r.occurredAt)
        : fallbackDate;
    if (Number.isNaN(occurredAt.getTime())) continue;
    const rowType: "INCOME" | "EXPENSE" =
      presetType === "AUTO"
        ? r.type === "INCOME" || r.type === "EXPENSE"
          ? r.type
          : "EXPENSE"
        : presetType;

    const counterpartyId =
      typeof r.counterpartyId === "string" && r.counterpartyId.trim()
        ? r.counterpartyId.trim()
        : null;
    const counterpartyName =
      typeof r.counterparty === "string" && r.counterparty.trim()
        ? r.counterparty.trim().slice(0, 200)
        : null;

    const cleanTitle = title.slice(0, 200);
    const dateKey = occurredAt.toISOString().slice(0, 10);
    const fingerprint = [
      kind,
      rowType,
      dateKey,
      Math.round(amount * 100),
      cleanTitle.toLowerCase(),
      entryFirmId ?? "",
    ].join("|");

    resolved.push({
      type: rowType,
      kind,
      amount: Math.round(amount * 100) / 100,
      currency: "UAH",
      occurredAt,
      projectId,
      firmId: entryFirmId,
      category: r.category,
      title: cleanTitle,
      description:
        typeof r.description === "string" && r.description.trim()
          ? r.description.trim().slice(0, 1000)
          : null,
      counterparty: counterpartyName,
      counterpartyId,
      status,
      source: "MANUAL",
      folderId,
      createdById: session.user.id,
      fingerprint,
    });
  }

  if (resolved.length === 0) {
    return NextResponse.json(
      { error: "Жоден рядок не пройшов валідацію" },
      { status: 400 },
    );
  }

  // Dedup: підтягуємо існуючі записи у тому самому firm/kind, у вузькому діапазоні дат.
  let duplicates = 0;
  let toInsert = resolved;
  if (skipDuplicates) {
    const dates = resolved.map((r) => r.occurredAt.getTime());
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));
    const titles = Array.from(new Set(resolved.map((r) => r.title)));

    const existing = await prisma.financeEntry.findMany({
      where: {
        kind,
        firmId: entryFirmId,
        title: { in: titles },
        occurredAt: { gte: minDate, lte: maxDate },
      },
      select: {
        type: true,
        kind: true,
        amount: true,
        title: true,
        occurredAt: true,
        firmId: true,
      },
    });

    const existingKeys = new Set(
      existing.map((e) =>
        [
          e.kind,
          e.type,
          e.occurredAt.toISOString().slice(0, 10),
          Math.round(Number(e.amount) * 100),
          e.title.toLowerCase(),
          e.firmId ?? "",
        ].join("|"),
      ),
    );

    toInsert = resolved.filter((r) => !existingKeys.has(r.fingerprint));
    duplicates = resolved.length - toInsert.length;
  }

  if (toInsert.length === 0) {
    return NextResponse.json(
      {
        count: 0,
        skipped: rows.length - resolved.length,
        duplicates,
      },
      { status: 200 },
    );
  }

  const result = await prisma.financeEntry.createMany({
    data: toInsert.map(({ fingerprint: _f, ...d }) => d),
  });

  await auditLog({
    userId: session.user.id,
    action: "CREATE",
    entity: "FinanceEntry",
    entityId: "bulk",
    newData: {
      bulkImport: true,
      kind,
      type: presetType,
      count: result.count,
      duplicatesSkipped: duplicates,
      projectId,
      folderId,
    },
  });

  return NextResponse.json(
    {
      count: result.count,
      skipped: rows.length - resolved.length,
      duplicates,
    },
    { status: 201 },
  );
}
