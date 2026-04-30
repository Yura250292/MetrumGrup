import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { assertCanAccessFirm } from "@/lib/firm/scope";

/**
 * Список FinanceEntry, прив'язаних до конкретного етапу проєкту.
 * Використовується drawer-ом «Деталі етапу» для секції «Історія витрат».
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; stageId: string }> },
) {
  const { id: projectId, stageId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (
    session.user.role !== "SUPER_ADMIN" &&
    session.user.role !== "MANAGER" &&
    session.user.role !== "FINANCIER" &&
    session.user.role !== "ENGINEER"
  ) {
    return forbiddenResponse();
  }

  const stage = await prisma.projectStageRecord.findUnique({
    where: { id: stageId },
    select: { id: true, projectId: true, project: { select: { firmId: true } } },
  });
  if (!stage || stage.projectId !== projectId) {
    return NextResponse.json({ error: "Етап не знайдено" }, { status: 404 });
  }
  try {
    assertCanAccessFirm(session, stage.project.firmId);
  } catch {
    return forbiddenResponse();
  }

  const entries = await prisma.financeEntry.findMany({
    where: { stageRecordId: stageId, isArchived: false },
    select: {
      id: true,
      occurredAt: true,
      kind: true,
      type: true,
      amount: true,
      title: true,
      description: true,
      counterparty: true,
      category: true,
      createdAt: true,
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: 50,
  });

  return NextResponse.json({ data: entries });
}
