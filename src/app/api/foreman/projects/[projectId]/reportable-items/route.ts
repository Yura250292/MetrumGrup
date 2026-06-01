import { NextRequest, NextResponse } from "next/server";
import {
  requireForeman,
  assertForemanCanAccessProject,
  forbiddenResponse,
  unauthorizedResponse,
} from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { visibleEstimateItemsWhere } from "@/lib/foreman/visible-items";
import { approvedQuantitiesFor } from "@/lib/projects/work-progress";
import { isReportableItemType } from "@/lib/projects/activation";

export const dynamic = "force-dynamic";

/**
 * GET /api/foreman/projects/[projectId]/reportable-items (P6).
 *
 * Повертає роботи кошторису, по яких current user — effective foreman, для
 * табличного вводу обсягів у PWA. Матеріали (itemType=material) виключені.
 * unitCost/ціни виконробу НЕ віддаємо.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  let session, firmId;
  try {
    ({ session, firmId } = await requireForeman());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") return forbiddenResponse();
    return unauthorizedResponse();
  }

  const { projectId } = await params;
  try {
    await assertForemanCanAccessProject(session.user.id, firmId, projectId);
  } catch {
    return forbiddenResponse();
  }

  const items = await prisma.estimateItem.findMany({
    where: visibleEstimateItemsWhere(projectId, session.user.id),
    select: {
      id: true,
      description: true,
      unit: true,
      quantity: true,
      itemType: true,
      isReportable: true,
      sectionId: true,
      section: { select: { id: true, title: true } },
    },
    orderBy: [{ sectionId: "asc" }, { sortOrder: "asc" }],
  });

  // Reportable = не матеріал (itemType ≠ 'material') і не знято через ДКО REMOVE.
  const reportable = items.filter(
    (it) => isReportableItemType(it.itemType) && it.isReportable !== false,
  );

  const approvedMap = await approvedQuantitiesFor(reportable.map((i) => i.id));

  const rows = reportable.map((it) => {
    const planned = Number(it.quantity ?? 0);
    const approved = approvedMap.get(it.id) ?? 0;
    const remaining = Math.max(0, planned - approved);
    return {
      estimateItemId: it.id,
      sectionId: it.sectionId,
      sectionName: it.section?.title ?? null,
      description: it.description,
      unit: it.unit,
      plannedQuantity: planned,
      approvedQuantity: approved,
      remainingQuantity: remaining,
      progressPercent: planned > 0 ? (approved / planned) * 100 : 0,
    };
  });

  return NextResponse.json({ items: rows });
}
