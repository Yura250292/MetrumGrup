/**
 * Generic PDF layout для заповнених форм (Stage 5).
 *
 * Field-by-field layout, A4 portrait. Підпис рендериться як зображення,
 * GPS — як текст з координатами, фото — placeholder (TODO Stage 6: завантажити
 * з R2 і вбудувати).
 *
 * UA-only: використовуємо стандартний латинський шрифт PDF + не намагаємось
 * рендерити кирилицю через StandardFonts (вона не підтримує). Для production
 * слід підвантажити TTF шрифт через @pdf-lib/fontkit (TODO у коментарі нижче).
 */

import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  type PDFPage,
  type PDFFont,
} from "pdf-lib";
import type { FormSchema, FieldDef, SubmissionData } from "../schema";

export type PdfRenderInput = {
  templateName: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  submittedBy: string;
  submittedAt: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  projectTitle?: string | null;
  schema: FormSchema;
  data: SubmissionData;
  // UA font bytes — optional. Якщо не передано, текст транслітерується.
  // TODO: завантажити NotoSans з public/fonts і передавати сюди.
  fontBytes?: Uint8Array;
};

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 50;
const LINE_HEIGHT = 14;

/** Транслітерує кирилицю → латиницю, бо StandardFonts.Helvetica її не підтримує. */
function transliterate(s: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", ґ: "g", д: "d", е: "e", є: "ie",
    ж: "zh", з: "z", и: "y", і: "i", ї: "yi", й: "y", к: "k", л: "l",
    м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
    ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ь: "",
    ю: "iu", я: "ia",
    А: "A", Б: "B", В: "V", Г: "G", Ґ: "G", Д: "D", Е: "E", Є: "Ye",
    Ж: "Zh", З: "Z", И: "Y", І: "I", Ї: "Yi", Й: "Y", К: "K", Л: "L",
    М: "M", Н: "N", О: "O", П: "P", Р: "R", С: "S", Т: "T", У: "U",
    Ф: "F", Х: "Kh", Ц: "Ts", Ч: "Ch", Ш: "Sh", Щ: "Shch", Ь: "",
    Ю: "Iu", Я: "Ia",
    "'": "'", "’": "'", "“": '"', "”": '"', "—": "-", "–": "-",
  };
  return Array.from(s)
    .map((ch) => (ch in map ? map[ch] : ch))
    .join("");
}

function valueToText(field: FieldDef, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Так" : "Ні";
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    if (field.type === "multiselect" && field.options) {
      const labels = value
        .map((v) => field.options!.find((o) => o.value === v)?.label ?? String(v));
      return labels.join(", ");
    }
    if (field.type === "photo" || field.type === "file") {
      return `[${value.length} ${field.type === "photo" ? "фото" : "файл(ів)"}]`;
    }
    return value.map(String).join(", ");
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.lat === "number" && typeof o.lng === "number") {
      return `${(o.lat as number).toFixed(5)}, ${(o.lng as number).toFixed(5)}`;
    }
  }
  if (typeof value === "string") {
    if (value.startsWith("data:image/")) return "[зображення]";
    if (field.type === "select" && field.options) {
      const opt = field.options.find((o) => o.value === value);
      return opt?.label ?? value;
    }
  }
  return String(value);
}

function drawText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  size: number,
  options?: { color?: ReturnType<typeof rgb>; maxWidth?: number; useFont: boolean },
): number {
  // wrap by chars (грубий wrap); якщо потрібно акуратний — додамо token wrap пізніше.
  const safeText = options?.useFont ? text : transliterate(text);
  const maxChars = options?.maxWidth ? Math.floor(options.maxWidth / (size * 0.5)) : safeText.length;
  const lines: string[] = [];
  let rest = safeText;
  while (rest.length > 0) {
    lines.push(rest.slice(0, maxChars));
    rest = rest.slice(maxChars);
  }
  for (const line of lines) {
    page.drawText(line, {
      x,
      y,
      size,
      font,
      color: options?.color ?? rgb(0.1, 0.1, 0.12),
    });
    y -= LINE_HEIGHT;
  }
  return y;
}

