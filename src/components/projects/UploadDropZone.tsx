"use client";

import { useState, useRef, DragEvent, ChangeEvent } from "react";
import { Upload, Loader2 } from "lucide-react";
import { useUploadProjectFile } from "@/hooks/useProjectFiles";

export function UploadDropZone({ projectId }: { projectId: string }) {
  const [dragOver, setDragOver] = useState(false);
  const [uploadingNames, setUploadingNames] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadProjectFile(projectId);

  const handleFiles = async (files: FileList) => {
    setError(null);
    const list = Array.from(files);
    setUploadingNames((prev) => [...prev, ...list.map((f) => f.name)]);

    for (const file of list) {
      try {
        await upload.mutateAsync(file);
      } catch (err) {
        setError(`${file.name}: ${(err as Error).message}`);
      } finally {
        setUploadingNames((prev) => prev.filter((n) => n !== file.name));
      }
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
    e.target.value = "";
  };

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed cursor-pointer transition-colors p-6 ${
          dragOver
            ? "border-blue-500 admin-dark:bg-blue-500/10 admin-light:bg-blue-50"
            : "admin-dark:border-white/10 admin-dark:hover:border-white/20 admin-light:border-gray-300 admin-light:hover:border-gray-400"
        }`}
      >
        <Upload className="h-8 w-8 admin-dark:text-gray-500 admin-light:text-gray-400" />
        <p className="text-sm font-medium admin-dark:text-gray-300 admin-light:text-gray-700">
          Перетягніть файли сюди або клікніть для вибору
        </p>
        <p className="text-xs admin-dark:text-gray-500 admin-light:text-gray-500">
          Фото, PDF, документи. Великі файли вантажаться напряму в сховище.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={onPick}
        />
      </div>

      {uploadingNames.length > 0 && (
        <div className="mt-2 space-y-1">
          {uploadingNames.map((name) => (
            <div
              key={name}
              className="flex items-center gap-2 text-xs admin-dark:text-gray-400 admin-light:text-gray-600"
            >
              <Loader2 className="h-3 w-3 animate-spin" />
              Завантаження: {name}
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}
