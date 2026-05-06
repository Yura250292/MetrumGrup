import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner, forbiddenResponse, unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  let session;
  try {
    ({ session } = await requireOwner());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") return forbiddenResponse();
    return unauthorizedResponse();
  }

  const conversation = await prisma.ownerConversation.findFirst({
    where: { id, userId: session.user.id },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ conversation });
}

const UpdateBody = z.object({
  title: z.string().max(200).optional(),
  isPinned: z.boolean().optional(),
  folderId: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  let session;
  try {
    ({ session } = await requireOwner());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") return forbiddenResponse();
    return unauthorizedResponse();
  }

  const owned = await prisma.ownerConversation.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = UpdateBody.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  // Folder ownership check (якщо folderId передано і не null)
  if (parsed.data.folderId) {
    const folder = await prisma.ownerChatFolder.findFirst({
      where: { id: parsed.data.folderId, userId: session.user.id },
      select: { id: true },
    });
    if (!folder) return NextResponse.json({ error: "Folder not found" }, { status: 400 });
  }

  await prisma.ownerConversation.update({
    where: { id },
    data: {
      title: parsed.data.title?.trim() || undefined,
      ...(parsed.data.isPinned !== undefined
        ? { isPinned: parsed.data.isPinned, pinnedAt: parsed.data.isPinned ? new Date() : null }
        : {}),
      ...(parsed.data.folderId !== undefined ? { folderId: parsed.data.folderId } : {}),
    },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  let session;
  try {
    ({ session } = await requireOwner());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") return forbiddenResponse();
    return unauthorizedResponse();
  }

  const owned = await prisma.ownerConversation.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.ownerConversation.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
