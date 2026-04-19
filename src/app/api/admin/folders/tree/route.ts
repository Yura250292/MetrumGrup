import { NextRequest, NextResponse } from "next/server";
import { requireStaffAccess, unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import type { FolderDomain } from "@prisma/client";

const VALID_DOMAINS: FolderDomain[] = ["PROJECT", "ESTIMATE", "FINANCE"];

/**
 * GET /api/admin/folders/tree?domain=PROJECT
 * Returns ALL folders for a domain in a single query (flat list).
 * Client builds the tree with depth from parentId chain.
 */
export async function GET(request: NextRequest) {
  try {
    await requireStaffAccess();
    const url = new URL(request.url);
    const domain = url.searchParams.get("domain") as FolderDomain | null;

    if (!domain || !VALID_DOMAINS.includes(domain)) {
      return NextResponse.json({ error: "domain is required" }, { status: 400 });
    }

    const folders = await prisma.folder.findMany({
      where: { domain },
      select: { id: true, name: true, parentId: true, sortOrder: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    return NextResponse.json({ folders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "Unauthorized") return unauthorizedResponse();
    console.error("[folders/tree] GET error:", err);
    return NextResponse.json({ error: "Помилка сервера" }, { status: 500 });
  }
}
