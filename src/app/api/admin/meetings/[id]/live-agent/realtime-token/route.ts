import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireSuperAdmin,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth-utils";

// POST /api/admin/meetings/[id]/live-agent/realtime-token
// Видає короткоживучий токен (10 хв) для AssemblyAI Universal-Streaming v3.
// Браузер потім підключається напряму до AssemblyAI WebSocket з цим токеном —
// сирий API-ключ ніколи не покидає сервер.
//
// V2 (createTemporaryToken через SDK) deprecated, віддає 404. Звертаємось
// напряму до v3-endpoint: GET streaming.assemblyai.com/v3/token.
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

  try {
    const res = await fetch(
      "https://streaming.assemblyai.com/v3/token?expires_in_seconds=600",
      {
        method: "GET",
        headers: {
          Authorization: process.env.ASSEMBLYAI_API_KEY!,
        },
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return NextResponse.json(
        {
          error: `AssemblyAI v3/token HTTP ${res.status}: ${body.slice(0, 200)}`,
        },
        { status: 502 },
      );
    }
    const data = await res.json();
    const token: string | undefined = data.token;
    if (!token) {
      return NextResponse.json(
        { error: "v3/token відповів без поля token" },
        { status: 502 },
      );
    }
    return NextResponse.json({ token, expiresInSec: 600 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create token";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
