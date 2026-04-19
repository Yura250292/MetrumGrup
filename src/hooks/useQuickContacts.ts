"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export type QuickContact = {
  id: string;
  name: string;
  avatar: string | null;
  role: string;
};

export function useQuickContacts() {
  return useQuery({
    queryKey: ["quick-contacts"],
    queryFn: async () => {
      const res = await fetch("/api/admin/profile/quick-contacts");
      if (!res.ok) throw new Error("Failed to load quick contacts");
      const data = await res.json();
      return data.contacts as QuickContact[];
    },
  });
}

export function useSaveQuickContacts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userIds: string[]) => {
      const res = await fetch("/api/admin/profile/quick-contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds }),
      });
      if (!res.ok) throw new Error("Failed to save quick contacts");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quick-contacts"] });
    },
  });
}
