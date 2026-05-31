import { Folder, FolderOpen, Mail } from "lucide-react";
import { auth } from "@/lib/auth";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getForemanProjects } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { LightShell } from "../../_components/v2/light-shell";
import { BigTileLight } from "../../_components/v2/big-tile-light";

export const dynamic = "force-dynamic";

export default async function ForemanFolderPickerPage() {
  const session = await auth();
  const { firmId } = await resolveFirmScopeForRequest(session);
  const userId = session!.user.id;

  const projects = await getForemanProjects(userId, firmId);

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

  const projectsByFolder = new Map<string, number>();
  for (const p of projects) {
    const key = p.folderId ?? "__none__";
    projectsByFolder.set(key, (projectsByFolder.get(key) ?? 0) + 1);
  }
  const orphanCount = projectsByFolder.get("__none__") ?? 0;

  return (
    <LightShell title="Оберіть обʼєкт" backHref="/foreman">
      {projects.length === 0 ? (
        <div className="mt-8 rounded-2xl bg-white border border-slate-200 p-6 text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
            <Mail size={22} className="text-slate-500" />
          </div>
          <div className="text-base font-semibold text-slate-700 mb-1">Немає призначень</div>
          <div className="text-sm text-slate-500 leading-relaxed">
            Зверніться до менеджера, щоб призначив вас на об{"’"}єкт.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 mt-2">
          {folders.map((f, i) => (
            <BigTileLight
              key={f.id}
              href={`/foreman/report/folder/${f.id}`}
              title={f.name}
              icon={<Folder size={18} strokeWidth={2.2} />}
              count={projectsByFolder.get(f.id) ?? 0}
              index={i}
            />
          ))}
          {orphanCount > 0 && (
            <BigTileLight
              href={`/foreman/report/folder/none`}
              title="Без папки"
              icon={<FolderOpen size={18} strokeWidth={2.2} />}
              count={orphanCount}
              index={folders.length}
            />
          )}
        </div>
      )}
    </LightShell>
  );
}
