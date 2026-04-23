import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { approveScan, ReceiptScanError } from "@/lib/services/receipt-scan-service";

const APPROVER_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER"];

export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ scanId: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!APPROVER_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { scanId } = await ctx.params;
  try {
    const result = await approveScan(scanId, session.user.id);
    return NextResponse.json({ data: result });
  } catch (err) {
    if (err instanceof ReceiptScanError) {
      return NextResponse.json({ error: err.message }, { status: err.statusHint });
    }
    console.error("[receipts/approve] error:", err);
    return NextResponse.json({ error: "Не вдалося підтвердити скан" }, { status: 500 });
  }
}
