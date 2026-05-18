/**
 * Візуальний аналіз будівельних креслень (Gemini Vision) — багатопрохідний.
 *
 * Навіщо: текстовий витяг з CAD-PDF (pdf-parse) дає плоский потік цифр без
 * прив'язки до стін/приміщень. Цей модуль подає PDF/зображення напряму у
 * Gemini Vision разом із DRAWING_READING_GUIDE.
 *
 * Замість одного «все-в-одному» проходу робиться КІЛЬКА фокусованих проходів
 * (приміщення/конструкції, інженерія, оздоблення, специфікації) — кожен має
 * власний бюджет токенів, тож обмір детальний, а не резюме. Усі проходи
 * читають той самий завантажений файл (Files API URI) паралельно.
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

interface VisionPass {
  key: string;
  title: string;
  prompt: string;
}

const COMMON_RULES = `
ПРАВИЛА:
- Розміри на кресленнях у мм: "3500" = 3.5 м. Площі — у м².
- Будь КОНКРЕТНИЙ: не "кілька кабінетів", а "Кабінет — 40,80 м²".
- Розділяй поверхи явно.
- Якщо чогось не видно/нечітко — познач у примітках, НЕ вигадуй.
- Відповідай ТІЛЬКИ змістовним звітом, без вступних фраз.`;

/** Прохід 1 — приміщення, перегородки, прорізи. */
const PASS_ROOMS: VisionPass = {
  key: 'rooms',
  title: 'ПРИМІЩЕННЯ ТА КОНСТРУКЦІЇ',
  prompt: `# ОБМІР: ПРИМІЩЕННЯ ТА КОНСТРУКЦІЇ

Ти — інженер-кошторисник. Зчитай з креслень:

1. **Будівля:** тип, кількість поверхів, загальна площа.
2. **ПРИМІЩЕННЯ** — повний перелік з УСІХ поверхів: назва + площа (м²).
   Бери дані з таблиць "Специфікація приміщень", якщо вони є.
3. **ПЕРЕГОРОДКИ** — сумарна довжина (м.п.) або площа (м²) нових перегородок,
   ОКРЕМО за типом і товщиною (ГКЛ 75/100/110/125 мм, у 2 шари, з блоків).
   Зашивка колон і зашивка інсталяцій/стояків — окремими рядками.
   Нарощення/підсилення існуючих стін — окремо.
4. **СКЛЯНІ КОНСТРУКЦІЇ** — скляні перегородки/огородження: к-сть, площа (м²).
5. **ДВЕРІ та ВІКНА** — загальна кількість за типами (міжкімнатні, скляні,
   технічні, вхідні; вікна — к-сть і габарити).
${COMMON_RULES}

ОБОВ'ЯЗКОВО в кінці окремим рядком:
ЗАГАЛЬНА_ПЛОЩА_М2: <сума площ приміщень з усіх поверхів — лише число>`,
};

/** Прохід 2 — інженерні системи. */
const PASS_ENGINEERING: VisionPass = {
  key: 'engineering',
  title: 'ІНЖЕНЕРНІ СИСТЕМИ',
  prompt: `# ОБМІР: ІНЖЕНЕРНІ СИСТЕМИ

Ти — інженер-кошторисник. Зчитай з планів інженерних мереж:

1. **ЕЛЕКТРИКА** — кількість розеток (за типами), вимикачів, виводів,
   електрощитів. Рахуй символи на планах.
2. **ОСВІТЛЕННЯ** — кількість світильників за типами (точкові, лінійні,
   люстри, трекові). Якщо є "Специфікація освітлення" — бери звідти.
3. **САНТЕХНІКА** — унітази, умивальники, душі/піддони, мийки, бойлери —
   к-сть; орієнтовна довжина трас водопостачання/каналізації.
4. **ОПАЛЕННЯ** — радіатори (к-сть), тепла підлога (площа м²), труби.
5. **ВЕНТИЛЯЦІЯ** — решітки, дифузори, припливні/витяжні установки.
${COMMON_RULES}`,
};

/** Прохід 3 — оздоблення. */
const PASS_FINISHING: VisionPass = {
  key: 'finishing',
  title: 'ОЗДОБЛЕННЯ',
  prompt: `# ОБМІР: ОЗДОБЛЕННЯ

Ти — інженер-кошторисник. Зчитай з планів стелі, підлоги, оздоблення стін:

1. **ПІДЛОГА** — площі (м²) ОКРЕМО за типом покриття для кожного приміщення
   (плитка/керамограніт, ламінат, паркет, наливна). Стяжка — площа.
2. **СТЕЛЯ** — площі за типом: підвісна ГКЛ, натяжна, Armstrong,
   **акустичні панелі**, фарбування.
3. **СТІНИ** — площі оздоблення за типом: фарбування, плитка, шпалери,
   декоративна штукатурка, панелі.
4. **ПЛІНТУС** — сумарна довжина (м.п.) за типом (МДФ, прихований).
${COMMON_RULES}`,
};

