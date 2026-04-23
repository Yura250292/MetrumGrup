import { GoogleGenerativeAI } from "@google/generative-ai";

const GEMINI_MODELS = ["gemini-3-flash-preview", "gemini-2.5-flash"];

export type FieldSpec = {
  key: string;
  label: string;
  required?: boolean;
  hint?: string;
};

export type AiMapping = {
  headerRow: number; // 1-indexed; 0 if no header row exists (data starts at row 1)
  columnMap: Record<string, number | null>; // 1-indexed column number per field key
  notes?: string;
};

const SYSTEM_PROMPT = `Ти — асистент для розпізнавання структури Excel таблиці. Тобі дають перші рядки таблиці (JSON масив масивів — кожен внутрішній масив це рядок, колонки 1-індексовані).

Завдання: визнач який рядок містить заголовки колонок, і яка колонка (1-індексована) містить значення для кожного запитаного поля.

Поверни СТРОГО JSON (без тексту, без markdown, без коментарів):
{"headerRow": <int>, "columnMap": {"<fieldKey>": <columnNumber | null>, ...}, "notes": "<коротка примітка>"}

Правила:
- headerRow: 1-індексований номер рядка з заголовками. 0 якщо заголовків немає.
- Для кожного поля у спеці постав номер колонки де знаходяться його значення, або null якщо колонки немає.
- Будь толерантним до синонімів, скорочень, варіантів українською/англійською/російською.
- Якщо кілька колонок підходять — обери ту, де значення виглядають консистентно.
- Пропускай "титульні" або декоративні рядки над заголовками (наприклад "Список співробітників", "Звіт станом на ...") — вони НЕ є заголовками.
- Якщо ПІБ розбито на кілька колонок (Прізвище, Імʼя, По-батькові) — постав номер першої колонки і додай це у notes.`;

export async function inferColumnMapping(
  rows: string[][],
  fields: FieldSpec[],
): Promise<AiMapping> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY не налаштовано");
  }

  const fieldList = fields
    .map(
      (f) =>
        `- ${f.key} (${f.label})${f.required ? " — REQUIRED" : ""}${f.hint ? `; ${f.hint}` : ""}`,
    )
    .join("\n");

  const sample = rows.slice(0, 25);

  const prompt = `${SYSTEM_PROMPT}

Поля для розпізнавання:
${fieldList}

Таблиця (перші ${sample.length} рядків, JSON):
${JSON.stringify(sample)}`;

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  let lastError: unknown;
  for (const modelName of GEMINI_MODELS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
        },
      });

      const result = await model.generateContent(prompt);
      const text = result.response.text();

      const jsonStart = text.indexOf("{");
      const jsonEnd = text.lastIndexOf("}");
      if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error("AI не повернув JSON-структуру");
      }

      const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as AiMapping;
      if (typeof parsed.headerRow !== "number" || !parsed.columnMap) {
        throw new Error("AI повернув некоректну структуру мапінгу");
      }

      for (const f of fields) {
        if (
          f.required &&
          (parsed.columnMap[f.key] === null || parsed.columnMap[f.key] === undefined)
        ) {
          throw new Error(`AI не зміг знайти обовʼязкове поле: ${f.label}`);
        }
      }

      return parsed;
    } catch (e) {
      lastError = e;
      // try next model
    }
  }

  throw lastError instanceof Error ? lastError : new Error("AI mapping failed");
}
