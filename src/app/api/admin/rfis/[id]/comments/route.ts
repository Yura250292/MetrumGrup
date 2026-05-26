import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { forbiddenResponse, unauthorizedResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";
import { notifyProjectMembers } from "@/lib/notifications/create";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const { firmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, firmId);
  if (!role) return forbiddenResponse();

  const { id } = await ctx.params;
  const rfi = await prisma.rFI.findFirst({
    where: { id, firmId: firmId ?? undefined },
    select: { id: true },
  });
  if (!rfi) return NextResponse.json({ error: "not-found" }, { status: 404 });

  const comments = await prisma.rFIComment.findMany({
    where: { rfiId: id },
    include: { author: { select: { id: true, name: true, avatar: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ comments });
}

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const { firmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, firmId);
  if (!role) return forbiddenResponse();

  const { id } = await ctx.params;
  const rfi = await prisma.rFI.findFirst({
    where: { id, firmId: firmId ?? undefined },
    select: { id: true, number: true, subject: true, projectId: true, status: true },
  });
  if (!rfi) return NextResponse.json({ error: "not-found" }, { status: 404 });
  if (rfi.status === "CANCELLED" || rfi.status === "CLOSED")
    return NextResponse.json({ error: "rfi-finalized" }, { status: 400 });

  let body: { body?: string };
  try {
    body = (await req.json()) as { body?: string };
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }
  if (!body.body?.trim()) return NextResponse.json({ error: "body-required" }, { status: 400 });

  const comment = await prisma.rFIComment.create({
    data: { rfiId: id, authorId: session.user.id, body: body.body.trim() },
    include: { author: { select: { id: true, name: true, avatar: true } } },
  });

  await notifyProjectMembers({
    projectId: rfi.projectId,
    actorId: session.user.id,
    type: "RFI_COMMENT",
    title: `${rfi.number}: новий коментар`,
    body: comment.body,
    relatedEntity: "RFI",
    relatedId: rfi.id,
  });

  return NextResponse.json({ comment }, { status: 201 });
}
