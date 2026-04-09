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

export function useUploadProjectFile(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
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