/** Прохід 4 — дослівне перенесення таблиць-специфікацій. */
const PASS_SPECS: VisionPass = {
  key: 'specs',
  title: 'СПЕЦИФІКАЦІЇ (дослівно з таблиць)',
  prompt: `# ПЕРЕНЕСЕННЯ СПЕЦИФІКАЦІЙ

На кресленнях можуть бути аркуші-ТАБЛИЦІ: "Специфікація дверей",
"Специфікація освітлення", "Специфікація матеріалів", "Відомість оздоблення".

Перепиши КОЖНУ таку таблицю МАКСИМАЛЬНО ТОЧНО, рядок за рядком:
- позиція/марка, найменування, габарити, кількість, одиниця;
- для матеріалів — конкретні марки/виробники, якщо вказані.

Це джерело правди для матеріалів — НЕ узагальнюй, НЕ замінюй власними.
Якщо специфікацій-таблиць у документі немає — напиши "Специфікацій-таблиць не виявлено".
${COMMON_RULES}`,
};

const PASSES: VisionPass[] = [PASS_ROOMS, PASS_ENGINEERING, PASS_FINISHING, PASS_SPECS];

type MediaPart =
  | { inlineData: { data: string; mimeType: string } }
  | { fileData: { fileUri: string; mimeType: string } };

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

  const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);
  const uploadedNames: string[] = [];

  try {
    const guide = await loadDrawingGuide();

    // Підготувати медіа-частини ОДИН раз — переюзаються в усіх проходах.
    const mediaParts: MediaPart[] = [];
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

          let info = uploaded.file;
          let waited = 0;
          while (info.state === FileState.PROCESSING && waited < 120_000) {
            await sleep(3000);
            waited += 3000;
            info = await fileManager.getFile(uploaded.file.name);
          }
          if (info.state === FileState.ACTIVE) {
            mediaParts.push({ fileData: { fileUri: info.uri, mimeType: info.mimeType } });
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
        mediaParts.push({ inlineData: { data: p.data, mimeType: p.mimeType } });
      }
    }

    if (mediaParts.length === 0) {
      return { report: '', analyzedCount: 0, error: 'Не вдалось підготувати жоден файл' };
    }

    const model = genAI.getGenerativeModel({
      model: 'gemini-3-flash-preview',
      generationConfig: { temperature: 0.1, maxOutputTokens: 12000 },
    });

    const areaHint = opts?.wizardArea
      ? `\n(Орієнтир із опитувальника: загальна площа ~${opts.wizardArea} м² — для перевірки, не заміна виміру.)`
      : '';
    const guideBlock = guide ? `\n\n=== ГАЙД ЧИТАННЯ КРЕСЛЕНЬ ===\n${guide}` : '';

    // Усі фокусовані проходи паралельно — кожен зі своїм бюджетом токенів.
    const passResults = await Promise.all(
      PASSES.map(async (pass): Promise<{ pass: VisionPass; text: string }> => {
        try {
          const result = await model.generateContent([
            pass.prompt + areaHint + guideBlock,
            ...(mediaParts as any[]),
          ]);
          return { pass, text: (result.response.text() || '').trim() };
        } catch (e) {
          console.warn(
            `⚠️ Vision pass "${pass.key}" failed:`,
            e instanceof Error ? e.message : e
          );
          return { pass, text: '' };
        }
      })
    );

    const ok = passResults.filter((r) => r.text.length > 40);
    if (ok.length === 0) {
      return { report: '', analyzedCount: 0, error: 'Vision не повернув жодного звіту' };
    }

    // Зібрати звіт.
    const body = ok
      .map((r) => `### ${r.pass.title}\n${r.text}`)
      .join('\n\n');
    const report =
      `## ВІЗУАЛЬНИЙ ОБМІР КРЕСЛЕНЬ (Gemini Vision, ${ok.length} проходів)\n` +
      `_Зчитано безпосередньо з ${parts.length} креслень — ПРІОРИТЕТНЕ джерело розмірів._\n\n` +
      body;

    // Площа — з проходу по приміщеннях.
    let totalAreaM2: number | undefined;
    const roomsText = passResults.find((r) => r.pass.key === 'rooms')?.text || '';
    const areaMatch = roomsText.match(/ЗАГАЛЬНА_ПЛОЩА_М2\s*[:=]\s*([\d\s.,]+)/i);
    if (areaMatch) {
      const parsed = parseFloat(areaMatch[1].replace(/\s/g, '').replace(',', '.'));
      if (Number.isFinite(parsed) && parsed > 0) totalAreaM2 = parsed;
    }

    return { report, analyzedCount: parts.length, totalAreaM2 };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('❌ analyzeDrawingsVisually failed:', msg);
    return { report: '', analyzedCount: 0, error: msg };
  } finally {
    // Прибрати завантажені файли (best-effort).
    for (const name of uploadedNames) {
      fileManager.deleteFile(name).catch(() => {});
    }
  }
}
