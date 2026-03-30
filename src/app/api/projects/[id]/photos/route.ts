import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  // Verify ownership for clients
  if (session.user.role === "CLIENT") {
    const project = await prisma.project.findFirst({
      where: { id, clientId: session.user.id },
      select: { id: true },
    });
    if (!project) return forbiddenResponse();
  }

  const searchParams = request.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "10");

  const [photoReports, total] = await Promise.all([
    prisma.photoReport.findMany({
      where: { projectId: id },
      include: {
        images: { orderBy: { sortOrder: "asc" } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.photoReport.count({ where: { projectId: id } }),
  ]);

  return NextResponse.json({
    data: photoReports,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
}
