import { NextRequest, NextResponse } from "next/server";
import { requireStaffAccess, unauthorizedResponse } from "@/lib/auth-utils";
import { getFolderBreadcrumbs } from "@/lib/folders/queries";
import {
  updateFolder,
  deleteFolder,
  SYSTEM_FOLDER_RENAME_ERROR,
  SYSTEM_FOLDER_MOVE_ERROR,
  SYSTEM_FOLDER_DELETE_ERROR,
  MIRROR_FOLDER_EDIT_ERROR,
  MIRROR_FOLDER_DELETE_ERROR,
  FOLDER_CYCLE_ERROR,
} from "@/lib/folders/actions";
import { prisma } from "@/lib/prisma";

const BUSINESS_RULE_ERRORS = new Set<string>([
  SYSTEM_FOLDER_RENAME_ERROR,
  SYSTEM_FOLDER_MOVE_ERROR,
  SYSTEM_FOLDER_DELETE_ERROR,
  MIRROR_FOLDER_EDIT_ERROR,
  MIRROR_FOLDER_DELETE_ERROR,
  FOLDER_CYCLE_ERROR,
]);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireStaffAccess();
    const { id } = await params;

    const folder = await prisma.folder.findUnique({ where: { id } });
    if (!folder) {
      return NextResponse.json({ error: "Папку не знайдено" }, { status: 404 });
    }

    const breadcrumbs = await getFolderBreadcrumbs(id);
    return NextResponse.json({ folder, breadcrumbs });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "Unauthorized") return unauthorizedResponse();
    console.error("[folders/id] GET error:", err);
    return NextResponse.json({ error: "Помилка сервера" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireStaffAccess();
    const { id } = await params;
    const body = await request.json();

    const folder = await updateFolder(
      id,
      {
        name: body.name,
        color: body.color,
        parentId: body.parentId,
        sortOrder: body.sortOrder,
      },
      { allowSystemBypass: session.user.role === "SUPER_ADMIN" },
    );

    return NextResponse.json({ folder });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "Unauthorized") return unauthorizedResponse();
    if (BUSINESS_RULE_ERRORS.has(msg)) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (msg.includes("Unique constraint")) {
      return NextResponse.json(
        { error: "Папка з такою назвою вже існує" },
        { status: 409 },
      );
    }
    console.error("[folders/id] PATCH error:", err);
    return NextResponse.json({ error: "Помилка сервера" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireStaffAccess();
    const { id } = await params;

    await deleteFolder(id, {
      allowSystemBypass: session.user.role === "SUPER_ADMIN",
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "Unauthorized") return unauthorizedResponse();
    if (BUSINESS_RULE_ERRORS.has(msg)) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[folders/id] DELETE error:", err);
    return NextResponse.json({ error: "Помилка сервера" }, { status: 500 });
  }
}
