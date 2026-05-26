"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { FieldDef, FieldType, FieldOption } from "@/lib/forms/schema";
import { FIELD_TYPE_LABELS } from "./field-palette";

const SUPPORTS_OPTIONS: FieldType[] = ["select", "multiselect"];
const SUPPORTS_MIN_MAX: FieldType[] = ["text", "longtext", "number"];
const SUPPORTS_PATTERN: FieldType[] = ["text"];
const SUPPORTS_MULTIPLE: FieldType[] = ["photo", "file"];

export function makeBlankField(type: FieldType, indexHint: number): FieldDef {
  const baseKey = `field_${indexHint + 1}`;
  const base: FieldDef = {
    key: baseKey,
    type,
    label:
      type === "section"
        ? "Розділ"
        : FIELD_TYPE_LABELS[type],
  };
  if (SUPPORTS_OPTIONS.includes(type)) {
    base.options = [{ value: "opt_1", label: "Варіант 1" }];
  }
  return base;
}

export function FieldEditor({
  field,
  onChange,
  onKeyChange,
  allFieldKeys,
}: {
  field: FieldDef;
  onChange: (patch: Partial<FieldDef>) => void;
  onKeyChange: (newKey: string) => void;
  allFieldKeys: string[];
}) {
  const [keyDraft, setKeyDraft] = useState(field.key);

  function commitKey() {
    if (keyDraft === field.key) return;
    if (!/^[a-z][a-z0-9_]*$/.test(keyDraft)) {
      alert("key має бути snake_case (a-z, 0-9, _)");
      setKeyDraft(field.key);
      return;
    }
    onKeyChange(keyDraft);
  }

  return (
    <div className="space-y-3 text-[12px]" style={{ color: T.textPrimary }}>
      <div>
        <Label>Лейбл</Label>
        <input
          value={field.label}
          onChange={(e) => onChange({ label: e.target.value })}
          className="w-full rounded-md border bg-transparent px-2 py-1.5 outline-none"
          style={{ borderColor: T.borderSoft }}
        />
      </div>

      <div>
        <Label>Ключ (key)</Label>
        <input
          value={keyDraft}
          onChange={(e) => setKeyDraft(e.target.value)}
          onBlur={commitKey}
          className="w-full rounded-md border bg-transparent px-2 py-1.5 font-mono outline-none"
          style={{ borderColor: T.borderSoft }}
        />
        <Hint>snake_case; стабільний — впливає на сумісність зі старими submissions</Hint>
      </div>

      <div>
        <Label>Підказка</Label>
        <input
          value={field.helpText ?? ""}
          onChange={(e) => onChange({ helpText: e.target.value || undefined })}
          className="w-full rounded-md border bg-transparent px-2 py-1.5 outline-none"
          style={{ borderColor: T.borderSoft }}
        />
      </div>

      {field.type !== "section" && (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!field.required}
            onChange={(e) => onChange({ required: e.target.checked })}
          />
          Обовʼязкове
        </label>
      )}

      {SUPPORTS_MULTIPLE.includes(field.type) && (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!field.multiple}
            onChange={(e) => onChange({ multiple: e.target.checked })}
          />
          Дозволити кілька значень
        </label>
      )}

      {SUPPORTS_MIN_MAX.includes(field.type) && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>{field.type === "number" ? "Min" : "Min довжина"}</Label>
            <input
              type="number"
              value={field.min ?? ""}
              onChange={(e) =>
                onChange({ min: e.target.value === "" ? undefined : Number(e.target.value) })
              }
              className="w-full rounded-md border bg-transparent px-2 py-1.5 outline-none"
              style={{ borderColor: T.borderSoft }}
            />
          </div>
          <div>
            <Label>{field.type === "number" ? "Max" : "Max довжина"}</Label>
            <input
              type="number"
              value={field.max ?? ""}
              onChange={(e) =>
                onChange({ max: e.target.value === "" ? undefined : Number(e.target.value) })
              }
              className="w-full rounded-md border bg-transparent px-2 py-1.5 outline-none"
              style={{ borderColor: T.borderSoft }}
            />
          </div>
        </div>
      )}

      {SUPPORTS_PATTERN.includes(field.type) && (
        <div>
          <Label>Регулярний вираз</Label>
          <input
            value={field.pattern ?? ""}
            onChange={(e) => onChange({ pattern: e.target.value || undefined })}
            className="w-full rounded-md border bg-transparent px-2 py-1.5 font-mono outline-none"
            style={{ borderColor: T.borderSoft }}
            placeholder="напр. ^\\+380\\d{9}$"
          />
        </div>
      )}

      {SUPPORTS_OPTIONS.includes(field.type) && (
        <OptionsEditor
          options={field.options ?? []}
          onChange={(options) => onChange({ options })}
        />
      )}

      <VisibleIfEditor
        value={field.visibleIf}
        allFieldKeys={allFieldKeys}
        onChange={(visibleIf) => onChange({ visibleIf })}
      />
    </div>
  );
}

