import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { computeBudgetMatrix } from "@/lib/financing/budget-matrix";

export const runtime = "nodejs";

const READ_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER", "HR"];

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!READ_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { id } = await ctx.params;
  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, title: true },
  });
  if (!project) return NextResponse.json({ error: "Проєкт не знайдено" }, { status: 404 });

  try {
    const matrix = await computeBudgetMatrix(id);
    return NextResponse.json({
      project,
      ...matrix,
    });
  } catch (error) {
    console.error("[budget-vs-actual] error:", error);
    return NextResponse.json(
      { error: "Помилка обчислення матриці План vs Факт" },
      { status: 500 },
    );
  }
}
