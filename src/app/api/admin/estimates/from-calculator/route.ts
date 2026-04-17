/**
 * POST /api/admin/estimates/from-calculator
 *
 * Creates a new draft Estimate by linearly scaling a ReferenceEstimate
 * from its captured area to the user-supplied newAreaM2. Quantities scale,
 * unit prices stay the same. Single source of truth for the math is
 * `scaleReference()` in `src/lib/estimates/calculator-scale.ts` — the
 * client uses the same function for the live preview.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse, ESTIMATE_ROLES } from "@/lib/auth-utils";
import { auditLog } from "@/lib/audit";
import { getNextEstimateNumber } from "@/lib/document-numbers";
import { recomputeEstimateTotals } from "@/lib/estimates/recompute";
import { scaleReference } from "@/lib/estimates/calculator-scale";

interface FromCalculatorBody {
  projectId: string;
  referenceId: string;
  newAreaM2: number;
  title?: string;
  description?: string;
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!ESTIMATE_ROLES.includes(session.user.role as any)) {
    return forbiddenResponse();
  }

  let body: FromCalculatorBody;
  try {
    body = (await request.json()) as FromCalculatorBody;
  } catch {
    return NextResponse.json({ error: "Невалідний JSON" }, { status: 400 });
  }

  const { projectId, referenceId, newAreaM2, title, description } = body;

  if (!projectId || !referenceId) {
    return NextResponse.json(
      { error: "projectId та referenceId обов'язкові" },
      { status: 400 }
    );
  }
  if (!Number.isFinite(newAreaM2) || newAreaM2 <= 0) {
    return NextResponse.json(
      { error: "Площа має бути більше 0" },
      { status: 400 }
    );
  }

  const reference = await prisma.referenceEstimate.findUnique({
    where: { id: referenceId },
    include: {
      sections: {
        orderBy: { sortOrder: "asc" },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });

  if (!reference || !reference.isActive) {
    return NextResponse.json(
      { error: "Еталонний кошторис не знайдено" },
      { status: 404 }
    );
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, title: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Проєкт не знайдено" }, { status: 404 });
  }

  let scaled;
  try {
    scaled = scaleReference(
      {
        id: reference.id,
        title: reference.title,
        totalAreaM2: Number(reference.totalAreaM2),
        sections: reference.sections.map((s) => ({
          id: s.id,
          title: s.title,
          sortOrder: s.sortOrder,
          items: s.items.map((i) => ({
            id: i.id,
            description: i.description,
            unit: i.unit,
            quantity: Number(i.quantity),
            unitPrice: Number(i.unitPrice),
            totalCost: Number(i.totalCost),
            kind: i.kind,
            sortOrder: i.sortOrder,
          })),
        })),
      },
      newAreaM2
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Помилка масштабування" },
      { status: 400 }
    );
  }

  if (scaled.itemCount === 0) {
    return NextResponse.json(
      { error: "Еталон не містить позицій" },
      { status: 400 }
    );
  }

  const finalTitle =
    title?.trim() ||
    `Кошторис — ${project.title} (${newAreaM2} м²)`;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const number = await getNextEstimateNumber();
      const estimate = await tx.estimate.create({
        data: {
          number,
          projectId,
          createdById: session.user.id,
          title: finalTitle,
          description:
            description?.trim() ||
            `Створено калькулятором з еталона "${reference.title}". ` +
              `Масштаб ×${scaled.scaleFactor.toFixed(3)} ` +
              `(${scaled.referenceAreaM2} м² → ${newAreaM2} м²).`,
          totalMaterials: scaled.grandTotal,
          totalLabor: 0,
          totalOverhead: 0,
          totalAmount: scaled.grandTotal,
          finalAmount: scaled.grandTotal,
          sections: {
            create: scaled.sections.map((section) => ({
              title: section.title,
              sortOrder: section.sortOrder,
              totalAmount: section.sectionTotal,
            })),
          },
        },
        include: { sections: { orderBy: { sortOrder: "asc" } } },
      });

      for (let sIdx = 0; sIdx < scaled.sections.length; sIdx++) {
        const section = scaled.sections[sIdx];
        const createdSection = estimate.sections[sIdx];
        if (!createdSection || section.items.length === 0) continue;
        await tx.estimateItem.createMany({
          data: section.items.map((item, iIdx) => ({
            estimateId: estimate.id,
            sectionId: createdSection.id,
            description: item.description,
            unit: item.unit,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            laborRate: 0,
            laborHours: 0,
            amount: item.amount,
            sortOrder: iIdx,
            itemType: item.kind === "material" ? "material" : "labor",
          })),
        });
      }

      return estimate;
    });

    await recomputeEstimateTotals(created.id);

    await auditLog({
      userId: session.user.id,
      action: "CREATE",
      entity: "Estimate",
      entityId: created.id,
      projectId,
      newData: {
        title: finalTitle,
        source: "calculator",
        referenceId,
        newAreaM2,
        scaleFactor: scaled.scaleFactor,
        grandTotal: scaled.grandTotal,
      },
    });

    return NextResponse.json({ data: { id: created.id } }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating estimate from calculator:", error);
    if (error?.code === "P2003") {
      if (error.meta?.constraint?.includes("createdById")) {
        return NextResponse.json(
          { error: "Ваша сесія застаріла. Будь ласка, вийдіть і увійдіть знову." },
          { status: 401 }
        );
      }
      if (error.meta?.constraint?.includes("projectId")) {
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
