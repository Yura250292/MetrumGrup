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
import crypto from 'crypto';
import { putJsonToR2, getJsonFromR2 } from '../r2-client';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Версія кешу обмірів. Зміни її, якщо змінив промпти/логіку проходів —
// тоді старий кеш інвалідовується і обмір рахується наново.
const VISION_CACHE_VERSION = 'v2-facts';

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

/**
 * Структуровані обсяги, зведені з обміру — «відомість обсягів».
 * Це джерело правди для quantity у кошторисі.
 */
export interface MeasuredFacts {
  totalAreaM2?: number;
  floorAreaM2?: number;
  ceilingAreaM2?: number;
  wallFinishAreaM2?: number;
  partitions?: Array<{ label: string; unit: string; quantity: number }>;
  doors?: { interior?: number; glass?: number; technical?: number; entrance?: number };
  glazingM2?: number;
  fixtures?: {
    outlets?: number;
    switches?: number;
    lights?: number;
    toilets?: number;
    sinks?: number;
    radiators?: number;
  };
}

export interface DrawingVisionResult {
  /** Готовий текстовий блок для masterContext (порожній, якщо аналіз не вдався). */
  report: string;
  /** Скільки документів реально проаналізовано візуально. */
  analyzedCount: number;
  /** Сумарна площа об'єкта, зчитана з креслень (м²), якщо вдалось визначити. */
  totalAreaM2?: number;
  /** Структуровані обсяги (зведена відомість). */
  measuredFacts?: MeasuredFacts;
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
 * Звести прозовий обмір у СТРУКТУРОВАНУ відомість обсягів (JSON).
 * Це 5-й, консолідаційний прохід — числа беруться з уже зчитаного обміру.
 */
async function extractMeasuredFacts(
  reportBody: string,
  wizardArea?: string | number
): Promise<MeasuredFacts | null> {
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-3-flash-preview',
      generationConfig: { temperature: 0, maxOutputTokens: 3000, responseMimeType: 'application/json' },
    });
    const prompt = `На основі ОБМІРУ креслень нижче зведи СТРУКТУРОВАНУ відомість обсягів.
Числа бери ТІЛЬКИ з обміру, не вигадуй. Чого немає — пропусти поле.
${wizardArea ? `Орієнтир площі: ~${wizardArea} м².` : ''}

ОБМІР:
${reportBody.slice(0, 30000)}

Поверни JSON:
{
  "totalAreaM2": число, "floorAreaM2": число, "ceilingAreaM2": число,
  "wallFinishAreaM2": число, "glazingM2": число,
  "partitions": [{"label":"ГКЛ 100мм","unit":"м²","quantity":число}],
  "doors": {"interior":число,"glass":число,"technical":число,"entrance":число},
  "fixtures": {"outlets":число,"switches":число,"lights":число,"toilets":число,"sinks":число,"radiators":число}
}`;
    const result = await model.generateContent(prompt);
    const text = (result.response.text() || '')
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? (parsed as MeasuredFacts) : null;
  } catch (e) {
    console.warn('⚠️ extractMeasuredFacts failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

/** Сформувати текстову «відомість обсягів» для промпта. */
function formatFactsTable(f: MeasuredFacts): string {
  const num = (n?: number) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined);
  const lines: string[] = [];
  if (num(f.totalAreaM2)) lines.push(`- Загальна площа: ${f.totalAreaM2} м²`);
  if (num(f.floorAreaM2)) lines.push(`- Площа підлоги: ${f.floorAreaM2} м²`);
  if (num(f.ceilingAreaM2)) lines.push(`- Площа стелі: ${f.ceilingAreaM2} м²`);
  if (num(f.wallFinishAreaM2)) lines.push(`- Площа стін під опорядження: ${f.wallFinishAreaM2} м²`);
  if (num(f.glazingM2)) lines.push(`- Скління: ${f.glazingM2} м²`);
  for (const p of f.partitions ?? []) {
    if (num(p.quantity)) lines.push(`- Перегородка «${p.label}»: ${p.quantity} ${p.unit || 'м²'}`);
  }
  const dp: string[] = [];
  if (num(f.doors?.interior)) dp.push(`міжкімнатні ${f.doors!.interior}`);
  if (num(f.doors?.glass)) dp.push(`скляні ${f.doors!.glass}`);
  if (num(f.doors?.technical)) dp.push(`технічні ${f.doors!.technical}`);
  if (num(f.doors?.entrance)) dp.push(`вхідні ${f.doors!.entrance}`);
  if (dp.length) lines.push(`- Двері: ${dp.join(', ')} шт`);
  const fp: string[] = [];
  if (num(f.fixtures?.outlets)) fp.push(`розетки ${f.fixtures!.outlets}`);
  if (num(f.fixtures?.switches)) fp.push(`вимикачі ${f.fixtures!.switches}`);
  if (num(f.fixtures?.lights)) fp.push(`світильники ${f.fixtures!.lights}`);
  if (num(f.fixtures?.toilets)) fp.push(`унітази ${f.fixtures!.toilets}`);
  if (num(f.fixtures?.sinks)) fp.push(`умивальники ${f.fixtures!.sinks}`);
  if (num(f.fixtures?.radiators)) fp.push(`радіатори ${f.fixtures!.radiators}`);
  if (fp.length) lines.push(`- Прилади: ${fp.join(', ')} шт`);

  if (lines.length === 0) return '';
  return (
    `## 📋 ВІДОМІСТЬ ОБСЯГІВ (ЗАФІКСОВАНО)\n` +
    `Це ТОЧНІ обсяги з креслень. У позиціях кошторису quantity бери САМЕ звідси.\n` +
    lines.join('\n') +
    '\n\n'
  );
}

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

  // 🔒 ДЕТЕРМІНІЗМ: обмір кешується за хешем вмісту файлів.
  // Той самий PDF → той самий обмір кожної генерації (без варіації Vision).
  const hasher = crypto.createHash('sha256').update(VISION_CACHE_VERSION);
  for (const p of parts) hasher.update(p.data);
  const cacheKey = `drawing-vision-cache/${hasher.digest('hex')}.json`;

  const cached = await getJsonFromR2<DrawingVisionResult>(cacheKey);
  if (cached && cached.report) {
    console.log('♻️ drawing-vision: обмір узято з кешу R2 (детермінований повтор)');
    return cached;
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

    // Зібрати звіт. Кожен прохід обмежуємо ~14000 символів, щоб обмір
    // не роздув промпт секцій (він інжектиться у кожну секцію).
    const PASS_CHAR_CAP = 14000;
    const body = ok
      .map((r) => {
        const text =
          r.text.length > PASS_CHAR_CAP
            ? r.text.slice(0, PASS_CHAR_CAP) + '\n…(скорочено)'
            : r.text;
        return `### ${r.pass.title}\n${text}`;
      })
      .join('\n\n');
    // 5-й прохід — звести прозовий обмір у структуровану відомість обсягів.
    const measuredFacts = (await extractMeasuredFacts(body, opts?.wizardArea)) ?? undefined;
    const factsTable = measuredFacts ? formatFactsTable(measuredFacts) : '';

    const report =
      `## ВІЗУАЛЬНИЙ ОБМІР КРЕСЛЕНЬ (Gemini Vision, ${ok.length} проходів)\n` +
      `_Зчитано безпосередньо з ${parts.length} креслень — ПРІОРИТЕТНЕ джерело розмірів._\n\n` +
      factsTable +
      body;

    // Площа — з відомості обсягів або з проходу по приміщеннях.
    let totalAreaM2: number | undefined = measuredFacts?.totalAreaM2;
    if (!totalAreaM2) {
      const roomsText = passResults.find((r) => r.pass.key === 'rooms')?.text || '';
      const areaMatch = roomsText.match(/ЗАГАЛЬНА_ПЛОЩА_М2\s*[:=]\s*([\d\s.,]+)/i);
      if (areaMatch) {
        const parsed = parseFloat(areaMatch[1].replace(/\s/g, '').replace(',', '.'));
        if (Number.isFinite(parsed) && parsed > 0) totalAreaM2 = parsed;
      }
    }

    const result: DrawingVisionResult = {
      report,
      analyzedCount: parts.length,
      totalAreaM2,
      measuredFacts,
    };
    // Зберегти у кеш — наступні генерації того ж файлу візьмуть готовий обмір.
    await putJsonToR2(cacheKey, result).catch((e) =>
      console.warn('⚠️ drawing-vision: не вдалось закешувати обмір —', e instanceof Error ? e.message : e)
    );
    return result;
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
