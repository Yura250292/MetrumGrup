import { NextRequest, NextResponse } from "next/server";
import { requireStaffAccess, unauthorizedResponse } from "@/lib/auth-utils";
import { listFolders } from "@/lib/folders/queries";
import { createFolder, MIRROR_FOLDER_EDIT_ERROR } from "@/lib/folders/actions";
import type { FolderDomain } from "@prisma/client";
import { auth } from "@/lib/auth";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";

const VALID_DOMAINS: FolderDomain[] = ["PROJECT", "ESTIMATE", "FINANCE", "MEETING"];

export async function GET(request: NextRequest) {
  try {
    await requireStaffAccess();
    const url = new URL(request.url);
    const domain = url.searchParams.get("domain") as FolderDomain | null;
    const parentIdRaw = url.searchParams.get("parentId");

    if (!domain || !VALID_DOMAINS.includes(domain)) {
      return NextResponse.json({ error: "domain is required" }, { status: 400 });
    }

    const parentId = parentIdRaw === "root" || !parentIdRaw ? null : parentIdRaw;
    const session = await auth();
    const { firmId } = await resolveFirmScopeForRequest(session);
    const folders = await listFolders(domain, parentId, firmId);
    return NextResponse.json({ folders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "Unauthorized") return unauthorizedResponse();
    console.error("[folders] GET error:", err);
    return NextResponse.json({ error: "Помилка сервера" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireStaffAccess();
    const body = await request.json();
    const { domain, name, parentId, color } = body;

    if (!domain || !VALID_DOMAINS.includes(domain)) {
      return NextResponse.json({ error: "domain is required" }, { status: 400 });
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Назва обов'язкова" }, { status: 400 });
    }

    const folder = await createFolder({
      domain,
      name: name.trim(),
      parentId: parentId ?? null,
      color: color ?? null,
    });

    return NextResponse.json({ folder }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "Unauthorized") return unauthorizedResponse();
    if (msg === "Батьківська папка не знайдена" || msg === MIRROR_FOLDER_EDIT_ERROR) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    // Unique constraint violation
    if (msg.includes("Unique constraint")) {
      return NextResponse.json(
        { error: "Папка з такою назвою вже існує" },
        { status: 409 },
      );
    }
    console.error("[folders] POST error:", err);
    return NextResponse.json({ error: "Помилка сервера" }, { status: 500 });
  }
}
