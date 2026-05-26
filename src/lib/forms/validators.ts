/**
 * Zod-валідатори для Site Forms Builder.
 *
 * - FieldDefSchema / FormSchemaZ — валідація self-описаного шаблону
 *   (admin будує форму у builder UI).
 * - SubmissionPayloadSchema — валідація payload з foreman при POST.
 * - validateSubmissionAgainstSchema — runtime-перевірка, що подане
 *   значення сумісне з полями (required/type/min/max/options).
 */

import { z } from "zod";
import type { FieldDef, FormSchema, SubmissionData } from "./schema";

const FIELD_TYPES = [
  "text",
  "longtext",
  "number",
  "date",
  "datetime",
  "select",
  "multiselect",
  "checkbox",
  "photo",
  "signature",
  "gps",
  "file",
  "section",
] as const;

export const FieldOptionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
});

export const FieldVisibilitySchema = z.object({
  fieldKey: z.string().min(1),
  equals: z.union([z.string(), z.number(), z.boolean()]),
});

export const FieldDefSchema = z
  .object({
    key: z
      .string()
      .min(1)
      .regex(/^[a-z][a-z0-9_]*$/, "key має бути snake_case (a-z, 0-9, _)"),
    type: z.enum(FIELD_TYPES),
    label: z.string().min(1),
    required: z.boolean().optional(),
    helpText: z.string().optional(),
    options: z.array(FieldOptionSchema).min(1).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().optional(),
    multiple: z.boolean().optional(),
    visibleIf: FieldVisibilitySchema.optional(),
  })
  .superRefine((field, ctx) => {
    if (
      (field.type === "select" || field.type === "multiselect") &&
      (!field.options || field.options.length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${field.type} потребує непорожніх options`,
        path: ["options"],
      });
    }
    if (field.pattern) {
      try {
        new RegExp(field.pattern);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "pattern не є валідним регулярним виразом",
          path: ["pattern"],
        });
      }
    }
    if (
      typeof field.min === "number" &&
      typeof field.max === "number" &&
      field.min > field.max
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "min не може бути більшим за max",
        path: ["min"],
      });
    }
  });

export const FormMetaSchema = z.object({
  headerLogo: z.boolean().optional(),
  pdfTemplate: z.enum(["KB2V", "KB3", "DEFAULT"]).optional(),
});

export const FormSchemaZ: z.ZodType<FormSchema> = z
  .object({
    fields: z.array(FieldDefSchema).min(1),
    meta: FormMetaSchema.optional(),
  })
  .superRefine((schema, ctx) => {
    const seen = new Set<string>();
    schema.fields.forEach((f, idx) => {
      if (seen.has(f.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `дубль ключа поля "${f.key}"`,
          path: ["fields", idx, "key"],
        });
      }
      seen.add(f.key);
    });
    // visibleIf має посилатися на існуюче поле, оголошене вище.
    const declaredBefore = new Set<string>();
    schema.fields.forEach((f, idx) => {
      if (f.visibleIf && !declaredBefore.has(f.visibleIf.fieldKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `visibleIf посилається на невідоме поле "${f.visibleIf.fieldKey}" (поле має бути оголошене вище)`,
          path: ["fields", idx, "visibleIf", "fieldKey"],
        });
      }
      declaredBefore.add(f.key);
    });
  }) as unknown as z.ZodType<FormSchema>;

/**
 * Payload, який foreman PWA POST-ить на `/api/foreman/form-submissions`.
 * Дублі (повторний sync з outbox) — ідентичні clientUuid → server upsert.
 */
export const SubmissionPayloadSchema = z.object({
  clientUuid: z.string().uuid(),
  templateId: z.string().min(1),
  templateVersion: z.number().int().positive(),
  projectId: z.string().min(1).nullable().optional(),
  taskId: z.string().min(1).nullable().optional(),
  foremanReportId: z.string().min(1).nullable().optional(),
  data: z.record(z.string(), z.unknown()),
  // attachmentTokens — id-шки уже завантажених на R2 файлів (через
  // /attachment endpoint). При submit ми лише лінкуємо їх до submission.
  attachmentTokens: z.array(z.string()).optional(),
});

/**
 * Runtime-перевірка: data відповідає schema.
 * Не Zod (бо schema динамічна) — імперативна.
 */
export function validateSubmissionAgainstSchema(
  data: SubmissionData,
  schema: FormSchema,
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const visibleFields = filterVisible(schema.fields, data);

  for (const field of visibleFields) {
    if (field.type === "section") continue;
    const v = data[field.key];
    const present =
      v !== undefined &&
      v !== null &&
      !(typeof v === "string" && v.length === 0) &&
      !(Array.isArray(v) && v.length === 0);

    if (field.required && !present) {
      errors.push(`Поле "${field.label}" обов'язкове`);
      continue;
    }
    if (!present) continue;

    switch (field.type) {
      case "text":
      case "longtext": {
        if (typeof v !== "string") {
          errors.push(`Поле "${field.label}" має бути рядком`);
        } else {
          if (typeof field.min === "number" && v.length < field.min) {
            errors.push(`Поле "${field.label}" занадто коротке (min=${field.min})`);
          }
          if (typeof field.max === "number" && v.length > field.max) {
            errors.push(`Поле "${field.label}" занадто довге (max=${field.max})`);
          }
          if (field.pattern) {
            try {
              if (!new RegExp(field.pattern).test(v)) {
                errors.push(`Поле "${field.label}" не відповідає шаблону`);
              }
            } catch {
              // Невалідний pattern уже відловлений у FieldDefSchema; ігноруємо тут.
            }
          }
        }
        break;
      }
      case "number": {
        if (typeof v !== "number" || Number.isNaN(v)) {
          errors.push(`Поле "${field.label}" має бути числом`);
        } else {
          if (typeof field.min === "number" && v < field.min) {
            errors.push(`Поле "${field.label}" менше за min=${field.min}`);
          }
          if (typeof field.max === "number" && v > field.max) {
            errors.push(`Поле "${field.label}" більше за max=${field.max}`);
          }
        }
        break;
      }
      case "checkbox": {
        if (typeof v !== "boolean") {
          errors.push(`Поле "${field.label}" має бути true/false`);
        }
        break;
      }
      case "date":
      case "datetime": {
        if (typeof v !== "string" || Number.isNaN(new Date(v).getTime())) {
          errors.push(`Поле "${field.label}" має бути валідною датою (ISO 8601)`);
        }
        break;
      }
      case "select": {
        const values = (field.options ?? []).map((o) => o.value);
        if (typeof v !== "string" || !values.includes(v)) {
          errors.push(`Поле "${field.label}" має бути одним з options`);
        }
        break;
      }
      case "multiselect": {
        const values = (field.options ?? []).map((o) => o.value);
        if (!Array.isArray(v) || !v.every((x) => typeof x === "string" && values.includes(x))) {
          errors.push(`Поле "${field.label}" має бути масивом з options`);
        }
        break;
      }
      case "gps": {
        const ok =
          typeof v === "object" &&
          v !== null &&
          !Array.isArray(v) &&
          typeof (v as { lat: unknown }).lat === "number" &&
          typeof (v as { lng: unknown }).lng === "number";
        if (!ok) {
          errors.push(`Поле "${field.label}" має містити { lat, lng }`);
        }
        break;
      }
      case "signature": {
        if (typeof v !== "string" || !v.startsWith("data:image/")) {
          errors.push(`Поле "${field.label}" має бути base64 PNG (data:image/...)`);
        }
        break;
      }
      case "photo":
      case "file": {
        const okArray =
          Array.isArray(v) && v.every((x) => typeof x === "string");
        const okString = typeof v === "string";
        if (field.multiple) {
          if (!okArray) {
            errors.push(`Поле "${field.label}" має бути масивом attachment id`);
          }
        } else if (!okString && !okArray) {
          errors.push(`Поле "${field.label}" має бути attachment id`);
        }
        break;
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true };
}

/**
 * Повертає поля, що видимі за поточним станом data (visibleIf-перевірка).
 * Section-поля також повертаються — вони суто візуальні.
 */
export function filterVisible(
  fields: FieldDef[],
  data: SubmissionData,
): FieldDef[] {
  return fields.filter((f) => {
    if (!f.visibleIf) return true;
    const refVal = data[f.visibleIf.fieldKey];
    return refVal === f.visibleIf.equals;
  });
}
