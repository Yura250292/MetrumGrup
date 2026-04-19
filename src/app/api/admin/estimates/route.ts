import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { auditLog } from "@/lib/audit";
import { getNextEstimateNumber } from "@/lib/document-numbers";
import { notifyProjectMembers } from "@/lib/notifications/create";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  // Allow SUPER_ADMIN, MANAGER, ENGINEER, and FINANCIER to view estimates
  const allowedRoles = ["SUPER_ADMIN", "MANAGER", "ENGINEER", "FINANCIER"];
  if (!allowedRoles.includes(session.user.role)) {
    return forbiddenResponse();
  }

  try {
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status");
    const folderIdFilter = searchParams.get("folderId");

    // Build where clause
    const where: any = {};
    if (statusFilter) {
      // Support multiple statuses separated by comma
      const statuses = statusFilter.split(",").map(s => s.trim());
      where.status = { in: statuses };
    }
    if (folderIdFilter !== null && folderIdFilter !== undefined) {
      where.folderId = folderIdFilter === "root" ? null : folderIdFilter;
    }

    const estimates = await prisma.estimate.findMany({
      where,
      select: {
        id: true,
        number: true,
        title: true,
        description: true,
        status: true,
        totalAmount: true,
        discount: true,
        finalAmount: true,
        createdAt: true,
        analysisSummary: true,
        project: { select: { title: true, client: { select: { name: true } } } },
        createdBy: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: estimates });
  } catch (error) {
    console.error("Error fetching estimates:", error);
    return NextResponse.json(
      { error: "Помилка завантаження кошторисів" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  // Allow SUPER_ADMIN, MANAGER, ENGINEER, and FINANCIER to create estimates
  const allowedRoles = ["SUPER_ADMIN", "MANAGER", "ENGINEER", "FINANCIER"];
  if (!allowedRoles.includes(session.user.role)) {
    return forbiddenResponse();
  }

  try {
    const body = await request.json();
    const { projectId, title, description, sections, overheadRate } = body;

    if (!projectId || !title) {
      return NextResponse.json(
        { error: "Проєкт та назва обов'язкові" },
        { status: 400 }
      );
    }

    // Create estimate with sections and items in atomic transaction
    const completeEstimate = await prisma.$transaction(async (tx) => {
      // Generate unique number atomically
      const number = await getNextEstimateNumber();

      // Calculate totals
      let totalMaterials = 0;
      let totalLabor = 0;

      const sectionsData = (sections || []).map((section: {
        title: string;
        items: Array<{
          description: string;
          unit: string;
          quantity: number;
          unitPrice: number;
          laborRate?: number;
          laborHours?: number;
          materialId?: string;
          isManualOverride?: boolean;
        }>;
      }, sIdx: number) => {
        const items = (section.items || []).map((item: {
          description: string;
          unit: string;
          quantity: number;
          unitPrice: number;
          laborRate?: number;
          laborHours?: number;
          materialId?: string;
          isManualOverride?: boolean;
        }, iIdx: number) => {
          const materialCost = item.quantity * item.unitPrice;
          const laborCost = (item.laborHours || 0) * (item.laborRate || 0);
          const amount = materialCost + laborCost;
          totalMaterials += materialCost;
          totalLabor += laborCost;

          return {
            description: item.description,
            unit: item.unit,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            laborRate: item.laborRate || 0,
            laborHours: item.laborHours || 0,
            amount,
            materialId: item.materialId || null,
            isManualOverride: item.isManualOverride || false,
            sortOrder: iIdx,
          };
        });

        return {
          title: section.title,
          sortOrder: sIdx,
          items: { create: items },
        };
      });

      const overhead = overheadRate ? ((totalMaterials + totalLabor) * overheadRate / 100) : 0;
      const totalAmount = totalMaterials + totalLabor + overhead;

      // Create estimate with sections
      const estimate = await tx.estimate.create({
        data: {
          number,
          projectId,
          createdById: session.user.id,
          title,
          description: description || null,
          totalMaterials,
          totalLabor,
          totalOverhead: overhead,
          totalAmount,
          finalAmount: totalAmount,
          sections: {
            create: sectionsData.map((section: { title: string; sortOrder: number }) => ({
              title: section.title,
              sortOrder: section.sortOrder,
            })),
          },
        },
        include: {
          sections: { orderBy: { sortOrder: "asc" } },
        },
      });

      // Create items for each section
      for (let sIdx = 0; sIdx < sectionsData.length; sIdx++) {
        const section = sectionsData[sIdx];
        const createdSection = estimate.sections[sIdx];

        if (section.items?.create && Array.isArray(section.items.create)) {
          await tx.estimateItem.createMany({
            data: section.items.create.map((item: any) => ({
              ...item,
              estimateId: estimate.id,
              sectionId: createdSection.id,
            })),
          });
        }
      }

      // Fetch complete estimate with all relations
      return await tx.estimate.findUnique({
        where: { id: estimate.id },
        include: {
          sections: {
            include: { items: { orderBy: { sortOrder: "asc" } } },
            orderBy: { sortOrder: "asc" },
          },
        },
      });
    });

    await auditLog({
      userId: session.user.id,
      action: "CREATE",
      entity: "Estimate",
      entityId: completeEstimate!.id,
      projectId,
      newData: { title, totalAmount: completeEstimate!.totalAmount },
    });

    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { title: true },
      });
      await notifyProjectMembers({
        projectId,
        actorId: session.user.id,
        type: "PROJECT_ESTIMATE_CREATED",
        title: `Новий кошторис у проєкті «${project?.title ?? ""}»`,
        body: title,
        relatedEntity: "Estimate",
        relatedId: completeEstimate!.id,
      });
    } catch (err) {
      console.error("[estimates/POST] notifyProjectMembers failed:", err);
    }

    return NextResponse.json({ data: completeEstimate }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating estimate:", error);

    // Handle specific Prisma errors
    if (error.code === 'P2003') {
      // Foreign key constraint violation
      if (error.meta?.constraint === 'estimates_createdById_fkey') {
        return NextResponse.json(
          { error: "Ваша сесія застаріла. Будь ласка, вийдіть і увійдіть знову." },
          { status: 401 }
        );
      }
      if (error.meta?.constraint?.includes('projectId')) {
        return NextResponse.json(
          { error: "Вибраний проєкт не існує" },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: "Помилка створення кошторису" },
      { status: 500 }
    );
  }
}
