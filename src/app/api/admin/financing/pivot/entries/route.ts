import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { listPivotEntries } from "@/lib/financing/pivot-entries";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { isHomeFirmFor, getActiveRoleFromSession } from "@/lib/firm/scope";

export const runtime = "nodejs";

const READ_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER", "HR"];

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { searchParams } = new URL(request.url);

  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const fromRaw = searchParams.get("from");
  const toRaw = searchParams.get("to");
  const from = fromRaw ? new Date(fromRaw) : defaultFrom;
  const to = toRaw ? new Date(toRaw) : defaultTo;

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return NextResponse.json({ error: "Некоректний діапазон дат" }, { status: 400 });
  }
  if (from >= to) {
    return NextResponse.json({ error: "from має бути < to" }, { status: 400 });
  }

  const projectIdRaw = searchParams.get("projectId");
  const folderIdRaw = searchParams.get("folderId");
  const kindRaw = searchParams.get("kind");
  const typeRaw = searchParams.get("type");
  const categoryRaw = searchParams.get("category");
  const subcategoryRaw = searchParams.get("subcategory");
  const archivedRaw = searchParams.get("archived");
  const limitRaw = searchParams.get("limit");
  const offsetRaw = searchParams.get("offset");

  const projectId =
    projectIdRaw === null
      ? undefined
      : projectIdRaw === "null" || projectIdRaw === ""
        ? null
        : projectIdRaw;
  const folderId = folderIdRaw && folderIdRaw !== "" ? folderIdRaw : undefined;
  const kind = kindRaw === "PLAN" || kindRaw === "FACT" ? kindRaw : undefined;
  const type = typeRaw === "INCOME" || typeRaw === "EXPENSE" ? typeRaw : undefined;
  const category = categoryRaw && categoryRaw !== "" ? categoryRaw : undefined;
  // subcategory: present-but-empty → match NULL subcategory; absent → don't filter.
  const subcategory =
    subcategoryRaw === null
      ? undefined
      : subcategoryRaw === ""
        ? null
        : subcategoryRaw;
  const archived = archivedRaw === "true";
  const limit = limitRaw ? Number(limitRaw) : undefined;
  const offset = offsetRaw ? Number(offsetRaw) : undefined;

  try {
    const { firmId } = await resolveFirmScopeForRequest(session);
    if (!isHomeFirmFor(session, firmId)) return forbiddenResponse();
    const activeRole = getActiveRoleFromSession(session, firmId);
    if (!activeRole || !READ_ROLES.includes(activeRole)) return forbiddenResponse();

    const data = await listPivotEntries({
      from,
      to,
      projectId,
      folderId,
      kind,
      type,
      category,
      subcategory,
      archived,
      firmId,
      limit,
      offset,
    });
    return NextResponse.json(data);
  } catch (error) {
    console.error("[financing/pivot/entries] error:", error);
    return NextResponse.json(
      { error: "Помилка вибірки рядків drill-down" },
      { status: 500 },
    );
  }
}
