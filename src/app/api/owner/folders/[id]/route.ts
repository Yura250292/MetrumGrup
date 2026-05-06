import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner, forbiddenResponse, unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const PatchBody = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().max(20).nullable().optional(),
  sortOrder: z.number().int().optional(),
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
  const owned = await prisma.ownerChatFolder.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  await prisma.ownerChatFolder.update({
    where: { id },
    data: {
      ...(parsed.data.name ? { name: parsed.data.name.trim() } : {}),
      ...(parsed.data.color !== undefined ? { color: parsed.data.color } : {}),
      ...(parsed.data.sortOrder !== undefined ? { sortOrder: parsed.data.sortOrder } : {}),
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
  const owned = await prisma.ownerChatFolder.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Conversation.folderId стане null через onDelete: SetNull у схемі
  await prisma.ownerChatFolder.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
