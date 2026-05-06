import { auth } from "@/lib/auth";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getForemanProjects } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { ForemanShell } from "../../../_components/foreman-shell";
import { BigTile } from "../../../_components/big-tile";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ folderId: string }>;
}

export default async function ForemanProjectPickerPage({ params }: PageProps) {
  const { folderId } = await params;
  const session = await auth();
  const { firmId } = await resolveFirmScopeForRequest(session);
  const userId = session!.user.id;

  const allProjects = await getForemanProjects(userId, firmId);

  const isNone = folderId === "none";
  const projects = isNone
    ? allProjects.filter((p) => !p.folderId)
    : allProjects.filter((p) => p.folderId === folderId);

  const folder = isNone
    ? { id: "none", name: "Без папки" }
    : await prisma.folder.findUnique({ where: { id: folderId }, select: { id: true, name: true } });

  if (!folder) {
    return (
      <ForemanShell title="Папку не знайдено" backHref="/foreman/report/folder">
        <div className="mt-8 rounded-2xl bg-zinc-900 border border-zinc-800 p-6 text-center text-zinc-400">
          Перевірте призначення з менеджером.
        </div>
      </ForemanShell>
    );
  }

  return (
    <ForemanShell title={folder.name} backHref="/foreman/report/folder" firmId={firmId}>
      {projects.length === 0 ? (
        <div className="mt-8 rounded-2xl bg-white/[0.03] backdrop-blur-md border border-white/10 p-6 text-center text-zinc-400">
          У цій папці вам не призначено проектів.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 mt-2">
          {projects.map((p, i) => (
            <BigTile
              key={p.id}
              href={`/foreman/report/project/${p.id}`}
              title={p.title}
              subtitle={p.address ?? undefined}
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-300">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z"/>
                  <path d="M9 22V12h6v10"/>
                </svg>
              }
              index={i}
            />
          ))}
        </div>
      )}
    </ForemanShell>
  );
}
