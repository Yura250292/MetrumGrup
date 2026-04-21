import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAdminRole,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth-utils";
import { z } from "zod";

const createSchema = z.object({
  title: z.string().min(1).max(255),
  projectId: z.string().min(1),
  description: z.string().max(5000).optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    await requireAdminRole();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return msg === "Forbidden" ? forbiddenResponse() : unauthorizedResponse();
  }

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  const meetings = await prisma.meeting.findMany({
    where: projectId ? { projectId } : undefined,
    orderBy: { recordedAt: "desc" },
    include: {
      project: { select: { id: true, title: true, slug: true } },
      createdBy: { select: { id: true, name: true } },
    },
    take: 200,
  });

  return NextResponse.json({ meetings });
}

export async function POST(request: NextRequest) {
  let session;
  try {
    session = await requireAdminRole();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return msg === "Forbidden" ? forbiddenResponse() : unauthorizedResponse();
  }

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const project = await prisma.project.findUnique({
    where: { id: parsed.data.projectId },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const meeting = await prisma.meeting.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      projectId: parsed.data.projectId,
      createdById: session.user.id,
      status: "DRAFT",
    },
    include: {
      project: { select: { id: true, title: true, slug: true } },
    },
  });

  return NextResponse.json({ meeting });
}
