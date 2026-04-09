import { prisma } from "@/lib/prisma";

/**
 * Generates an AI estimate from project files (already in R2).
 *
 * Strategy: collect ProjectFile rows with r2Key, build r2Keys JSON,
 * and call the existing /api/admin/estimates/generate endpoint via
 * internal fetch with the caller's session cookie.
 */
export async function generateEstimateFromProjectFiles(opts: {
  projectId: string;
  cookieHeader: string | null;
  projectType?: string;
  notes?: string;
  selectedFileIds?: string[];
}): Promise<{ estimateId: string }> {
  const where = opts.selectedFileIds && opts.selectedFileIds.length > 0
    ? { projectId: opts.projectId, id: { in: opts.selectedFileIds } }
    : { projectId: opts.projectId };

  const files = await prisma.projectFile.findMany({
    where,
    select: {
      id: true,
      name: true,
      r2Key: true,
      mimeType: true,
      textContent: true,
    },
  });

  const r2Files = files
    .filter((f) => f.r2Key !== null)
    .map((f) => ({
      key: f.r2Key as string,
      originalName: f.name,
      mimeType: f.mimeType,
    }));

  const textNotes = files
    .filter((f) => f.textContent !== null)
    .map((f) => `[${f.name}]\n${f.textContent}`)
    .join("\n\n");

  if (r2Files.length === 0 && !textNotes) {
    throw new Error("Немає файлів або текстових описів для генерації");
  }

  const project = await prisma.project.findUnique({
    where: { id: opts.projectId },
    select: { id: true, title: true },
  });
  if (!project) throw new Error("Проєкт не знайдено");

  const formData = new FormData();
  if (r2Files.length > 0) {
    formData.append("r2Keys", JSON.stringify(r2Files));
  }
  formData.append("projectId", opts.projectId);
  formData.append("projectType", opts.projectType ?? "ремонт");

  // Combine user notes and text descriptions from project files
  const combinedNotes = [opts.notes, textNotes].filter(Boolean).join("\n\n");
  if (combinedNotes) {
    formData.append("notes", combinedNotes);
  }

  const baseUrl =
    process.env.NEXTAUTH_URL ||
    process.env.VERCEL_URL ||
    `http://localhost:${process.env.PORT || 3000}`;
  const normalizedBase = baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`;

  const headers: Record<string, string> = {};
  if (opts.cookieHeader) headers["Cookie"] = opts.cookieHeader;

  const res = await fetch(`${normalizedBase}/api/admin/estimates/generate`, {
    method: "POST",
    body: formData,
    headers,
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(`AI генерація не вдалась: ${res.status} ${errorBody.slice(0, 200)}`);
  }

  const result = await res.json();
  const estimateId =
    result?.data?.id ?? result?.estimate?.id ?? result?.estimateId ?? null;

  if (!estimateId) {
    throw new Error("AI генерація не повернула id кошторису");
  }

  return { estimateId };
}
