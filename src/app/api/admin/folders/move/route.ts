import { NextRequest, NextResponse } from "next/server";
import { requireStaffAccess, unauthorizedResponse } from "@/lib/auth-utils";
import { moveItems } from "@/lib/folders/actions";
import type { FolderDomain } from "@prisma/client";

const VALID_DOMAINS: FolderDomain[] = ["PROJECT", "ESTIMATE", "FINANCE", "MEETING"];

export async function POST(request: NextRequest) {
  try {
    await requireStaffAccess();
    const body = await request.json();
    const { domain, itemIds, targetFolderId } = body;

    if (!domain || !VALID_DOMAINS.includes(domain)) {
      return NextResponse.json({ error: "domain is required" }, { status: 400 });
    }
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return NextResponse.json({ error: "itemIds is required" }, { status: 400 });
    }

    const result = await moveItems({
      domain,
      itemIds,
      targetFolderId: targetFolderId ?? null,
    });

    return NextResponse.json({ count: result.count });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "Unauthorized") return unauthorizedResponse();
    if (msg === "Цільова папка не знайдена") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[folders/move] POST error:", err);
    return NextResponse.json({ error: "Помилка сервера" }, { status: 500 });
  }
}
