import { NextRequest, NextResponse } from "next/server";
import { AssemblyAI } from "assemblyai";
import { prisma } from "@/lib/prisma";
import {
  requireSuperAdmin,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth-utils";

// POST /api/admin/meetings/[id]/live-agent/realtime-token
// Видає короткоживучий токен (10 хв) для AssemblyAI Streaming Speech-to-Text.
// Браузер потім підключається напряму до AssemblyAI WebSocket з цим токеном —
// сирий API-ключ ніколи не покидає сервер.
//
// Stream вартість ~$0.47/год — тому видаємо лише авторизованим SuperAdmin'ам
// під конкретну нараду.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSuperAdmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return msg === "Forbidden" ? forbiddenResponse() : unauthorizedResponse();
  }

  if (!process.env.ASSEMBLYAI_API_KEY) {
    return NextResponse.json(
      { error: "ASSEMBLYAI_API_KEY не налаштовано" },
      { status: 500 },
    );
  }

  const { id } = await params;
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  const client = new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY });
  try {
    const token = await client.realtime.createTemporaryToken({
      expires_in: 600, // 10 хв
    });
    return NextResponse.json({ token, expiresInSec: 600 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create token";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
