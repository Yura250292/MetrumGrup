import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { generateEmployeesTemplate } from "@/lib/import/hr-import";

export async function GET() {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!["SUPER_ADMIN", "MANAGER", "HR"].includes(session.user.role)) {
    return forbiddenResponse();
  }

  const buffer = await generateEmployeesTemplate();
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="Шаблон_Співробітники.xlsx"',
      "Content-Length": String(buffer.length),
    },
  });
}
