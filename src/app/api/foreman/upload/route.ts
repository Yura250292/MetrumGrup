import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireForeman, forbiddenResponse, unauthorizedResponse } from "@/lib/auth-utils";
import { getForemanPutUrl } from "@/lib/foreman/r2";

export const dynamic = "force-dynamic";

const MAX_SIZE = 20 * 1024 * 1024;

const Body = z.object({
  originalName: z.string().min(1).max(256),
  mimeType: z.string().min(1).max(128),
  size: z.number().int().positive().max(MAX_SIZE),
});

export async function POST(req: NextRequest) {
  let session;
  try {
    ({ session } = await requireForeman());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") return forbiddenResponse();
    return unauthorizedResponse();
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad request", message: "Невалідні параметри" }, { status: 400 });
  }

  try {
    const { key, putUrl } = await getForemanPutUrl({
      userId: session.user.id,
      originalName: parsed.data.originalName,
      mimeType: parsed.data.mimeType,
    });
    return NextResponse.json({ key, putUrl });
  } catch (e) {
    console.error("[foreman/upload] presign failed:", e);
    return NextResponse.json({ error: "Server", message: "Не вдалось отримати посилання на завантаження" }, { status: 500 });
  }
}
