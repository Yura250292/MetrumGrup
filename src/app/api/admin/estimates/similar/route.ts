/**
 * GET /api/admin/estimates/similar
 *
 * Повертає схожі кошториси з власного корпусу (firm-scoped) для відображення
 * у setup-screen ("Подібні проєкти") і result-screen.
 *
 * Query params:
 *   projectType — house/apartment/commercial/...
 *   area        — цільова площа (м²)
 *   qualityTier — economy/standard/premium/luxury (опціонально)
 *   limit       — скільки повертати (default 5)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { findSimilarEstimates, getCorpusStats } from "@/lib/estimates/similar";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { searchParams } = new URL(request.url);
  const projectType = searchParams.get("projectType") || undefined;
  const areaStr = searchParams.get("area");
  const area = areaStr ? parseFloat(areaStr.replace(",", ".")) : undefined;
  const qualityTier = searchParams.get("qualityTier") || undefined;
  const limit = parseInt(searchParams.get("limit") || "5", 10);

  // Підтягуємо firmId користувача
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { firmId: true },
  });
  const firmId = user?.firmId ?? null;

  const [similar, stats] = await Promise.all([
    findSimilarEstimates({
      projectType,
      totalAreaM2: Number.isFinite(area) && (area as number) > 0 ? area : undefined,
      qualityTier,
      firmId,
      limit,
    }),
    getCorpusStats(firmId),
  ]);

  return NextResponse.json({ similar, stats });
}
