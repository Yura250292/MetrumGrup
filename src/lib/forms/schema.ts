/**
 * Site Forms Builder — TypeScript schema (Task 03).
 *
 * Цей модуль описує форму як data structure (FormSchema), що зберігається
 * у FormTemplate.schema JSON. На зміну schema admin-API інкрементить
 * FormTemplate.version і кладе snapshot у FormTemplateRevision, щоб старі
 * submissions завжди рендерились у layout, як їх подавали.
 */

export type FieldType =
  | "text"
  | "longtext"
  | "number"
  | "date"
  | "datetime"
  | "select"
  | "multiselect"
  | "checkbox"
  | "photo"
  | "signature"
  | "gps"
  | "file"
  | "section";

export type FieldOption = {
  value: string;
  label: string;
};

/**
 * Примітив conditional-логіки: показувати це поле, лише якщо інше поле
 * (fieldKey) дорівнює `equals`. Складніша логіка — v2.
 */
export type FieldVisibility = {
  fieldKey: string;
  equals: string | number | boolean;
};

export type FieldDef = {
  /** snake_case, unique within template; стабільний — використовується у FormSubmission.data. */
  key: string;
  type: FieldType;
  label: string;
  required?: boolean;
  helpText?: string;
  /** Лише для select/multiselect. */
  options?: FieldOption[];
  /** Для number: межі. Для text/longtext: довжина. */
  min?: number;
  max?: number;
  /** Регулярний вираз (string) — для text. Зберігається як рядок, parse на runtime. */
  pattern?: string;
  /** Дозволити декілька значень: photo/file. */
  multiple?: boolean;
  visibleIf?: FieldVisibility;
};

export type FormMeta = {
  /** Чи показувати лого фірми у заголовку PDF. */
  headerLogo?: boolean;
  /**
   * Який PDF-layout використати на експорті.
   * - DEFAULT — generic field-by-field.
   * - KB2V/KB3 — пікель-перфект за наказом Мінрегіону №65.
   */
  pdfTemplate?: "KB2V" | "KB3" | "DEFAULT";
};

export type FormSchema = {
  fields: FieldDef[];
  meta?: FormMeta;
};

/**
 * Значення одного поля у FormSubmission.data.
 * - section — нічого не зберігає (відображення).
 * - signature — base64 PNG (якщо ≤30KB) або attachment id.
 * - gps — { lat, lng, accuracy? }.
 * - photo/file (multiple=true) — масив attachment id.
 * - select — value (string). multiselect — string[].
 */
export type FieldValue =
  | string
  | number
  | boolean
  | string[]
  | { lat: number; lng: number; accuracy?: number };

export type SubmissionData = Record<string, FieldValue>;
