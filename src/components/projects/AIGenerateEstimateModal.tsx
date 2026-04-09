"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProjectFiles } from "@/hooks/useProjectFiles";
import { useGenerateEstimateFromProject } from "@/hooks/useProjectEstimates";

const PROJECT_TYPES = [
  { value: "ремонт", label: "Ремонт" },
  { value: "новобудова", label: "Новобудова" },
  { value: "реконструкція", label: "Реконструкція" },
];

export function AIGenerateEstimateModal({
  open,
  onOpenChange,
  projectId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
}) {
  const router = useRouter();
  const { data: files } = useProjectFiles(projectId);
  const generate = useGenerateEstimateFromProject(projectId);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [projectType, setProjectType] = useState("ремонт");
  const [notes, setNotes] = useState("");

  // Pre-select all files when opening
  useEffect(() => {
    if (open && files) {
      setSelectedIds(new Set(files.map((f) => f.id)));
    }
  }, [open, files]);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !generate.isPending) onOpenChange(false);
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onOpenChange, generate.isPending]);

  if (!open) return null;

  const toggleFile = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleGenerate = async () => {
    if (selectedIds.size === 0) return;
    try {
      const result = await generate.mutateAsync({
        projectType,
        notes: notes.trim() || undefined,
        selectedFileIds: Array.from(selectedIds),
      });
      onOpenChange(false);
      router.push(`/admin/estimates/${result.estimateId}`);
    } catch (err) {
      console.error(err);
    }
  };

  const hasFiles = files && files.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={() => !generate.isPending && onOpenChange(false)}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl border admin-dark:border-white/10 admin-dark:bg-gray-900 admin-light:border-gray-200 admin-light:bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b admin-dark:border-white/10 admin-light:border-gray-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 admin-dark:text-purple-400 admin-light:text-purple-600" />
            <h3 className="text-sm font-bold admin-dark:text-white admin-light:text-gray-900">
              AI-генерація кошторису з файлів
            </h3>
          </div>
          <button
            onClick={() => !generate.isPending && onOpenChange(false)}
            className="rounded-lg p-1 admin-dark:hover:bg-white/10 admin-light:hover:bg-gray-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!hasFiles ? (
            <p className="text-sm text-center py-6 admin-dark:text-gray-400 admin-light:text-gray-600">
              Спочатку завантажте файли проєкту (фото, креслення, опис) — і AI зможе сформувати кошторис на їх основі.
            </p>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium mb-2 admin-dark:text-gray-300 admin-light:text-gray-700">
                  Тип проєкту
                </label>
                <div className="flex gap-2 flex-wrap">
                  {PROJECT_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setProjectType(t.value)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        projectType === t.value
                          ? "bg-blue-600 text-white"
                          : "admin-dark:bg-white/5 admin-dark:text-gray-300 admin-light:bg-gray-100 admin-light:text-gray-700"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-2 admin-dark:text-gray-300 admin-light:text-gray-700">
                  Файли для аналізу ({selectedIds.size} з {files?.length})
                </label>
                <div className="border admin-dark:border-white/10 admin-light:border-gray-200 rounded-lg max-h-64 overflow-y-auto">
                  {files?.map((f) => (
                    <label
                      key={f.id}
                      className="flex items-center gap-2 px-3 py-2 border-b admin-dark:border-white/5 admin-light:border-gray-100 last:border-b-0 cursor-pointer admin-dark:hover:bg-white/5 admin-light:hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(f.id)}
                        onChange={() => toggleFile(f.id)}
                      />
                      <span className="text-xs admin-dark:text-gray-200 admin-light:text-gray-800 truncate flex-1">
                        {f.name}
                      </span>
                      <span className="text-[10px] admin-dark:text-gray-500 admin-light:text-gray-500">
                        {f.mimeType === "text/plain" ? "опис" : f.mimeType.split("/")[1]}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1 admin-dark:text-gray-300 admin-light:text-gray-700">
                  Додаткові примітки (опціонально)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Особливі вимоги, які треба врахувати..."
                  className="w-full rounded-lg border admin-dark:border-white/10 admin-dark:bg-gray-900/40 admin-dark:text-white admin-light:border-gray-200 admin-light:bg-white admin-light:text-gray-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                />
              </div>
            </>
          )}

          {generate.isError && (
            <p className="text-xs text-red-500">
              {(generate.error as Error)?.message}
            </p>
          )}

          {generate.isPending && (
            <div className="flex items-center gap-2 text-xs admin-dark:text-blue-400 admin-light:text-blue-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              AI обробляє файли... Це може зайняти 1-2 хвилини.
            </div>
          )}
        </div>

        <div className="border-t admin-dark:border-white/10 admin-light:border-gray-200 px-4 py-3 flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={generate.isPending}
          >
            Скасувати
          </Button>
          <Button
            size="sm"
            onClick={handleGenerate}
            disabled={!hasFiles || selectedIds.size === 0 || generate.isPending}
          >
            <Sparkles className="h-4 w-4" />
            {generate.isPending ? "Генерація..." : "Згенерувати"}
          </Button>
        </div>
      </div>
    </div>
  );
}
