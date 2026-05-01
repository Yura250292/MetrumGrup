import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { computePivot } from "@/lib/financing/pivot";
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
  const archivedRaw = searchParams.get("archived");

  const projectId =
    projectIdRaw === null
      ? undefined
      : projectIdRaw === "null" || projectIdRaw === ""
        ? null
        : projectIdRaw;
  const folderId = folderIdRaw && folderIdRaw !== "" ? folderIdRaw : undefined;
  const kind = kindRaw === "PLAN" || kindRaw === "FACT" ? kindRaw : undefined;
  const archived = archivedRaw === "true";

  try {
    const { firmId } = await resolveFirmScopeForRequest(session);
    if (!isHomeFirmFor(session, firmId)) return forbiddenResponse();
    const activeRole = getActiveRoleFromSession(session, firmId);
    if (!activeRole || !READ_ROLES.includes(activeRole)) return forbiddenResponse();

    const data = await computePivot({
      from,
      to,
      projectId,
      folderId,
      kind,
      archived,
      firmId,
    });
    return NextResponse.json(data);
  } catch (error) {
    console.error("[financing/pivot] error:", error);
    return NextResponse.json(
      { error: "Помилка обчислення зведеної таблиці" },
      { status: 500 },
    );
  }
}
