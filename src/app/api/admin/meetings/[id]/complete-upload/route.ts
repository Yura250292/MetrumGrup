import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAdminRole,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth-utils";
import { z } from "zod";

const schema = z.object({
  audioR2Key: z.string().min(1),
  audioUrl: z.string().url(),
  audioMimeType: z.string().min(1),
  audioSizeBytes: z.number().int().positive(),
  audioDurationMs: z.number().int().nonnegative().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminRole();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return msg === "Forbidden" ? forbiddenResponse() : unauthorizedResponse();
  }

  const { id } = await params;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const meeting = await prisma.meeting.update({
    where: { id },
    data: {
      audioR2Key: parsed.data.audioR2Key,
      audioUrl: parsed.data.audioUrl,
      audioMimeType: parsed.data.audioMimeType,
      audioSizeBytes: parsed.data.audioSizeBytes,
      audioDurationMs: parsed.data.audioDurationMs ?? null,
      status: "UPLOADED",
      processingError: null,
    },
  });

  return NextResponse.json({ meeting });
}
