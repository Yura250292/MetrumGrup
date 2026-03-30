import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { TEMPLATE_PROMPTS } from "@/lib/estimate-prompts";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// Parse uploaded files to text
async function extractFileContent(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith(".pdf")) {
    try {
      const pdfModule = await import("pdf-parse");
      const pdfParse = (pdfModule as unknown as { default: (buf: Buffer) => Promise<{ text: string }> }).default || pdfModule;
      const data = await (pdfParse as (buf: Buffer) => Promise<{ text: string }>)(buffer);
      return `[PDF: ${file.name}]\n${data.text}`;
    } catch (e) {
      return `[PDF: ${file.name}] — не вдалось прочитати PDF`;
    }
  }

  if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(buffer, { type: "buffer" });
      let text = `[Excel: ${file.name}]\n`;
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        text += `\n--- Лист: ${sheetName} ---\n${csv}\n`;
      }
      return text;
    } catch (e) {
      return `[Excel: ${file.name}] — не вдалось прочитати файл`;
    }
  }

  if (fileName.endsWith(".csv") || fileName.endsWith(".txt")) {
    return `[${file.name}]\n${buffer.toString("utf-8")}`;
  }

  if (fileName.endsWith(".doc") || fileName.endsWith(".docx")) {
    return `[Word: ${file.name}]\n${buffer.toString("utf-8").replace(/[^\x20-\x7E\u0400-\u04FF\n\t ]/g, " ")}`;
  }

  // For images - send as base64 to Gemini vision
  if (file.type.startsWith("image/")) {
    return `__IMAGE__:${buffer.toString("base64")}:${file.type}`;
  }

  return `[${file.name}] — невідомий формат файлу`;
}

async function generateWithOpenAI(prompt: string, textContent: string) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY не налаштований");
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: textContent },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
    max_tokens: 8000,
  });

  return completion.choices[0]?.message?.content || "{}";
}

