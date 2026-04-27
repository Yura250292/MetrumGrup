import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { z } from "zod";
import {
  forbiddenResponse,
  requireRole,
  unauthorizedResponse,
} from "@/lib/auth-utils";
import { getOversightConfig, setOversightConfig } from "@/lib/chat/oversight";

const updateSchema = z.object({
  roles: z.array(z.nativeEnum(Role)),
  userIds: z.array(z.string().min(1)),
});

function handle(err: unknown) {
  const message = err instanceof Error ? err.message : "Unknown error";
  if (message === "Unauthorized") return unauthorizedResponse();
  if (message === "Forbidden") return forbiddenResponse();
  console.error("[chat/oversight] error:", err);
  return NextResponse.json({ error: "Помилка сервера" }, { status: 500 });
}

export async function GET() {
  try {
    await requireRole(["SUPER_ADMIN"]);
    const config = await getOversightConfig();
    return NextResponse.json({ config });
  } catch (err) {
    return handle(err);
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireRole(["SUPER_ADMIN"]);
    const json = await request.json();
    const parsed = updateSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Невірні дані", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const config = await setOversightConfig(parsed.data);
    return NextResponse.json({ config });
  } catch (err) {
    return handle(err);
  }
}
