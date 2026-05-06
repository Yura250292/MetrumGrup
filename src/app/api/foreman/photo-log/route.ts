import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireForeman,
  assertForemanCanAccessProject,
  forbiddenResponse,
  unauthorizedResponse,
} from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const Body = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  files: z
    .array(
      z.object({
        key: z.string().min(1),
        caption: z.string().max(200).optional().nullable(),
      }),
    )
    .min(1)
    .max(20),
});

export async function POST(req: NextRequest) {
  let session, firmId;
  try {
    ({ session, firmId } = await requireForeman());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") return forbiddenResponse();
    return unauthorizedResponse();
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Bad request", message: "Невалідні параметри" },
      { status: 400 },
    );
  }

  try {
    await assertForemanCanAccessProject(session.user.id, firmId, parsed.data.projectId);
  } catch {
    return forbiddenResponse();
  }

  const project = await prisma.project.findUnique({
    where: { id: parsed.data.projectId },
    select: { currentStage: true },
  });

  const photoReport = await prisma.photoReport.create({
    data: {
      projectId: parsed.data.projectId,
      title: parsed.data.title.trim(),
      description: parsed.data.description?.trim() || null,
      stage: project?.currentStage ?? "DESIGN",
      createdById: session.user.id,
      images: {
        create: parsed.data.files.map((f, i) => ({
          // Зберігаємо r2Key у полі url. Читачі знають що це r2 key і
          // самостійно генерують signed GET URL через getForemanGetUrl.
          url: `r2:${f.key}`,
          caption: f.caption?.trim() || null,
          sortOrder: i,
        })),
      },
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, id: photoReport.id });
}
