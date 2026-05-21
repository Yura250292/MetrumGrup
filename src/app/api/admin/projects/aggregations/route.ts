import { NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireStaffAccess,
  unauthorizedResponse,
} from "@/lib/auth-utils";
import { listProjectsWithAggregations } from "@/lib/projects/aggregations";

export async function GET() {
  try {
    const session = await requireStaffAccess();
    // FINANCIER бачить лише проєкти, де доданий як ProjectMember.
    const restrictToMemberOfUserId =
      session.user.role === "FINANCIER" ? session.user.id : null;
    const projects = await listProjectsWithAggregations(session.user.id, {
      restrictToMemberOfUserId,
    });
    return NextResponse.json({ projects });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Unauthorized") return unauthorizedResponse();
    if (message === "Forbidden") return forbiddenResponse();
    console.error("[projects/aggregations] error:", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
