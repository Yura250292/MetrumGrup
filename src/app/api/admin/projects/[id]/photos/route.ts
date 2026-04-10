import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { ProjectStage } from "@prisma/client";
import { canUploadProjectFiles } from "@/lib/projects/access";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  // Allow any active project member who has upload rights (engineers, foremen,
  // managers) to file a photo report. SUPER_ADMIN bypass handled in access.ts.
  const allowed = await canUploadProjectFiles(projectId, session.user.id);
  if (!allowed) return forbiddenResponse();

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
