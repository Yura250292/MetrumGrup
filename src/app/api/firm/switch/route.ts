import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { KNOWN_FIRMS } from "@/lib/firm/scope";
import {
  FIRM_OVERRIDE_COOKIE,
  FIRM_OVERRIDE_ALL,
} from "@/lib/firm/server-scope";

export const runtime = "nodejs";

/**
 * Перемикач фірм. Доступний для всіх залогінених користувачів — щоб керівник
 * студії теж міг перемикатись (з обмеженнями на дії — див. assertHomeFirm).
 * "__all__" (cross-firm view) — лише для SUPER_ADMIN.
 *
 * POST { firmId: "metrum-group" | "metrum-studio" | "__all__" | null }
 *  - конкретний firmId → cookie ставиться на 30 днів (sticky last session)
 *  - "__all__" → cross-firm view (тільки SUPER_ADMIN)
 *  - null → cookie очищується, поведінка за замовчуванням
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const isSuperAdmin = session.user.role === "SUPER_ADMIN";

  let body: { firmId?: string | null } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Невірне тіло запиту" }, { status: 400 });
  }

  const { firmId } = body;

  const response = NextResponse.json({ ok: true, firmId: firmId ?? null });

  if (firmId === null || firmId === undefined) {
    response.cookies.delete(FIRM_OVERRIDE_COOKIE);
    return response;
  }

  if (firmId === FIRM_OVERRIDE_ALL) {
    if (!isSuperAdmin) {
      return NextResponse.json(
        { error: "Cross-firm view доступний лише адміністраторам" },
        { status: 403 },
      );
    }
  } else if (!KNOWN_FIRMS[firmId]) {
    return NextResponse.json({ error: "Невідома фірма" }, { status: 400 });
  }

  response.cookies.set(FIRM_OVERRIDE_COOKIE, firmId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return response;
}
