import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireSuperAdmin,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth-utils";
import { z } from "zod";

const patchSchema = z.object({
  label: z.string().min(1).max(8),
  guessedName: z.string().trim().max(120).nullable().optional(),
  role: z.string().trim().max(120).nullable().optional(),
});

type SpeakerEntry = {
  label: string;
  guessedName: string | null;
  role: string | null;
  evidence: string;
};

// PATCH /api/admin/meetings/[id]/speakers
// Тіло: { label: "A", guessedName: "Олег"?, role: "директор"? }
// Оновлює відповідного спікера в meeting.structured.speakers (JSON-полі).
// Якщо такого лейбла нема — додає новий запис із "manually added" evidence.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSuperAdmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return msg === "Forbidden" ? forbiddenResponse() : unauthorizedResponse();
  }

  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: { structured: true },
  });
  if (!meeting) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const structured = (meeting.structured ?? {}) as Record<string, unknown>;
  const speakersRaw = Array.isArray(structured.speakers)
    ? (structured.speakers as SpeakerEntry[])
    : [];

  const idx = speakersRaw.findIndex((s) => s.label === parsed.data.label);
  const trimmedName =
    parsed.data.guessedName !== undefined
      ? parsed.data.guessedName?.trim() || null
      : undefined;
  const trimmedRole =
    parsed.data.role !== undefined
      ? parsed.data.role?.trim() || null
      : undefined;

  if (idx === -1) {
    // Новий спікер вручну (рідкісний кейс — зазвичай вже є з AI).
    speakersRaw.push({
      label: parsed.data.label,
      guessedName: trimmedName ?? null,
      role: trimmedRole ?? null,
      evidence: "Додано вручну користувачем",
    });
  } else {
    const current = speakersRaw[idx];
    speakersRaw[idx] = {
      ...current,
      guessedName:
        trimmedName !== undefined ? trimmedName : current.guessedName,
      role: trimmedRole !== undefined ? trimmedRole : current.role,
    };
  }

  const updatedStructured = { ...structured, speakers: speakersRaw };

  await prisma.meeting.update({
    where: { id },
    data: { structured: updatedStructured },
  });

  return NextResponse.json({ data: { speakers: speakersRaw } });
}
