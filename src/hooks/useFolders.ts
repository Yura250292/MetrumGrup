"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FolderDomain } from "@prisma/client";

export type FolderItem = {
  id: string;
  name: string;
  color: string | null;
  domain: string;
  parentId: string | null;
  sortOrder: number;
  isSystem: boolean;
  slug: string | null;
  childFolderCount: number;
  itemCount: number;
  finance?: { income: number; expense: number; balance: number };
};

export type BreadcrumbItem = { id: string; name: string };

export type FolderTreeItem = {
  id: string;
  name: string;
  parentId: string | null;
  depth: number;
};

const folderKeys = {
  all: ["folders"] as const,
  list: (domain: string, parentId: string | null) =>
    ["folders", domain, parentId ?? "root"] as const,
  detail: (id: string) => ["folders", "detail", id] as const,
  tree: (domain: string) => ["folders", "tree", domain] as const,
};

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export function useFolders(domain: FolderDomain, parentId: string | null) {
  return useQuery({
    queryKey: folderKeys.list(domain, parentId),
    queryFn: () => {
      const p = parentId ?? "root";
      return jsonFetch<{ folders: FolderItem[] }>(
        `/api/admin/folders?domain=${domain}&parentId=${p}`,
      ).then((d) => d.folders);
    },
  });
}

export function useFolderDetail(folderId: string | null) {
  return useQuery({
    queryKey: folderKeys.detail(folderId ?? ""),
    queryFn: () =>
      jsonFetch<{ folder: FolderItem; breadcrumbs: BreadcrumbItem[] }>(
        `/api/admin/folders/${folderId}`,
      ),
    enabled: !!folderId,
  });
}

export function useCreateFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      domain: FolderDomain;
      name: string;
      parentId?: string | null;
      color?: string | null;
    }) =>
      jsonFetch<{ folder: FolderItem }>("/api/admin/folders", {
        method: "POST",
        body: JSON.stringify(input),
      }).then((d) => d.folder),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: folderKeys.all });
    },
  });
}

export function useUpdateFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      name?: string;
      color?: string | null;
      parentId?: string | null;
    }) =>
      jsonFetch<{ folder: FolderItem }>(`/api/admin/folders/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }).then((d) => d.folder),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: folderKeys.all });
    },
  });
}

export function useDeleteFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      jsonFetch<{ ok: true }>(`/api/admin/folders/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: folderKeys.all });
    },
  });
}

export function useMoveItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      domain: FolderDomain;
      itemIds: string[];
      targetFolderId: string | null;
    }) =>
      jsonFetch<{ count: number }>("/api/admin/folders/move", {
        method: "POST",
        body: JSON.stringify(input),
      }).then((d) => d.count),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: folderKeys.all });
    },
  });
}
