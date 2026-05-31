import { Home } from "lucide-react";
import { auth } from "@/lib/auth";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getForemanProjects } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { LightShell } from "../../../_components/v2/light-shell";
import { BigTileLight } from "../../../_components/v2/big-tile-light";

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
    : await prisma.folder.findUnique({
        where: { id: folderId },
        select: { id: true, name: true },
      });

  if (!folder) {
    return (
      <LightShell title="Папку не знайдено" backHref="/foreman/report/folder">
        <div className="mt-8 rounded-2xl bg-white border border-slate-200 p-6 text-center text-slate-500">
          Перевірте призначення з менеджером.
        </div>
      </LightShell>
    );
  }

  return (
    <LightShell title={folder.name} backHref="/foreman/report/folder">
      {projects.length === 0 ? (
        <div className="mt-8 rounded-2xl bg-white border border-slate-200 p-6 text-center text-slate-500">
          У цій папці вам не призначено проектів.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 mt-2">
          {projects.map((p, i) => (
            <BigTileLight
              key={p.id}
              href={`/foreman/report/project/${p.id}`}
              title={p.title}
              subtitle={p.address ?? undefined}
              icon={<Home size={18} strokeWidth={2.2} />}
              index={i}
            />
          ))}
        </div>
      )}
    </LightShell>
  );
}
