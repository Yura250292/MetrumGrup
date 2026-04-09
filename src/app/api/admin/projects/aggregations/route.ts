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
    const projects = await listProjectsWithAggregations(session.user.id);
    return NextResponse.json({ projects });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Unauthorized") return unauthorizedResponse();
    if (message === "Forbidden") return forbiddenResponse();
    console.error("[projects/aggregations] error:", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
