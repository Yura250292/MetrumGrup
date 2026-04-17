import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

/**
 * Account-level saved views (projectId IS NULL).
 * Used by /admin-v2/me dashboard to save/load filter combos.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const views = await prisma.savedView.findMany({
    where: {
      projectId: null,
      OR: [{ userId: session.user.id }, { isShared: true }],
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ data: views });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  try {
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "Назва обов'язкова" }, { status: 400 });
    }

    const view = await prisma.savedView.create({
      data: {
        userId: session.user.id,
        projectId: null,
        name,
        viewType: body.viewType ?? "LIST",
        filtersJson: body.filtersJson ?? {},
        groupBy: body.groupBy ?? null,
        sortBy: body.sortBy ?? null,
        isShared: false,
      },
    });

    return NextResponse.json({ data: view }, { status: 201 });
  } catch (error) {
    console.error("[me/views/POST] error:", error);
    return NextResponse.json({ error: "Помилка збереження" }, { status: 500 });
  }
}
