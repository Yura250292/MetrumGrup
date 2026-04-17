import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ viewId: string }> }
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const { viewId } = await ctx.params;

  const view = await prisma.savedView.findUnique({ where: { id: viewId } });
  if (!view || view.projectId !== null) {
    return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  }
  if (view.userId !== session.user.id) return forbiddenResponse();

  try {
    const body = await request.json();
    const updated = await prisma.savedView.update({
      where: { id: viewId },
      data: {
        name: typeof body.name === "string" ? body.name.trim() : undefined,
        filtersJson: body.filtersJson ?? undefined,
        groupBy: body.groupBy !== undefined ? body.groupBy : undefined,
        sortBy: body.sortBy !== undefined ? body.sortBy : undefined,
        viewType: body.viewType ?? undefined,
      },
    });
    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("[me/views/PATCH] error:", error);
    return NextResponse.json({ error: "Помилка оновлення" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ viewId: string }> }
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const { viewId } = await ctx.params;

  const view = await prisma.savedView.findUnique({ where: { id: viewId } });
  if (!view || view.projectId !== null) {
    return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  }
  if (view.userId !== session.user.id) return forbiddenResponse();

  await prisma.savedView.delete({ where: { id: viewId } });
  return NextResponse.json({ success: true });
}
