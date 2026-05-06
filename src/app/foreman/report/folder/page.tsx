import { auth } from "@/lib/auth";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getForemanProjects } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { ForemanShell } from "../../_components/foreman-shell";
import { BigTile } from "../../_components/big-tile";

export const dynamic = "force-dynamic";

export default async function ForemanFolderPickerPage() {
  const session = await auth();
  const { firmId } = await resolveFirmScopeForRequest(session);
  const userId = session!.user.id;

  const projects = await getForemanProjects(userId, firmId);

  // Унікальні folderId з призначених проектів. null = "Без папки".
  const folderIds = Array.from(new Set(projects.map((p) => p.folderId).filter((id): id is string => !!id)));

  const folders = folderIds.length
    ? await prisma.folder.findMany({
        where: { id: { in: folderIds } },
        select: { id: true, name: true, color: true },
        orderBy: { name: "asc" },
      })
    : [];

  const projectsByFolder = new Map<string, number>();
  for (const p of projects) {
    const key = p.folderId ?? "__none__";
    projectsByFolder.set(key, (projectsByFolder.get(key) ?? 0) + 1);
  }

  const orphanCount = projectsByFolder.get("__none__") ?? 0;

  return (
    <ForemanShell title="Оберіть об’єкт" backHref="/foreman">
      {projects.length === 0 ? (
        <div className="mt-8 rounded-2xl bg-zinc-900 border border-zinc-800 p-6 text-center">
          <div className="text-5xl mb-3">📭</div>
          <div className="text-lg font-semibold mb-2">Немає призначень</div>
          <div className="text-sm text-zinc-400">
            Зверніться до менеджера, щоб призначив вас на об{"’"}єкт.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 mt-2">
          {folders.map((f) => (
            <BigTile
              key={f.id}
              href={`/foreman/report/folder/${f.id}`}
              title={f.name}
              icon="📁"
              count={projectsByFolder.get(f.id) ?? 0}
            />
          ))}
          {orphanCount > 0 && (
            <BigTile
              href={`/foreman/report/folder/none`}
              title="Без папки"
              icon="📂"
              count={orphanCount}
            />
          )}
        </div>
      )}
    </ForemanShell>
  );
}
