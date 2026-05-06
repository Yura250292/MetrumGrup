import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { requireOwner, forbiddenResponse, unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** POST → створити/зрегенерувати share token. */
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

  const owned = await prisma.ownerConversation.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // 32-character URL-safe token
  const token = randomBytes(24).toString("base64url");

  await prisma.ownerConversation.update({
    where: { id },
    data: { shareToken: token, shareTokenAt: new Date() },
  });

  return NextResponse.json({ ok: true, token });
}

/** DELETE → revoke (token=null). */
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

  await prisma.ownerConversation.update({
    where: { id },
    data: { shareToken: null, shareTokenAt: null },
  });

  return NextResponse.json({ ok: true });
}
