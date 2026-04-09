"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCreateTextNote } from "@/hooks/useProjectFiles";

export function AddTextNoteModal({
  open,
  onOpenChange,
  projectId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
}) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const createNote = useCreateTextNote(projectId);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onOpenChange]);

  if (!open) return null;

  const handleSave = async () => {
    if (!text.trim()) return;
    try {
      await createNote.mutateAsync({ title, text });
      setTitle("");
      setText("");
      onOpenChange(false);
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
        className="w-full max-w-lg rounded-xl border admin-dark:border-white/10 admin-dark:bg-gray-900 admin-light:border-gray-200 admin-light:bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b admin-dark:border-white/10 admin-light:border-gray-200 px-4 py-3">
          <h3 className="text-sm font-bold admin-dark:text-white admin-light:text-gray-900">
            Додати текстовий опис
          </h3>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-lg p-1 admin-dark:hover:bg-white/10 admin-light:hover:bg-gray-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1 admin-dark:text-gray-300 admin-light:text-gray-700">
              Назва (опціонально)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Наприклад: Опис об'єкту"
              className="w-full rounded-lg border admin-dark:border-white/10 admin-dark:bg-gray-900/40 admin-dark:text-white admin-light:border-gray-200 admin-light:bg-white admin-light:text-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 admin-dark:text-gray-300 admin-light:text-gray-700">
              Текст опису
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder="Опишіть деталі проєкту, побажання клієнта, технічні нюанси..."
              className="w-full rounded-lg border admin-dark:border-white/10 admin-dark:bg-gray-900/40 admin-dark:text-white admin-light:border-gray-200 admin-light:bg-white admin-light:text-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            />
          </div>
          {createNote.isError && (
            <p className="text-xs text-red-500">
              {(createNote.error as Error)?.message}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Скасувати
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!text.trim() || createNote.isPending}
            >
              {createNote.isPending ? "Збереження..." : "Зберегти"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
