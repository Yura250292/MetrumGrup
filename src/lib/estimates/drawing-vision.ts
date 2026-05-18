/**
 * Візуальний аналіз будівельних креслень (Gemini Vision).
 *
 * Навіщо: текстовий витяг з CAD-PDF (pdf-parse) дає плоский потік цифр без
 * прив'язки до стін/приміщень — за ним неможливо порахувати кошторис.
 * Цей модуль подає PDF/зображення безпосередньо у Gemini Vision разом із
 * DRAWING_READING_GUIDE і повертає СТРУКТУРОВАНИЙ текстовий обмір
 * (площі приміщень, довжини перегородок, кількості дверей/вікон/приладів),
 * який далі вливається у masterContext генерації.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager, FileState } from '@google/generative-ai/server';
import { promises as fs } from 'fs';
import path from 'path';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Gemini inline-payload ліміт ~20 МБ на ВЕСЬ запит. Файли більші за цей поріг
// (raw bytes) вантажимо через Files API, дрібні — лишаємо inline.
const FILES_API_THRESHOLD_BYTES = 7 * 1024 * 1024;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Приблизний розмір у байтах з довжини base64-рядка. */
function base64Bytes(b64: string): number {
  return Math.floor((b64.length * 3) / 4);
}

export interface DrawingPart {
  data: string; // base64
  mimeType: string;
  name?: string;
}

export interface DrawingVisionResult {
  /** Готовий текстовий блок для masterContext (порожній, якщо аналіз не вдався). */
  report: string;
  /** Скільки документів реально проаналізовано візуально. */
  analyzedCount: number;
  /** Сумарна площа об'єкта, зчитана з креслень (м²), якщо вдалось визначити. */
  totalAreaM2?: number;
  /** Технічна помилка, якщо була (генерація не падає через неї). */
  error?: string;
}

/** Завантажити гайд читання креслень (тихо деградує, якщо файлу нема). */
async function loadDrawingGuide(): Promise<string> {
  try {
    const filePath = path.join(process.cwd(), 'src/lib/DRAWING_READING_GUIDE.md');
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return '';
  }
}

const VISION_PROMPT = `# ЗАВДАННЯ: ВІЗУАЛЬНИЙ ОБМІР БУДІВЕЛЬНИХ КРЕСЛЕНЬ

Ти — інженер-кошторисник. Перед тобою креслення проєкту (плани, специфікації).
Твоя робота — ТОЧНО зчитати з креслень УСІ розміри та кількості, які потрібні
для розрахунку кошторису. Використовуй гайд читання креслень нижче.

## ЩО ОБОВ'ЯЗКОВО ЗЧИТАТИ І ПОРАХУВАТИ:

1. **ПРИМІЩЕННЯ** — назва + площа (м²) кожного приміщення з усіх поверхів.
   Якщо є таблиця "Специфікація приміщень" — бери дані з неї.
2. **ПЕРЕГОРОДКИ** — сумарна довжина (м.п.) нових перегородок, окремо за типом
   і товщиною (ГКЛ 75/100/110/125 мм, у 2 шари, з блоків, скляні). Зашивка
   колон та інсталяцій — окремо.
3. **ДВЕРІ** — кількість за типами (міжкімнатні, скляні, технічні, вхідні);
   якщо є специфікація дверей — звідти.
4. **ВІКНА / СКЛІННЯ** — кількість і габарити, скляні конструкції/перегородки.
5. **ПІДЛОГА / СТЕЛЯ / СТІНИ** — площі оздоблення за типом покриття
   (плитка, ламінат, фарбування, підвісна/акустична/натяжна стеля).
6. **ЕЛЕКТРИКА** — кількість розеток, вимикачів, світильників (з планів).
7. **САНТЕХНІКА** — унітази, умивальники, душі/ванни, мийки.
8. **ОПАЛЕННЯ / ОВ** — радіатори, тепла підлога (площа), вентрешітки.

## ПРАВИЛА:
- Розміри на кресленнях у мм: "3500" = 3.5 м. Площі рахуй у м².
- Будь КОНКРЕТНИЙ: не "кілька кабінетів", а "Кабінет — 40,80 м²".
- Якщо чогось не видно/нечітко — познач це у полі notes, не вигадуй.
- Поверхи розділяй явно.

## ФОРМАТ ВІДПОВІДІ — Markdown (без code-fence):

### ОБМІР КРЕСЛЕНЬ
**Будівля:** <тип, поверхів, загальна площа>

**Приміщення:**
- <Поверх 1> Назва — XX,XX м²
...

**Перегородки:** <за типами, м.п.>
**Двері:** <за типами, шт>
**Вікна/скління:** <шт, особливості>
**Оздоблення підлоги/стін/стелі:** <площі за типами>
**Електрика:** розетки X, вимикачі Y, світильники Z
**Сантехніка:** <прилади, шт>
**Опалення/ОВ:** <радіатори, тепла підлога м²>
**Примітки та невизначеності:** <що не вдалось зчитати точно>

ЗАГАЛЬНА_ПЛОЩА_М2: <сумарна площа всіх приміщень/поверхів — ЛИШЕ число, напр. 874.7>

Відповідай ТІЛЬКИ цим звітом, без вступних фраз.
Рядок ЗАГАЛЬНА_ПЛОЩА_М2 обов'язковий — це сума площ приміщень з усіх поверхів.`;

