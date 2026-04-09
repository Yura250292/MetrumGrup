import { NextRequest, NextResponse } from "next/server";
import {
  ESTIMATE_ROLES,
  forbiddenResponse,
  requireAuth,
  unauthorizedResponse,
} from "@/lib/auth-utils";
import { generateEstimateFromProjectFiles } from "@/lib/projects/generate-estimate";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    if (!ESTIMATE_ROLES.includes(session.user.role)) {
      return forbiddenResponse();
    }

    const { id } = await ctx.params;
    const json = await request.json().catch(() => ({}));

    const projectType = typeof json.projectType === "string" ? json.projectType : undefined;
    const notes = typeof json.notes === "string" ? json.notes : undefined;
    const selectedFileIds = Array.isArray(json.selectedFileIds)
      ? (json.selectedFileIds as string[])
      : undefined;

    const cookieHeader = request.headers.get("cookie");

    const result = await generateEstimateFromProjectFiles({
      projectId: id,
      cookieHeader,
      projectType,
      notes,
      selectedFileIds,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Unauthorized") return unauthorizedResponse();
    if (message === "Forbidden") return forbiddenResponse();
    console.error("[projects/generate-estimate] error:", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
