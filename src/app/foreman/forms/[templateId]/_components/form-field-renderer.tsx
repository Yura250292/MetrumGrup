"use client";

import type { FieldDef } from "@/lib/forms/schema";
import { SignaturePad } from "./signature-pad";
import { PhotoCapture } from "./photo-capture";
import { GpsField } from "./gps-field";

export function FormFieldRenderer({
  field,
  value,
  onChange,
  submissionDraftId,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  submissionDraftId: string;
}) {
  if (field.type === "section") {
    return (
      <h3 className="mt-4 border-b border-white/10 pb-1 text-[14px] font-semibold text-white">
        {field.label}
      </h3>
    );
  }

  return (
    <div>
      <label className="mb-1 block text-[13px] text-white/85">
        {field.label}
        {field.required && <span className="text-red-300"> *</span>}
      </label>
      {field.helpText && (
        <div className="mb-1 text-[11px] text-white/50">{field.helpText}</div>
      )}
      {renderInput(field, value, onChange, submissionDraftId)}
    </div>
  );
}

function renderInput(
  field: FieldDef,
  value: unknown,
  onChange: (v: unknown) => void,
  submissionDraftId: string,
): React.ReactNode {
  const inputCls = "w-full rounded-xl bg-white/[0.06] px-3 py-2 text-[14px] text-white outline-none";

  switch (field.type) {
    case "text":
      return (
        <input
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
        />
      );
    case "longtext":
      return (
        <textarea
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          className={inputCls}
        />
      );
    case "number":
      return (
        <input
          type="number"
          value={typeof value === "number" ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          className={inputCls}
        />
      );
    case "date":
      return (
        <input
          type="date"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
        />
      );
    case "datetime":
      return (
        <input
          type="datetime-local"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
        />
      );
    case "select":
      return (
        <select
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
        >
          <option value="">— виберіть —</option>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case "multiselect": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="space-y-1">
          {(field.options ?? []).map((o) => {
            const checked = arr.includes(o.value);
            return (
              <label key={o.value} className="flex items-center gap-2 text-[14px] text-white/85">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    if (e.target.checked) onChange([...arr, o.value]);
                    else onChange(arr.filter((v) => v !== o.value));
                  }}
                />
                {o.label}
              </label>
            );
          })}
        </div>
      );
    }
    case "checkbox":
      return (
        <label className="flex items-center gap-2 text-[14px] text-white/85">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
          />
          {field.label}
        </label>
      );
    case "photo":
    case "file":
      return (
        <PhotoCapture
          fieldKey={field.key}
          submissionDraftId={submissionDraftId}
          value={value as string | string[] | undefined}
          onChange={onChange}
          multiple={!!field.multiple}
          mode={field.type === "photo" ? "image" : "any"}
        />
      );
    case "signature":
      return (
        <SignaturePad
          value={typeof value === "string" ? value : null}
          onChange={onChange}
        />
      );
    case "gps":
      return (
        <GpsField
          value={
            value && typeof value === "object" && !Array.isArray(value)
              ? (value as { lat: number; lng: number; accuracy?: number })
              : null
          }
          onChange={onChange}
        />
      );
    default:
      return null;
  }
}
