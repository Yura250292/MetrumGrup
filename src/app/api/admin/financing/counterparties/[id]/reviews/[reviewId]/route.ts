import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  DELETE_ROLES,
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

const patchSchema = z.object({
  qualityScore: score.optional(),
  timelinessScore: score.optional(),
  priceScore: score.optional(),
  communicationScore: score.optional(),
  comment: z.string().trim().max(4_000).nullable().optional(),
});

/**
 * PATCH: автор може редагувати свій review. SUPER_ADMIN — будь-який.
 */
export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; reviewId: string }> },
) {
  const session = await auth();
  const { id, reviewId } = await ctx.params;
  const access = await requireCounterpartyAccess({
    session,
    counterpartyId: id,
    allowedRoles: WRITE_ROLES,
  });
  if (isAccessResponse(access)) return access;

  const review = await prisma.counterpartyReview.findFirst({
    where: { id: reviewId, counterpartyId: id },
  });
  if (!review) {
    return NextResponse.json({ error: "Відгук не знайдено" }, { status: 404 });
  }

  const isAuthor = review.byUserId === access.session.user.id;
  const isSuperAdmin = access.session.user.role === "SUPER_ADMIN";
  if (!isAuthor && !isSuperAdmin) {
    return NextResponse.json(
      { error: "Редагувати може лише автор" },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Невірний JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const merged = {
    qualityScore: data.qualityScore ?? review.qualityScore,
    timelinessScore: data.timelinessScore ?? review.timelinessScore,
    priceScore: data.priceScore ?? review.priceScore,
    communicationScore: data.communicationScore ?? review.communicationScore,
  };
  const rating = computeOverallRating(merged);

  const updated = await prisma.$transaction(async (tx) => {
    const r = await tx.counterpartyReview.update({
      where: { id: reviewId },
      data: {
        ...merged,
        rating,
        comment: data.comment === undefined ? review.comment : data.comment,
        reviewedAt: new Date(),
      },
    });
    await recomputeCounterpartyRating(tx, id);
    return r;
  });

  return NextResponse.json({ review: updated });
}

/**
 * DELETE: тільки SUPER_ADMIN. Hard delete (rev.1) — soft delete у відкритих
 * питаннях, перенесено в rev.2.
 */
export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string; reviewId: string }> },
) {
  const session = await auth();
  const { id, reviewId } = await ctx.params;
  const access = await requireCounterpartyAccess({
    session,
    counterpartyId: id,
    allowedRoles: DELETE_ROLES,
  });
  if (isAccessResponse(access)) return access;

  const exists = await prisma.counterpartyReview.findFirst({
    where: { id: reviewId, counterpartyId: id },
    select: { id: true },
  });
  if (!exists) {
    return NextResponse.json({ error: "Відгук не знайдено" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.counterpartyReview.delete({ where: { id: reviewId } });
    await recomputeCounterpartyRating(tx, id);
  });

  return NextResponse.json({ ok: true });
}
