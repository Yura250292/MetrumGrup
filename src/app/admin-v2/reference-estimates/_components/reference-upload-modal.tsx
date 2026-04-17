"use client";

import { useEffect, useRef, useState } from "react";
import { X, Upload, Loader2, FileSpreadsheet, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import {
  useParseReferenceFile,
  useCreateReferenceEstimate,
  type ParsedReferenceEstimate,
} from "@/hooks/useReferenceEstimates";

export function ReferenceUploadModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedReferenceEstimate | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [areaInput, setAreaInput] = useState("");

  const parse = useParseReferenceFile();
  const create = useCreateReferenceEstimate();

  useEffect(() => {
    if (!open) {
      setParsed(null);
      setTitle("");
      setDescription("");
      setAreaInput("");
      parse.reset();
      create.reset();
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !parse.isPending && !create.isPending) {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onOpenChange, parse.isPending, create.isPending]);

  if (!open) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    parse.reset();
    create.reset();
    try {
      const result = await parse.mutateAsync(file);
      setParsed(result);
      if (!title) {
        setTitle(file.name.replace(/\.(xlsx|xls)$/i, ""));
      }
    } catch (err) {
      console.error(err);
      setParsed(null);
    }
  };

  const areaM2 = Number(areaInput.replace(",", "."));
  const canSave =
    !!parsed &&
    !!title.trim() &&
    Number.isFinite(areaM2) &&
    areaM2 > 0 &&
    !create.isPending;

  const handleSave = async () => {
    if (!parsed || !canSave) return;
    try {
      await create.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        totalAreaM2: areaM2,
        sourceFormat: parsed.format,
        sections: parsed.sections,
      });
      onOpenChange(false);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={() =>
        !parse.isPending && !create.isPending && onOpenChange(false)
      }
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl border admin-dark:border-white/10 admin-dark:bg-gray-900 admin-light:border-gray-200 admin-light:bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b admin-dark:border-white/10 admin-light:border-gray-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 admin-dark:text-emerald-400 admin-light:text-emerald-600" />
            <h3 className="text-sm font-bold admin-dark:text-white admin-light:text-gray-900">
              Завантажити еталонний кошторис
            </h3>
          </div>
          <button
            onClick={() =>
              !parse.isPending && !create.isPending && onOpenChange(false)
            }
            className="rounded-lg p-1 admin-dark:hover:bg-white/10 admin-light:hover:bg-gray-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium mb-2 admin-dark:text-gray-300 admin-light:text-gray-700">
              XLSX файл кошторису
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={handleFileChange}
              disabled={parse.isPending || create.isPending}
              className="block w-full text-xs admin-dark:text-gray-300 admin-light:text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-600 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-emerald-700"
            />
            <p className="text-[11px] mt-1 admin-dark:text-gray-500 admin-light:text-gray-500">
              PDF поки не підтримуються — лише XLSX/XLS
            </p>
          </div>

          {parse.isPending && (
            <div className="flex items-center gap-2 text-xs admin-dark:text-emerald-400 admin-light:text-emerald-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Парсинг файлу...
            </div>
          )}

          {parse.isError && (
            <p className="text-xs text-red-500">
              {(parse.error as Error)?.message}
            </p>
          )}

          {parsed && (
            <>
              <div className="rounded-lg border admin-dark:border-emerald-400/30 admin-dark:bg-emerald-400/5 admin-light:border-emerald-300 admin-light:bg-emerald-50 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-4 w-4 admin-dark:text-emerald-400 admin-light:text-emerald-600" />
                  <span className="text-xs font-semibold admin-dark:text-emerald-300 admin-light:text-emerald-800">
                    Файл успішно розпарсено
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div>
                    <div className="admin-dark:text-gray-400 admin-light:text-gray-600">
                      Формат
                    </div>
                    <div className="font-semibold admin-dark:text-white admin-light:text-gray-900">
                      {parsed.format}
                    </div>
                  </div>
                  <div>
                    <div className="admin-dark:text-gray-400 admin-light:text-gray-600">
                      Позицій
                    </div>
                    <div className="font-semibold admin-dark:text-white admin-light:text-gray-900">
                      {parsed.itemCount}
                    </div>
                  </div>
                  <div>
                    <div className="admin-dark:text-gray-400 admin-light:text-gray-600">
                      Сума з файлу
                    </div>
                    <div className="font-semibold admin-dark:text-emerald-400 admin-light:text-emerald-600">
                      {formatCurrency(parsed.grandTotal)}
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-[11px] admin-dark:text-gray-400 admin-light:text-gray-600">
                  Секцій: {parsed.sections.length} —{" "}
                  {parsed.sections
                    .slice(0, 3)
                    .map((s) => s.title)
                    .join(", ")}
                  {parsed.sections.length > 3 ? "..." : ""}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1 admin-dark:text-gray-300 admin-light:text-gray-700">
                  Назва еталону <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="напр. Офіс 150 м² ARMET"
                  className="w-full rounded-lg border admin-dark:border-white/10 admin-dark:bg-gray-900/40 admin-dark:text-white admin-light:border-gray-200 admin-light:bg-white admin-light:text-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1 admin-dark:text-gray-300 admin-light:text-gray-700">
                  Площа об'єкта (м²) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={areaInput}
                  onChange={(e) => setAreaInput(e.target.value)}
                  placeholder="напр. 150.6"
                  className="w-full rounded-lg border admin-dark:border-white/10 admin-dark:bg-gray-900/40 admin-dark:text-white admin-light:border-gray-200 admin-light:bg-white admin-light:text-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-[11px] mt-1 admin-dark:text-gray-500 admin-light:text-gray-500">
                  Це площа об'єкта, для якого зроблений цей кошторис. Калькулятор
                  буде масштабувати позиції від цієї площі.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1 admin-dark:text-gray-300 admin-light:text-gray-700">
                  Опис (опціонально)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Тип об'єкта, особливості..."
                  className="w-full rounded-lg border admin-dark:border-white/10 admin-dark:bg-gray-900/40 admin-dark:text-white admin-light:border-gray-200 admin-light:bg-white admin-light:text-gray-900 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
                />
              </div>
            </>
          )}

          {create.isError && (
            <p className="text-xs text-red-500">
              {(create.error as Error)?.message}
            </p>
          )}
        </div>

        <div className="border-t admin-dark:border-white/10 admin-light:border-gray-200 px-4 py-3 flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={parse.isPending || create.isPending}
          >
            Скасувати
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!canSave}>
            {create.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Збереження...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Зберегти еталон
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
