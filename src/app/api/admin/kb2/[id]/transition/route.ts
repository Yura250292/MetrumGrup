import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import {
  cancelKB2Form,
  issueKB2Form,
  signKB2Form,
  KB2Error,
} from "@/lib/financing/kb2-service";

export const runtime = "nodejs";

const WRITE_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER"];

const schema = z.object({
  action: z.enum(["issue", "sign", "cancel"]),
  signedAt: z.string().optional(),
  retentionReleaseDate: z.string().optional(),
  reason: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!WRITE_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    let result;
    switch (parsed.data.action) {
      case "issue":
        result = await issueKB2Form(id, session.user.id);
        break;
      case "sign":
        result = await signKB2Form(id, session.user.id, {
          signedAt: parsed.data.signedAt ? new Date(parsed.data.signedAt) : undefined,
          retentionReleaseDate: parsed.data.retentionReleaseDate
            ? new Date(parsed.data.retentionReleaseDate)
            : undefined,
        });
        break;
      case "cancel":
        result = await cancelKB2Form(id, session.user.id, parsed.data.reason);
        break;
    }
    return NextResponse.json({ data: result });
  } catch (e) {
    if (e instanceof KB2Error) {
      return NextResponse.json({ error: e.message }, { status: e.statusHint });
    }
    console.error("[kb2/transition] error:", e);
    return NextResponse.json({ error: "Помилка переходу статусу" }, { status: 500 });
  }
}
