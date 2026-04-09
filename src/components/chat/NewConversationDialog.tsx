"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, MessageSquare, FolderKanban, Calculator } from "lucide-react";
import { useCreateConversation, useStaffUsers } from "@/hooks/useChat";
import { Button } from "@/components/ui/button";

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Адмін",
  MANAGER: "Менеджер",
  ENGINEER: "Інженер",
  FINANCIER: "Фінансист",
};

type AdminProject = { id: string; title: string; slug: string };
type AdminEstimate = { id: string; number: string; title: string };

export function NewConversationDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"DM" | "PROJECT" | "ESTIMATE">("DM");
  const [projects, setProjects] = useState<AdminProject[] | null>(null);
  const [estimates, setEstimates] = useState<AdminEstimate[] | null>(null);
  const { data: users } = useStaffUsers();
  const createConversation = useCreateConversation();

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open || tab !== "PROJECT" || projects) return;
    fetch("/api/admin/projects")
      .then((r) => r.json())
      .then((d) => setProjects(d.data ?? []))
      .catch(() => setProjects([]));
  }, [open, tab, projects]);

  useEffect(() => {
    if (!open || tab !== "ESTIMATE" || estimates) return;
    fetch("/api/admin/estimates")
      .then((r) => r.json())
      .then((d) => setEstimates(d.data ?? d.estimates ?? []))
      .catch(() => setEstimates([]));
  }, [open, tab, estimates]);

  if (!open) return null;

  const handleCreate = async (
    input:
      | { type: "DM"; userId: string }
      | { type: "PROJECT"; projectId: string }
      | { type: "ESTIMATE"; estimateId: string }
  ) => {
    try {
      const conversation = await createConversation.mutateAsync(input);
      onOpenChange(false);
      router.push(`/admin/chat/${conversation.id}`);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-md rounded-xl border admin-dark:border-white/10 admin-dark:bg-gray-900 admin-light:border-gray-200 admin-light:bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b admin-dark:border-white/10 admin-light:border-gray-200 px-4 py-3">
          <h3 className="text-sm font-bold admin-dark:text-white admin-light:text-gray-900">
            Нова розмова
          </h3>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-lg p-1 admin-dark:hover:bg-white/10 admin-light:hover:bg-gray-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex border-b admin-dark:border-white/10 admin-light:border-gray-200">
          <button
            onClick={() => setTab("DM")}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium ${
              tab === "DM"
                ? "border-b-2 border-blue-500 admin-dark:text-white admin-light:text-gray-900"
                : "admin-dark:text-gray-400 admin-light:text-gray-600"
            }`}
          >
            <MessageSquare className="h-4 w-4" />
            Співробітник
          </button>
          <button
            onClick={() => setTab("PROJECT")}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium ${
              tab === "PROJECT"
                ? "border-b-2 border-blue-500 admin-dark:text-white admin-light:text-gray-900"
                : "admin-dark:text-gray-400 admin-light:text-gray-600"
            }`}
          >
            <FolderKanban className="h-4 w-4" />
            Проєкт
          </button>
          <button
            onClick={() => setTab("ESTIMATE")}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium ${
              tab === "ESTIMATE"
                ? "border-b-2 border-blue-500 admin-dark:text-white admin-light:text-gray-900"
                : "admin-dark:text-gray-400 admin-light:text-gray-600"
            }`}
          >
            <Calculator className="h-4 w-4" />
            Кошторис
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto scrollbar-thin">
          {tab === "DM" && (
            <div>
              {!users && (
                <p className="p-4 text-sm admin-dark:text-gray-500 admin-light:text-gray-500">
                  Завантаження...
                </p>
              )}
              {users?.length === 0 && (
                <p className="p-4 text-sm admin-dark:text-gray-500 admin-light:text-gray-500">
                  Немає інших співробітників
                </p>
              )}
              {users?.map((u) => (
                <button
                  key={u.id}
                  onClick={() => handleCreate({ type: "DM", userId: u.id })}
                  disabled={createConversation.isPending}
                  className="flex w-full items-center gap-3 px-4 py-3 border-b admin-dark:border-white/5 admin-light:border-gray-100 admin-dark:hover:bg-white/5 admin-light:hover:bg-gray-50 disabled:opacity-50"
                >
                  <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white text-sm font-semibold">
                    {u.name?.charAt(0).toUpperCase() ?? "?"}
                  </div>
                  <div className="text-left min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate admin-dark:text-white admin-light:text-gray-900">
                      {u.name}
                    </p>
                    <p className="text-xs admin-dark:text-gray-400 admin-light:text-gray-600">
                      {ROLE_LABELS[u.role] ?? u.role}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
          {tab === "PROJECT" && (
            <div>
              {!projects && (
                <p className="p-4 text-sm admin-dark:text-gray-500 admin-light:text-gray-500">
                  Завантаження...
                </p>
              )}
              {projects?.length === 0 && (
                <p className="p-4 text-sm admin-dark:text-gray-500 admin-light:text-gray-500">
                  Немає проєктів
                </p>
              )}
              {projects?.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleCreate({ type: "PROJECT", projectId: p.id })}
                  disabled={createConversation.isPending}
                  className="flex w-full items-center gap-3 px-4 py-3 border-b admin-dark:border-white/5 admin-light:border-gray-100 admin-dark:hover:bg-white/5 admin-light:hover:bg-gray-50 disabled:opacity-50"
                >
                  <div className="h-9 w-9 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white">
                    <FolderKanban className="h-4 w-4" />
                  </div>
                  <div className="text-left min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate admin-dark:text-white admin-light:text-gray-900">
                      {p.title}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
          {tab === "ESTIMATE" && (
            <div>
              {!estimates && (
                <p className="p-4 text-sm admin-dark:text-gray-500 admin-light:text-gray-500">
                  Завантаження...
                </p>
              )}
              {estimates?.length === 0 && (
                <p className="p-4 text-sm admin-dark:text-gray-500 admin-light:text-gray-500">
                  Немає кошторисів
                </p>
              )}
              {estimates?.map((est) => (
                <button
                  key={est.id}
                  onClick={() => handleCreate({ type: "ESTIMATE", estimateId: est.id })}
                  disabled={createConversation.isPending}
                  className="flex w-full items-center gap-3 px-4 py-3 border-b admin-dark:border-white/5 admin-light:border-gray-100 admin-dark:hover:bg-white/5 admin-light:hover:bg-gray-50 disabled:opacity-50"
                >
                  <div className="h-9 w-9 rounded-full bg-gradient-to-br from-purple-500 to-violet-500 flex items-center justify-center text-white">
                    <Calculator className="h-4 w-4" />
                  </div>
                  <div className="text-left min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate admin-dark:text-white admin-light:text-gray-900">
                      {est.number}: {est.title}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {createConversation.isError && (
          <div className="px-4 py-2 border-t admin-dark:border-white/10 admin-light:border-gray-200">
            <p className="text-xs text-red-500">
              {(createConversation.error as Error)?.message}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
