import { NextRequest, NextResponse } from "next/server";
import type { FormCategory, Prisma } from "@prisma/client";
import {
  requireForeman,
  forbiddenResponse,
  unauthorizedResponse,
} from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const VALID_CATEGORIES: FormCategory[] = [
  "DAILY_REPORT",
  "SAFETY",
  "QUALITY",
  "ACCEPTANCE",
  "KB2V",
  "KB3",
  "CUSTOM",
];

export async function GET(req: NextRequest) {
  let firmId: string | null;
  try {
    ({ firmId } = await requireForeman());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") return forbiddenResponse();
    return unauthorizedResponse();
  }

  const url = new URL(req.url);
  const categoryParam = url.searchParams.get("category");

  const where: Prisma.FormTemplateWhereInput = {
    isActive: true,
    firmId: firmId ?? undefined,
  };
  if (
    categoryParam &&
    VALID_CATEGORIES.includes(categoryParam as FormCategory)
  ) {
    where.category = categoryParam as FormCategory;
  }

  const templates = await prisma.formTemplate.findMany({
    where,
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      version: true,
      updatedAt: true,
    },
  });
  return NextResponse.json({ data: templates });
}
