import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse, FOREMAN_REPORT_REVIEWERS } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const Body = z.object({
  reason: z.string().min(3).max(1000),
});

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { firmId: activeFirmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, activeFirmId);
  if (!role || !FOREMAN_REPORT_REVIEWERS.includes(role)) return forbiddenResponse();

  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Bad request", message: "Вкажіть причину відхилення" },
      { status: 400 },
    );
  }

  const report = await prisma.foremanReport.findFirst({
    where: { id, firmId: activeFirmId ?? undefined },
    select: { id: true, status: true },
  });
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (report.status !== "PENDING_APPROVAL") {
    return NextResponse.json(
      { error: "Conflict", message: "Можна відхилити тільки звіт у статусі очікування" },
      { status: 409 },
    );
  }

  await prisma.foremanReport.update({
    where: { id },
    data: {
      status: "REJECTED",
      rejectionReason: parsed.data.reason.trim(),
      reviewedAt: new Date(),
      reviewedById: session.user.id,
    },
  });

  return NextResponse.json({ ok: true });
}
