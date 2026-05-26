import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { forbiddenResponse, unauthorizedResponse } from "@/lib/auth-utils";
import { getActiveRoleFromSession } from "@/lib/firm/scope";
import { DEFAULT_SLA_HOURS } from "@/lib/rfi/sla";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ firmId: string }> };

export async function GET(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const { firmId } = await ctx.params;
  // Role must be able to view this firm.
  const role = getActiveRoleFromSession(session, firmId);
  if (!role) return forbiddenResponse();

  const sla = await prisma.firmRFISLA.findUnique({ where: { firmId } });
  return NextResponse.json({
    sla: sla ?? {
      firmId,
      hoursLow: DEFAULT_SLA_HOURS.LOW,
      hoursNormal: DEFAULT_SLA_HOURS.NORMAL,
      hoursHigh: DEFAULT_SLA_HOURS.HIGH,
      hoursUrgent: DEFAULT_SLA_HOURS.URGENT,
      isDefault: true,
    },
  });
}

type PatchBody = {
  hoursLow?: number;
  hoursNormal?: number;
  hoursHigh?: number;
  hoursUrgent?: number;
};

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const { firmId } = await ctx.params;
  const role = getActiveRoleFromSession(session, firmId);
  if (role !== "SUPER_ADMIN") return forbiddenResponse();

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const data: PatchBody = {};
  for (const k of ["hoursLow", "hoursNormal", "hoursHigh", "hoursUrgent"] as const) {
    const v = body[k];
    if (v === undefined) continue;
    if (typeof v !== "number" || v <= 0 || v > 24 * 30)
      return NextResponse.json({ error: `${k}-out-of-range` }, { status: 400 });
    data[k] = Math.round(v);
  }

  const sla = await prisma.firmRFISLA.upsert({
    where: { firmId },
    update: data,
    create: {
      firmId,
      hoursLow: data.hoursLow ?? DEFAULT_SLA_HOURS.LOW,
      hoursNormal: data.hoursNormal ?? DEFAULT_SLA_HOURS.NORMAL,
      hoursHigh: data.hoursHigh ?? DEFAULT_SLA_HOURS.HIGH,
      hoursUrgent: data.hoursUrgent ?? DEFAULT_SLA_HOURS.URGENT,
    },
  });
  return NextResponse.json({ sla });
}
