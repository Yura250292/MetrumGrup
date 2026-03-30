import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { auditLog } from "@/lib/audit";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
    return forbiddenResponse();
  }

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true, email: true, phone: true } },
      manager: { select: { id: true, name: true, email: true, phone: true } },
      stages: { orderBy: { sortOrder: "asc" } },
      payments: { orderBy: { scheduledDate: "asc" } },
      estimates: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  }

  return NextResponse.json({ data: project });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
    return forbiddenResponse();
  }

  const body = await request.json();
  const { title, description, address, status, currentStage, stageProgress, managerId, totalBudget, totalPaid, startDate, expectedEndDate, actualEndDate } = body;

  const updateData: Record<string, unknown> = {};
  if (title !== undefined) updateData.title = title;
  if (description !== undefined) updateData.description = description;
  if (address !== undefined) updateData.address = address;
  if (status !== undefined) updateData.status = status;
  if (currentStage !== undefined) updateData.currentStage = currentStage;
  if (stageProgress !== undefined) updateData.stageProgress = stageProgress;
  if (managerId !== undefined) updateData.managerId = managerId || null;
  if (totalBudget !== undefined) updateData.totalBudget = totalBudget;
  if (totalPaid !== undefined) updateData.totalPaid = totalPaid;
  if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null;
  if (expectedEndDate !== undefined) updateData.expectedEndDate = expectedEndDate ? new Date(expectedEndDate) : null;
  if (actualEndDate !== undefined) updateData.actualEndDate = actualEndDate ? new Date(actualEndDate) : null;

  const project = await prisma.project.update({
    where: { id },
    data: updateData,
  });

  await auditLog({
    userId: session.user.id,
    action: "UPDATE",
    entity: "Project",
    entityId: id,
    projectId: id,
    newData: updateData,
  });

  return NextResponse.json({ data: project });
}
