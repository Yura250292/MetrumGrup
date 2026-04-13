import { NextRequest, NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireStaffAccess,
  unauthorizedResponse,
} from "@/lib/auth-utils";
import { canViewProject } from "@/lib/projects/access";
import { prisma } from "@/lib/prisma";
import { toJobDTO } from "@/lib/ai-render";

export const runtime = "nodejs";

function handleError(err: unknown) {
  const message = err instanceof Error ? err.message : "Unknown error";
  if (message === "Unauthorized") return unauthorizedResponse();
  if (message === "Forbidden") return forbiddenResponse();
  console.error("[ai-render/job] error:", err);
  return NextResponse.json({ error: message }, { status: 400 });
}

/**
 * GET /api/admin/projects/[id]/ai-render/[jobId]
 * Get a single render job status (for polling).
 */
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string; jobId: string }> }
) {
  try {
    const session = await requireStaffAccess();
    const { id: projectId, jobId } = await ctx.params;
    const ok = await canViewProject(projectId, session.user.id);
    if (!ok) return forbiddenResponse();

    const job = await prisma.aiRenderJob.findFirst({
      where: { id: jobId, projectId },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json({ job: toJobDTO(job) });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * DELETE /api/admin/projects/[id]/ai-render/[jobId]
 * Cancel a render job.
 */
export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string; jobId: string }> }
) {
  try {
    const session = await requireStaffAccess();
    const { id: projectId, jobId } = await ctx.params;
    const ok = await canViewProject(projectId, session.user.id);
    if (!ok) return forbiddenResponse();

    const job = await prisma.aiRenderJob.findFirst({
      where: { id: jobId, projectId },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.status === "QUEUED" || job.status === "PROCESSING") {
      await prisma.aiRenderJob.update({
        where: { id: jobId },
        data: { status: "CANCELLED", completedAt: new Date() },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