/**
 * Проаналізувати креслення візуально і повернути текстовий обмір.
 * Ніколи не кидає виключення — у разі помилки повертає порожній report.
 */
export async function analyzeDrawingsVisually(
  parts: DrawingPart[],
  opts?: { wizardArea?: string | number }
): Promise<DrawingVisionResult> {
  if (!parts || parts.length === 0) {
    return { report: '', analyzedCount: 0 };
  }
  if (!process.env.GEMINI_API_KEY) {
    return { report: '', analyzedCount: 0, error: 'GEMINI_API_KEY not configured' };
  }

  try {
    const guide = await loadDrawingGuide();

    const model = genAI.getGenerativeModel({
      model: 'gemini-3-flash-preview',
      generationConfig: { temperature: 0.1, maxOutputTokens: 8000 },
    });

    const areaHint = opts?.wizardArea
      ? `\n\n(Орієнтир із опитувальника: загальна площа ~${opts.wizardArea} м² — використовуй як перевірку, не як заміну виміру з креслень.)`
      : '';

    const promptParts: any[] = [VISION_PROMPT + areaHint];
    if (guide) {
      promptParts.push(`\n\n=== ГАЙД ЧИТАННЯ КРЕСЛЕНЬ ===\n${guide}`);
    }

    // Великі файли — через Files API, дрібні — inline.
    const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);
    const uploadedNames: string[] = [];

    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (base64Bytes(p.data) > FILES_API_THRESHOLD_BYTES) {
        try {
          const buffer = Buffer.from(p.data, 'base64');
          const uploaded = await fileManager.uploadFile(buffer, {
            mimeType: p.mimeType,
            displayName: p.name || `drawing-${i + 1}`,
          });
          uploadedNames.push(uploaded.file.name);

          // Дочекатись, поки Gemini обробить файл (PDF → PROCESSING).
          let info = uploaded.file;
          let waited = 0;
          while (info.state === FileState.PROCESSING && waited < 120_000) {
            await sleep(3000);
            waited += 3000;
            info = await fileManager.getFile(uploaded.file.name);
          }
          if (info.state === FileState.ACTIVE) {
            promptParts.push({ fileData: { fileUri: info.uri, mimeType: info.mimeType } });
          } else {
            console.warn(`⚠️ Files API: файл ${p.name} у стані ${info.state}, пропускаю`);
          }
        } catch (e) {
          console.warn(
            `⚠️ Files API upload failed (${p.name}):`,
            e instanceof Error ? e.message : e
          );
        }
      } else {
        promptParts.push({ inlineData: { data: p.data, mimeType: p.mimeType } });
      }
    }

    const result = await model.generateContent(promptParts);
    const text = (result.response.text() || '').trim();

    // Прибрати завантажені файли (best-effort, не блокує).
    for (const name of uploadedNames) {
      fileManager.deleteFile(name).catch(() => {});
    }

    if (text.length < 80) {
      return { report: '', analyzedCount: 0, error: 'Vision повернув порожній звіт' };
    }

    const report =
      `## ВІЗУАЛЬНИЙ ОБМІР КРЕСЛЕНЬ (Gemini Vision)\n` +
      `_Зчитано безпосередньо з ${parts.length} креслень — пріоритетне джерело розмірів._\n\n` +
      text;

    // Витягти сумарну площу для авто-заповнення, якщо її не ввели вручну.
    let totalAreaM2: number | undefined;
    const areaMatch = text.match(/ЗАГАЛЬНА_ПЛОЩА_М2\s*[:=]\s*([\d\s.,]+)/i);
    if (areaMatch) {
      const parsed = parseFloat(areaMatch[1].replace(/\s/g, '').replace(',', '.'));
      if (Number.isFinite(parsed) && parsed > 0) totalAreaM2 = parsed;
    }

    return { report, analyzedCount: parts.length, totalAreaM2 };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('❌ analyzeDrawingsVisually failed:', msg);
    return { report: '', analyzedCount: 0, error: msg };
  }
}
