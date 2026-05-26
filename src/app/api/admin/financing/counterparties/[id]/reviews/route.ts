import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  READ_ROLES,
  WRITE_ROLES,
  isAccessResponse,
  requireCounterpartyAccess,
} from "@/lib/counterparties/access";
import {
  computeOverallRating,
  recomputeCounterpartyRating,
} from "@/lib/counterparties/recompute-rating";

export const runtime = "nodejs";

const score = z.number().int().min(1).max(5);

const createOrUpsertSchema = z.object({
  projectId: z.string().min(1),
  qualityScore: score,
  timelinessScore: score,
  priceScore: score,
  communicationScore: score,
  comment: z.string().trim().max(4_000).nullable().optional(),
});

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const { id } = await ctx.params;
  const access = await requireCounterpartyAccess({
    session,
    counterpartyId: id,
    allowedRoles: READ_ROLES,
  });
  if (isAccessResponse(access)) return access;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId") ?? undefined;

  const reviews = await prisma.counterpartyReview.findMany({
    where: { counterpartyId: id, projectId: projectId || undefined },
    orderBy: { reviewedAt: "desc" },
    include: {
      by: { select: { id: true, name: true, avatar: true } },
      project: { select: { id: true, title: true, slug: true } },
    },
  });

  return NextResponse.json({ reviews });
}

/**
 * POST: створює новий review або редагує існуючий (upsert по
 * (counterpartyId, byUserId, projectId)). Recompute avgRating відбувається
 * у тій самій транзакції.
 *
 * RBAC: тільки members проєкту (через ProjectMember) АБО менеджер проєкту АБО
 * SUPER_ADMIN. ENGINEER без членства не може писати review.
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const { id } = await ctx.params;
  const access = await requireCounterpartyAccess({
    session,
    counterpartyId: id,
    allowedRoles: WRITE_ROLES,
  });
  if (isAccessResponse(access)) return access;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Невірний JSON" }, { status: 400 });
  }
  const parsed = createOrUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // RBAC: тільки members проєкту, manager або SUPER_ADMIN.
  const userId = access.session.user.id;
  const isSuperAdmin = access.session.user.role === "SUPER_ADMIN";
  if (!isSuperAdmin) {
    const project = await prisma.project.findUnique({
      where: { id: data.projectId },
      select: { managerId: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Проєкт не знайдено" }, { status: 404 });
    }
    const isManager = project.managerId === userId;
    if (!isManager) {
      const membership = await prisma.projectMember.findFirst({
        where: {
          projectId: data.projectId,
          userId,
          isActive: true,
        },
        select: { id: true },
      });
      if (!membership) {
        return NextResponse.json(
          { error: "Тільки члени проєкту можуть писати відгуки" },
          { status: 403 },
        );
      }
    }
  }

  const rating = computeOverallRating(data);

  const review = await prisma.$transaction(async (tx) => {
    const upserted = await tx.counterpartyReview.upsert({
      where: {
        counterpartyId_byUserId_projectId: {
          counterpartyId: id,
          byUserId: userId,
          projectId: data.projectId,
        },
      },
      create: {
        counterpartyId: id,
        byUserId: userId,
        projectId: data.projectId,
        rating,
        qualityScore: data.qualityScore,
        timelinessScore: data.timelinessScore,
        priceScore: data.priceScore,
        communicationScore: data.communicationScore,
        comment: data.comment ?? null,
      },
      update: {
        rating,
        qualityScore: data.qualityScore,
        timelinessScore: data.timelinessScore,
        priceScore: data.priceScore,
        communicationScore: data.communicationScore,
        comment: data.comment ?? null,
        reviewedAt: new Date(),
      },
    });
    await recomputeCounterpartyRating(tx, id);
    return upserted;
  });

  return NextResponse.json({ review }, { status: 201 });
}
