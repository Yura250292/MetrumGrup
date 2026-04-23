import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { slugify } from "@/lib/utils";
import { auditLog } from "@/lib/audit";
import { ProjectStage } from "@prisma/client";
import { addProjectMember } from "@/lib/projects/members-service";
import { seedProjectTaskDefaults } from "@/lib/tasks/defaults";
import {
  ensureProjectMirror,
  syncProjectBudgetEntry,
} from "@/lib/folders/mirror-service";

const STAGE_ORDER: ProjectStage[] = [
  "DESIGN", "FOUNDATION", "WALLS", "ROOF", "ENGINEERING", "FINISHING", "HANDOVER",
];

// GET /api/admin/projects - List all projects
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
    return forbiddenResponse();
  }

  try {
    const projects = await prisma.project.findMany({
      // Hide auto-generated AI-estimate scratch projects from the picker
      where: { slug: { not: { startsWith: "temp-" } } },
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

  // Auto-add manager as PROJECT_MANAGER member
  if (project.managerId) {
    try {
      await addProjectMember({
        projectId: project.id,
        userId: project.managerId,
        roleInProject: "PROJECT_MANAGER",
        invitedById: session.user.id,
      });
    } catch (err) {
      console.error("Failed to auto-add manager as project member:", err);
    }
  }

  // Seed default task statuses & labels for the new project. Idempotent.
  // Failure is non-fatal — feature-flag gate means tasks may be disabled anyway.
  try {
    await seedProjectTaskDefaults(project.id);
  } catch (err) {
    console.error("Failed to seed project task defaults:", err);
  }

  // Mirror project into FINANCE folder tree + seed plan-budget entry
  try {
    await ensureProjectMirror(project.id);
    await syncProjectBudgetEntry(project.id, session.user.id);
  } catch (err) {
    console.error("Failed to sync project mirror/budget:", err);
  }

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
