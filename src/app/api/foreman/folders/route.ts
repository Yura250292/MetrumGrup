import { NextResponse } from "next/server";
import { requireForeman, getForemanProjects, forbiddenResponse, unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  let session, firmId;
  try {
    ({ session, firmId } = await requireForeman());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") return forbiddenResponse();
    return unauthorizedResponse();
  }

  const projects = await getForemanProjects(session.user.id, firmId);
  const folderIds = Array.from(
    new Set(projects.map((p) => p.folderId).filter((id): id is string => !!id)),
  );

  const folders = folderIds.length
    ? await prisma.folder.findMany({
        where: { id: { in: folderIds } },
        select: { id: true, name: true, color: true },
        orderBy: { name: "asc" },
      })
    : [];

  const counts = new Map<string, number>();
  for (const p of projects) {
    const k = p.folderId ?? "__none__";
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  return NextResponse.json({
    folders: folders.map((f) => ({ ...f, projectCount: counts.get(f.id) ?? 0 })),
    orphanCount: counts.get("__none__") ?? 0,
  });
}
