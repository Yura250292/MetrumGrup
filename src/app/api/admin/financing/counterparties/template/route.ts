import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { generateCounterpartiesTemplate } from "@/lib/import/hr-import";

export const runtime = "nodejs";

const READ_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "HR"];

/**
 * Excel template for bulk counterparty import.
 * Same format as the legacy /admin/hr/counterparties/template endpoint —
 * reuses the shared generator. Available to finance + HR roles.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!READ_ROLES.includes(session.user.role)) return forbiddenResponse();

  const buffer = await generateCounterpartiesTemplate();
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="Шаблон_Контрагенти.xlsx"',
      "Content-Length": String(buffer.length),
    },
  });
}
