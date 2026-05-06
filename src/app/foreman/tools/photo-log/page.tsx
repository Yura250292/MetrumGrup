import { auth } from "@/lib/auth";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getForemanProjects } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { ForemanShell } from "../../_components/foreman-shell";
import { PhotoLogTool } from "./_tool";

export const dynamic = "force-dynamic";

export default async function ForemanPhotoLogPage() {
  const session = await auth();
  const { firmId } = await resolveFirmScopeForRequest(session);
  const userId = session!.user.id;

  const projects = await getForemanProjects(userId, firmId);

  // Resolve folder names for picker
  const folderIds = Array.from(
    new Set(projects.map((p) => p.folderId).filter((id): id is string => !!id)),
  );
  const folders = folderIds.length
    ? await prisma.folder.findMany({
        where: { id: { in: folderIds } },
        select: { id: true, name: true },
      })
    : [];
  const folderMap = new Map(folders.map((f) => [f.id, f.name]));

  const projectOptions = projects.map((p) => ({
    id: p.id,
    title: p.title,
    folderName: p.folderId ? folderMap.get(p.folderId) ?? null : null,
  }));

  return (
    <ForemanShell title="Фотолог" backHref="/foreman" firmId={firmId}>
      <PhotoLogTool projects={projectOptions} />
    </ForemanShell>
  );
}
