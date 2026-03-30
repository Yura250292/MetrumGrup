import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      stages: { orderBy: { sortOrder: "asc" } },
      client: { select: { id: true, name: true, email: true, phone: true } },
      manager: { select: { id: true, name: true, email: true, phone: true } },
      payments: { orderBy: { scheduledDate: "asc" } },
      completionActs: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!project) {
    return NextResponse.json(
      { error: "Not Found", message: "Проєкт не знайдено" },
      { status: 404 }
    );
  }

  // Client can only see their own projects
  if (session.user.role === "CLIENT" && project.clientId !== session.user.id) {
    return forbiddenResponse();
  }

  return NextResponse.json({ data: project });
}
