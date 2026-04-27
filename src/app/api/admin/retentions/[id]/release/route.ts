import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { releaseRetention, KB2Error } from "@/lib/financing/kb2-service";

export const runtime = "nodejs";

const WRITE_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER"];

const schema = z.object({
  occurredAt: z.string().optional(),
  status: z.enum(["APPROVED", "PAID"]).default("APPROVED"),
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
    const result = await releaseRetention(id, session.user.id, {
      occurredAt: parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : undefined,
      status: parsed.data.status,
    });
    return NextResponse.json({ data: result });
  } catch (e) {
    if (e instanceof KB2Error) {
      return NextResponse.json({ error: e.message }, { status: e.statusHint });
    }
    console.error("[retention/release] error:", e);
    return NextResponse.json({ error: "Помилка релізу утримання" }, { status: 500 });
  }
}
