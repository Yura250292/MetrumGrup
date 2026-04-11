import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  let ids: string[] | undefined;
  try {
    const body = await request.json().catch(() => ({}));
    if (Array.isArray(body?.ids)) {
      ids = body.ids.filter((v: unknown): v is string => typeof v === "string" && v.length > 0);
    }
  } catch {
    // empty body — mark all as read
  }

  const where = ids && ids.length > 0
    ? { userId: session.user.id, id: { in: ids }, isRead: false }
    : { userId: session.user.id, isRead: false };

  const result = await prisma.notification.updateMany({
    where,
    data: { isRead: true },
  });

  return NextResponse.json({ updated: result.count });
}