function OptionsEditor({
  options,
  onChange,
}: {
  options: FieldOption[];
  onChange: (next: FieldOption[]) => void;
}) {
  return (
    <div>
      <Label>Варіанти</Label>
      <div className="space-y-1">
        {options.map((o, idx) => (
          <div key={idx} className="flex items-center gap-1">
            <input
              value={o.value}
              onChange={(e) => {
                const next = [...options];
                next[idx] = { ...o, value: e.target.value };
                onChange(next);
              }}
              placeholder="value"
              className="w-1/3 rounded-md border bg-transparent px-2 py-1 font-mono text-[11px] outline-none"
              style={{ borderColor: T.borderSoft }}
            />
            <input
              value={o.label}
              onChange={(e) => {
                const next = [...options];
                next[idx] = { ...o, label: e.target.value };
                onChange(next);
              }}
              placeholder="label"
              className="flex-1 rounded-md border bg-transparent px-2 py-1 outline-none"
              style={{ borderColor: T.borderSoft }}
            />
            <button
              onClick={() => onChange(options.filter((_, i) => i !== idx))}
              aria-label="Видалити"
            >
              <X size={12} style={{ color: T.textMuted }} />
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={() =>
          onChange([
            ...options,
            { value: `opt_${options.length + 1}`, label: `Варіант ${options.length + 1}` },
          ])
        }
        className="mt-1 inline-flex items-center gap-1 text-[11px]"
        style={{ color: T.accentPrimary }}
      >
        <Plus size={12} />
        Додати
      </button>
    </div>
  );
}

function VisibleIfEditor({
  value,
  allFieldKeys,
  onChange,
}: {
  value: FieldDef["visibleIf"];
  allFieldKeys: string[];
  onChange: (next: FieldDef["visibleIf"] | undefined) => void;
}) {
  const enabled = !!value;
  return (
    <div className="rounded-md border p-2" style={{ borderColor: T.borderSoft }}>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            if (!e.target.checked) onChange(undefined);
            else {
              onChange({ fieldKey: allFieldKeys[0] ?? "", equals: true });
            }
          }}
        />
        Показувати лише якщо…
      </label>
      {enabled && value && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <select
            value={value.fieldKey}
            onChange={(e) => onChange({ ...value, fieldKey: e.target.value })}
            className="rounded-md border bg-transparent px-2 py-1 text-[11px] outline-none"
            style={{ borderColor: T.borderSoft, color: T.textPrimary }}
          >
            {allFieldKeys.length === 0 && <option value="">— немає полів вище —</option>}
            {allFieldKeys.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <input
            value={String(value.equals)}
            onChange={(e) => {
              const raw = e.target.value;
              const parsed: string | number | boolean =
                raw === "true"
                  ? true
                  : raw === "false"
                    ? false
                    : Number.isFinite(Number(raw)) && raw !== ""
                      ? Number(raw)
                      : raw;
              onChange({ ...value, equals: parsed });
            }}
            placeholder="true / false / число / рядок"
            className="rounded-md border bg-transparent px-2 py-1 text-[11px] outline-none"
            style={{ borderColor: T.borderSoft, color: T.textPrimary }}
          />
        </div>
      )}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 text-[11px] uppercase tracking-wide" style={{ color: T.textMuted }}>
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-0.5 text-[10px]" style={{ color: T.textMuted }}>
      {children}
    </div>
  );
}
