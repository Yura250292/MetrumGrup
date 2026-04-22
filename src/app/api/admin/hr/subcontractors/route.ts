import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";

async function guard() {
  const session = await auth();
  if (!session?.user) return { error: unauthorizedResponse() };
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
    return { error: forbiddenResponse() };
  }
  return { session };
}

const nullableString = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v === "" || v === undefined ? null : v));

const emailField = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v === "" || v === undefined ? null : v))
  .refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
    message: "Невірний email",
  });

const rateTypeEnum = z.enum(["PER_HOUR", "PER_DAY", "PER_MONTH", "PER_SQM", "PER_PIECE"]);

const createSchema = z.object({
  name: z.string().trim().min(1, "ПІБ обовʼязкове"),
  specialty: z.string().trim().min(1, "Спеціальність обовʼязкова"),
  phone: nullableString,
  email: emailField,
  rateType: rateTypeEnum.default("PER_DAY"),
  rateAmount: z.number().nonnegative().optional().nullable(),
  rateUnit: nullableString,
  availableFrom: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? new Date(v) : null)),
  notes: nullableString,
  isActive: z.boolean().default(true),
});

const updateSchema = createSchema.partial().extend({
  id: z.string().min(1),
});

function syncDailyRate(
  rateType: string | undefined,
  rateAmount: number | null | undefined,
): number | null | undefined {
  if (rateType === "PER_DAY" && rateAmount != null) return rateAmount;
  if (rateType && rateType !== "PER_DAY") return null;
  return undefined;
}

export async function GET() {
  const g = await guard();
  if (g.error) return g.error;

  const items = await prisma.worker.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: {
      crewAssignments: {
        where: { endDate: null },
        include: { project: { select: { title: true } } },
        take: 1,
      },
    },
  });
  return NextResponse.json({ data: items });
}

export async function POST(request: NextRequest) {
  const g = await guard();
  if (g.error) return g.error;

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const dailyRate = syncDailyRate(data.rateType, data.rateAmount ?? null);

  const item = await prisma.worker.create({
    data: {
      ...data,
      dailyRate: dailyRate ?? null,
    },
  });
  return NextResponse.json({ data: item }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const g = await guard();
  if (g.error) return g.error;

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { id, ...data } = parsed.data;
  const synced = syncDailyRate(data.rateType, data.rateAmount ?? null);
  const patch: Record<string, unknown> = { ...data };
  if (synced !== undefined) patch.dailyRate = synced;

  const item = await prisma.worker.update({ where: { id }, data: patch });
  return NextResponse.json({ data: item });
}

export async function DELETE(request: NextRequest) {
  const g = await guard();
  if (g.error) return g.error;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Відсутній id" }, { status: 400 });
  }

  await prisma.worker.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
