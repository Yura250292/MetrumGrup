import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { PhotoReportCard } from "@/components/dashboard/PhotoReportCard";
import Link from "next/link";
import { ArrowLeft, Camera } from "lucide-react";
import type { PhotoReportWithImages } from "@/types";

export const dynamic = 'force-dynamic';

export default async function ProjectPhotosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");

  const project = await prisma.project.findFirst({
    where: { id, clientId: session.user.id },
    select: { id: true, title: true },
  });

  if (!project) notFound();

  const photoReports = await prisma.photoReport.findMany({
    where: { projectId: id },
    include: {
      images: { orderBy: { sortOrder: "asc" } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <Link
        href={`/dashboard/projects/${id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        {project.title}
      </Link>

      <h1 className="mb-6 text-2xl font-bold">Фотозвіти</h1>

      {photoReports.length > 0 ? (
        <div className="space-y-4">
          {(photoReports as PhotoReportWithImages[]).map((report) => (
            <PhotoReportCard key={report.id} report={report} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border bg-card p-12 text-center">
          <Camera className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-medium">Немає фотозвітів</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Фотозвіти з&apos;являться тут після завантаження менеджером.
          </p>
        </div>
      )}
    </div>
  );
}
