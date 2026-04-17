import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorizedResponse();

  try {
    const body = await request.json();

    const data: Record<string, unknown> = {};

    if ("workPrefsJson" in body) {
      data.workPrefsJson = body.workPrefsJson;
    }
    if ("productivityPrefsJson" in body) {
      data.productivityPrefsJson = body.productivityPrefsJson;
    }

    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data,
      select: {
        workPrefsJson: true,
        productivityPrefsJson: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Preferences update error:", error);
    return NextResponse.json(
      { error: "Помилка оновлення налаштувань" },
      { status: 500 }
    );
  }
}
