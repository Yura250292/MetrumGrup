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
  folderId: z.string().min(1).optional().nullable(),
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
  const folderIdParam = searchParams.get("folderId");

  const where: Record<string, unknown> = {};
  if (projectId) where.projectId = projectId;
  if (folderIdParam === "root") {
    where.folderId = null;
  } else if (folderIdParam) {
    where.folderId = folderIdParam;
  }

  const meetings = await prisma.meeting.findMany({
    where: Object.keys(where).length ? where : undefined,
    orderBy: { recordedAt: "desc" },
    include: {
      project: { select: { id: true, title: true, slug: true } },
      createdBy: { select: { id: true, name: true } },
      folder: { select: { id: true, name: true } },
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

  if (parsed.data.folderId) {
    const folder = await prisma.folder.findUnique({
      where: { id: parsed.data.folderId },
      select: { domain: true },
    });
    if (!folder || folder.domain !== "MEETING") {
      return NextResponse.json(
        { error: "Папку нарад не знайдено" },
        { status: 400 },
      );
    }
  }

  const meeting = await prisma.meeting.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      projectId: parsed.data.projectId,
      folderId: parsed.data.folderId ?? null,
      createdById: session.user.id,
      status: "DRAFT",
    },
    include: {
      project: { select: { id: true, title: true, slug: true } },
      folder: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ meeting });
}
