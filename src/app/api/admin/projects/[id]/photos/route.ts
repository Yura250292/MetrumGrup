import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { ProjectStage } from "@prisma/client";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
    return forbiddenResponse();
  }

  const body = await request.json();
  const { title, description, stage, images } = body;

  const photoReport = await prisma.photoReport.create({
    data: {
      projectId,
      title,
      description: description || null,
      stage: stage as ProjectStage,
      createdById: session.user.id,
      images: {
        create: (images || []).map((img: { url: string; caption?: string }, i: number) => ({
          url: img.url,
          caption: img.caption || null,
          sortOrder: i,
        })),
      },
    },
    include: { images: true },
  });

  return NextResponse.json({ data: photoReport }, { status: 201 });
}
