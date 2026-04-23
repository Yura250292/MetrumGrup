import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { createScanFromFile, ReceiptScanError } from "@/lib/services/receipt-scan-service";
import { GeminiUnavailableError } from "@/lib/ocr/gemini-client";

export const runtime = "nodejs";
export const maxDuration = 60;

const SCAN_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER"];

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!SCAN_ROLES.includes(session.user.role)) return forbiddenResponse();

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Невалідний multipart" }, { status: 400 });
  }

  const file = formData.get("file");
  const projectId = formData.get("projectId");
  const notesRaw = formData.get("notes");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Файл не надіслано" }, { status: 400 });
  }
  if (typeof projectId !== "string" || !projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await createScanFromFile({
      projectId,
      buffer,
      mimeType: file.type,
      originalName: file.name,
      notes: typeof notesRaw === "string" ? notesRaw : undefined,
      createdById: session.user.id,
      source: "WEB",
    });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    if (err instanceof ReceiptScanError) {
      return NextResponse.json({ error: err.message }, { status: err.statusHint });
    }
    if (err instanceof GeminiUnavailableError) {
      return NextResponse.json({ error: `AI розпізнавання недоступне: ${err.message}` }, { status: 502 });
    }
    console.error("[receipts/scan] error:", err);
    return NextResponse.json({ error: "Не вдалося обробити скан" }, { status: 500 });
  }
}
