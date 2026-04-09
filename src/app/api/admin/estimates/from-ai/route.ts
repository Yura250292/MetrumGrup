/**
 * POST /api/admin/estimates/from-ai
 *
 * Saves an estimate produced by the AI generator (master/multi-agent flow).
 * Items arrive in AI-format (with `laborCost`) and are normalized server-side
 * via `normalizeAiItems`. The previous client-side `laborCost / 200` heuristic
 * has been removed — keeping a single source of truth on the backend.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { auditLog } from "@/lib/audit";
import { getNextEstimateNumber } from "@/lib/document-numbers";
import { normalizeAiItems, type AiItem } from "@/lib/estimates/ai-item-normalizer";
import { recomputeEstimateTotals } from "@/lib/estimates/recompute";

interface AiSection {
  title: string;
  items: AiItem[];
}

interface FromAiBody {
  projectId: string;
  title: string;
  description?: string;
  sections: AiSection[];
  overheadRate?: number;
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const allowedRoles = ["SUPER_ADMIN", "MANAGER", "ENGINEER", "FINANCIER"];
  if (!allowedRoles.includes(session.user.role)) {
    return forbiddenResponse();
  }

  try {
    const body = (await request.json()) as FromAiBody;
    const { projectId, title, description, sections, overheadRate } = body;

    if (!projectId || !title) {
      return NextResponse.json(
        { error: "Проєкт та назва обов'язкові" },
        { status: 400 }
      );
    }

    if (!Array.isArray(sections) || sections.length === 0) {
      return NextResponse.json(
        { error: "Кошторис має містити хоча б одну секцію" },
        { status: 400 }
      );
    }

    // Normalize per section, drop empty sections after normalization.
    const normalizedSections = sections
      .map((section, sIdx) => ({
        title: section.title || `Секція ${sIdx + 1}`,
        sortOrder: sIdx,
        items: normalizeAiItems(section.items || []),
      }))
      .filter((section) => section.items.length > 0);

    if (normalizedSections.length === 0) {
      return NextResponse.json(
        { error: "Після нормалізації не залишилось жодної валідної позиції" },
        { status: 400 }
      );
    }

    // Aggregate totals from normalized items.
    let totalMaterials = 0;
    let totalLabor = 0;
    for (const section of normalizedSections) {
      for (const item of section.items) {
        totalMaterials += item.quantity * item.unitPrice;
        totalLabor += item.laborRate * item.laborHours;
      }
    }
    const overhead = overheadRate
      ? ((totalMaterials + totalLabor) * overheadRate) / 100
      : 0;
    const totalAmount = totalMaterials + totalLabor + overhead;

    const completeEstimate = await prisma.$transaction(async (tx) => {
      const number = await getNextEstimateNumber();

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
            create: normalizedSections.map((section) => ({
              title: section.title,
              sortOrder: section.sortOrder,
            })),
          },
        },
        include: {
          sections: { orderBy: { sortOrder: "asc" } },
        },
      });

      for (let sIdx = 0; sIdx < normalizedSections.length; sIdx++) {
        const section = normalizedSections[sIdx];
        const createdSection = estimate.sections[sIdx];
        await tx.estimateItem.createMany({
          data: section.items.map((item, iIdx) => ({
            ...item,
            sortOrder: iIdx,
            estimateId: estimate.id,
            sectionId: createdSection.id,
          })),
        });
      }

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

    // Recompute totals through the canonical pipeline (covers discount, margin, tax).
    if (completeEstimate) {
      await recomputeEstimateTotals(completeEstimate.id);
    }

    await auditLog({
      userId: session.user.id,
      action: "CREATE",
      entity: "Estimate",
      entityId: completeEstimate!.id,
      projectId,
      newData: { title, totalAmount: completeEstimate!.totalAmount, source: "ai" },
    });

    return NextResponse.json({ data: completeEstimate }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating estimate from AI:", error);

    if (error?.code === "P2003") {
      if (error.meta?.constraint === "estimates_createdById_fkey") {
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
