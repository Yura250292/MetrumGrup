"use client";

import { X } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { FormSchema } from "@/lib/forms/schema";
import { FormFieldPreview } from "./form-field-preview";

export function FormPreviewModal({
  schema,
  name,
  onClose,
}: {
  schema: FormSchema;
  name: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg shadow-2xl"
        style={{ backgroundColor: T.panel, color: T.textPrimary }}
      >
        <header
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: T.borderSoft }}
        >
          <div>
            <div className="text-[11px] uppercase tracking-wide" style={{ color: T.textMuted }}>
              Перегляд (як бачить виконроб)
            </div>
            <div className="font-semibold">{name}</div>
          </div>
          <button onClick={onClose} aria-label="Закрити">
            <X size={18} style={{ color: T.textMuted }} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">
          {schema.fields.length === 0 ? (
            <div className="py-12 text-center text-[12px]" style={{ color: T.textMuted }}>
              Форма порожня — додайте поля у builder.
            </div>
          ) : (
            <div className="space-y-3">
              {schema.fields.map((f) => (
                <FormFieldPreview key={f.key} field={f} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
