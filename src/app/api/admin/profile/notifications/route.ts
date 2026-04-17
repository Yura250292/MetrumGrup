import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorizedResponse();

  try {
    const body = await request.json();

    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data: { notificationPrefsJson: body },
      select: { notificationPrefsJson: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Notification prefs update error:", error);
    return NextResponse.json(
      { error: "Помилка оновлення налаштувань сповіщень" },
      { status: 500 }
    );
  }
}
