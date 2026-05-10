import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  requireSuperAdmin,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth-utils";

const patchSchema = z.object({
  isPinned: z.boolean().optional(),
  isHidden: z.boolean().optional(),
});

// PATCH /api/admin/meetings/[id]/live-agent/insights/[insightId]
// Body: { isPinned?, isHidden? }
export async function PATCH(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; insightId: string }> },
) {
  try {
    await requireSuperAdmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return msg === "Forbidden" ? forbiddenResponse() : unauthorizedResponse();
  }

  const { id, insightId } = await params;
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.issues },
      { status: 400 },
    );
  }
  if (
    parsed.data.isPinned === undefined &&
    parsed.data.isHidden === undefined
  ) {
    return NextResponse.json(
      { error: "Жодного поля для оновлення" },
      { status: 400 },
    );
  }

  const insight = await prisma.liveMeetingInsight.findUnique({
    where: { id: insightId },
    select: { id: true, meetingId: true },
  });
  if (!insight || insight.meetingId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.liveMeetingInsight.update({
    where: { id: insightId },
    data: parsed.data,
  });

  return NextResponse.json({ insight: updated });
}

// DELETE /api/admin/meetings/[id]/live-agent/insights/[insightId]
export async function DELETE(
  _request: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; insightId: string }> },
) {
  try {
    await requireSuperAdmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return msg === "Forbidden" ? forbiddenResponse() : unauthorizedResponse();
  }

  const { id, insightId } = await params;
  const insight = await prisma.liveMeetingInsight.findUnique({
    where: { id: insightId },
    select: { id: true, meetingId: true },
  });
  if (!insight || insight.meetingId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await prisma.liveMeetingInsight.delete({ where: { id: insightId } });
  return NextResponse.json({ ok: true });
}
