import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { findOrCreateProjectWarehouse } from "@/lib/warehouse/project-warehouse";

const ALLOWED_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER"];

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!ALLOWED_ROLES.includes(session.user.role)) return forbiddenResponse();

  const body = await request.json().catch(() => ({}));
  const projectId = typeof body?.projectId === "string" ? body.projectId : null;
  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  try {
    const warehouse = await findOrCreateProjectWarehouse(projectId);
    return NextResponse.json({ data: { warehouseId: warehouse.id, name: warehouse.name } });
  } catch (err) {
    console.error("[warehouse/find-or-create] error:", err);
    return NextResponse.json({ error: "Не вдалося отримати склад" }, { status: 500 });
  }
}
