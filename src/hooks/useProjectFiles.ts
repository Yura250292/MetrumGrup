"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type ProjectFileDTO = {
  id: string;
  type: string;
  name: string;
  url: string;
  r2Key: string | null;
  textContent: string | null;
  size: number;
  mimeType: string;
  createdAt: string;
  uploadedBy: { id: string; name: string };
};

const projectFilesKey = (projectId: string) => ["project", projectId, "files"] as const;

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export function useProjectFiles(projectId: string) {
  return useQuery({
    queryKey: projectFilesKey(projectId),
    queryFn: () =>
      jsonFetch<{ files: ProjectFileDTO[] }>(`/api/admin/projects/${projectId}/files`).then(
        (d) => d.files
      ),
    enabled: !!projectId,
    refetchOnWindowFocus: true,
  });
}

// Поріг, після якого замість multipart-аплоаду на наш роут йдемо
// presigned URL → PUT прямо в R2 (обхід Vercel ~4.5 МБ ліміту тіла запиту).
// 3.5 МБ — щоб мати запас на оверхед multipart-обгортки.
const DIRECT_UPLOAD_THRESHOLD = 3.5 * 1024 * 1024;

export function useUploadProjectFile(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      // Малі файли — простий multipart через наш API route.
      if (file.size <= DIRECT_UPLOAD_THRESHOLD) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(`/api/admin/projects/${projectId}/files`, {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Upload failed: ${res.status}`);
        }
        return (await res.json()).file as ProjectFileDTO;
      }

      // Великі файли: 1) presigned URL, 2) PUT напряму в R2, 3) реєстрація в БД.
      const presignedRes = await fetch(
        `/api/admin/projects/${projectId}/files/presigned-url`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            files: [
              { name: file.name, type: file.type || "application/octet-stream", size: file.size },
            ],
          }),
        },
      );
      if (!presignedRes.ok) {
        const body = await presignedRes.json().catch(() => ({}));
        throw new Error(body.error ?? "Не вдалось отримати presigned URL");
      }
      const { presignedUrls } = (await presignedRes.json()) as {
        presignedUrls: Array<{ uploadUrl: string; key: string }>;
      };
      const presigned = presignedUrls?.[0];
      if (!presigned) throw new Error("Бекенд не повернув presigned URL");

      const putRes = await fetch(presigned.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!putRes.ok) {
        throw new Error(`Помилка завантаження в R2: ${putRes.status}`);
      }

      const registerRes = await fetch(`/api/admin/projects/${projectId}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          r2Key: presigned.key,
          name: file.name,
          size: file.size,
          mimeType: file.type || "application/octet-stream",
        }),
      });
      if (!registerRes.ok) {
        const body = await registerRes.json().catch(() => ({}));
        throw new Error(body.error ?? "Не вдалось зареєструвати файл у БД");
      }
      return (await registerRes.json()).file as ProjectFileDTO;
    },
    onSuccess: (newFile) => {
      qc.setQueryData<ProjectFileDTO[]>(projectFilesKey(projectId), (prev) =>
        prev ? [newFile, ...prev] : [newFile]
      );
    },
  });
}

export function useCreateTextNote(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { title: string; text: string }) =>
      jsonFetch<{ file: ProjectFileDTO }>(`/api/admin/projects/${projectId}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }).then((d) => d.file),
    onSuccess: (newFile) => {
      qc.setQueryData<ProjectFileDTO[]>(projectFilesKey(projectId), (prev) =>
        prev ? [newFile, ...prev] : [newFile]
      );
    },
  });
}

export function useDeleteProjectFile(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fileId: string) =>
      jsonFetch<{ ok: true }>(`/api/admin/projects/${projectId}/files/${fileId}`, {
        method: "DELETE",
      }),
    onSuccess: (_data, fileId) => {
      qc.setQueryData<ProjectFileDTO[]>(projectFilesKey(projectId), (prev) =>
        prev ? prev.filter((f) => f.id !== fileId) : prev
      );
    },
  });
}

/**
 * Згенерувати AI кошторис з вибраних файлів проекту.
 * Бекенд (generateEstimateFromProjectFiles) уже вміє приймати selectedFileIds.
 */
export function useGenerateEstimateFromFiles(projectId: string) {
  return useMutation({
    mutationFn: (input: {
      selectedFileIds: string[];
      projectType?: string;
      notes?: string;
    }) =>
      jsonFetch<{ estimateId: string }>(
        `/api/admin/projects/${projectId}/generate-estimate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      ),
  });
}

/**
 * Завантажити вибрані файли проекту як ZIP-архів.
 * Повертає Blob, який далі сейвиться як файл через створення тимчасової URL.
 */
export function useDownloadFilesZip(projectId: string) {
  return useMutation({
    mutationFn: async (input: { fileIds: string[]; archiveName?: string }) => {
      const res = await fetch(`/api/admin/projects/${projectId}/files/zip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds: input.fileIds }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Download failed: ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = input.archiveName ?? `project-${projectId}-files.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return { ok: true as const };
    },
  });
}
