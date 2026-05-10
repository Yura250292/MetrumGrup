import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireSuperAdmin,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth-utils";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSuperAdmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return msg === "Forbidden" ? forbiddenResponse() : unauthorizedResponse();
  }

  const { id } = await params;
  const url = new URL(request.url);
  const includeHidden = url.searchParams.get("includeHidden") === "1";

  const insights = await prisma.liveMeetingInsight.findMany({
    where: {
      meetingId: id,
      ...(includeHidden ? {} : { isHidden: false }),
    },
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    take: 200,
  });

  // Простий cost-summary — корисно показати в UI «потрачено».
  const costAgg = await prisma.liveAgentCostLog.aggregate({
    where: { meetingId: id },
    _count: { id: true },
    _sum: {
      inputTokens: true,
      outputTokens: true,
      estimatedCostUsd: true,
    },
  });

  return NextResponse.json({
    insights,
    cost: {
      calls: costAgg._count.id,
      inputTokens: costAgg._sum.inputTokens ?? 0,
      outputTokens: costAgg._sum.outputTokens ?? 0,
      estimatedCostUsd: costAgg._sum.estimatedCostUsd ?? 0,
    },
  });
}
