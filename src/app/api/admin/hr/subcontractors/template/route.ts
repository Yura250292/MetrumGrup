import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { generateSubcontractorsTemplate } from "@/lib/import/hr-import";

export async function GET() {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!["SUPER_ADMIN", "MANAGER", "HR"].includes(session.user.role)) {
    return forbiddenResponse();
  }

  const buffer = await generateSubcontractorsTemplate();
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="Шаблон_Підрядники.xlsx"',
      "Content-Length": String(buffer.length),
    },
  });
}
