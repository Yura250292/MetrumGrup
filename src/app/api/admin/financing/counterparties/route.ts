import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";

export const runtime = "nodejs";

// Finance-scoped read access — also picks up engineers for read-only.
const READ_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER", "HR"];
// Autocreate is restricted to staff who actively log finance ops.
const WRITE_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "HR"];

const querySchema = z.object({
  q: z.string().trim().optional(),
  type: z.enum(["LEGAL", "INDIVIDUAL", "FOP"]).optional(),
  includeInactive: z.coerce.boolean().default(false),
  take: z.coerce.number().int().positive().max(500).default(50),
});

const createSchema = z.object({
  name: z.string().trim().min(1, "Назва обовʼязкова"),
  type: z.enum(["LEGAL", "INDIVIDUAL", "FOP"]).default("LEGAL"),
  edrpou: z.string().trim().optional().nullable(),
  iban: z.string().trim().optional().nullable(),
  vatPayer: z.boolean().default(false),
  taxId: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  email: z.string().trim().email().optional().nullable(),
  address: z.string().trim().optional().nullable(),
});

function normaliseName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!READ_ROLES.includes(session.user.role)) return forbiddenResponse();

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні параметри", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { q, type, includeInactive, take } = parsed.data;

  const items = await prisma.counterparty.findMany({
    where: {
      ...(includeInactive ? {} : { isActive: true }),
      ...(type ? { type } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { edrpou: { contains: q, mode: "insensitive" } },
              { taxId: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    take,
  });

  return NextResponse.json({ data: items });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!WRITE_ROLES.includes(session.user.role)) return forbiddenResponse();

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const name = normaliseName(data.name);

  // Idempotent autocreate — case-insensitive lookup before insert.
  const existing = await prisma.counterparty.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    orderBy: { isActive: "desc" },
  });
  if (existing) {
    return NextResponse.json({ data: existing }, { status: 200 });
  }

  const created = await prisma.counterparty.create({
    data: {
      name,
      type: data.type,
      edrpou: data.edrpou ?? null,
      iban: data.iban ?? null,
      vatPayer: data.vatPayer,
      taxId: data.taxId ?? null,
      phone: data.phone ?? null,
      email: data.email ?? null,
      address: data.address ?? null,
      isActive: true,
    },
  });
  return NextResponse.json({ data: created }, { status: 201 });
}
