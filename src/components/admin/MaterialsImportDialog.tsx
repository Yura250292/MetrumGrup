"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, X, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

interface ImportValidationError {
  row: number;
  field: string;
  message: string;
}

interface ImportStats {
  total: number;
  valid: number;
  invalid: number;
  created?: number;
  updated?: number;
  skipped?: number;
}

interface MaterialsImportDialogProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function MaterialsImportDialog({ onClose, onSuccess }: MaterialsImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    stats: ImportStats;
    errors: ImportValidationError[];
  } | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setValidationResult(null);
    }
  }

  async function handleValidate() {
    if (!file) return;

    setValidating(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/admin/materials/import?mode=validate", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        alert(result.error || "Помилка валідації");
        return;
      }

      setValidationResult({
        stats: {
          total: result.totalRows,
          valid: result.validRows,
          invalid: result.invalidRows,
        },
        errors: result.errors || [],
      });
    } catch (error) {
      console.error("Validation error:", error);
      alert("Помилка валідації файлу");
    } finally {
      setValidating(false);
    }
  }

  async function handleImport() {
    if (!file) return;

    if (
      !confirm(
        `Імпортувати ${validationResult?.stats.valid} матеріалів?\n\n` +
          (skipDuplicates
            ? "Дублікати будуть пропущені."
            : "Дублікати будуть оновлені новими даними.")
      )
    ) {
      return;
    }

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(
        `/api/admin/materials/import?mode=import&skipDuplicates=${skipDuplicates}`,
        {
          method: "POST",
          body: formData,
        }
      );

      const result = await response.json();

      if (!response.ok) {
        alert(result.error || "Помилка імпорту");
        return;
      }

      alert(
        `Імпорт завершено успішно!\n\n` +
          `Створено: ${result.stats.created}\n` +
          `Оновлено: ${result.stats.updated}\n` +
          `Пропущено: ${result.stats.skipped}`
      );

      onSuccess();
      onClose();
    } catch (error) {
      console.error("Import error:", error);
      alert("Помилка імпорту матеріалів");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-bold flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-green-600" />
                Імпорт матеріалів з Excel
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Завантажте Excel файл з матеріалами для масового імпорту
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              disabled={validating || importing}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* File Upload */}
          {!file ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors"
            >
              <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-sm font-medium mb-1">Натисніть щоб обрати файл</p>
              <p className="text-xs text-muted-foreground">Excel (.xlsx, .xls)</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          ) : (
            <Card className="p-4 bg-muted/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="h-8 w-8 text-green-600" />
                  <div>
                    <p className="text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFile(null);
                    setValidationResult(null);
                  }}
                  disabled={validating || importing}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          )}

          {/* Validation Results */}
          {validationResult && (
            <div className="space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                <Card className="p-3 text-center">
                  <p className="text-2xl font-bold">{validationResult.stats.total}</p>
                  <p className="text-xs text-muted-foreground">Всього рядків</p>
                </Card>
                <Card className="p-3 text-center bg-green-50">
                  <p className="text-2xl font-bold text-green-600">
                    {validationResult.stats.valid}
                  </p>
                  <p className="text-xs text-muted-foreground">Валідних</p>
                </Card>
                <Card className="p-3 text-center bg-red-50">
                  <p className="text-2xl font-bold text-red-600">
                    {validationResult.stats.invalid}
                  </p>
                  <p className="text-xs text-muted-foreground">Помилок</p>
                </Card>
              </div>

              {/* Errors */}
              {validationResult.errors.length > 0 && (
                <Card className="p-4 bg-red-50 border-red-200">
                  <div className="flex items-start gap-2 mb-3">
                    <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-red-900">
                        Знайдено {validationResult.errors.length} помилок
                      </p>
                      <p className="text-xs text-red-700 mt-1">
                        Виправте помилки в Excel файлі перед імпортом
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {validationResult.errors.slice(0, 10).map((error, idx) => (
                      <div key={idx} className="text-xs text-red-800 font-mono">
                        Рядок {error.row}, поле "{error.field}": {error.message}
                      </div>
                    ))}
                    {validationResult.errors.length > 10 && (
                      <p className="text-xs text-red-700 italic mt-2">
                        ...та ще {validationResult.errors.length - 10} помилок
                      </p>
                    )}
                  </div>
                </Card>
              )}

              {/* Success */}
              {validationResult.errors.length === 0 && validationResult.stats.valid > 0 && (
                <Card className="p-4 bg-green-50 border-green-200">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-green-900">
                        Файл готовий до імпорту
                      </p>
                      <p className="text-xs text-green-700 mt-1">
                        Всі {validationResult.stats.valid} рядків пройшли валідацію успішно
                      </p>
                    </div>
                  </div>
                </Card>
              )}

              {/* Duplicates option */}
              {validationResult.errors.length === 0 && validationResult.stats.valid > 0 && (
                <Card className="p-4">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={skipDuplicates}
                      onChange={(e) => setSkipDuplicates(e.target.checked)}
                      className="mt-1"
                    />
                    <div>
                      <p className="text-sm font-medium">Пропустити дублікати</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Якщо увімкнено - матеріали з існуючим артикулом будуть пропущені.
                        <br />
                        Якщо вимкнено - існуючі матеріали будуть оновлені новими даними.
                      </p>
                    </div>
                  </label>
                </Card>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-4 border-t">
            <Button variant="outline" onClick={onClose} disabled={validating || importing}>
              Скасувати
            </Button>

            {!validationResult && file && (
              <Button onClick={handleValidate} disabled={validating} className="bg-blue-600">
                {validating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Валідація...
                  </>
                ) : (
                  "Перевірити файл"
                )}
              </Button>
            )}

            {validationResult &&
              validationResult.errors.length === 0 &&
              validationResult.stats.valid > 0 && (
                <Button
                  onClick={handleImport}
                  disabled={importing}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {importing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Імпорт...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      Імпортувати {validationResult.stats.valid} матеріалів
                    </>
                  )}
                </Button>
              )}
          </div>
        </div>
      </Card>
    </div>
  );
}
