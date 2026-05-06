import { NextRequest, NextResponse } from "next/server";
import { requireOwner, forbiddenResponse, unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/owner/messages/[id]/bookmark — toggles bookmark.
 * Власник може закладати тільки повідомлення з власних розмов.
 */
export async function POST(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  let session;
  try {
    ({ session } = await requireOwner());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") return forbiddenResponse();
    return unauthorizedResponse();
  }

  const message = await prisma.ownerChatMessage.findFirst({
    where: {
      id,
      conversation: { userId: session.user.id },
    },
    select: { id: true, isBookmarked: true },
  });
  if (!message) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.ownerChatMessage.update({
    where: { id },
    data: { isBookmarked: !message.isBookmarked },
    select: { id: true, isBookmarked: true },
  });

  return NextResponse.json({ ok: true, isBookmarked: updated.isBookmarked });
}
