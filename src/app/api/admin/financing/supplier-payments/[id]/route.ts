import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { isHomeFirmFor, assertCanAccessFirm } from "@/lib/firm/scope";
import { voidSupplierPayment } from "@/lib/finance/supplier-allocation";

export const runtime = "nodejs";

const READ_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER", "HR"];
// MANAGER веде облік постачальників разом з Адміном → дозволено void.
const VOID_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER"];

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, ctx: Ctx) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!READ_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, firmId)) return forbiddenResponse();

  const { id } = await ctx.params;
  const payment = await prisma.supplierPayment.findUnique({
    where: { id },
    include: {
      counterparty: { select: { id: true, name: true } },
      project: { select: { id: true, title: true, slug: true } },
      createdBy: { select: { id: true, name: true } },
      voidedBy: { select: { id: true, name: true } },
      allocations: {
        include: {
          financeEntry: {
            select: {
              id: true,
              title: true,
              amount: true,
              occurredAt: true,
              status: true,
              projectId: true,
              project: { select: { id: true, title: true, slug: true } },
            },
          },
        },
      },
    },
  });
  if (!payment) {
    return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  }
  assertCanAccessFirm(session, payment.firmId);

  return NextResponse.json({ data: payment });
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!VOID_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, firmId)) return forbiddenResponse();

  const { id } = await ctx.params;
  const existing = await prisma.supplierPayment.findUnique({
    where: { id },
    select: { id: true, firmId: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  }
  assertCanAccessFirm(session, existing.firmId);

  let reason: string | null = null;
  try {
    const body = await request.json();
    if (body && typeof body === "object" && typeof body.reason === "string") {
      reason = body.reason.trim() || null;
    }
  } catch {
    // empty body — OK
  }

  try {
    const result = await voidSupplierPayment({
      paymentId: id,
      voidedById: session.user.id,
      reason,
    });
    return NextResponse.json({
      data: result.payment,
      alreadyVoided: result.alreadyVoided,
    });
  } catch (e: unknown) {
    const status =
      typeof (e as { status?: number }).status === "number"
        ? (e as { status: number }).status
        : 400;
    const msg = e instanceof Error ? e.message : "Помилка скасування";
    return NextResponse.json({ error: msg }, { status });
  }
}
