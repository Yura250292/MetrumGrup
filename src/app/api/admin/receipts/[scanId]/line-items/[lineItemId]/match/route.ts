import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { matchLineItem, ReceiptScanError } from "@/lib/services/receipt-scan-service";
import { LineItemMatchSchema } from "@/lib/schemas/receipt";

const SCAN_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER"];

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ scanId: string; lineItemId: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!SCAN_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { scanId, lineItemId } = await ctx.params;
  const body = await request.json().catch(() => null);
  const parsed = LineItemMatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Невалідне тіло запиту", details: parsed.error.format() }, { status: 400 });
  }

  try {
    const result = await matchLineItem(scanId, lineItemId, parsed.data, session.user.id);
    return NextResponse.json({ data: result });
  } catch (err) {
    if (err instanceof ReceiptScanError) {
      return NextResponse.json({ error: err.message }, { status: err.statusHint });
    }
    console.error("[receipts/line-items/match] error:", err);
    return NextResponse.json({ error: "Не вдалося оновити позицію" }, { status: 500 });
  }
}
