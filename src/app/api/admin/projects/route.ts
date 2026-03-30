import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { slugify } from "@/lib/utils";
import { auditLog } from "@/lib/audit";
import { ProjectStage } from "@prisma/client";

const STAGE_ORDER: ProjectStage[] = [
  "DESIGN", "FOUNDATION", "WALLS", "ROOF", "ENGINEERING", "FINISHING", "HANDOVER",
];

// GET /api/admin/projects - List all projects
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  try {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        client: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json({ data: projects });
  } catch (error) {
    console.error("Error fetching projects:", error);
    return NextResponse.json(
      { error: "Помилка завантаження проєктів" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
    return forbiddenResponse();
  }

  const body = await request.json();
  const { title, description, address, clientId, managerId, totalBudget, startDate, expectedEndDate } = body;

  if (!title || !clientId) {
    return NextResponse.json({ error: "Назва та клієнт обов'язкові" }, { status: 400 });
  }

  // Generate unique slug
  let slug = slugify(title);
  const existing = await prisma.project.findUnique({ where: { slug } });
  if (existing) {
    slug = `${slug}-${Date.now().toString(36)}`;
  }

  const project = await prisma.project.create({
    data: {
      title,
      slug,
      description: description || null,
      address: address || null,
      clientId,
      managerId: managerId || null,
      totalBudget: totalBudget || 0,
      startDate: startDate ? new Date(startDate) : null,
      expectedEndDate: expectedEndDate ? new Date(expectedEndDate) : null,
      stages: {
        create: STAGE_ORDER.map((stage, i) => ({
          stage,
          status: "PENDING",
          progress: 0,
          sortOrder: i,
        })),
      },
    },
    include: { stages: true },
  });

  await auditLog({
    userId: session.user.id,
    action: "CREATE",
    entity: "Project",
    entityId: project.id,
    projectId: project.id,
    newData: { title, clientId },
  });

  return NextResponse.json({ data: project }, { status: 201 });
}
