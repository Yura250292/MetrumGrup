import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import {
  isHomeFirmFor,
  firmIdForNewEntity,
  DEFAULT_FIRM_ID,
} from "@/lib/firm/scope";
import { createSupplierPaymentWithAllocation } from "@/lib/finance/supplier-allocation";

export const runtime = "nodejs";

const READ_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER", "HR"];
const WRITE_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER"];

const querySchema = z.object({
  counterpartyId: z.string().trim().optional(),
  projectId: z.string().trim().optional(),
  status: z.enum(["POSTED", "VOIDED"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  take: z.coerce.number().int().positive().max(500).default(50),
});

const createSchema = z.object({
  counterpartyId: z.string().trim().min(1),
  projectId: z.string().trim().nullable().optional(),
  amount: z.coerce.number().positive(),
  currency: z.string().trim().default("UAH"),
  occurredAt: z.coerce.date(),
  method: z.enum(["CASH", "BANK_TRANSFER", "CARD"]).default("BANK_TRANSFER"),
  reference: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
  strategy: z.enum(["HYBRID", "FIFO", "PROPORTIONAL"]).default("HYBRID"),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!READ_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, firmId)) return forbiddenResponse();

  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні параметри", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { counterpartyId, projectId, status, from, to, take } = parsed.data;

  const items = await prisma.supplierPayment.findMany({
    where: {
      ...(firmId ? { firmId } : {}),
      ...(counterpartyId ? { counterpartyId } : {}),
      ...(projectId ? { projectId } : {}),
      ...(status ? { status } : {}),
      ...(from || to
        ? {
            occurredAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    },
    orderBy: { occurredAt: "desc" },
    take,
    select: {
      id: true,
      counterpartyId: true,
      projectId: true,
      amount: true,
      currency: true,
      occurredAt: true,
      method: true,
      reference: true,
      notes: true,
      status: true,
      voidedAt: true,
      counterparty: { select: { id: true, name: true } },
      project: { select: { id: true, title: true, slug: true } },
      _count: { select: { allocations: true } },
    },
  });

  return NextResponse.json({ data: items });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!WRITE_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, firmId)) return forbiddenResponse();

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;
  const entryFirmId = firmId ?? firmIdForNewEntity(session, DEFAULT_FIRM_ID);

  // Counterparty cross-firm guard: не дозволяємо платіж постачальнику іншої фірми.
  const cp = await prisma.counterparty.findUnique({
    where: { id: data.counterpartyId },
    select: { id: true, firmId: true, isActive: true },
  });
  if (!cp) {
    return NextResponse.json({ error: "Постачальника не знайдено" }, { status: 404 });
  }
  if (cp.firmId && cp.firmId !== entryFirmId) {
    return forbiddenResponse();
  }
  if (!cp.isActive) {
    return NextResponse.json(
      { error: "Постачальник деактивований" },
      { status: 409 },
    );
  }

  if (data.projectId) {
    const project = await prisma.project.findUnique({
      where: { id: data.projectId },
      select: { id: true, firmId: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Проект не знайдено" }, { status: 404 });
    }
    if (project.firmId && project.firmId !== entryFirmId) {
      return forbiddenResponse();
    }
  }

  const idempotencyKey = request.headers.get("x-idempotency-key");

  try {
    const result = await createSupplierPaymentWithAllocation({
      counterpartyId: data.counterpartyId,
      firmId: entryFirmId,
      projectId: data.projectId ?? null,
      amount: data.amount,
      currency: data.currency,
      occurredAt: data.occurredAt,
      method: data.method,
      reference: data.reference ?? null,
      notes: data.notes ?? null,
      createdById: session.user.id,
      idempotencyKey,
      strategy: data.strategy,
    });
    return NextResponse.json(
      {
        data: result.payment,
        plan: result.plan,
        idempotentReplay: result.idempotentReplay,
      },
      { status: result.idempotentReplay ? 200 : 201 },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Помилка створення платежу";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
