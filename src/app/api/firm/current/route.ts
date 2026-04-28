import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { KNOWN_FIRMS } from "@/lib/firm/scope";

export const runtime = "nodejs";

/** Повертає поточний firm scope для UI перемикача. */
export async function GET() {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const scope = await resolveFirmScopeForRequest(session);
  return NextResponse.json({
    firmId: scope.firmId,
    firmName: scope.firmId ? KNOWN_FIRMS[scope.firmId]?.name ?? null : "Усі фірми",
    isSuperAdmin: scope.isSuperAdmin,
    userFirmId: scope.userFirmId,
  });
}
