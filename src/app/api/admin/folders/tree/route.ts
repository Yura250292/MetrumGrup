import { NextRequest, NextResponse } from "next/server";
import { requireStaffAccess, unauthorizedResponse } from "@/lib/auth-utils";
import { auth } from "@/lib/auth";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getFolderTree } from "@/lib/folders/queries";
import type { FolderDomain } from "@prisma/client";

const VALID_DOMAINS: FolderDomain[] = ["PROJECT", "ESTIMATE", "FINANCE", "MEETING"];

/**
 * GET /api/admin/folders/tree?domain=PROJECT
 * Returns folders for a domain (flat list). Firm-scoped for the active user:
 * Studio context shows only Studio mirrors, Group context shows system folders too.
 */
export async function GET(request: NextRequest) {
  try {
    await requireStaffAccess();
    const url = new URL(request.url);
    const domain = url.searchParams.get("domain") as FolderDomain | null;

    if (!domain || !VALID_DOMAINS.includes(domain)) {
      return NextResponse.json({ error: "domain is required" }, { status: 400 });
    }

    const session = await auth();
    const { firmId } = await resolveFirmScopeForRequest(session);
    const folders = await getFolderTree(domain, firmId);

    return NextResponse.json({ folders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "Unauthorized") return unauthorizedResponse();
    console.error("[folders/tree] GET error:", err);
    return NextResponse.json({ error: "Помилка сервера" }, { status: 500 });
  }
}
