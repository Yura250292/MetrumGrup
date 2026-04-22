import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";

async function guard() {
  const session = await auth();
  if (!session?.user) return { error: unauthorizedResponse() };
  if (!["SUPER_ADMIN", "MANAGER", "HR"].includes(session.user.role)) {
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

const createSchema = z.object({
  name: z.string().trim().min(1, "Назва обовʼязкова"),
  type: z.enum(["LEGAL", "INDIVIDUAL", "FOP"]).default("LEGAL"),
  taxId: nullableString,
  phone: nullableString,
  email: emailField,
  address: nullableString,
  notes: nullableString,
  isActive: z.boolean().default(true),
});

const updateSchema = createSchema.partial().extend({
  id: z.string().min(1),
});

export async function GET() {
  const g = await guard();
  if (g.error) return g.error;

  const items = await prisma.counterparty.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
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

  const item = await prisma.counterparty.create({ data: parsed.data });
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
  const item = await prisma.counterparty.update({ where: { id }, data });
  return NextResponse.json({ data: item });
}

export async function DELETE(request: NextRequest) {
  const g = await guard();
  if (g.error) return g.error;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Відсутній id" }, { status: 400 });
  }

  await prisma.counterparty.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
