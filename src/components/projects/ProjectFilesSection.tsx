"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Image as ImageIcon,
  StickyNote,
  Trash2,
  Plus,
  Folder,
  Sparkles,
  Download,
  X,
  Loader2,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  useDeleteProjectFile,
  useDownloadFilesZip,
  useProjectFiles,
  type ProjectFileDTO,
} from "@/hooks/useProjectFiles";
import { UploadDropZone } from "./UploadDropZone";
import { AddTextNoteModal } from "./AddTextNoteModal";

const ADMIN_ROLES = ["SUPER_ADMIN", "MANAGER"];

function fileIcon(file: ProjectFileDTO) {
  if (file.mimeType === "text/plain") return StickyNote;
  if (file.mimeType.startsWith("image/")) return ImageIcon;
  return FileText;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ProjectFilesSection({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { data: session } = useSession();
  const { data: files, isLoading, error } = useProjectFiles(projectId);
  const deleteFile = useDeleteProjectFile(projectId);
  const downloadZip = useDownloadFilesZip(projectId);
  const [textModalOpen, setTextModalOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<ProjectFileDTO | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);

  const currentUserId = session?.user?.id;
  const isAdmin = session?.user?.role && ADMIN_ROLES.includes(session.user.role);

  // Скинути виділення якщо файл був видалений в іншому місці.
  const validSelectedIds = useMemo(() => {
    if (!files) return new Set<string>();
    const fileIds = new Set(files.map((f) => f.id));
    return new Set([...selectedIds].filter((id) => fileIds.has(id)));
  }, [files, selectedIds]);
  const selectedCount = validSelectedIds.size;
  const allSelected = !!files && files.length > 0 && selectedCount === files.length;

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (!files) return;
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(files.map((f) => f.id)));
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleGenerateAi = () => {
    if (!files) return;
    // Зберегти метадані вибраних файлів у sessionStorage,
    // контролер AI кошторису підхопить їх при ініціалізації.
    const selectedFiles = files.filter((f) => validSelectedIds.has(f.id));
    const payload = selectedFiles.map((f) => ({
      name: f.name,
      url: f.url,
      r2Key: f.r2Key,
      size: f.size,
      mimeType: f.mimeType,
    }));
    try {
      sessionStorage.setItem("ai-estimate-project-files", JSON.stringify(payload));
    } catch { /* ignore quota errors */ }
    router.push(`/ai-estimate-v2?projectId=${projectId}`);
  };

  const handleDownloadZip = async () => {
    setActionError(null);
    try {
      await downloadZip.mutateAsync({ fileIds: [...validSelectedIds] });
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  const handleClickFile = (file: ProjectFileDTO) => {
    if (file.mimeType === "text/plain") {
      setPreviewFile(file);
    } else {
      window.open(file.url, "_blank", "noopener,noreferrer");
    }
  };

  const handleDelete = (file: ProjectFileDTO) => {
    if (!confirm(`Видалити файл "${file.name}"?`)) return;
    deleteFile.mutate(file.id);
  };

  return (
    <div className="rounded-xl border admin-dark:border-white/10 admin-light:border-gray-200 admin-dark:bg-gray-900/40 admin-light:bg-white p-4">
      <div className="mb-4 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Folder className="h-5 w-5 admin-dark:text-gray-400 admin-light:text-gray-600" />
          <h3 className="text-base font-bold admin-dark:text-white admin-light:text-gray-900">
            Файли проєкту
          </h3>
          {files && (
            <span className="text-xs admin-dark:text-gray-500 admin-light:text-gray-500">
              ({files.length})
            </span>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => setTextModalOpen(true)}>
          <Plus className="h-4 w-4" />
          Текстовий опис
        </Button>
      </div>

      <UploadDropZone projectId={projectId} />

      {selectedCount > 0 && (
        <div
          className="mt-4 flex items-center gap-2 flex-wrap rounded-lg border border-blue-500/40 admin-dark:bg-blue-500/10 admin-light:bg-blue-50 px-3 py-2"
          role="toolbar"
          aria-label="Дії з вибраними файлами"
        >
          <span className="text-sm font-semibold admin-dark:text-blue-200 admin-light:text-blue-900">
            Вибрано: {selectedCount}
          </span>
          <button
            type="button"
            onClick={clearSelection}
            className="text-xs admin-dark:text-blue-300 admin-light:text-blue-700 hover:underline flex items-center gap-1"
            title="Зняти виділення"
          >
            <X className="h-3 w-3" />
            Зняти
          </button>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="outline"
            onClick={handleDownloadZip}
            disabled={downloadZip.isPending}
          >
            {downloadZip.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Завантажити (ZIP)
          </Button>
          <Button
            size="sm"
            onClick={handleGenerateAi}
          >
            <Sparkles className="h-4 w-4" />
            AI кошторис
          </Button>
        </div>
      )}

      {actionError && (
        <p className="mt-2 text-xs text-red-500">Помилка: {actionError}</p>
      )}

      <div className="mt-4 space-y-2">
        {isLoading && (
          <p className="text-sm admin-dark:text-gray-500 admin-light:text-gray-500">
            Завантаження...
          </p>
        )}
        {error && (
          <p className="text-sm text-red-500">
            Помилка: {(error as Error).message}
          </p>
        )}
        {!isLoading && files?.length === 0 && (
          <p className="text-sm text-center py-4 admin-dark:text-gray-500 admin-light:text-gray-500">
            Поки немає файлів. Завантажте перший — він буде доступний для AI генерації кошторису.
          </p>
        )}
        {!isLoading && files && files.length > 0 && (
          <label className="flex items-center gap-2 px-2 py-1 text-xs admin-dark:text-gray-400 admin-light:text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="h-4 w-4 accent-blue-600"
            />
            {allSelected ? "Зняти всі" : "Виділити всі"}
          </label>
        )}
        {files?.map((file) => {
          const Icon = fileIcon(file);
          const canDelete = file.uploadedBy.id === currentUserId || isAdmin;
          const isSelected = validSelectedIds.has(file.id);
          return (
            <div
              key={file.id}
              className={`flex items-center gap-3 rounded-lg border admin-dark:bg-gray-900/40 admin-light:bg-white p-3 group ${
                isSelected
                  ? "border-blue-500/60 admin-dark:bg-blue-500/5 admin-light:bg-blue-50/40"
                  : "admin-dark:border-white/5 admin-light:border-gray-100"
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleOne(file.id)}
                onClick={(e) => e.stopPropagation()}
                className="h-4 w-4 accent-blue-600 flex-shrink-0"
                aria-label={`Вибрати ${file.name}`}
              />
              <button
                type="button"
                onClick={() => handleClickFile(file)}
                className="flex items-center gap-3 flex-1 min-w-0 text-left"
              >
                <div
                  className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    file.mimeType === "text/plain"
                      ? "bg-gradient-to-br from-amber-500 to-orange-500"
                      : file.mimeType.startsWith("image/")
                      ? "bg-gradient-to-br from-blue-500 to-cyan-500"
                      : "bg-gradient-to-br from-purple-500 to-violet-500"
                  } text-white`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate admin-dark:text-white admin-light:text-gray-900">
                    {file.name}
                  </p>
                  <p className="text-[11px] admin-dark:text-gray-500 admin-light:text-gray-500">
                    {file.mimeType === "text/plain" ? "опис" : formatBytes(file.size)} •{" "}
                    {file.uploadedBy.name} • {formatDate(file.createdAt)}
                  </p>
                </div>
              </button>
              {canDelete && (
                <button
                  type="button"
                  onClick={() => handleDelete(file)}
                  disabled={deleteFile.isPending}
                  className="opacity-0 group-hover:opacity-100 transition-opacity rounded p-1.5 admin-dark:hover:bg-white/10 admin-light:hover:bg-gray-100"
                  title="Видалити"
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <AddTextNoteModal
        open={textModalOpen}
        onOpenChange={setTextModalOpen}
        projectId={projectId}
      />

      {/* Text preview modal */}
      {previewFile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setPreviewFile(null)}
        >
          <div
            className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-xl border admin-dark:border-white/10 admin-dark:bg-gray-900 admin-light:border-gray-200 admin-light:bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b admin-dark:border-white/10 admin-light:border-gray-200 px-4 py-3">
              <h3 className="text-sm font-bold admin-dark:text-white admin-light:text-gray-900">
                {previewFile.name}
              </h3>
              <p className="text-[11px] admin-dark:text-gray-500 admin-light:text-gray-500">
                {previewFile.uploadedBy.name} • {formatDate(previewFile.createdAt)}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <pre className="whitespace-pre-wrap text-sm admin-dark:text-gray-200 admin-light:text-gray-800 font-sans">
                {previewFile.textContent}
              </pre>
            </div>
            <div className="border-t admin-dark:border-white/10 admin-light:border-gray-200 px-4 py-3 flex justify-end">
              <Button size="sm" onClick={() => setPreviewFile(null)}>
                Закрити
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
