import { NextRequest, NextResponse } from "next/server";
import {
  requireRole,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth-utils";
import { assertCanAccessFirm } from "@/lib/firm/scope";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

const Body = z.object({ reviewNote: z.string().max(2000).optional() });

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  let session;
  try {
    session = await requireRole(["SUPER_ADMIN", "MANAGER", "HR"]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") return forbiddenResponse();
    return unauthorizedResponse();
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "ValidationError", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const sub = await prisma.formSubmission.findUnique({
    where: { id },
    select: { firmId: true, status: true },
  });
  if (!sub) return NextResponse.json({ error: "NotFound" }, { status: 404 });
  try {
    assertCanAccessFirm(session, sub.firmId);
  } catch {
    return forbiddenResponse();
  }
  if (sub.status !== "SUBMITTED") {
    return NextResponse.json(
      { error: "InvalidState", message: "Можна approve лише SUBMITTED" },
      { status: 409 },
    );
  }

  const updated = await prisma.formSubmission.update({
    where: { id },
    data: {
      status: "APPROVED",
      reviewedById: session.user.id,
      reviewedAt: new Date(),
      reviewNote: parsed.data.reviewNote ?? null,
    },
  });
  const { notifySubmissionReviewed } = await import("@/lib/forms/notifications");
  void notifySubmissionReviewed(id, "APPROVED");
  return NextResponse.json({ data: updated });
}
