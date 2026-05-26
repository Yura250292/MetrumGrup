"use client";

import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { FieldDef } from "@/lib/forms/schema";

/**
 * Спрощений read-only preview поля для admin builder. Інтерактивні
 * варіанти (camera, GPS, signature) — у foreman renderer (Stage 4).
 */
export function FormFieldPreview({ field }: { field: FieldDef }) {
  if (field.type === "section") {
    return (
      <h3 className="border-b pb-1 text-[13px] font-semibold" style={{ borderColor: T.borderSoft, color: T.textPrimary }}>
        {field.label}
      </h3>
    );
  }

  return (
    <div>
      <label className="mb-1 block text-[12px]" style={{ color: T.textPrimary }}>
        {field.label}
        {field.required && (
          <span style={{ color: T.danger }}> *</span>
        )}
      </label>
      {field.helpText && (
        <div className="mb-1 text-[10px]" style={{ color: T.textMuted }}>
          {field.helpText}
        </div>
      )}
      {renderInput(field)}
    </div>
  );
}

function renderInput(field: FieldDef) {
  const baseClass =
    "w-full rounded-md border bg-transparent px-2 py-1.5 text-[12px] outline-none";
  const baseStyle = { borderColor: T.borderSoft, color: T.textPrimary } as const;
  switch (field.type) {
    case "text":
      return <input className={baseClass} style={baseStyle} placeholder="—" disabled />;
    case "longtext":
      return <textarea className={baseClass} style={baseStyle} rows={3} placeholder="—" disabled />;
    case "number":
      return <input type="number" className={baseClass} style={baseStyle} placeholder="0" disabled />;
    case "date":
      return <input type="date" className={baseClass} style={baseStyle} disabled />;
    case "datetime":
      return <input type="datetime-local" className={baseClass} style={baseStyle} disabled />;
    case "select":
      return (
        <select className={baseClass} style={baseStyle} disabled>
          <option>— виберіть —</option>
          {(field.options ?? []).map((o) => (
            <option key={o.value}>{o.label}</option>
          ))}
        </select>
      );
    case "multiselect":
      return (
        <div className="flex flex-wrap gap-1">
          {(field.options ?? []).map((o) => (
            <label key={o.value} className="inline-flex items-center gap-1 text-[12px]">
              <input type="checkbox" disabled />
              {o.label}
            </label>
          ))}
        </div>
      );
    case "checkbox":
      return (
        <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: T.textPrimary }}>
          <input type="checkbox" disabled />
          {field.label}
        </label>
      );
    case "photo":
      return (
        <div
          className="rounded-md border border-dashed py-4 text-center text-[11px]"
          style={{ borderColor: T.borderSoft, color: T.textMuted }}
        >
          📷 Зробити фото {field.multiple ? "(кілька)" : ""}
        </div>
      );
    case "signature":
      return (
        <div
          className="rounded-md border border-dashed py-8 text-center text-[11px]"
          style={{ borderColor: T.borderSoft, color: T.textMuted }}
        >
          ✍️ Підпис (canvas у foreman PWA)
        </div>
      );
    case "gps":
      return (
        <div
          className="rounded-md border border-dashed py-3 text-center text-[11px]"
          style={{ borderColor: T.borderSoft, color: T.textMuted }}
        >
          📍 GPS координати
        </div>
      );
    case "file":
      return (
        <div
          className="rounded-md border border-dashed py-3 text-center text-[11px]"
          style={{ borderColor: T.borderSoft, color: T.textMuted }}
        >
          📎 Файл {field.multiple ? "(кілька)" : ""}
        </div>
      );
    default:
      return null;
  }
}
