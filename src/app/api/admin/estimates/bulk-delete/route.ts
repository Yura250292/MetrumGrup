/**
 * POST /api/admin/estimates/bulk-delete
 *
 * Body: { ids: string[] }
 *
 * Видаляє кілька кошторисів одним запитом. Cleanup tool — після серії
 * автогенерацій накопичується десятки порожніх / тестових кошторисів,
 * треба швидко прибрати. SUPER_ADMIN і MANAGER (так само як одиничний DELETE).
 *
 * Cascade delete у Prisma схемі забирає sections, items, refine history,
 * versions, approvals, conversation. Нічого додаткового null-ити не треба.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { auditLog } from "@/lib/audit";

const MAX_BATCH = 200;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
    return forbiddenResponse();
  }

  let body: { ids?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Невалідний JSON" }, { status: 400 });
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.filter((x): x is string => typeof x === "string" && x.length > 0)
    : [];

  if (ids.length === 0) {
    return NextResponse.json(
      { error: "Не передано жодного ID для видалення" },
      { status: 400 }
    );
  }
  if (ids.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `Забагато ID для одного запиту (max ${MAX_BATCH})` },
      { status: 400 }
    );
  }

  // Single deleteMany — atomically removes everything in the list.
  // Cascade delete handles sections / items / etc automatically.
  let deletedCount = 0;
  try {
    const result = await prisma.estimate.deleteMany({
      where: { id: { in: ids } },
    });
    deletedCount = result.count;
  } catch (error) {
    console.error("Bulk delete estimates failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Помилка видалення: ${error.message}`
            : "Помилка видалення кошторисів",
      },
      { status: 500 }
    );
  }

  if (deletedCount > 0) {
    await auditLog({
      userId: session.user.id,
      action: "DELETE",
      entity: "Estimate",
      newData: { bulkCount: deletedCount, ids },
    });
  }

  return NextResponse.json({
    success: true,
    deletedCount,
    requestedCount: ids.length,
    skippedCount: ids.length - deletedCount,
  });
}
