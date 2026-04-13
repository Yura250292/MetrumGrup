import { NextRequest, NextResponse } from "next/server";
import { requireStaffAccess, unauthorizedResponse } from "@/lib/auth-utils";
import { getCredits } from "@/lib/ai-render";

export const runtime = "nodejs";

/**
 * GET /api/admin/projects/[id]/ai-render/credits
 * Get current AI render credit balance.
 */
export async function GET(_request: NextRequest) {
  try {
    await requireStaffAccess();
    const credits = await getCredits();
    return NextResponse.json({ credits });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Unauthorized") return unauthorizedResponse();
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
