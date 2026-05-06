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
    <ForemanShell title="Оберіть об’єкт" backHref="/foreman" firmId={firmId}>
      {projects.length === 0 ? (
        <div className="mt-8 rounded-2xl bg-white/[0.03] backdrop-blur-md border border-white/10 p-8 text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
              <rect x="2" y="6" width="20" height="14" rx="2"/>
              <path d="M2 6l10 7 10-7"/>
            </svg>
          </div>
          <div className="text-lg font-semibold mb-2 text-white">Немає призначень</div>
          <div className="text-sm text-zinc-400 leading-relaxed">
            Зверніться до менеджера, щоб призначив вас на об{"’"}єкт.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 mt-2">
          {folders.map((f, i) => (
            <BigTile
              key={f.id}
              href={`/foreman/report/folder/${f.id}`}
              title={f.name}
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-300">
                  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>
                </svg>
              }
              count={projectsByFolder.get(f.id) ?? 0}
              index={i}
            />
          ))}
          {orphanCount > 0 && (
            <BigTile
              href={`/foreman/report/folder/none`}
              title="Без папки"
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
                  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>
                </svg>
              }
              count={orphanCount}
              index={folders.length}
            />
          )}
        </div>
      )}
    </ForemanShell>
  );
}