export async function renderDefaultFormPdf(input: PdfRenderInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  let page = pdf.addPage([A4.width, A4.height]);

  let font: PDFFont;
  const useEmbeddedFont = !!input.fontBytes;
  if (useEmbeddedFont) {
    const { default: fontkit } = await import("@pdf-lib/fontkit");
    pdf.registerFontkit(fontkit);
    font = await pdf.embedFont(input.fontBytes!);
  } else {
    font = await pdf.embedFont(StandardFonts.Helvetica);
  }

  // Заголовок
  let y = A4.height - MARGIN;
  page.drawText(useEmbeddedFont ? input.templateName : transliterate(input.templateName), {
    x: MARGIN,
    y,
    size: 16,
    font,
    color: rgb(0.05, 0.05, 0.1),
  });
  y -= 22;

  const metaLines = [
    `Виконавець: ${input.submittedBy}`,
    `Дата: ${input.submittedAt ? new Date(input.submittedAt).toLocaleString("uk-UA") : "—"}`,
    `Статус: ${input.status}`,
    input.projectTitle ? `Проєкт: ${input.projectTitle}` : null,
    input.reviewedBy ? `Затвердив: ${input.reviewedBy}` : null,
  ].filter((s): s is string => !!s);
  for (const line of metaLines) {
    y = drawText(page, font, line, MARGIN, y, 10, { useFont: useEmbeddedFont, maxWidth: A4.width - 2 * MARGIN });
    y -= 2;
  }

  y -= 8;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: A4.width - MARGIN, y },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  });
  y -= 14;

  // Watermark для не-APPROVED
  if (input.status !== "APPROVED") {
    page.drawText(useEmbeddedFont ? "ЧЕРНЕТКА" : "CHERNETKA", {
      x: A4.width / 2 - 100,
      y: A4.height / 2,
      size: 60,
      font,
      color: rgb(0.85, 0.85, 0.85),
      rotate: degrees(35),
      opacity: 0.3,
    });
  }

  // Поля
  for (const field of input.schema.fields) {
    if (y < MARGIN + 60) {
      page = pdf.addPage([A4.width, A4.height]);
      y = A4.height - MARGIN;
    }
    if (field.type === "section") {
      y -= 6;
      page.drawText(useEmbeddedFont ? field.label : transliterate(field.label), {
        x: MARGIN,
        y,
        size: 12,
        font,
        color: rgb(0.1, 0.1, 0.15),
      });
      y -= LINE_HEIGHT;
      page.drawLine({
        start: { x: MARGIN, y: y + 4 },
        end: { x: A4.width - MARGIN, y: y + 4 },
        thickness: 0.3,
        color: rgb(0.8, 0.8, 0.8),
      });
      y -= 6;
      continue;
    }

    // label
    page.drawText(useEmbeddedFont ? field.label : transliterate(field.label), {
      x: MARGIN,
      y,
      size: 9,
      font,
      color: rgb(0.4, 0.4, 0.45),
    });
    y -= LINE_HEIGHT;

    // signature: рендеримо як зображення (base64 PNG)
    const raw = input.data[field.key];
    if (
      field.type === "signature" &&
      typeof raw === "string" &&
      raw.startsWith("data:image/png;base64,")
    ) {
      try {
        const b64 = raw.slice("data:image/png;base64,".length);
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const img = await pdf.embedPng(bytes);
        const w = Math.min(220, A4.width - 2 * MARGIN);
        const h = (img.height / img.width) * w;
        if (y - h < MARGIN) {
          page = pdf.addPage([A4.width, A4.height]);
          y = A4.height - MARGIN;
        }
        page.drawImage(img, { x: MARGIN, y: y - h, width: w, height: h });
        y -= h + 6;
      } catch {
        // fallback на text
        y = drawText(page, font, valueToText(field, raw), MARGIN, y, 10, {
          useFont: useEmbeddedFont,
          maxWidth: A4.width - 2 * MARGIN,
        });
      }
      continue;
    }

    y = drawText(page, font, valueToText(field, raw), MARGIN, y, 10, {
      useFont: useEmbeddedFont,
      maxWidth: A4.width - 2 * MARGIN,
    });
    y -= 4;
  }

  return pdf.save();
}
