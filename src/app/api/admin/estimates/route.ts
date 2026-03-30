import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { auditLog } from "@/lib/audit";

export async function GET() {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  // Allow SUPER_ADMIN, MANAGER, ENGINEER, and FINANCIER to view estimates
  const allowedRoles = ["SUPER_ADMIN", "MANAGER", "ENGINEER", "FINANCIER"];
  if (!allowedRoles.includes(session.user.role)) {
    return forbiddenResponse();
  }

  try {
    const estimates = await prisma.estimate.findMany({
      include: {
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

    // Generate unique number
    const count = await prisma.estimate.count();
    const number = `EST-${String(count + 1).padStart(4, "0")}`;

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

    // Create estimate with sections and items in a transaction
    const estimate = await prisma.estimate.create({
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
          create: sectionsData.map(section => ({
            title: section.title,
            sortOrder: section.sortOrder,
          })),
        },
      },
      include: {
        sections: { orderBy: { sortOrder: "asc" } },
      },
    });

    // Now create items for each section with proper estimateId
    for (let sIdx = 0; sIdx < sectionsData.length; sIdx++) {
      const section = sectionsData[sIdx];
      const createdSection = estimate.sections[sIdx];

      if (section.items?.create && Array.isArray(section.items.create)) {
        await prisma.estimateItem.createMany({
          data: section.items.create.map((item: any) => ({
            ...item,
            estimateId: estimate.id,
            sectionId: createdSection.id,
          })),
        });
      }
    }

    // Fetch the complete estimate with all relations
    const completeEstimate = await prisma.estimate.findUnique({
      where: { id: estimate.id },
      include: {
        sections: {
          include: { items: { orderBy: { sortOrder: "asc" } } },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    await auditLog({
      userId: session.user.id,
      action: "CREATE",
      entity: "Estimate",
      entityId: estimate.id,
      projectId,
      newData: { title, totalAmount },
    });

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
