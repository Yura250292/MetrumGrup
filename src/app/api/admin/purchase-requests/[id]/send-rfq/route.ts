import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";
import { nextNumber } from "@/lib/procurement/numbering";
import { generateAccessToken } from "@/lib/procurement/tokens";
import { sendRfqSchema } from "@/lib/procurement/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEND_ROLES = new Set(["MANAGER", "SUPER_ADMIN"]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const { firmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, firmId);
  if (!role || !SEND_ROLES.has(role) || !firmId) return forbiddenResponse();

  const parsed = sendRfqSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid-body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { counterpartyIds, deadline } = parsed.data;

  const pr = await prisma.purchaseRequest.findFirst({
    where: { id, firmId },
    select: { id: true, status: true, firmId: true },
  });
  if (!pr) return NextResponse.json({ error: "not-found" }, { status: 404 });
  if (pr.status !== "DRAFT") {
    return NextResponse.json(
      { error: "not-draft", status: pr.status },
      { status: 409 },
    );
  }

  const counterparties = await prisma.counterparty.findMany({
    where: {
      id: { in: counterpartyIds },
      firmId,
      isActive: true,
      roles: { has: "SUPPLIER" },
    },
    select: { id: true, email: true, name: true },
  });
  if (counterparties.length !== counterpartyIds.length) {
    return NextResponse.json(
      { error: "invalid-counterparties", message: "Деякі контрагенти не SUPPLIER або з іншої фірми" },
      { status: 400 },
    );
  }
  for (const c of counterparties) {
    if (!c.email) {
      return NextResponse.json(
        { error: "missing-email", counterpartyId: c.id, name: c.name },
        { status: 400 },
      );
    }
  }

  const rfq = await prisma.$transaction(async (tx) => {
    const internalNumber = await nextNumber(tx, "RFQ", firmId);
    const created = await tx.rFQ.create({
      data: {
        purchaseRequestId: pr.id,
        deadline,
        status: "SENT",
        internalNumber,
        recipients: {
          create: counterparties.map((c) => ({
            counterpartyId: c.id,
            emailSnapshot: c.email as string,
            accessToken: generateAccessToken(),
          })),
        },
      },
      select: {
        id: true,
        internalNumber: true,
        status: true,
        deadline: true,
        recipients: {
          select: {
            id: true,
            counterpartyId: true,
            emailSnapshot: true,
            accessToken: true,
          },
        },
      },
    });
    await tx.purchaseRequest.update({
      where: { id: pr.id },
      data: { status: "RFQ_SENT" },
    });
    return created;
  });

  // TODO Phase B: email invitations через `src/lib/notifications/email.ts`.
  // Зараз повертаємо токени у відповідь — UI може показати «розіслати листи»
  // вручну, або тест-середовище використати для перевірки токенів.

  return NextResponse.json(rfq, { status: 201 });
}
