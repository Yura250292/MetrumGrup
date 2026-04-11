/**
 * POST /api/admin/projects/bulk-delete
 *
 * Body: { ids: string[] }
 *
 * Видаляє кілька проектів одним запитом. Cleanup tool — користувач у v2 UI
 * накопичив багато тестових проектів від AI-генерації, треба швидко
 * почистити. Тільки SUPER_ADMIN.
 *
 * Так само як одиничний DELETE, попередньо null-имо FK на projectId у
 * inventory_transactions і audit_logs (вони без onDelete: Cascade).
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { auditLog } from "@/lib/audit";

const MAX_BATCH = 100;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  if (session.user.role !== "SUPER_ADMIN") {
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

  const deleted: string[] = [];
  const failed: Array<{ id: string; reason: string }> = [];

  for (const id of ids) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.inventoryTransaction.updateMany({
          where: { projectId: id },
          data: { projectId: null },
        });
        await tx.$executeRaw`UPDATE "audit_logs" SET "projectId" = NULL WHERE "projectId" = ${id}`;
        await tx.project.delete({ where: { id } });
      });
      deleted.push(id);
    } catch (e) {
      failed.push({
        id,
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (deleted.length > 0) {
    await auditLog({
      userId: session.user.id,
      action: "DELETE",
      entity: "Project",
      newData: { bulkCount: deleted.length, ids: deleted },
    });
  }

  return NextResponse.json({
    success: failed.length === 0,
    deletedCount: deleted.length,
    failedCount: failed.length,
    deleted,
    failed,
  });
}
