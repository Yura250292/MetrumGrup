import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { rejectScan, ReceiptScanError } from "@/lib/services/receipt-scan-service";
import { ReceiptRejectSchema } from "@/lib/schemas/receipt";

const APPROVER_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER"];

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ scanId: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!APPROVER_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { scanId } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const parsed = ReceiptRejectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Потрібна причина відхилення" }, { status: 400 });
  }

  try {
    const result = await rejectScan(scanId, session.user.id, parsed.data.reason);
    return NextResponse.json({ data: result });
  } catch (err) {
    if (err instanceof ReceiptScanError) {
      return NextResponse.json({ error: err.message }, { status: err.statusHint });
    }
    console.error("[receipts/reject] error:", err);
    return NextResponse.json({ error: "Не вдалося відхилити скан" }, { status: 500 });
  }
}
