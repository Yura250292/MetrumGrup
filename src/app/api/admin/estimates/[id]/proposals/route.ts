import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { forbiddenResponse, unauthorizedResponse } from "@/lib/auth-utils";
import { DEFAULT_FIRM_ID } from "@/lib/firm/scope";
import { prisma } from "@/lib/prisma";
import { createProposal } from "@/lib/estimates/proposals";

const ADMIN_ROLES = ["SUPER_ADMIN", "MANAGER"] as const;

/** GET — список proposals для кошториса (admin). Firm-scoped через estimate.project. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: estimateId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!ADMIN_ROLES.includes(session.user.role as (typeof ADMIN_ROLES)[number])) {
    return forbiddenResponse();
  }

  // Firm-isolation: SUPER_ADMIN бачить усе; інші — лише home firm.
  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    select: { id: true, project: { select: { firmId: true } } },
  });
  if (!estimate) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (
    session.user.role !== "SUPER_ADMIN" &&
    session.user.firmId !== estimate.project.firmId
  ) {
    return forbiddenResponse();
  }

  const proposals = await prisma.estimateProposal.findMany({
    where: { estimateId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      counterpartyId: true,
      counterparty: { select: { id: true, name: true, email: true } },
      emailSnapshot: true,
      sentAt: true,
      firstViewedAt: true,
      lastViewedAt: true,
      expiresAt: true,
      completedAt: true,
      itemsTotal: true,
      itemsApproved: true,
      itemsRejected: true,
      itemsPending: true,
      createdAt: true,
      createdBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ data: proposals });
}

/** POST — створити новий proposal (DRAFT). Окремий send-call виставить SENT + email. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: estimateId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!ADMIN_ROLES.includes(session.user.role as (typeof ADMIN_ROLES)[number])) {
    return forbiddenResponse();
  }

  const body = await request.json().catch(() => ({}));
  const { counterpartyId, emailSnapshot, expiresAt } = body as {
    counterpartyId?: string;
    emailSnapshot?: string;
    expiresAt?: string | null;
  };

  if (!counterpartyId || typeof counterpartyId !== "string") {
    return NextResponse.json(
      { error: "counterpartyId is required" },
      { status: 400 },
    );
  }
  if (!emailSnapshot || typeof emailSnapshot !== "string") {
    return NextResponse.json(
      { error: "emailSnapshot is required" },
      { status: 400 },
    );
  }

  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    select: {
      id: true,
      project: { select: { firmId: true } },
    },
  });
  if (!estimate) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Firm-isolation + counterparty must belong to same firm (або shared firmId=null).
  if (
    session.user.role !== "SUPER_ADMIN" &&
    session.user.firmId !== estimate.project.firmId
  ) {
    return forbiddenResponse();
  }

  const counterparty = await prisma.counterparty.findUnique({
    where: { id: counterpartyId },
    select: { id: true, firmId: true, email: true },
  });
  if (!counterparty) {
    return NextResponse.json(
      { error: "Counterparty not found" },
      { status: 404 },
    );
  }
  if (
    counterparty.firmId !== null &&
    counterparty.firmId !== estimate.project.firmId
  ) {
    return NextResponse.json(
      { error: "Counterparty firm does not match estimate firm" },
      { status: 400 },
    );
  }

  // Заборона дублікату: вже існує active proposal для цього кошториса.
  // Partial unique index у БД зловить race, але дамо frienly помилку наперед.
  const existing = await prisma.estimateProposal.findFirst({
    where: {
      estimateId,
      status: { in: ["SENT", "IN_NEGOTIATION", "PARTIALLY_APPROVED"] },
    },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      {
        error: "Active proposal already exists",
        existingProposalId: existing.id,
      },
      { status: 409 },
    );
  }

  try {
    const proposal = await createProposal({
      estimateId,
      firmId: estimate.project.firmId ?? DEFAULT_FIRM_ID,
      counterpartyId,
      emailSnapshot,
      createdById: session.user.id,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });

    return NextResponse.json({ data: proposal }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create proposal";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
