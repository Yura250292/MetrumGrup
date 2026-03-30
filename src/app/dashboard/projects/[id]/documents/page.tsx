import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateShort } from "@/lib/utils";
import Link from "next/link";
import { ArrowLeft, FileText, Download, File } from "lucide-react";

const FILE_TYPE_LABELS: Record<string, string> = {
  DOCUMENT: "Документ",
  PLAN: "План",
  COMPLETION_ACT: "Акт",
  ESTIMATE: "Кошторис",
  PHOTO_REPORT: "Фотозвіт",
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const dynamic = 'force-dynamic';

export default async function ProjectDocumentsPage({
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

  const files = await prisma.projectFile.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
    include: {
      uploadedBy: { select: { name: true } },
    },
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

      <h1 className="mb-6 text-2xl font-bold">Документи</h1>

      {files.length > 0 ? (
        <div className="space-y-2">
          {files.map((file) => (
            <Card key={file.id} className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-muted p-2">
                  <File className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary" className="text-[10px]">
                      {FILE_TYPE_LABELS[file.type] || file.type}
                    </Badge>
                    <span>{formatFileSize(file.size)}</span>
                    <span>•</span>
                    <span>{formatDateShort(file.createdAt)}</span>
                    <span>•</span>
                    <span>{file.uploadedBy.name}</span>
                  </div>
                </div>
                <a
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg p-2 hover:bg-muted transition-colors"
                >
                  <Download className="h-4 w-4 text-muted-foreground" />
                </a>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border bg-card p-12 text-center">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-medium">Немає документів</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Документи проєкту з&apos;являться тут.
          </p>
        </div>
      )}
    </div>
  );
}
