import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { approveScan, ReceiptScanError } from "@/lib/services/receipt-scan-service";

const APPROVER_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER"];

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ scanId: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!APPROVER_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { scanId } = await ctx.params;
  // Safe Finance Migration: дозволяємо approver-у вибрати намір.
  // За замовч. COMMITTED_EXPENSE (стандарт: накладну отримали, ще не платили).
  let financeNature: "COMMITTED_EXPENSE" | "ACTUAL_EXPENSE" | undefined;
  try {
    const body = await request.json().catch(() => ({}));
    if (
      body?.financeNature === "COMMITTED_EXPENSE"
      || body?.financeNature === "ACTUAL_EXPENSE"
    ) {
      financeNature = body.financeNature;
    } else if (body?.entryIntent === "ACTUAL") {
      financeNature = "ACTUAL_EXPENSE";
    } else if (body?.entryIntent === "COMMITTED") {
      financeNature = "COMMITTED_EXPENSE";
    }
  } catch {
    // empty body OK
  }

  try {
    const result = await approveScan(scanId, session.user.id, { financeNature });
    return NextResponse.json({ data: result });
  } catch (err) {
    if (err instanceof ReceiptScanError) {
      return NextResponse.json({ error: err.message }, { status: err.statusHint });
    }
    console.error("[receipts/approve] error:", err);
    return NextResponse.json({ error: "Не вдалося підтвердити скан" }, { status: 500 });
  }
}
