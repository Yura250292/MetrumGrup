import { NextRequest, NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireAuth,
  unauthorizedResponse,
} from "@/lib/auth-utils";
import { lockActiveEstimateVersion } from "@/lib/estimates/version-lock";
import { prisma } from "@/lib/prisma";

/// POST /api/admin/estimates/[id]/lock
/// Заморожує активну версію кошторису. Після цього додавання/редагування/
/// видалення items блокуються (409 ESTIMATE_LOCKED). Лишається можливість
/// створити нову `revised` версію — це окремий flow.
///
/// Доступ: SUPER_ADMIN або MANAGER.
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const role = session.user.role;
    if (role !== "SUPER_ADMIN" && role !== "MANAGER") {
      return forbiddenResponse();
    }

    const { id: estimateId } = await ctx.params;
    const estimate = await prisma.estimate.findUnique({
      where: { id: estimateId },
      select: { id: true },
    });
    if (!estimate) {
      return NextResponse.json({ error: "Кошторис не знайдено" }, { status: 404 });
    }

    const result = await lockActiveEstimateVersion(estimateId, session.user.id);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Unauthorized") return unauthorizedResponse();
    if (message === "Forbidden") return forbiddenResponse();
    console.error("[estimates/lock] error:", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