async function generateWithAnthropic(systemPrompt: string, userContent: string) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY не налаштований");
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await anthropic.messages.create({
    model: "claude-opus-4-20250514",
    max_tokens: 8000,
    temperature: 0.3,
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
  });

  const content = message.content[0];
  if (content.type === "text") {
    // Claude може повертати JSON в markdown блоках
    const text = content.text;
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\{[\s\S]*\}/);
    return jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text;
  }
  return "{}";
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
    return forbiddenResponse();
  }

  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "YOUR_GEMINI_API_KEY_HERE") {
    return NextResponse.json(
      { error: "GEMINI_API_KEY не налаштований. Додайте ключ в .env файл." },
      { status: 500 }
    );
  }

  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const projectId = formData.get("projectId") as string;
    const projectType = formData.get("projectType") as string || "ремонт";
    const area = formData.get("area") as string || "";
    const additionalNotes = formData.get("notes") as string || "";
    const categoriesStr = formData.get("categories") as string || "";
    const selectedCategories = categoriesStr ? categoriesStr.split(",") : [];
    const model = (formData.get("model") as string) || "gemini";
    const template = (formData.get("template") as string) || "custom";

    if (files.length === 0) {
      return NextResponse.json({ error: "Завантажте хоча б один файл" }, { status: 400 });
    }

    // Extract content from all files
    const textParts: string[] = [];
    const imageParts: { inlineData: { data: string; mimeType: string } }[] = [];

    for (const file of files) {
      const content = await extractFileContent(file);
      if (content.startsWith("__IMAGE__:")) {
        const [, base64, mimeType] = content.split(":");
        imageParts.push({ inlineData: { data: base64, mimeType } });
      } else {
        textParts.push(content);
      }
    }

    // Load materials from DB for reference pricing
    const materials = await prisma.material.findMany({
      where: { isActive: true },
      select: { name: true, category: true, unit: true, basePrice: true, laborRate: true },
    });

    const laborRates = await prisma.laborRate.findMany({
      where: { isActive: true },
      select: { name: true, category: true, unit: true, ratePerUnit: true },
    });

    const materialsRef = materials.map(
      (m) => `${m.name} (${m.category}) — ${m.basePrice} ₴/${m.unit}, робота: ${m.laborRate} ₴/${m.unit}`
    ).join("\n");

    const laborRef = laborRates.map(
      (l) => `${l.name} (${l.category}) — ${l.ratePerUnit} ₴/${l.unit}`
    ).join("\n");

    // Category descriptions mapping
    const categoryDescriptions: Record<string, string> = {
      demolition: `### Демонтажні роботи
- Демонтаж старої підлоги (окремо по типу: плитка, лінолеум, ламінат, паркет)
- Демонтаж стін/перегородок (якщо є)
- Зняття старих шпалер/фарби
- Демонтаж старої сантехніки (ванна, унітаз, умивальник, змішувачі)
- Демонтаж старої електрики (розетки, вимикачі, проводка)
- Демонтаж дверей та дверних коробок
- Вивіз сміття (контейнер, мішки)`,
      earthworks: `### Земляні роботи
- Виїмка ґрунту (якщо потрібно)
- Планування та розчищення ділянки
- Влаштування котловану
- Зворотна засипка
- Вивіз ґрунту`,
      foundation: `### Фундамент
- Земляні роботи під фундамент
- Опалубка фундаменту
- Арматура для фундаменту
- Бетон для фундаменту
- Гідроізоляція фундаменту
- Утеплення фундаменту`,
      walls: `### Стіни та перегородки
- Гіпсокартон (листи, профілі CD/UD, підвіси, саморізи, стрічка серпянка)
- Або цегла/газоблок для нових стін
- Штукатурка (суміш штукатурна, маяки, сітка штукатурна)
- Шпаклівка (стартова + фінішна, окремими позиціями)
- Грунтовка глибокого проникнення
- Фарба інтер'єрна (або шпалери + клей для шпалер)
- Кутники перфоровані
- Стрічка малярна`,
      ceiling: `### Стеля
- Шпаклівка стелі або гіпсокартонна конструкція
- Фарба для стелі
- Натяжна стеля (якщо передбачена)
- Потолочний плінтус/галтель
- Грунтовка`,
      floor: `### Підлога
- Стяжка (суміш для стяжки, пісок, цемент або самовирівнювач)
- Гідроізоляція (для ванної/санвузлів)
- Утеплювач підлоги (якщо потрібно: пінополістирол, мінвата)
- Підкладка під ламінат/паркет
- Напольне покриття (ламінат, паркетна дошка, плитка — окремо для кожної кімнати)
- Клей для плитки (якщо плитка)
- Затирка для швів
- Хрестики для плитки
- Плінтус напольний + кріплення
- Поріжки`,
      electrical: `### Електрика
- Кабель ВВГнг 3×2.5 (розетки)
- Кабель ВВГнг 3×1.5 (освітлення)
- Гофра для кабелю
- Підрозетники
- Розетки (кількість по кімнатах)
- Вимикачі (одноклавішні, двоклавішні)
- Автоматичні вимикачі (на кожну групу)
- УЗО / диференційний автомат
- Електрощит
- Розподільні коробки
- LED світильники / люстри (по кімнатах)
- Точкові світильники (якщо є підвісна/натяжна стеля)`,
      plumbing: `### Сантехніка
- Труби водопостачання (поліпропілен або метал-пластик) + фітинги
- Труби каналізації 50мм, 110мм + фітинги
- Запірна арматура (крани кульові)
- Змішувач для ванної
- Змішувач для умивальника
- Змішувач для кухні
- Унітаз (з бачком, кріпленням, гофрою)
- Ванна або душова кабіна
- Умивальник + тумба
- Сифони
- Полотенцесушитель
- Екран під ванну
- Гідроізоляція ванної кімнати (обмазувальна)`,
      heating: `### Опалення та вентиляція
- Радіатори + кріплення
- Труби для опалення
- Терморегулятори
- Електричний теплий пол (кабель або мат) + терморегулятор
- Або водяний теплий пол (труби, колектор, утеплювач)
- Вентиляційні решітки
- Витяжка (якщо потрібно)`,
      windows: `### Вікна та двері
- Міжкімнатні двері (кількість по кімнатах) + коробки + лиштви
- Фурнітура дверна (ручки, завіси, замки)
- Монтажна піна
- Вхідні двері (якщо потрібно)
- Підвіконня (якщо заміна вікон)
- Відкоси (матеріал + оздоблення)
- Металопластикові вікна (якщо передбачено)`,
      finishing: `### Оздоблювальні роботи
- Малярні роботи (фарба, валики, пензлі)
- Шпалери + клей для шпалер
- Декоративна штукатурка
- Молдінги, плінтуси
- Облицювальні панелі
- Витратні матеріали (стрічка малярна, плівка захисна)`,
      kitchen: `### Кухня
- Плитка для фартуха
- Клей для плитки
- Затирка
- Розетки для техніки (окремі групи)
- Підведення води та каналізації
- Стільниця (якщо потрібно)
- Меблі кухонні (за потреби)`,
      bathroom: `### Санвузол
- Плитка для стін та підлоги
- Клей для плитки
- Затирка водостійка
- Гідроізоляція
- Сантехніка (унітаз, ванна/душ, умивальник)
- Змішувачі
- Дзеркало + шафка
- Полотенцесушитель
- Аксесуари (тримачі, гачки)`,
      roof: `### Покрівля
- Стропила дерев'яні
- Гідроізоляція покрівлі
- Утеплювач для покрівлі
- Покрівельне покриття (металочерепиця, профнастил, бітумна черепиця тощо)
- Водостічна система
- Комплектуючі для покрівлі (коники, вітрові планки, саморізи)`,
      facade: `### Фасад
- Утеплення фасаду (пінопласт, мінвата)
- Клей для утеплювача
- Дюбелі для утеплювача
- Армуюча сітка
- Декоративна штукатурка фасадна
- Грунтовка фасадна
- Фарба фасадна (якщо потрібно)`
    };

    // Build sections text based on selected categories
    const sectionsText = selectedCategories.length > 0
      ? selectedCategories.map(catId => categoryDescriptions[catId]).filter(Boolean).join("\n\n")
      : Object.values(categoryDescriptions).join("\n\n");

    // Add template-specific prompt if applicable
    const templateSpecificPrompt =
      template !== "custom" && TEMPLATE_PROMPTS[template]
        ? `\n\n${TEMPLATE_PROMPTS[template]}\n\n`
        : "";

    // Build prompt
    const prompt = `# РОЛЬ
Ти — головний кошторисник із 20-річним досвідом будівельної компанії "Metrum Group" у Львові, Україна.
Ти ЕКСПЕРТ найвищого рівня у складанні кошторисів для будівництва та ремонту. Ти ніколи не припускаєшся помилок у розрахунках площ, об'ємів та кількостей.

# КРИТИЧНІ ПРАВИЛА РОЗРАХУНКУ ПЛОЩ ТА КІЛЬКОСТЕЙ
1. **УВАЖНО ЧИТАЙ ДОКУМЕНТИ.** Якщо в PDF/Excel файлі вказано площі кімнат, стін, підлоги — використовуй ТІЛЬКИ ці значення. НЕ ВИГАДУЙ площі.
2. **Площа стін ≠ площа підлоги.** Площа стін = периметр × висота стелі (зазвичай 2.7м). Не плутай ці величини.
3. **Віднімай площі вікон та дверей** при розрахунку оздоблення стін (вікно ≈ 1.5 м², двері ≈ 1.8 м²).
4. **Перевіряй математику ДВІЧІ.** totalCost = quantity × unitPrice + laborCost. sectionTotal = сума всіх totalCost у секції.
5. Якщо площа вказана у файлі як "загальна площа квартири" — це площа ПІДЛОГИ, не стін.
6. Якщо площа НЕ вказана у файлах і користувач не вказав — оціни на основі кількості кімнат та типу приміщення, але ПОЗНАЧИТИ що це оцінка.

# ЗАВДАННЯ
Проаналізуй надані файли проєкту та створи МАКСИМАЛЬНО ДЕТАЛЬНИЙ та РЕАЛІСТИЧНИЙ КОШТОРИС.

# КОНТЕКСТ
- Тип проєкту: ${projectType}
- Площа (від користувача): ${area || "НЕ ВКАЗАНО — визначи з документів або оціни"}
- Додаткові примітки: ${additionalNotes || "немає"}
- Локація: Львів, Україна
- Валюта: гривня (₴, UAH)
${templateSpecificPrompt}
# КРИТИЧНО ВАЖЛИВО — ПОВНОТА КОШТОРИСУ
Кошторис має бути ПОВНИМ і РЕАЛІСТИЧНИМ. Типовий ремонт квартири 60-100 м² включає 50-120+ позицій матеріалів.
НЕ СКОРОЧУЙ і НЕ УЗАГАЛЬНЮЙ. Кожен матеріал — окрема позиція.

## ОБОВ'ЯЗКОВІ СЕКЦІЇ ДЛЯ КОШТОРИСУ (включи ВСІ що стосуються проєкту):

${sectionsText}

## ВАЖЛИВО ПРО КІЛЬКІСТЬ ПОЗИЦІЙ:
- Мінімум 40-60 позицій для простого ремонту однокімнатної квартири
- 60-90 позицій для двокімнатної квартири
- 80-120+ позицій для трикімнатної або більшої
- Кожен ТИП матеріалу — ОКРЕМА позиція (не "шпаклівка", а "шпаклівка стартова Knauf HP Start 30 кг" і "шпаклівка фінішна Knauf HP Finish 25 кг")
- Вказуй КОНКРЕТНІ марки та виробників матеріалів де можливо

# СТАНДАРТИ ЯКОСТІ (на основі реальних проєктів Metrum Group):

## Правило 1: КОНКРЕТНІСТЬ У НАЗВАХ
❌ ПОГАНО: "Гіпсокартон"
✅ ДОБРЕ: "Гіпсокартон вологостійкий Knauf 2500x1200х12,5 мм 3 кв. м"

❌ ПОГАНО: "Штукатурка"
✅ ДОБРЕ: "Штукатурка машинна МП-75 30кг"

❌ ПОГАНО: "Профіль"
✅ ДОБРЕ: "Профиль BauGut ARMOSTEEL CD 60/4 м 0,5 мм"

## Правило 2: РЕАЛЬНІ МАРКИ
Використовуй ці перевірені марки:
- Гіпсокартон: Knauf
- Шпаклівки: Knauf (Фуген, Мульті-Фініш, HP Start, HP Finish), Sniezka ACRYL-PUTZ
- Ґрунтовки: Ceresit (CT 17)
- Фарби: Caparol, Sadolin, Tikkurila
- Профілі: BauGut ARMOSTEEL, Knauf
- Клеї: Knauf PERLFIX, Ceresit
- Плитка: Paradyz, Cersanit, Golden Tile

## Правило 3: ПРАВИЛЬНІ СПЕЦИФІКАЦІЇ
Завжди вказуй:
- Розміри (2500x1200мм, 100x200x600мм)
- Вагу/об'єм (25кг, 30кг, 10л)
- Товщину (12,5мм, 0,5мм)
- Площу покриття (3 кв.м)

## Правило 4: ДЕТАЛЬНІСТЬ РОБІТ
❌ ПОГАНО: "Роботи зі стінами"
✅ ДОБРЕ: Окремі позиції для кожного етапу:
1. "Грунтування стін перед шпаклюванням" (м², 42₴/м²)
2. "Шпаклювання стін трьохразове" (м², 410₴/м²)
3. "Грунтування стін перед фарбуванням" (м², 42₴/м²)
4. "Фарбування стін" (м², 175₴/м²)

## Правило 5: ТОЧНІ РОЗРАХУНКИ КІЛЬКОСТЕЙ
Для стін:
- Площа стін = периметр × висота стелі (зазвичай 2.7м)
- ЗАВЖДИ віднімай площі вікон (~1.5м² кожне) та дверей (~1.8м² кожні)
- Приклад: кімната 4×5м, висота 2.7м
  * Периметр = (4+5)×2 = 18м
  * Площа стін = 18×2.7 = 48.6м²
  * Мінус двері (1.8м²) = 46.8м²

Для матеріалів:
- Додавай 10-15% запас для підрізки/браку
- Штукатурка: ~17кг/м² при товщині 10мм
- Шпаклівка стартова: ~1.2кг/м² за шар
- Шпаклівка фінішна: ~0.8кг/м² за шар
- Фарба: ~8-10м² з 1 літра (2 шари)

## Правило 6: РЕАЛЬНІ ЦІНИ (станом на 2025)
Орієнтовні ціни матеріалів:
- Гіпсокартон Knauf 12.5мм: 450-550₴/шт
- Штукатурка МП-75 30кг: 380-420₴/мішок
- Шпаклівка Knauf фінішна 25кг: 500-550₴/мішок
- Ґрунтовка Ceresit CT 17 10л: 520-590₴/банка
- Фарба Caparol 10л: 5500-6200₴/відро
- Газоблок 100×200×600: 55-65₴/шт
- Профіль CD 60 4м: 180-220₴/шт

Орієнтовні ціни робіт:
- Штукатурка стін: 300-350₴/м²
- Шпаклювання стін (3 рази): 380-450₴/м²
- Фарбування стін: 150-200₴/м²
- Мурування перегородок з газоблоку: 420-500₴/м²
- Монтаж ГКЛ: 250-300₴/м²

## Правило 7: СТРУКТУРА СЕКЦІЙ
Дотримуйся логічного порядку:
1. Демонтажні роботи (завжди першими!)
2. Мурування/перегородки
3. Штукатурні роботи
4. Грунтування
5. Шпаклювання
6. Фінішне грунтування
7. Фарбування/оздоблення

Всередині кожної секції:
- Спочатку матеріали основні
- Потім комплектуючі
- Потім витратні матеріали

# ДОВІДКОВІ ЦІНИ З НАШОЇ БАЗИ (використовуй як орієнтир):
Матеріали:
${materialsRef}

Тарифи на роботи:
${laborRef}

# ДАНІ З ФАЙЛІВ КЛІЄНТА:
${textParts.join("\n\n")}

# ПОШУК ЦІН ТА ПОСИЛАННЯ
Для КОЖНОГО матеріалу в кошторисі:
- Знайди РЕАЛЬНУ АКТУАЛЬНУ ціну на українському ринку через Google Search
- Для посилання (priceSource) використовуй ТІЛЬКИ формат ПОШУКОВОГО ЗАПИТУ магазину:
  * https://epicentrk.ua/search/?q=НАЗВА+ТОВАРУ
  * https://prom.ua/search?search_term=НАЗВА+ТОВАРУ
  * https://budmagazin.ua/search?q=НАЗВА+ТОВАРУ
- НІКОЛИ не вигадуй прямі посилання на конкретні сторінки товарів (вони будуть 404!)
- Використовуй ТІЛЬКИ пошукові URL-и — вони ЗАВЖДИ працюють
- priceNote — вкажи знайдену ціну та назву товару
- Ціна в кошторисі має відповідати реальній ринковій ціні

# ПРИКЛАДИ ПРАВИЛЬНОГО ОФОРМЛЕННЯ ПОЗИЦІЙ (з реальних проєктів Metrum Group):

## Приклад 1: Стіни та штукатурка
{
  "description": "Штукатурка машинна МП-75 30кг",
  "unit": "шт",
  "quantity": 96,
  "unitPrice": 400,
  "laborCost": 0,
  "totalCost": 38400,
  "priceSource": "https://epicentrk.ua/search/?q=штукатурка+МП-75+30кг",
  "priceNote": "Штукатурка МП-75 30кг, ~400₴ (epicentrk.ua)"
}

## Приклад 2: Гіпсокартонні конструкції
{
  "description": "Гіпсокартон вологостійкий Knauf 2500x1200х12,5 мм 3 кв. м",
  "unit": "шт",
  "quantity": 17,
  "unitPrice": 505,
  "laborCost": 0,
  "totalCost": 8585,
  "priceSource": "https://epicentrk.ua/search/?q=гіпсокартон+Knauf+вологостійкий+12.5мм",
  "priceNote": "ГКЛ вологостійкий Knauf 12.5мм, ~505₴ (epicentrk.ua)"
}

## Приклад 3: Профілі та комплектуючі
{
  "description": "Профиль BauGut ARMOSTEEL CD 60/4 м 0,5 мм",
  "unit": "шт",
  "quantity": 23,
  "unitPrice": 202,
  "laborCost": 0,
  "totalCost": 4646,
  "priceSource": "https://epicentrk.ua/search/?q=профіль+CD+60+4м",
  "priceNote": "Профіль CD 60 4м, ~202₴ (epicentrk.ua)"
}

## Приклад 4: Шпаклівка
{
  "description": "Шпаклівка Knauf гіпсова Мульті-Фініш 25кг",
  "unit": "шт",
  "quantity": 49,
  "unitPrice": 530,
  "laborCost": 0,
  "totalCost": 25970,
  "priceSource": "https://epicentrk.ua/search/?q=Knauf+Мульті+Фініш+25кг",
  "priceNote": "Knauf Мульті-Фініш 25кг, ~530₴ (epicentrk.ua)"
}

## Приклад 5: Ґрунтовка
{
  "description": "Ґрунтовка глибокопроникна Ceresit CT 17 10 л",
  "unit": "шт",
  "quantity": 14,
  "unitPrice": 559,
  "laborCost": 0,
  "totalCost": 7826,
  "priceSource": "https://epicentrk.ua/search/?q=Ceresit+CT17+10л",
  "priceNote": "Ceresit CT 17 10л, ~559₴ (epicentrk.ua)"
}

## Приклад 6: Фарба
{
  "description": "Фарба інтер'єрна Caparol біла 10 л під колерування",
  "unit": "шт",
  "quantity": 9,
  "unitPrice": 5850,
  "laborCost": 0,
  "totalCost": 52650,
  "priceSource": "https://epicentrk.ua/search/?q=Caparol+фарба+10л",
  "priceNote": "Caparol біла 10л, ~5850₴ (epicentrk.ua)"
}

## Приклад 7: Газоблок
{
  "description": "Газоблок 100х200х600мм",
  "unit": "шт",
  "quantity": 1045,
  "unitPrice": 58,
  "laborCost": 0,
  "totalCost": 60610,
  "priceSource": "https://epicentrk.ua/search/?q=газоблок+100х200х600",
  "priceNote": "Газоблок 100x200x600мм, ~58₴ (epicentrk.ua)"
}

## Приклад 8: Роботи зі складним розрахунком
{
  "description": "Штукатурка стін гіпсовою штукатуркою",
  "unit": "м²",
  "quantity": 238.4,
  "unitPrice": 0,
  "laborCost": 78672,
  "totalCost": 78672,
  "priceSource": "",
  "priceNote": "Вартість робіт: 330₴/м² × 238.4м² = 78,672₴"
}

**ВАЖЛИВО:** Звертай увагу на:
1. Конкретні марки та виробники (Knauf, Ceresit, BauGut, Caparol)
2. Точні специфікації (розміри, вага, об'єм)
3. Реальні ціни з українського ринку (станом на 2025)
4. Правильні одиниці виміру (шт, м², м, кг, л)
5. Точні розрахунки totalCost = quantity × unitPrice + laborCost
6. Детальні priceNote з поясненням ціни

# ФОРМАТ ВІДПОВІДІ (тільки JSON, без іншого тексту):
{
  "title": "Назва кошторису",
  "description": "Короткий опис проєкту з визначеною площею",
  "area": "XX м² (ТОЧНА площа з документів або обґрунтована оцінка)",
  "areaSource": "звідки взята площа: 'з документу', 'вказано користувачем', або 'оцінка на основі...'",
  "sections": [
    {
      "title": "Назва секції",
      "items": [
        {
          "description": "Конкретна назва матеріалу з маркою та об'ємом/вагою",
          "unit": "м²/м.п./шт/мішок/рул/комплект/тощо",
          "quantity": 0.00,
          "unitPrice": 0.00,
          "laborCost": 0.00,
          "totalCost": 0.00,
          "priceSource": "https://epicentrk.ua/search/?q=назва+товару",
          "priceNote": "Назва товару, ~ціна ₴ (epicentrk.ua)"
        }
      ],
      "sectionTotal": 0.00
    }
  ],
  "summary": {
    "materialsCost": 0.00,
    "laborCost": 0.00,
    "overheadPercent": 15,
    "overheadCost": 0.00,
    "totalBeforeDiscount": 0.00,
    "recommendations": "Конкретні рекомендації по оптимізації бюджету"
  }
}

# КОНТРОЛЬ ЯКОСТІ (перевір перед відповіддю):
✓ Кошторис містить НЕ МЕНШЕ 40 позицій матеріалів
✓ Всі площі відповідають даним з файлів
✓ totalCost = quantity × unitPrice + laborCost (для кожної позиції)
✓ sectionTotal = сума totalCost всіх позицій секції
✓ materialsCost = сума (quantity × unitPrice) по всіх позиціях
✓ laborCost = сума laborCost по всіх позиціях
✓ overheadCost = (materialsCost + laborCost) × overheadPercent / 100
✓ totalBeforeDiscount = materialsCost + laborCost + overheadCost
✓ Посилання — ТІЛЬКИ пошукові URL магазинів (НЕ прямі сторінки товарів)
✓ Кожен матеріал має конкретну назву з маркою/виробником`;

    // Generate estimate using selected AI model
    let text = "";

    switch (model) {
      case "openai":
        console.log("🤖 Використовуємо OpenAI GPT-4o...");
        text = await generateWithOpenAI(prompt, textParts.join("\n\n"));
        break;

      case "anthropic":
        console.log("🧠 Використовуємо Anthropic Claude Opus 4...");
        text = await generateWithAnthropic(prompt, textParts.join("\n\n"));
        break;

      default: // "gemini"
        console.log("✨ Використовуємо Google Gemini з Google Search...");
        // Call Gemini with Google Search grounding for real prices
        const geminiModel = genAI.getGenerativeModel({
          model: "gemini-3-flash-preview",
          tools: [{
            googleSearch: {},
          } as unknown as import("@google/generative-ai").Tool],
        });

        const parts: (string | { inlineData: { data: string; mimeType: string } })[] = [prompt];
        if (imageParts.length > 0) {
          parts.push(...imageParts);
        }

        const result = await geminiModel.generateContent(parts);
        const response = result.response;
        text = response.text();
        break;
    }

    // Parse JSON from response
    let estimateData;
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
      const jsonStr = (jsonMatch[1] || text).trim();
      estimateData = JSON.parse(jsonStr);
    } catch (parseError) {
      return NextResponse.json({
        error: "AI повернув невалідний JSON. Спробуйте ще раз.",
        rawResponse: text,
      }, { status: 422 });
    }

    return NextResponse.json({
      data: estimateData,
      filesProcessed: files.map((f) => f.name),
    });
  } catch (error: unknown) {
    console.error("Estimate generation error:", error);
    const message = error instanceof Error ? error.message : "Невідома помилка";
    return NextResponse.json({ error: `Помилка генерації: ${message}` }, { status: 500 });
  }
}
