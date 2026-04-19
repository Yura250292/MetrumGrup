import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

/** GET — resolve quick-contact user IDs into full user objects */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return unauthorizedResponse();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { workPrefsJson: true },
  });

  const prefs = (user?.workPrefsJson ?? {}) as Record<string, unknown>;
  const ids = Array.isArray(prefs.quickChatUserIds) ? prefs.quickChatUserIds as string[] : [];

  if (ids.length === 0) {
    return NextResponse.json({ contacts: [] });
  }

  const contacts = await prisma.user.findMany({
    where: { id: { in: ids }, isActive: true },
    select: { id: true, name: true, avatar: true, role: true },
    take: 5,
  });

  // Preserve user-defined order
  const ordered = ids
    .map((id) => contacts.find((c) => c.id === id))
    .filter(Boolean);

  return NextResponse.json({ contacts: ordered });
}

/** PATCH — save ordered list of quick-contact user IDs (max 5) */
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorizedResponse();

  const body = await request.json();
  const userIds = body.userIds;

  if (!Array.isArray(userIds) || userIds.length > 5) {
    return NextResponse.json(
      { error: "userIds має бути масивом (макс. 5)" },
      { status: 400 },
    );
  }

  for (const id of userIds) {
    if (typeof id !== "string") {
      return NextResponse.json({ error: "Кожен ID має бути рядком" }, { status: 400 });
    }
  }

  // Merge into existing workPrefsJson
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { workPrefsJson: true },
  });

  const existing = (user?.workPrefsJson ?? {}) as Record<string, unknown>;

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      workPrefsJson: { ...existing, quickChatUserIds: userIds },
    },
  });

  return NextResponse.json({ ok: true });
}
