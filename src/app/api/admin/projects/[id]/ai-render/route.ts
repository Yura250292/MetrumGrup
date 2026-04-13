import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import {
  forbiddenResponse,
  requireStaffAccess,
  unauthorizedResponse,
} from "@/lib/auth-utils";
import { canViewProject } from "@/lib/projects/access";
import { prisma } from "@/lib/prisma";
import {
  createRenderJob,
  processRenderJob,
  getCredits,
  toJobDTO,
} from "@/lib/ai-render";
import type { CreateRenderJobInput } from "@/lib/ai-render/types";

export const runtime = "nodejs";
export const maxDuration = 300;

function handleError(err: unknown) {
  const message = err instanceof Error ? err.message : "Unknown error";
  if (message === "Unauthorized") return unauthorizedResponse();
  if (message === "Forbidden") return forbiddenResponse();
  if (message.includes("не налаштований")) {
    return NextResponse.json({ error: message }, { status: 503 });
  }
  if (message.includes("вичерпано")) {
    return NextResponse.json({ error: message }, { status: 402 });
  }
  console.error("[ai-render] error:", err);
  return NextResponse.json({ error: message }, { status: 400 });
}

/**
 * POST /api/admin/projects/[id]/ai-render
 * Create a new AI render job.
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireStaffAccess();
    const { id: projectId } = await ctx.params;
    const ok = await canViewProject(projectId, session.user.id);
    if (!ok) return forbiddenResponse();

    const body = (await request.json()) as CreateRenderJobInput;

    const job = await createRenderJob(projectId, session.user.id, body);

    // Fire-and-forget: process in background after response is sent
    after(async () => {
      try {
        await processRenderJob(job.id);
      } catch (err) {
        console.error("[ai-render] background processing failed:", err);
      }
    });

    return NextResponse.json({ job }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * GET /api/admin/projects/[id]/ai-render
 * List all render jobs for a project.
 */
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireStaffAccess();
    const { id: projectId } = await ctx.params;
    const ok = await canViewProject(projectId, session.user.id);
    if (!ok) return forbiddenResponse();

    const jobs = await prisma.aiRenderJob.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });

    const credits = await getCredits();

    return NextResponse.json({
      jobs: jobs.map(toJobDTO),
      credits,
    });
  } catch (err) {
    return handleError(err);
  }
}
