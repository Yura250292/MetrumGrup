import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse, ESTIMATE_ROLES } from "@/lib/auth-utils";
import { auditLog } from "@/lib/audit";

interface CreateBody {
  title: string;
  description?: string;
  totalAreaM2: number;
  sourceFormat?: string;
  sections: Array<{
    title: string;
    sortOrder?: number;
    sectionTotal?: number;
    items: Array<{
      description: string;
      unit: string;
      quantity: number;
      unitPrice: number;
      totalCost: number;
      kind?: string;
      sortOrder?: number;
    }>;
  }>;
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!ESTIMATE_ROLES.includes(session.user.role as any)) {
    return forbiddenResponse();
  }

  const references = await prisma.referenceEstimate.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      totalAreaM2: true,
      grandTotal: true,
      itemCount: true,
      sourceFormat: true,
      createdAt: true,
      createdBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ data: references });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!ESTIMATE_ROLES.includes(session.user.role as any)) {
    return forbiddenResponse();
  }

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Невалідний JSON" }, { status: 400 });
  }

  const { title, description, totalAreaM2, sourceFormat, sections } = body;

  if (!title || !title.trim()) {
    return NextResponse.json({ error: "Назва обов'язкова" }, { status: 400 });
  }
  if (!totalAreaM2 || totalAreaM2 <= 0) {
    return NextResponse.json(
      { error: "Площа має бути більше 0" },
      { status: 400 }
    );
  }
  if (!Array.isArray(sections) || sections.length === 0) {
    return NextResponse.json(
      { error: "Еталон має містити хоча б одну секцію" },
      { status: 400 }
    );
  }

  let grandTotal = 0;
  let itemCount = 0;
  for (const section of sections) {
    for (const item of section.items || []) {
      grandTotal += Number(item.totalCost) || 0;
      itemCount += 1;
    }
  }

  if (itemCount === 0) {
    return NextResponse.json(
      { error: "Еталон має містити хоча б одну позицію" },
      { status: 400 }
    );
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const reference = await tx.referenceEstimate.create({
        data: {
          title: title.trim(),
          description: description?.trim() || null,
          totalAreaM2,
          grandTotal,
          itemCount,
          sourceFormat: sourceFormat || null,
          createdById: session.user.id,
          sections: {
            create: sections.map((section, sIdx) => ({
              title: section.title || `Секція ${sIdx + 1}`,
              sortOrder: section.sortOrder ?? sIdx,
              sectionTotal: section.sectionTotal ?? 0,
            })),
          },
        },
        include: { sections: { orderBy: { sortOrder: "asc" } } },
      });

      for (let sIdx = 0; sIdx < sections.length; sIdx++) {
        const section = sections[sIdx];
        const createdSection = reference.sections[sIdx];
        if (!createdSection || !section.items?.length) continue;
        await tx.referenceEstimateItem.createMany({
          data: section.items.map((item, iIdx) => ({
            sectionId: createdSection.id,
            description: item.description,
            unit: item.unit || "",
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalCost: item.totalCost,
            kind: item.kind || "work",
            sortOrder: item.sortOrder ?? iIdx,
          })),
        });
      }

      return reference;
    });

    await auditLog({
      userId: session.user.id,
      action: "CREATE",
      entity: "ReferenceEstimate",
      entityId: created.id,
      newData: { title, totalAreaM2, grandTotal, itemCount },
    });

    return NextResponse.json({ data: { id: created.id } }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating reference estimate:", error);
    return NextResponse.json(
      { error: "Помилка створення еталону" },
      { status: 500 }
    );
  }
}
