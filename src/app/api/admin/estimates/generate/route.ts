import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { TEMPLATE_PROMPTS } from "@/lib/estimate-prompts";
import { validateEstimate, formatValidationReport } from "@/lib/estimate-validation";
import { generateMaterialsContext } from "@/lib/materials-database";
import { generateWorkItemsContext } from "@/lib/work-items-database";
import { parseSpecificationText, generateSpecificationContext } from "@/lib/specification-parser";
import { parsePDF } from "@/lib/pdf-helper";
import { shouldUseR2, downloadFileFromR2 } from "@/lib/r2-client";
import { cachedSystem, type AnthropicContentBlock } from "@/lib/ai/anthropic-cache";
import { safeParseJson } from "@/lib/ai/json-parse";
import fs from "fs/promises";
import path from "path";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// Vercel config - increase timeout for large file processing
export const maxDuration = 300; // 5 minutes (requires Vercel Pro plan)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // Ensure no caching

// Load drawing reading guide for AI
async function loadDrawingGuide(): Promise<string> {
  try {
    const filePath = path.join(process.cwd(), "src/lib/DRAWING_READING_GUIDE.md");
    return await fs.readFile(filePath, "utf-8");
  } catch (error) {
    console.error("Failed to load drawing guide:", error);
    return ""; // Return empty if file not found (won't break generation)
  }
}

// Download file from URL (for R2 signed URLs)
async function downloadFileFromURL(url: string, fileName: string, mimeType: string): Promise<File> {
  console.log(`📥 Downloading from URL: ${fileName}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${fileName}: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const blob = new Blob([arrayBuffer], { type: mimeType });

  // Convert Blob to File
  const file = new File([blob], fileName, { type: mimeType });

  console.log(`   ✅ Downloaded: ${fileName} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);

  return file;
}

// Note: PDF to image conversion removed - Gemini can read PDFs natively!
// PDFs are now sent directly to Gemini without conversion.

// Parse uploaded files to text and/or images/PDFs
async function extractFileContent(file: File): Promise<string | { text: string; images: string[]; pdfs: Array<{ data: string; mimeType: string; name: string }> }> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith(".pdf")) {
    try {
      // Extract text content
      const data = await parsePDF(buffer);

      // For Gemini: send PDF directly as it supports native PDF parsing
      // This is more reliable than image conversion
      const pdfBase64 = buffer.toString('base64');

      // Return text and PDF data
      return {
        text: `[PDF: ${file.name}]\n${data.text}`,
        images: [], // No images needed for Gemini
        pdfs: [{
          data: pdfBase64,
          mimeType: 'application/pdf',
          name: file.name
        }],
      };
    } catch (e) {
      console.error("  ❌ PDF processing failed:", e);
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

async function generateWithOpenAI(
  prompt: string,
  textContent: string,
  imageParts: { inlineData: { data: string; mimeType: string } }[] = []
) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY не налаштований");
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Build messages with vision support
  const userContent: any[] = [{ type: "text", text: textContent }];

  // Add images for GPT-4o vision
  if (imageParts.length > 0) {
    console.log(`  🖼️  Adding ${imageParts.length} images to OpenAI request`);
    for (const img of imageParts) {
      userContent.push({
        type: "image_url",
        image_url: {
          url: `data:${img.inlineData.mimeType};base64,${img.inlineData.data}`
        }
      });
    }
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: userContent },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1, // Lower for more deterministic outputs (was 0.3)
    max_tokens: 16000, // Збільшено для більшої кількості позицій
  });

  return completion.choices[0]?.message?.content || "{}";
}

async function generateWithAnthropic(
  systemPrompt: string,
  userContent: string,
  imageParts: { inlineData: { data: string; mimeType: string } }[] = []
) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY не налаштований");
  }

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: 600000, // 10 minutes timeout
  });

  // Build content with vision support — cache the (long, repeating) user
  // text on the cache breakpoint so retries / refines don't pay full input
  // tokens for the materials/work-items/drawing-guide context block.
  const messageContent: AnthropicContentBlock[] = [
    { type: "text", text: userContent, cache_control: { type: "ephemeral" } },
  ];

  // Add images for Claude vision (with 5 MB limit check)
  if (imageParts.length > 0) {
    console.log(`  🖼️  Processing ${imageParts.length} images for Anthropic request`);

    const ANTHROPIC_IMAGE_LIMIT = 5 * 1024 * 1024; // 5 MB strict limit
    let addedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < imageParts.length; i++) {
      const img = imageParts[i];

      // Decode base64 to get EXACT byte size
      const decodedBuffer = Buffer.from(img.inlineData.data, 'base64');
      const exactBytes = decodedBuffer.length;
      const sizeMB = (exactBytes / 1024 / 1024).toFixed(2);

      console.log(`  📏 Image ${i + 1}/${imageParts.length}: ${sizeMB} MB (${exactBytes} bytes)`);

      if (exactBytes > ANTHROPIC_IMAGE_LIMIT) {
        skippedCount++;
        console.warn(`  ⚠️  Image ${i + 1} EXCEEDS 5 MB (${sizeMB} MB) - SKIPPING`);
        console.warn(`     → Anthropic limit: ${ANTHROPIC_IMAGE_LIMIT} bytes (5 MB)`);
        console.warn(`     → This image: ${exactBytes} bytes (${sizeMB} MB)`);
        console.warn(`     → Use Gemini model for large files (no size limit)`);
        continue; // Skip this image
      }

      console.log(`  ✅ Image ${i + 1} OK (${sizeMB} MB < 5 MB) - adding to request`);

      messageContent.push({
        type: "image",
        source: {
          type: "base64",
          media_type: img.inlineData.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
          data: img.inlineData.data
        }
      });
      addedCount++;
    }

    console.log(`  ✅ Added ${addedCount} images, skipped ${skippedCount} (5 MB limit)`);

    if (skippedCount > 0) {
      console.warn(`  ⚠️  WARNING: ${skippedCount} image(s) skipped due to size. Estimate quality may be reduced.`);
      console.warn(`  💡 TIP: Use Gemini model for projects with large images (no 5 MB limit).`);
    }
  }

  // Use streaming for long-running requests (>10 minutes)
  console.log('🔄 Using streaming for Anthropic (prevents 10-min timeout)');

  let fullText = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedInputTokens = 0;
  let cacheCreationTokens = 0;

  const stream = await anthropic.messages.create({
    model: "claude-opus-4-20250514",
    max_tokens: 16000, // Збільшено для більшої кількості позицій
    temperature: 0.1, // Lower for more deterministic outputs (was 0.3)
    system: cachedSystem(systemPrompt),
    messages: [{ role: "user", content: messageContent }],
    stream: true, // Enable streaming to avoid 10-minute timeout
  });

  // Collect streamed chunks + capture usage metadata for the ledger
  for await (const messageStreamEvent of stream) {
    if (messageStreamEvent.type === 'content_block_delta' &&
        messageStreamEvent.delta.type === 'text_delta') {
      fullText += messageStreamEvent.delta.text;
    } else if (messageStreamEvent.type === 'message_start') {
      const u = messageStreamEvent.message.usage;
      inputTokens = u.input_tokens ?? 0;
      cachedInputTokens = u.cache_read_input_tokens ?? 0;
      cacheCreationTokens = u.cache_creation_input_tokens ?? 0;
    } else if (messageStreamEvent.type === 'message_delta') {
      outputTokens = messageStreamEvent.usage?.output_tokens ?? outputTokens;
    }
  }

  console.log('  📊 [Anthropic] tokens:', {
    input: inputTokens,
    cachedInput: cachedInputTokens,
    cacheCreation: cacheCreationTokens,
    output: outputTokens,
  });

  // Resilient JSON extraction (handles markdown fences, truncation, trailing
  // commas) — drops far fewer requests than the old single regex did.
  const parsed = safeParseJson(fullText);
  if (parsed.ok) {
    return JSON.stringify(parsed.value);
  }
  // Fall back to raw fenced/braced match so downstream code can still try
  // to use whatever the model returned.
  const jsonMatch = fullText.match(/```json\n([\s\S]*?)\n```/) || fullText.match(/\{[\s\S]*\}/);
  return jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : fullText;
}

// NEW: Gemini Analysis Phase for Pipeline
async function analyzeWithGemini(
  textParts: string[],
  imageParts: { inlineData: { data: string; mimeType: string } }[],
  pdfParts: Array<{ data: string; mimeType: string; name: string }>,
  wizardData: any
): Promise<string> {
  console.log('📊 Phase 1: Gemini Analysis...');

  const analysisPrompt = `# ЗАВДАННЯ: Аналіз проектної документації

Ти — експерт з будівництва. Проаналізуй всі надані документи і витягни СТРУКТУРОВАНІ дані.

## Що аналізувати:

### 1. Архітектурні плани (креслення):
- Кількість розеток, вимикачів, світильників
- Площі приміщень (м²)
- Кількість дверей, вікон
- Довжини стін, перегородок
- Сантехнічні прилади (ванна, душ, унітаз, раковина)
- Опалення (радіатори, тепла підлога)

### 2. Геологічний звіт (якщо є):
- Рівень підземних вод (УГВ, м)
- Тип ґрунту
- Несуча здатність
- Рекомендований тип фундаменту

### 3. План земельної ділянки (якщо є):
- Площа ділянки (м²)
- Перепад висот (м)
- Існуючі комунікації (вода, каналізація, електрика, газ)
- Існуючі споруди на ділянці

### 4. Рецензія експерта (якщо є):
- Критичні зауваження (що ОБОВ'ЯЗКОВО треба додати/виправити)
- Важливі зауваження

### 5. Специфікації (якщо є):
- Конкретні марки матеріалів
- Вимоги до обладнання

### 6. Фото місцевості (якщо є):
- Рельєф (рівний, схил, нерівний)
- Перешкоди (дерева, старі споруди)
- Стан підїздів

## ВАЖЛИВО - ЦІНИ МАТЕРІАЛІВ:

**Використовуй Google Search для пошуку АКТУАЛЬНИХ цін (${new Date().getFullYear()} рік):**

1. Для КОЖНОГО основного матеріалу зроби Google Search:
   - Цемент М500 (ціна за 50 кг мішок)
   - Цегла червона (ціна за 1000 шт)
   - Блоки газобетон (ціна за м³)
   - Арматура (ціна за тонну)
   - Профнастил (ціна за м²)
   - Гіпсокартон (ціна за лист)
   - І т.д.

2. Шукай в українських магазинах:
   - Епіцентр (epicentrk.ua)
   - Будмаркет (budmarket.com.ua)
   - Леруа Мерлен (leroymerlin.ua)
   - OBI (obi.ua)
   - Нова Лінія (novalinia.ua)

3. Для кожної ціни вказуй:
   - Магазин
   - Дата перевірки
   - URL пошукового запиту

## Формат відповіді (JSON):

\`\`\`json
{
  "plans": {
    "totalArea": 150,
    "rooms": [
      {"name": "Вітальня", "area": 25.5},
      {"name": "Спальня 1", "area": 18.0}
    ],
    "electrical": {
      "outlets": 45,
      "switches": 20,
      "lightPoints": 30,
      "outdoorLighting": true
    },
    "plumbing": {
      "toilets": 2,
      "sinks": 3,
      "bathtubs": 1,
      "showers": 1
    },
    "heating": {
      "radiators": 8,
      "underfloorHeating": true,
      "underfloorArea": 50
    },
    "doors": {
      "interior": 8,
      "entrance": 1
    },
    "windows": {
      "count": 12,
      "totalArea": 35
    },
    "walls": {
      "exterior": 80,
      "interior": 45
    }
  },

  "geology": {
    "groundwaterLevel": 2.5,
    "soilType": "Глина",
    "bearingCapacity": 2.0,
    "recommendedFoundation": "Стрічковий",
    "warnings": ["Високий УГВ - потрібен дренаж"]
  },

  "sitePlan": {
    "area": 1200,
    "elevationDifference": 3.5,
    "utilities": {
      "water": true,
      "sewerage": false,
      "electricity": true,
      "gas": false
    },
    "existingStructures": ["Старий сарай", "5 дерев"],
    "accessRoad": "грунтова"
  },

  "review": {
    "criticalComments": [
      "Додати контур заземлення для всіх розеток",
      "Посилити фундамент згідно геології"
    ],
    "importantComments": [
      "Рекомендовано використати цегла М150",
      "Додати вентиляцію в санвузлах"
    ]
  },

  "specifications": {
    "materials": [
      {"category": "Цемент", "specification": "ПЦ М500 Д0", "unit": "т"},
      {"category": "Цегла", "specification": "Рядова М125 250×120×65", "unit": "тис.шт"}
    ]
  },

  "prices": {
    "materials": [
      {
        "name": "Цемент ПЦ М500 (мішок 50 кг)",
        "price": 285,
        "unit": "шт",
        "source": "Епіцентр",
        "date": "${new Date().toISOString().split('T')[0]}",
        "searchUrl": "https://www.google.com/search?q=цемент+м500+ціна+епіцентр+${new Date().getFullYear()}"
      },
      {
        "name": "Цегла червона М125",
        "price": 9500,
        "unit": "тис.шт",
        "source": "Будмаркет",
        "date": "${new Date().toISOString().split('T')[0]}",
        "searchUrl": "https://www.google.com/search?q=цегла+червона+ціна+будмаркет+${new Date().getFullYear()}"
      }
    ]
  },

  "photos": {
    "terrain": "Нерівний, схил на північ",
    "obstacles": ["2 великі дерева біля входу", "Старий паркан"],
    "access": "Грунтова дорога 3м ширини, потребує укріплення"
  }
}
\`\`\`

**КРИТИЧНО ВАЖЛИВО:**
1. ВСІ числові значення (кількості, площі, розміри) - з креслень
2. ВСІ ціни матеріалів - з Google Search (${new Date().getFullYear()} рік)
3. Для кожної ціни - джерело і дата
4. Якщо даних немає - пиши null або [] (порожній масив)

Повертай ТІЛЬКИ JSON без додаткового тексту!`;

  const geminiModel = genAI.getGenerativeModel({
    model: "gemini-3-flash-preview",
    tools: [{
      googleSearch: {},
    } as unknown as import("@google/generative-ai").Tool],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 30000,
      responseMimeType: "application/json",
    },
  });

  const parts: (string | { inlineData: { data: string; mimeType: string } })[] = [analysisPrompt];

  // Add wizard data context
  if (wizardData) {
    parts.push(`\n\n## ДАНІ З WIZARD:\n${JSON.stringify(wizardData, null, 2)}`);
  }

  // Add text from files
  if (textParts.length > 0) {
    parts.push(`\n\n## ТЕКСТ З ФАЙЛІВ:\n${textParts.join("\n\n")}`);
  }

  // Add PDFs directly (Gemini native support)
  if (pdfParts.length > 0) {
    console.log(`  📑 Adding ${pdfParts.length} PDF files for Gemini analysis`);
    for (const pdf of pdfParts) {
      parts.push({
        inlineData: {
          data: pdf.data,
          mimeType: pdf.mimeType,
        }
      });
    }
  }

  // Add images (no size limit!)
  if (imageParts.length > 0) {
    console.log(`  🖼️  Adding ${imageParts.length} images for Gemini analysis`);
    parts.push(...imageParts);
  }

  const result = await geminiModel.generateContent(parts);
  const response = result.response;
  const analysisJSON = response.text();

  console.log('✅ Gemini analysis completed');
  console.log(`  📊 Analysis size: ${(analysisJSON.length / 1024).toFixed(1)} KB`);

  return analysisJSON;
}

function calculateMinimumItems(wizardData: any, isCommercial: boolean = false): number {
  if (!wizardData) return 50;

  // Commercial projects need much more items (phased generation)
  if (isCommercial) {
    console.log('🏪 Commercial project - Phase 1 minimum (150 items), iterations add Phase 2-3');
    return 150; // Phase 1: 150 items, total target 400-500+ across phases
  }

  let base = 60;
  const area = parseFloat(wizardData.totalArea || '100');

  // Balanced area-based calculation
  // Rule: 1.2 items per m² minimum (realistic for full house)
  base = Math.max(base, Math.floor(area * 1.2));

  console.log(`📐 Base minimum from area (${area}m² × 1.2): ${Math.floor(area * 1.2)}`);

  // Additional items by area tiers (reduced)
  if (area > 100) base += 20;
  if (area > 150) base += 30;
  if (area > 200) base += 40;

  // Object type specific calculations
  if (wizardData.objectType === 'house' || wizardData.objectType === 'townhouse') {
    const houseData = wizardData.houseData;

    // Floors
    if (wizardData.floors) base += (wizardData.floors - 1) * 25;

    // Additional spaces
    if (houseData?.hasBasement) base += 25;
    if (houseData?.hasAttic) base += 20;
    if (houseData?.hasGarage) base += 20;

    // Terrain and foundation work
    if (houseData?.terrain?.needsExcavation) base += 10;
    if (houseData?.terrain?.needsDrainage) base += 8;

    // Foundation details
    if (houseData?.foundation) {
      base += 15; // Base foundation items
      if (houseData.foundation.waterproofing) base += 5;
      if (houseData.foundation.insulation) base += 5;
    }

    // Walls
    if (houseData?.walls) {
      base += 20; // Base wall items
      if (houseData.walls.insulation) base += 10;
      if (houseData.walls.partitionMaterial !== 'same') base += 8;
    }

    // Roof
    if (houseData?.roof) {
      base += 15; // Base roof items
      if (houseData.roof.insulation) base += 8;
      if (houseData.roof.gutterSystem) base += 5;
      base += (houseData.roof.roofWindows || 0) * 3;
    }
  }

  // Townhouse specific
  if (wizardData.objectType === 'townhouse' && wizardData.townhouseData) {
    if (wizardData.townhouseData.sharedUtilities) base -= 10; // Less items if shared
  }

  // Renovation (apartments/offices)
  if (wizardData.renovationData) {
    const reno = wizardData.renovationData;

    // Current stage affects base
    switch (reno.currentStage) {
      case 'bare_concrete': base += 60; break;
      case 'rough_walls': base += 45; break;
      case 'rough_floor': base += 40; break;
      case 'utilities_installed': base += 30; break;
      case 'ready_for_finish': base += 20; break;
    }

    // Work required
    if (reno.workRequired?.demolition) base += 15;
    if (reno.workRequired?.roughPlaster) base += 20;
    if (reno.workRequired?.electrical) base += 25;
    if (reno.workRequired?.plumbing) base += 20;
    if (reno.layoutChange) base += 15;
    if (reno.newPartitions) base += 10;

    // Rooms
    if (reno.rooms) {
      base += (reno.rooms.bathrooms || 0) * 20;
      base += (reno.rooms.bedrooms || 0) * 12;
      base += (reno.rooms.kitchen || 0) * 18;
    }
  }

  // Commercial specific
  if (wizardData.commercialData) {
    const comm = wizardData.commercialData;

    if (comm.floor?.type === 'industrial') base += 25;
    if (comm.floor?.antiStatic) base += 8;
    if (comm.fireRating) base += 15;
    if (comm.hvac) base += 20;
    if (comm.heavyDutyElectrical) base += 15;
    if (comm.accessControl) base += 10;
    if (comm.surveillance) base += 12;
  }

  // Utilities (for all types) - Balanced multipliers
  if (wizardData.utilities) {
    const util = wizardData.utilities;

    // Electrical - reasonable multipliers with caps
    if (util.electrical) {
      // Cap at reasonable numbers to prevent explosion
      const outlets = Math.min(util.electrical.outlets || 0, 50);
      const switches = Math.min(util.electrical.switches || 0, 40);
      const lightPoints = Math.min(util.electrical.lightPoints || 0, 30);

      base += outlets * 2; // outlet + cable (not 4 - too much)
      base += switches * 1.5;
      base += lightPoints * 1.5;
      if (util.electrical.power === 'three_phase') base += 10;
      base += 15; // Base electrical items (panel, breakers, wiring)

      console.log(`⚡ Electrical: +${Math.round(outlets * 2 + switches * 1.5 + lightPoints * 1.5 + 15)} items`);
    }

    // Heating - reasonable multipliers with caps
    if (util.heating) {
      if (util.heating.type && util.heating.type !== 'none') {
        base += 20; // Base heating items
      }
      const radiators = Math.min(util.heating.radiators || 0, 30);
      base += radiators * 3; // radiator + valves + pipes (not 5)
      if (util.heating.underfloor) base += 15;

      console.log(`🔥 Heating: +${20 + radiators * 3 + (util.heating.underfloor ? 15 : 0)} items`);
    }

    // Water & sewerage
    if (util.water?.coldWater) base += 10;
    if (util.water?.hotWater) base += 10;
    if (util.water?.boilerType && util.water.boilerType !== 'none') base += 8;
    if (util.sewerage?.type) base += 8;
    if (util.sewerage?.pumpNeeded) base += 5;

    // Ventilation
    if (util.ventilation?.forced) base += 10;
    if (util.ventilation?.recuperation) base += 8;
  }

  // Finishing
  if (wizardData.finishing) {
    const finish = wizardData.finishing;

    // Walls
    if (finish.walls?.qualityLevel === 'premium') base += 15;
    if (finish.walls?.tileArea && finish.walls.tileArea > 0) base += 10;

    // Flooring
    const flooring = finish.flooring || {};
    Object.keys(flooring).forEach(key => {
      if (flooring[key] > 0) base += 6;
    });

    // Ceiling
    if (finish.ceiling) {
      if (finish.ceiling.levels && finish.ceiling.levels > 1) base += 8 * finish.ceiling.levels;
    }
  }

  // Windows & Doors - balanced multipliers
  if (wizardData.openings) {
    const windows = Math.min(wizardData.openings.windows?.count || 0, 40);
    const entranceDoors = Math.min(wizardData.openings.doors?.entrance || 0, 5);
    const interiorDoors = Math.min(wizardData.openings.doors?.interior || 0, 30);

    base += windows * 3; // window + sills + slopes
    base += entranceDoors * 4;
    base += interiorDoors * 2;

    console.log(`🚪 Openings: +${windows * 3 + entranceDoors * 4 + interiorDoors * 2} items`);
  }

  // If no openings specified but it's a house, assume minimum windows/doors
  if ((wizardData.objectType === 'house' || wizardData.objectType === 'townhouse') && !wizardData.openings) {
    const estimatedWindows = Math.ceil(area / 20); // ~1 window per 20m²
    const estimatedDoors = 3 + Math.floor(area / 50); // 3 entrance + 1 per 50m² interior
    base += estimatedWindows * 3;
    base += estimatedDoors * 2;
    console.log(`📊 No openings specified, estimated: ${estimatedWindows} windows, ${estimatedDoors} doors → +${estimatedWindows * 3 + estimatedDoors * 2} items`);
  }

  const finalMin = Math.round(base);

  // CRITICAL: Cap maximum to prevent AI overload
  // AI cannot generate 500+ items in one response due to token limits
  const cappedMin = Math.min(finalMin, 300);

  if (finalMin > 300) {
    console.log(`⚠️ Calculated ${finalMin} items but CAPPING to 300 (AI token limit)`);
  }

  console.log(`✅ FINAL calculated minimum: ${cappedMin} items (raw: ${finalMin})`);
  return cappedMin;
}

function buildWizardContext(wizardData: any, isCommercial: boolean = false): string {
  if (!wizardData) {
    console.log('⚠️ Wizard context: EMPTY - no wizard data provided');
    return '';
  }

  console.log('✅ Building wizard context from NEW wizard structure');
  console.log('📦 Wizard data received:', JSON.stringify(wizardData, null, 2));

  // Log critical fields for debugging
  console.log('🔍 Critical wizard fields:', {
    objectType: wizardData.objectType,
    workScope: wizardData.workScope,
    'houseData.currentState': wizardData.houseData?.currentState,
    'houseData.demolitionRequired': wizardData.houseData?.demolitionRequired,
    'houseData.walls.material': wizardData.houseData?.walls?.material,
    'townhouseData.currentState': wizardData.townhouseData?.currentState,
    'townhouseData.demolitionRequired': wizardData.townhouseData?.demolitionRequired,
  });

  let context = `\n\n## 🎯 ДЕТАЛЬНА ІНФОРМАЦІЯ ПРО ПРОЕКТ (Professional Engineering Wizard):\n\n`;

  // Object Type and Work Scope
  const objectTypeLabels: Record<string, string> = {
    house: 'Приватний будинок',
    townhouse: 'Котедж (Таунхаус)',
    apartment: 'Квартира',
    office: 'Офісне приміщення',
    commercial: 'Комерційне приміщення',
  };

  const workScopeLabels: Record<string, string> = {
    foundation_only: 'Тільки фундамент',
    foundation_walls: 'Фундамент + Коробка',
    foundation_walls_roof: 'Коробка з дахом',
    full_cycle: 'Повний цикл будівництва',
    renovation: 'Ремонт',
  };

  context += `### Тип проекту:\n`;
  context += `- Об\'єкт: **${objectTypeLabels[wizardData.objectType] || wizardData.objectType}**\n`;
  context += `- Обсяг робіт: **${workScopeLabels[wizardData.workScope] || wizardData.workScope}**\n`;
  context += `- Загальна площа: **${wizardData.totalArea} м²**\n`;
  if (wizardData.floors) context += `- Поверхів: ${wizardData.floors}\n`;
  if (wizardData.ceilingHeight) context += `- Висота стелі: ${wizardData.ceilingHeight} м\n`;

  // CURRENT BUILDING STATE (CRITICAL for demolition decisions!)
  let currentState: string | null = null;
  let demolitionRequired: boolean | undefined = undefined;
  let demolitionDescription: string | undefined = undefined;

  if (wizardData.objectType === 'house' && wizardData.houseData) {
    currentState = wizardData.houseData.currentState;
    demolitionRequired = wizardData.houseData.demolitionRequired;
    demolitionDescription = wizardData.houseData.demolitionDescription;
  } else if (wizardData.objectType === 'townhouse' && wizardData.townhouseData) {
    currentState = wizardData.townhouseData.currentState;
    demolitionRequired = wizardData.townhouseData.demolitionRequired;
    demolitionDescription = wizardData.townhouseData.demolitionDescription;
  }

  console.log('🏗️ Building state extracted:', { currentState, demolitionRequired, hasDescription: !!demolitionDescription });

  if (currentState) {
    const currentStateLabels: Record<string, string> = {
      greenfield: 'Чиста ділянка (будівництво з нуля)',
      foundation_only: 'Є фундамент',
      shell: 'Коробка (фундамент + стіни + дах, БЕЗ оздоблення)',
      rough_utilities: 'Коробка + комунікації прокладені',
      existing_building: 'Існуюча будівля (реконструкція)'
    };

    context += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    context += `### ⚠️⚠️⚠️ КРИТИЧНО ВАЖЛИВО - ПОТОЧНИЙ СТАН БУДІВЛІ ⚠️⚠️⚠️\n`;
    context += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    context += `**Поточний стан:** ${currentStateLabels[currentState] || currentState}\n`;

    // DEMOLITION CONTROL (NEW! Most important part)
    if (demolitionRequired === false) {
      console.log('🚫 DEMOLITION FORBIDDEN - Adding strict ban to AI prompt');
      context += `\n🚨🚨🚨 **ДЕМОНТАЖНІ РОБОТИ ЗАБОРОНЕНІ!** 🚨🚨🚨\n`;
      context += `**Інженер ЯВНО вказав: демонтаж НЕ потрібен!**\n\n`;
      context += `❌❌❌ **АБСОЛЮТНА ЗАБОРОНА - НЕ ДОДАВАЙ ЖОДНОЇ позиції демонтажу:** ❌❌❌\n`;
      context += `❌ "Демонтаж плитки" - ЗАБОРОНЕНО!\n`;
      context += `❌ "Зняття шпалер" - ЗАБОРОНЕНО!\n`;
      context += `❌ "Демонтаж стяжки" - ЗАБОРОНЕНО!\n`;
      context += `❌ "Демонтаж підлоги" - ЗАБОРОНЕНО!\n`;
      context += `❌ "Демонтаж штукатурки" - ЗАБОРОНЕНО!\n`;
      context += `❌ "Демонтаж перегородок" - ЗАБОРОНЕНО!\n`;
      context += `❌ Будь-які інші демонтажні роботи - ЗАБОРОНЕНО!\n\n`;
      context += `✅ **ДОЗВОЛЕНО:** ТІЛЬКИ будівництво НОВОГО (комунікації, оздоблення, встановлення)\n`;
      context += `**Якщо ти додасиш хоч ОДНУ позицію демонтажу - ти ПРОВАЛИВ завдання!**\n`;
      context += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    } else if (demolitionRequired === true && demolitionDescription) {
      console.log('⚠️ DEMOLITION ALLOWED - Limited to user description:', demolitionDescription);
      context += `\n⚠️ **Демонтажні роботи дозволені ТІЛЬКИ:**\n`;
      context += `${demolitionDescription}\n\n`;
      context += `❌ НЕ ДОДАВАЙ інші демонтажні роботи крім вказаних вище!\n`;
      context += `❌ НЕ додавай демонтаж плитки, шпалер, підлоги якщо це НЕ вказано!\n`;
      context += `✅ Додавай тільки той демонтаж що описаний + нове будівництво\n`;
      context += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    } else if (demolitionRequired === true && !demolitionDescription) {
      console.log('⚠️ DEMOLITION ALLOWED - No description provided');
      context += `\n⚠️ **Демонтажні роботи дозволені**\n`;
      context += `Інженер вказав що потрібен демонтаж, але не описав деталі.\n`;
      context += `Додавай демонтаж ТІЛЬКИ якщо він логічний для ${currentStateLabels[currentState]}\n`;
      context += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    } else {
      console.log('⚠️ DEMOLITION NOT EXPLICITLY SET - Using fallback based on currentState:', currentState, 'demolitionRequired:', demolitionRequired);
      // Fallback to old logic based on currentState (when demolitionRequired not explicitly set)
      if (currentState === 'shell') {
        context += `\n🚨 **ЦЕ КОРОБКА З ГОЛИМИ СТІНАМИ!** 🚨\n\n`;
        context += `**АБСОЛЮТНА ЗАБОРОНА НА ДЕМОНТАЖНІ РОБОТИ:**\n`;
        context += `❌ НЕ ДОДАВАЙ "Демонтаж плитки" - плитки НЕМАЄ!\n`;
        context += `❌ НЕ ДОДАВАЙ "Зняття шпалер" - шпалер НЕМАЄ!\n`;
        context += `❌ НЕ ДОДАВАЙ "Демонтаж старої стяжки" - стяжки НЕМАЄ!\n`;
        context += `❌ НЕ ДОДАВАЙ "Демонтаж підлоги" - підлоги НЕМАЄ!\n`;
        context += `❌ НЕ ДОДАВАЙ "Зняття старої штукатурки" - штукатурки НЕМАЄ!\n`;
        context += `❌ НЕ ДОДАВАЙ жодних інших демонтажних робіт оздоблення!\n\n`;
        context += `✅ **ЩО МОЖНА ДОДАВАТИ:**\n`;
        context += `✓ Демонтаж ТІЛЬКИ тих стін, які зазначені на ПЛАНІ як "демонтувати"\n`;
        context += `✓ Всі інші роботи - ТІЛЬКИ НОВЕ БУДІВНИЦТВО (комунікації, оздоблення)\n\n`;
        context += `**Це голі бетонні/цегляні стіни без жодного оздоблення!**\n`;
        context += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      } else if (currentState === 'foundation_only') {
        context += `\n🚨 **ЦЕ ТІЛЬКИ ФУНДАМЕНТ!** 🚨\n\n`;
        context += `**АБСОЛЮТНА ЗАБОРОНА НА ДЕМОНТАЖНІ РОБОТИ:**\n`;
        context += `❌ НЕ ДОДАВАЙ жодних демонтажних робіт - стін, підлоги, оздоблення ще НЕМАЄ!\n`;
        context += `✅ **ЩО ДОДАВАТИ:** ТІЛЬКИ будівництво з нуля - стіни, дах, комунікації, оздоблення\n`;
        context += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      } else if (currentState === 'greenfield') {
        context += `\n🚨 **ЦЕ ЧИСТА ДІЛЯНКА!** 🚨\n\n`;
        context += `**АБСОЛЮТНА ЗАБОРОНА НА ДЕМОНТАЖНІ РОБОТИ:**\n`;
        context += `❌ НЕ ДОДАВАЙ жодних демонтажних робіт - будівлі ще НЕМАЄ взагалі!\n`;
        context += `✅ **ЩО ДОДАВАТИ:** Підготовка ділянки + будівництво з нуля\n`;
        context += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      } else if (currentState === 'rough_utilities') {
        context += `\n**Коробка з прокладеними комунікаціями, БЕЗ чистового оздоблення**\n\n`;
        context += `**ОБМЕЖЕНІ ДЕМОНТАЖНІ РОБОТИ:**\n`;
        context += `❌ НЕ ДОДАВАЙ демонтаж плитки, шпалер, підлоги - оздоблення НЕМАЄ!\n`;
        context += `✓ Можливий демонтаж ТІЛЬКИ якщо на плані зазначено перепланування\n`;
        context += `✅ **ЩО ДОДАВАТИ:** Оздоблювальні роботи (штукатурка, підлога, плитка, малярка)\n`;
        context += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      } else if (currentState === 'existing_building') {
        context += `\n**Існуюча будівля - реконструкція/ремонт**\n\n`;
        context += `**ДЕМОНТАЖНІ РОБОТИ ДОЗВОЛЕНІ:**\n`;
        context += `✓ Можна додавати демонтаж старого оздоблення (плитка, шпалери, підлога)\n`;
        context += `✓ Можна додавати демонтаж перегородок якщо є перепланування\n`;
        context += `⚠️ Але додавай ТІЛЬКИ те, що реально потрібно за планом!\n`;
        context += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      }
    }
  } else {
    console.log('❌ WARNING: currentState NOT SET - demolition control will not work!');
    console.log('   objectType:', wizardData.objectType);
    console.log('   has houseData:', !!wizardData.houseData);
    console.log('   has townhouseData:', !!wizardData.townhouseData);
  }

  // HOUSE-SPECIFIC DATA
  if ((wizardData.objectType === 'house' || wizardData.objectType === 'townhouse') && wizardData.houseData) {
    const house = wizardData.houseData;

    // Additional spaces
    if (house.hasBasement || house.hasAttic || house.hasGarage) {
      context += `\n### Додаткові приміщення:\n`;
      if (house.hasBasement) context += `- ✓ Підвал${house.basementArea ? ` (${house.basementArea} м²)` : ''}\n`;
      if (house.hasAttic) context += `- ✓ Мансарда/Горище${house.atticArea ? ` (${house.atticArea} м²)` : ''}\n`;
      if (house.hasGarage) {
        context += `- ✓ Гараж${house.garageArea ? ` (${house.garageArea} м²)` : ''}`;
        if (house.garageType) context += ` - ${house.garageType === 'attached' ? 'Прибудований' : 'Окремий'}`;
        context += `\n`;
      }
    }

    // Terrain
    if (house.terrain) {
      const t = house.terrain;
      context += `\n### 🌍 Місцевість та підготовка ділянки:\n`;

      const soilLabels: Record<string, string> = {
        clay: 'Глина', sand: 'Пісок', rock: 'Скеля', mixed: 'Змішаний', unknown: 'Невідомо'
      };
      const waterLabels: Record<string, string> = {
        shallow: 'Близько (< 2м)', medium: 'Середньо (2-5м)', deep: 'Глибоко (> 5м)', unknown: 'Невідомо'
      };
      const slopeLabels: Record<string, string> = {
        flat: 'Рівна', slight: 'Невеликий ухил', steep: 'Крутий ухил'
      };

      context += `- Тип ґрунту: ${soilLabels[t.soilType] || t.soilType}\n`;
      context += `- Рівень ґрунтових вод: ${waterLabels[t.groundwaterDepth] || t.groundwaterDepth}\n`;
      context += `- Ухил ділянки: ${slopeLabels[t.slope] || t.slope}\n`;
      if (t.needsExcavation) context += `- ⚠️ ПОТРІБНА розкопка та виїмка грунту\n`;
      if (t.needsDrainage) context += `- ⚠️ ПОТРІБЕН дренаж для відведення води\n`;
    }

    // Foundation
    if (house.foundation) {
      const f = house.foundation;
      context += `\n### 🏗️ Фундамент:\n`;

      const foundationLabels: Record<string, string> = {
        strip: 'Стрічковий', slab: 'Плитний', pile: 'Пальовий', combined: 'Комбінований'
      };
      const reinforcementLabels: Record<string, string> = {
        light: 'Легке', standard: 'Стандартне', heavy: 'Посилене'
      };

      context += `- Тип: ${foundationLabels[f.type] || f.type}\n`;
      if (f.depth) context += `- Глибина закладення: ${f.depth} м\n`;
      if (f.width) context += `- Ширина: ${f.width} м\n`;
      context += `- Армування: ${reinforcementLabels[f.reinforcement] || f.reinforcement}\n`;
      if (f.waterproofing) context += `- ✓ Гідроізоляція\n`;
      if (f.insulation) {
        context += `- ✓ Утеплення`;
        if (f.insulationThickness) context += ` (${f.insulationThickness} мм)`;
        context += `\n`;
      }
    }

    // Walls
    if (house.walls) {
      const w = house.walls;
      context += `\n### 🧱 Стіни та перегородки:\n`;

      const wallMaterialLabels: Record<string, string> = {
        gasblock: 'Газоблок', brick: 'Цегла', wood: 'Дерево', panel: 'Панельний', monolith: 'Моноліт'
      };
      const insulationLabels: Record<string, string> = {
        foam: 'Пінопласт', mineral: 'Мінеральна вата', ecowool: 'Екова'
      };

      context += `- Матеріал несучих стін: ${wallMaterialLabels[w.material] || w.material}\n`;
      if (w.thickness) context += `- Товщина: ${w.thickness} мм\n`;
      if (w.insulation) {
        context += `- ✓ Додаткове утеплення`;
        if (w.insulationType) context += ` (${insulationLabels[w.insulationType] || w.insulationType})`;
        if (w.insulationThickness) context += ` ${w.insulationThickness} мм`;
        context += `\n`;
      }
      if (w.partitionMaterial) {
        const partLabel = w.partitionMaterial === 'same' ? 'Такий самий' : wallMaterialLabels[w.partitionMaterial] || w.partitionMaterial;
        context += `- Матеріал перегородок: ${partLabel}\n`;
      }
    }

    // Roof
    if (house.roof) {
      const r = house.roof;
      context += `\n### 🏠 Покрівля:\n`;

      const roofTypeLabels: Record<string, string> = {
        pitched: 'Скатний', flat: 'Плоский', mansard: 'Мансардний', combined: 'Комбінований'
      };
      const roofMaterialLabels: Record<string, string> = {
        metal_tile: 'Металочерепиця',
        soft_tile: 'М\'яка черепиця',
        profiled_sheet: 'Профнастил',
        ceramic: 'Керамічна черепиця',
        slate: 'Шифер'
      };
      const atticLabels: Record<string, string> = {
        cold: 'Холодне', warm: 'Тепле (опалюється)', living: 'Житлове приміщення'
      };

      context += `- Тип даху: ${roofTypeLabels[r.type] || r.type}\n`;
      if (r.pitchAngle) context += `- Кут нахилу: ${r.pitchAngle}°\n`;
      context += `- Покрівельний матеріал: ${roofMaterialLabels[r.material] || r.material}\n`;
      if (r.insulation) {
        context += `- ✓ Утеплення покрівлі`;
        if (r.insulationThickness) context += ` (${r.insulationThickness} мм)`;
        context += `\n`;
      }
      context += `- Використання горища/мансарди: ${atticLabels[r.attic] || r.attic}\n`;
      if (r.gutterSystem) context += `- ✓ Система водостоків\n`;
      if (r.roofWindows && r.roofWindows > 0) context += `- Мансардні вікна: ${r.roofWindows} шт\n`;
    }
  }

  // TOWNHOUSE-SPECIFIC
  if (wizardData.objectType === 'townhouse' && wizardData.townhouseData) {
    const t = wizardData.townhouseData;
    context += `\n### 🏘️ Особливості таунхаусу:\n`;
    context += `- Кількість суміжних стін: ${t.adjacentWalls}\n`;
    context += `- Розташування: ${t.isEndUnit ? 'Крайній в ряді' : 'Середній в ряді'}\n`;
    if (t.sharedUtilities) context += `- ✓ Спільні комунікації з сусідами\n`;
  }

  // RENOVATION-SPECIFIC (apartments/offices)
  if (wizardData.renovationData) {
    const reno = wizardData.renovationData;
    context += `\n### 🔨 Ремонт - Поточний стан:\n`;

    const stageLabels: Record<string, string> = {
      bare_concrete: 'Голий бетон',
      rough_walls: 'Чорнова штукатурка є',
      rough_floor: 'Чорнова стяжка є',
      utilities_installed: 'Комунікації встановлені',
      ready_for_finish: 'Готово під чистове оздоблення'
    };

    context += `- Стадія: ${stageLabels[reno.currentStage] || reno.currentStage}\n`;

    // What exists
    const existing = [];
    if (reno.existing?.roughPlaster) existing.push('чорнова штукатурка');
    if (reno.existing?.roughFloor) existing.push('чорнова стяжка');
    if (reno.existing?.electricalRoughIn) existing.push('електрика прокладена');
    if (reno.existing?.plumbingRoughIn) existing.push('сантехніка прокладена');
    if (reno.existing?.windowsInstalled) existing.push('вікна встановлені');
    if (reno.existing?.doorsInstalled) existing.push('двері встановлені');

    if (existing.length > 0) {
      context += `- Що вже є: ${existing.join(', ')}\n`;
    }

    // What's required
    const required = [];
    if (reno.workRequired?.demolition) required.push('демонтаж');
    if (reno.workRequired?.roughPlaster) required.push('чорнова штукатурка');
    if (reno.workRequired?.roughFloor) required.push('чорнова стяжка');
    if (reno.workRequired?.electrical) required.push('електрика');
    if (reno.workRequired?.plumbing) required.push('сантехніка');
    if (reno.workRequired?.heating) required.push('опалення');
    if (reno.workRequired?.finishPlaster) required.push('фінішна штукатурка');
    if (reno.workRequired?.painting) required.push('фарбування');
    if (reno.workRequired?.flooring) required.push('підлога');
    if (reno.workRequired?.tiling) required.push('плитка');
    if (reno.workRequired?.windows) required.push('вікна');
    if (reno.workRequired?.doors) required.push('двері');

    if (required.length > 0) {
      context += `- Що потрібно зробити: ${required.join(', ')}\n`;
    }

    if (reno.layoutChange) context += `- ⚠️ Зміна планування (перенесення стін)\n`;
    if (reno.newPartitions) {
      context += `- ⚠️ Нові перегородки`;
      if (reno.newPartitionsLength) context += ` (${reno.newPartitionsLength} м.п.)`;
      context += `\n`;
    }

    if (reno.rooms) {
      context += `- Кімнати: ${reno.rooms.bedrooms || 0} спальні, ${reno.rooms.bathrooms || 0} санвузли, ${reno.rooms.kitchen || 0} кухня, ${reno.rooms.living || 0} вітальня\n`;
    }
  }

  // COMMERCIAL-SPECIFIC
  if (wizardData.commercialData) {
    const comm = wizardData.commercialData;
    context += `\n### 🏭 Комерційне приміщення:\n`;

    const purposeLabels: Record<string, string> = {
      shop: 'Магазин', restaurant: 'Ресторан/Кафе', warehouse: 'Склад',
      production: 'Виробництво', showroom: 'Шоурум', other: 'Інше'
    };

    context += `- Призначення: ${purposeLabels[comm.purpose] || comm.purpose}\n`;

    // Current state and demolition (for new construction / reconstruction)
    if (comm.currentState) {
      const currentStateLabels: Record<string, string> = {
        greenfield: 'Чиста ділянка (будівництво з нуля)',
        existing_building: 'Існуюча будівля (потрібен демонтаж)',
        existing_renovation: 'Існуюче приміщення (тільки ремонт)'
      };

      context += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      context += `### ⚠️⚠️⚠️ КРИТИЧНО ВАЖЛИВО - ПОТОЧНИЙ СТАН ⚠️⚠️⚠️\n`;
      context += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      context += `**Поточний стан:** ${currentStateLabels[comm.currentState] || comm.currentState}\n`;

      if (comm.currentState === 'greenfield') {
        context += `\n🟢 **ЦЕ ЧИСТА ДІЛЯНКА - БУДІВНИЦТВО З НУЛЯ!**\n\n`;
        context += `**ОБОВ'ЯЗКОВО ВКЛЮЧИ:**\n`;
        context += `✅ Підготовка ділянки (планування, розмітка)\n`;
        context += `✅ Повний цикл будівництва (фундамент, стіни, дах, комунікації, оздоблення)\n`;
        context += `✅ Всі комерційні системи (холодильне обладнання, потужна електрика, HVAC, протипожежні)\n`;
        context += `❌ НЕ ДОДАВАЙ демонтажні роботи - будівлі немає!\n`;
        context += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      } else if (comm.currentState === 'existing_building') {
        context += `\n🏢 **Є ІСНУЮЧА БУДІВЛЯ!**\n\n`;

        if (comm.demolitionRequired !== false) {
          context += `🚨 **ДЕМОНТАЖ ДОЗВОЛЕНИЙ:**\n`;
          if (comm.demolitionDescription) {
            context += `**Опис демонтажу:** ${comm.demolitionDescription}\n\n`;
          } else {
            context += `**Повний демонтаж існуючої будівлі** перед новим будівництвом\n\n`;
          }
          context += `**ОБОВ'ЯЗКОВО ВКЛЮЧИ:**\n`;
          context += `1️⃣ **Демонтажні роботи:** розбирання будівлі, вивіз сміття, планування ділянки\n`;
          context += `2️⃣ **Нове будівництво:** фундамент, стіни, дах, комунікації, оздоблення\n`;
          context += `3️⃣ **Комерційні системи:** всі обов'язкові для магазину/супермаркету\n`;
        } else {
          context += `❌ **ДЕМОНТАЖ ЗАБОРОНЕНО** - будівля залишається\n`;
        }
        context += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      }
    }

    if (comm.floor) {
      context += `- Тип підлоги: ${comm.floor.type === 'industrial' ? 'Промислова' : 'Стандартна'}\n`;
      if (comm.floor.coating) {
        const coatingLabels: Record<string, string> = {
          epoxy: 'Епоксидне', polyurethane: 'Поліуретанове', tile: 'Плитка', concrete: 'Бетон', other: 'Інше'
        };
        context += `- Покриття підлоги: ${coatingLabels[comm.floor.coating] || comm.floor.coating}\n`;
      }
      if (comm.floor.loadCapacity) context += `- Навантаження: ${comm.floor.loadCapacity} кг/м²\n`;
      if (comm.floor.antiStatic) context += `- ✓ Антистатична підлога\n`;
    }

    const features = [];
    if (comm.fireRating) features.push('протипожежні вимоги');
    if (comm.hvac) features.push('потужна вентиляція');
    if (comm.heavyDutyElectrical) features.push('підвищене навантаження електрики');
    if (comm.accessControl) features.push('контроль доступу');
    if (comm.surveillance) features.push('відеоспостереження');

    if (features.length > 0) {
      context += `- Додаткові вимоги: ${features.join(', ')}\n`;
    }
  }

  // UTILITIES (for all types)
  if (wizardData.utilities) {
    const util = wizardData.utilities;
    context += `\n### ⚡ Інженерні системи:\n`;

    // Electrical
    if (util.electrical) {
      const e = util.electrical;
      context += `\n**Електрика:**\n`;
      context += `- Потужність: ${e.power === 'three_phase' ? 'Трифазна' : 'Однофазна'}${e.capacity ? ` (${e.capacity} кВт)` : ''}\n`;
      if (e.outlets) context += `- Розеток: ${e.outlets} шт → Додай ${e.outlets} позицій (розетка + підрозетник + кабель)\n`;
      if (e.switches) context += `- Вимикачів: ${e.switches} шт → Додай ${e.switches} позицій\n`;
      if (e.lightPoints) context += `- Точок освітлення: ${e.lightPoints} шт → Додай ${e.lightPoints} позицій\n`;
      if (e.outdoorLighting) context += `- ✓ Зовнішнє освітлення\n`;
    }

    // Heating
    if (util.heating && util.heating.type && util.heating.type !== 'none') {
      const h = util.heating;
      context += `\n**Опалення:**\n`;

      const heatingLabels: Record<string, string> = {
        gas: 'Газове', electric: 'Електричне', solid_fuel: 'Тверде паливо', heat_pump: 'Тепловий насос'
      };

      context += `- Тип: ${heatingLabels[h.type] || h.type}\n`;
      if (h.radiators) context += `- Радіаторів: ${h.radiators} шт → Додай ${h.radiators} позицій з різною потужністю\n`;
      if (h.underfloor) {
        context += `- ✓ Теплі підлоги`;
        if (h.underfloorArea) context += ` (${h.underfloorArea} м²)`;
        context += ` → Додай мат, термостат, кабель\n`;
      }
      if (h.boilerPower) context += `- Потужність котла: ${h.boilerPower} кВт\n`;
    }

    // Water
    if (util.water) {
      const w = util.water;
      context += `\n**Водопостачання:**\n`;

      const sourceLabels: Record<string, string> = {
        central: 'Центральне', well: 'Свердловина', borehole: 'Артезіанська'
      };

      context += `- Джерело: ${sourceLabels[w.source] || w.source}\n`;
      if (w.coldWater) context += `- ✓ Холодна вода\n`;
      if (w.hotWater) {
        context += `- ✓ Гаряча вода`;
        if (w.boilerType && w.boilerType !== 'none') {
          const boilerLabels: Record<string, string> = { gas: 'Газовий', electric: 'Електричний' };
          context += ` (${boilerLabels[w.boilerType] || w.boilerType} бойлер`;
          if (w.boilerVolume) context += `, ${w.boilerVolume} л`;
          context += `)`;
        }
        context += `\n`;
      }
    }

    // Sewerage
    if (util.sewerage) {
      const s = util.sewerage;
      context += `\n**Каналізація:**\n`;

      const sewerageLabels: Record<string, string> = {
        central: 'Центральна', septic: 'Септик', treatment: 'Очисна станція'
      };

      context += `- Тип: ${sewerageLabels[s.type] || s.type}\n`;
      if (s.pumpNeeded) context += `- ⚠️ Потрібен насос\n`;
    }

    // Ventilation
    if (util.ventilation) {
      const v = util.ventilation;
      const ventTypes = [];
      if (v.natural) ventTypes.push('природна');
      if (v.forced) ventTypes.push('примусова');
      if (v.recuperation) ventTypes.push('з рекуперацією');

      if (ventTypes.length > 0) {
        context += `\n**Вентиляція:** ${ventTypes.join(', ')}\n`;
        if (v.areas && v.areas.length > 0) {
          context += `- Приміщення: ${v.areas.join(', ')}\n`;
        }
      }
    }
  }

  // FINISHING
  if (wizardData.finishing) {
    const finish = wizardData.finishing;
    context += `\n### 🎨 Оздоблення:\n`;

    if (finish.walls) {
      const materialLabels: Record<string, string> = {
        paint: 'Фарбування', wallpaper: 'Шпалери', tile: 'Плитка', panels: 'Панелі', mixed: 'Змішане'
      };
      const qualityLabels: Record<string, string> = {
        economy: 'Економ', standard: 'Стандарт', premium: 'Преміум'
      };

      context += `- Стіни: ${materialLabels[finish.walls.material] || finish.walls.material}, ${qualityLabels[finish.walls.qualityLevel] || finish.walls.qualityLevel}\n`;
      if (finish.walls.tileArea) context += `  Плитка: ${finish.walls.tileArea} м²\n`;
    }

    if (finish.flooring) {
      const flooring = finish.flooring;
      const floorTypes = [];
      if (flooring.tile) floorTypes.push(`плитка ${flooring.tile} м²`);
      if (flooring.laminate) floorTypes.push(`ламінат ${flooring.laminate} м²`);
      if (flooring.parquet) floorTypes.push(`паркет ${flooring.parquet} м²`);
      if (flooring.vinyl) floorTypes.push(`вініл ${flooring.vinyl} м²`);
      if (flooring.carpet) floorTypes.push(`ковролін ${flooring.carpet} м²`);
      if (flooring.epoxy) floorTypes.push(`епоксид ${flooring.epoxy} м²`);

      if (floorTypes.length > 0) {
        context += `- Підлога: ${floorTypes.join(', ')}\n`;
      }
    }

    if (finish.ceiling) {
      const ceilingLabels: Record<string, string> = {
        paint: 'Фарбування', drywall: 'Гіпсокартон', suspended: 'Підвісна', stretch: 'Натяжна'
      };
      const lightingLabels: Record<string, string> = {
        spots: 'Точкові світильники', chandelier: 'Люстри', led: 'LED', mixed: 'Змішане'
      };

      context += `- Стеля: ${ceilingLabels[finish.ceiling.type] || finish.ceiling.type}`;
      if (finish.ceiling.levels && finish.ceiling.levels > 1) context += `, ${finish.ceiling.levels} рівні`;
      context += `\n`;
      context += `  Освітлення: ${lightingLabels[finish.ceiling.lighting] || finish.ceiling.lighting}\n`;
    }
  }

  // WINDOWS & DOORS
  if (wizardData.openings) {
    const op = wizardData.openings;
    context += `\n### 🚪 Вікна та двері:\n`;

    if (op.windows) {
      const w = op.windows;
      const typeLabels: Record<string, string> = {
        plastic: 'Пластикові', wood: 'Дерев\'яні', aluminum: 'Алюмінієві'
      };
      const glazingLabels: Record<string, string> = {
        single: 'Однокамерний', double: 'Двокамерний', triple: 'Трикамерний'
      };

      context += `- Вікна: ${w.count} шт`;
      if (w.totalArea) context += `, ${w.totalArea} м²`;
      if (w.type) context += `, ${typeLabels[w.type] || w.type}`;
      if (w.glazing) context += `, ${glazingLabels[w.glazing] || w.glazing} склопакет`;
      context += `\n`;
    }

    if (op.doors) {
      const d = op.doors;
      context += `- Двері вхідні: ${d.entrance} шт\n`;
      context += `- Двері внутрішні: ${d.interior} шт`;
      if (d.type) context += ` (${d.type === 'premium' ? 'Преміум' : 'Стандарт'})`;
      context += `\n`;
    }
  }

  // Special requirements
  if (wizardData.specialRequirements) {
    context += `\n### ⚠️ Особливі вимоги:\n${wizardData.specialRequirements}\n`;
  }

  // Calculate minimum items
  const minItems = calculateMinimumItems(wizardData, isCommercial);
  context += `\n\n═══════════════════════════════════════════════════════\n`;
  context += `📊 **МІНІМАЛЬНА КІЛЬКІСТЬ ПОЗИЦІЙ: ${minItems}**\n`;
  context += `⚠️ **Це ОБОВ'ЯЗКОВА вимога, НЕ рекомендація!**\n`;
  context += `💡 Якщо вийде менше - ПРОВАЛ завдання!\n`;
  context += `═══════════════════════════════════════════════════════\n\n`;

  return context;
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
    return forbiddenResponse();
  }

  try {
    const formData = await request.formData();

    // Support for R2 uploaded files (production) or direct files (localhost)
    const r2KeysStr = formData.get("r2Keys") as string || null;
    const r2FilesStr = formData.get("r2Files") as string || null; // Legacy support
    let files: File[] = [];

    if (r2KeysStr) {
      // R2 mode (NEW): download files from R2 by keys
      console.log('📦 R2 mode: Downloading files from R2 by keys...');
      const r2Keys = JSON.parse(r2KeysStr) as Array<{
        key: string;
        originalName: string;
        mimeType: string;
        size: number;
      }>;

      console.log(`   ${r2Keys.length} files in R2`);

      // Download all files from R2 by key
      const downloadPromises = r2Keys.map(async (r2File) => {
        const buffer = await downloadFileFromR2(r2File.key);
        // Convert Buffer to Uint8Array for Blob compatibility
        const uint8Array = new Uint8Array(buffer);
        const blob = new Blob([uint8Array], { type: r2File.mimeType });
        return new File([blob], r2File.originalName, { type: r2File.mimeType });
      });

      files = await Promise.all(downloadPromises);

      console.log(`✅ Downloaded ${files.length} files from R2`);
    } else if (r2FilesStr) {
      // R2 mode (LEGACY): download files from R2 URLs
      console.log('📦 R2 mode (legacy): Downloading files from R2 URLs...');
      const r2Files = JSON.parse(r2FilesStr) as Array<{
        url: string;
        originalName: string;
        mimeType: string;
        size: number;
      }>;

      console.log(`   ${r2Files.length} files in R2`);

      // Download all files from R2
      const downloadPromises = r2Files.map(r2File =>
        downloadFileFromURL(r2File.url, r2File.originalName, r2File.mimeType)
      );

      files = await Promise.all(downloadPromises);

      console.log(`✅ Downloaded ${files.length} files from R2`);
    } else {
      // Direct mode: use files from FormData
      files = formData.getAll("files") as File[];
      console.log('📁 Direct mode: Using files from FormData');
    }

    const projectId = formData.get("projectId") as string;
    const projectType = formData.get("projectType") as string || "ремонт";
    const area = formData.get("area") as string || "";
    const additionalNotes = formData.get("notes") as string || "";
    const categoriesStr = formData.get("categories") as string || "";
    const selectedCategories = categoriesStr ? categoriesStr.split(",") : [];
    const model = (formData.get("model") as string) || "gemini";
    const template = (formData.get("template") as string) || "custom";

    // Wizard data (optional)
    const wizardDataStr = formData.get("wizardData") as string || null;
    const wizardData = wizardDataStr ? JSON.parse(wizardDataStr) : null;

    // Dynamic minimum items calculation based on template and area
    // Calculate minimum items based on wizard data (smart calculation)
    let calculatedMin: number;

    if (wizardData) {
      calculatedMin = calculateMinimumItems(wizardData);
      console.log('✅ Using SMART calculation from wizard data');
    } else {
      // Fallback to old template-based calculation
      const minItemsByTemplate: Record<string, number> = {
        'foundation': 25,
        'shell': 60,
        'turnkey': 80,
        'house_full': 150,
        'apartment_rough': 50,
        'custom': 50
      };

      const areaNum = parseFloat(area) || 100;
      const baseMin = minItemsByTemplate[template] || 50;

      calculatedMin = template === 'house_full'
        ? Math.max(baseMin, Math.floor(areaNum * 1.2))
        : baseMin;

      console.log('⚠️ Using OLD template-based calculation (no wizard)');
    }

    console.log('📊 Wizard Data:', wizardData ? 'Присутній' : 'Відсутній');
    console.log('📐 Calculated Min Items:', calculatedMin);
    console.log('🏗️ Template:', template);
    console.log('📏 Area:', area, 'm²');

    if (files.length === 0) {
      return NextResponse.json({ error: "Завантажте хоча б один файл" }, { status: 400 });
    }

    console.log('📁 Files uploaded:', files.length);
    files.forEach((f, i) => console.log(`  ${i + 1}. ${f.name} (${(f.size / 1024).toFixed(1)} KB)`));

    // Extract content from all files
    const textParts: string[] = [];
    const imageParts: { inlineData: { data: string; mimeType: string } }[] = [];
    const pdfParts: Array<{ data: string; mimeType: string; name: string }> = [];

    console.log('📂 Processing files in parallel (faster)...');

    // OPTIMIZATION: Process all files in parallel instead of sequentially
    const fileProcessingPromises = files.map(async (file) => {
      try {
        // OPTIMIZATION: Skip text extraction for very large PDFs (>15 MB) - just send PDF directly
        const isLargePDF = file.name.toLowerCase().endsWith('.pdf') && file.size > 15 * 1024 * 1024;

        if (isLargePDF) {
          console.log(`  ⚡ Large PDF detected: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB) - skipping text extraction, sending directly`);
          const buffer = Buffer.from(await file.arrayBuffer());
          const pdfBase64 = buffer.toString('base64');
          return {
            type: 'pdf-only',
            pdfData: {
              data: pdfBase64,
              mimeType: 'application/pdf',
              name: file.name
            }
          };
        }

        const content = await extractFileContent(file);
        return { type: 'normal', content, fileName: file.name };
      } catch (error) {
        console.error(`  ❌ Error processing ${file.name}:`, error);
        return { type: 'error', fileName: file.name };
      }
    });

    const processedFiles = await Promise.all(fileProcessingPromises);

    // Collect results
    for (const result of processedFiles) {
      if (result.type === 'error') {
        console.log(`  ⚠️ Skipped ${result.fileName} due to processing error`);
        continue;
      }

      if (result.type === 'pdf-only' && result.pdfData) {
        pdfParts.push(result.pdfData);
        console.log(`  ✅ ${result.pdfData.name}: Large PDF added directly`);
        continue;
      }

      const { content, fileName } = result;

      // Handle PDF files (returns object with text, images, and PDF data)
      if (typeof content === 'object' && 'text' in content && 'pdfs' in content) {
        // Add PDF text content (only if not too long)
        if (content.text.length < 500000) {
          textParts.push(content.text);
          console.log(`  📄 PDF text: ${fileName} (${content.text.length} chars)`);
        } else {
          console.log(`  ⚠️ PDF text too long: ${fileName} (${content.text.length} chars) - skipping text, using PDF directly`);
        }

        // Add PDF files for native Gemini processing
        if (content.pdfs && content.pdfs.length > 0) {
          pdfParts.push(...content.pdfs);
          console.log(`  📑 PDF file: ${fileName} (${(content.pdfs[0].data.length / 1024).toFixed(1)} KB base64)`);
        }

        // Add images if any (fallback for non-Gemini models)
        if (content.images && content.images.length > 0) {
          for (let i = 0; i < content.images.length; i++) {
            imageParts.push({
              inlineData: {
                data: content.images[i],
                mimeType: 'image/png'
              }
            });
          }
          console.log(`  🖼️  PDF images: ${fileName} (${content.images.length} pages)`);
        }
      }
      // Handle regular image files
      else if (typeof content === 'string' && content.startsWith("__IMAGE__:")) {
        const [, base64, mimeType] = content.split(":");
        imageParts.push({ inlineData: { data: base64, mimeType } });
        console.log(`  🖼️  Image: ${fileName} (${(base64.length / 1024).toFixed(1)} KB)`);
      }
      // Handle text files (Excel, CSV, TXT, etc.)
      else if (typeof content === 'string') {
        textParts.push(content);
        console.log(`  📄 Text: ${fileName} (${content.length} chars)`);
      }
    }

    console.log(`📊 Extraction summary: ${textParts.length} text files, ${imageParts.length} images, ${pdfParts.length} PDFs`);

    // Simple file classification (old method - reliable)
    const planFiles: File[] = [];
    const specFiles: File[] = [];

    for (const file of files) {
      const name = file.name.toLowerCase();
      const isSpec =
        name.includes('специф') || name.includes('spec') ||
        name.includes('технолог') || name.includes('інструкц') ||
        file.size > 10 * 1024 * 1024; // > 10 MB

      if (isSpec) {
        specFiles.push(file);
      } else {
        planFiles.push(file);
      }
    }

    console.log(`📂 Classification: ${planFiles.length} plan files, ${specFiles.length} specification files`);

    // Parsed data for pipeline mode (will be populated in pipeline case)
    const parsedData: Record<string, any> = {};

    // Advanced document classification and parsing moved to pipeline mode only
    // TODO: Re-enable for pipeline mode after fixing stability issues

    // OPTIMIZATION: Use already extracted text instead of re-parsing
    // Process specification files (use textParts that were already extracted)
    let specificationData: any = null;
    if (specFiles.length > 0) {
      console.log(`📚 Parsing ${specFiles.length} specification files from already extracted text...`);

      // Use textParts that already contain spec text
      const specTexts = textParts.filter(text =>
        text.includes('[SPECIFICATION:') || text.includes('специф') || text.includes('spec')
      );

      if (specTexts.length > 0) {
        const allSpecText = specTexts.join('\n\n---\n\n');
        try {
          specificationData = parseSpecificationText(allSpecText);
          console.log(`  ✓ Parsed: ${specificationData.materials.length} materials, ${specificationData.methods.length} methods`);
        } catch (e) {
          console.error(`  ✗ Specification parsing failed:`, e);
        }
      } else {
        console.log(`  ⚠️ No specification text found in extracted content`);
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

    // Load drawing reading guide for visual analysis (PDF or images)
    const drawingGuide = (imageParts.length > 0 || pdfParts.length > 0) ? await loadDrawingGuide() : "";

    if (pdfParts.length > 0 && drawingGuide) {
      console.log(`📚 DRAWING_READING_GUIDE loaded for ${pdfParts.length} PDF files (${(drawingGuide.length / 1024).toFixed(1)}KB)`);
    } else if (pdfParts.length > 0 && !drawingGuide) {
      console.warn(`⚠️ WARNING: ${pdfParts.length} PDF files but NO drawing guide loaded!`);
    }

    // Detect commercial project from documents
    const allTexts = textParts.join('\n').toLowerCase();
    const isCommercialProject =
      allTexts.includes('атб') ||
      allTexts.includes('супермаркет') ||
      allTexts.includes('магазин') ||
      allTexts.includes('торгов') ||
      allTexts.includes('комерц') ||
      allTexts.includes('ритейл') ||
      allTexts.includes('supermarket') ||
      allTexts.includes('retail') ||
      allTexts.includes('commercial');

    const hasATB = allTexts.includes('атб') || allTexts.includes('atb');

    if (isCommercialProject || hasATB) {
      console.log(`🏪 COMMERCIAL PROJECT DETECTED! ${hasATB ? '(ATB supermarket)' : '(Generic commercial)'}`);

      // Override minimum items for commercial projects
      // Phase 1: 150 items (core systems), then iterations add Phase 2-3
      // Total target: 400-500+ items across all phases
      calculatedMin = 150; // Phase 1 minimum
      console.log(`🏪 Updated calculatedMin to 150 for Phase 1 (iterations will add Phase 2-3 for total 400-500+)`);
    }

    // Build wizard context with commercial flag
    const wizardContext = buildWizardContext(wizardData, isCommercialProject || hasATB);

    // Build materials context from database
    const relevantCategories = template === 'house_full'
      ? ['foundation', 'walls', 'roof', 'electrical', 'plumbing', 'heating', 'windows', 'doors', 'finishing']
      : template === 'apartment_rough'
      ? ['walls', 'electrical', 'plumbing', 'finishing']
      : undefined; // All categories for custom
    const materialsContext = generateMaterialsContext(relevantCategories);
    console.log(`💰 Materials database context: ${(materialsContext.length / 1024).toFixed(1)}KB, categories: ${relevantCategories?.join(', ') || 'all'}`);

    // Build work items context (labor/installation prices)
    const workItemsContext = generateWorkItemsContext(relevantCategories);
    console.log(`💼 Work items database context: ${(workItemsContext.length / 1024).toFixed(1)}KB, categories: ${relevantCategories?.join(', ') || 'all'}`);

    // Build specification context if available
    const specificationContext = specificationData
      ? generateSpecificationContext(specificationData)
      : '';
    if (specificationContext) {
      console.log(`📚 Specification context: ${(specificationContext.length / 1024).toFixed(1)}KB`);
      console.log(`   - ${specificationData.materials.length} materials, ${specificationData.methods.length} methods, ${specificationData.requirements.filter((r: any) => r.critical).length} critical requirements`);
    }

    // NEW: Build contexts from new document types
    let sitePlanContext = '';
    let geologicalContext = '';
    let reviewContext = '';
    let photosContext = '';

    if (parsedData?.sitePlan) {
      const { SitePlanParser } = await import('@/lib/parsers/site-plan-parser');
      const sitePlanParser = new SitePlanParser();
      sitePlanContext = sitePlanParser.generateContext(parsedData.sitePlan);
      console.log(`🗺️  Site plan context: ${(sitePlanContext.length / 1024).toFixed(1)}KB`);
    }

    if (parsedData?.geological) {
      const { GeologicalParser } = await import('@/lib/parsers/geological-parser');
      const geologicalParser = new GeologicalParser();
      geologicalContext = geologicalParser.generateContext(parsedData.geological);
      console.log(`🪨 Geological context: ${(geologicalContext.length / 1024).toFixed(1)}KB`);
      if (parsedData.geological.warnings.length > 0) {
        console.warn(`   ⚠️  ${parsedData.geological.warnings.length} critical geological warnings`);
      }
    }

    if (parsedData?.review) {
      const { ProjectReviewParser } = await import('@/lib/parsers/review-parser');
      const reviewParser = new ProjectReviewParser();
      reviewContext = reviewParser.generateContext(parsedData.review);
      console.log(`📝 Review context: ${(reviewContext.length / 1024).toFixed(1)}KB`);
      if (parsedData.review.criticalCount > 0) {
        console.warn(`   🚨 ${parsedData.review.criticalCount} critical review comments!`);
      }
    }

    if (parsedData?.photos) {
      const { SitePhotosHandler } = await import('@/lib/parsers/site-photos-handler');
      const photosHandler = new SitePhotosHandler();
      photosContext = photosHandler.generateContext(parsedData.photos);
      console.log(`📸 Photos context: ${(photosContext.length / 1024).toFixed(1)}KB`);
    }

    // Build commercial override prompt if detected
    let commercialOverride = '';
    if (isCommercialProject || hasATB) {
      commercialOverride = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨🚨🚨 КРИТИЧНО ВАЖЛИВО - ВИЯВЛЕНО КОМЕРЦІЙНИЙ ОБ'ЄКТ ${hasATB ? '(АТБ СУПЕРМАРКЕТ)' : ''} 🚨🚨🚨
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**З ДОКУМЕНТІВ ВИЗНАЧЕНО: ЦЕ КОМЕРЦІЙНА/ТОРГОВЕЛЬНА БУДІВЛЯ!**

${hasATB ? `
**АТБ - це ВЕЛИКИЙ супермаркет мережі, типові параметри:**
- Площа торгового залу: 800-1500 м²
- Загальна площа будівлі: 1200-2000 м²
- Висота стелі торгового залу: 4-5 м (НЕ 2.7м!)
- Складські/технічні приміщення: 400-600 м²
- Парковка: 30-50 місць = 800-1200 м²
` : ''}

**ОБОВ'ЯЗКОВІ ВИМОГИ ДЛЯ КОМЕРЦІЙНИХ ОБ'ЄКТІВ:**

**1. ПЛОЩА ТА МАСШТАБ:**
- ❌ ІГНОРУЙ якщо wizard вказав малу площу (<200м²) - це помилка!
- ✅ ВИЗНАЧ РЕАЛЬНУ площу з креслень/документів
- ✅ Для супермаркетів: мінімум 1000-2000 м² загальної площі
- ✅ Враховуй торговий зал + склад + технічні + офіс + санвузли

**2. КОМЕРЦІЙНІ МАТЕРІАЛИ (В 2-3 РАЗИ ДОРОЖЧІ!):**
- Підлога: промислова (епоксидна/поліуретанова/плитка для навантажень)
- Стіни: комерційні матеріали, підвищена вогнестійкість
- Двері: протипожежні, евакуаційні, вантажні
- Вікна: великі вітрини з загартованого скла
- Оздоблення: стійке до високих навантажень

**3. ОБОВ'ЯЗКОВІ КОМЕРЦІЙНІ СИСТЕМИ (МІЛЬЙОНИ ГРИВЕНЬ!):**

**Холодильне обладнання** (для супермаркету критично!):
- Холодильні вітрини: 10-20 шт × 80,000-150,000 ₴ = 1,000,000-3,000,000 ₴
- Морозильні камери/лари: 5-10 шт × 60,000-120,000 ₴ = 300,000-1,200,000 ₴
- Холодильні камери: 2-4 шт × 150,000-300,000 ₴ = 300,000-1,200,000 ₴
- Морозильні камери: 2-3 шт × 200,000-400,000 ₴ = 400,000-1,200,000 ₴
- Компресорне обладнання: 500,000-1,500,000 ₴
- Разом холодильне: 2,500,000-8,000,000 ₴

**Електрика потужна (400-600 кВт!):**
- Трансформаторна підстанція або потужне підключення: 800,000-2,000,000 ₴
- Головний розподільчий щит (ГРЩ): 300,000-600,000 ₴
- Резервне живлення (генератор/UPS): 400,000-800,000 ₴
- Кабельні лінії 400V: потужні перерізи (6-10мм²): 500,000-1,000,000 ₴
- Освітлення торгового залу (LED панелі): 200-300 точок × 1,500 ₴ = 300,000-450,000 ₴
- Разом електрика: 2,300,000-4,850,000 ₴

**HVAC (вентиляція та кондиціювання):**
- Приточно-витяжна вентиляція: великий об'єм (4-5м стелі!): 1,500,000-3,000,000 ₴
- Кондиціювання торгового залу (1000+м²): 800,000-1,500,000 ₴
- Вентиляція складських приміщень: 300,000-600,000 ₴
- Разом HVAC: 2,600,000-5,100,000 ₴

**Протипожежні системи:**
- Автоматична пожежна сигналізація: 400,000-800,000 ₴
- Система пожежогасіння (спринклерна): 1,000,000-2,000,000 ₴
- Система димовидалення: 500,000-1,000,000 ₴
- Евакуаційне освітлення та табло: 150,000-300,000 ₴
- Протипожежні двері: 10-15 шт × 15,000 ₴ = 150,000-225,000 ₴
- Разом протипожежне: 2,200,000-4,325,000 ₴

**Системи безпеки:**
- Відеоспостереження: 30-50 камер × 8,000 ₴ = 240,000-400,000 ₴
- Система контролю доступу: 200,000-400,000 ₴
- Охоронна сигналізація: 150,000-300,000 ₴
- Разом безпека: 590,000-1,100,000 ₴

**Касова зона:**
- Касові столи: 5-8 шт × 25,000 ₴ = 125,000-200,000 ₴
- Електропроводка для кас (POS): 150,000-250,000 ₴
- Разом касова зона: 275,000-450,000 ₴

**Вантажна зона:**
- Вантажний під'їзд (рампа/докшелтер): 400,000-800,000 ₴
- Секційні/відкатні ворота: 150,000-300,000 ₴
- Освітлення та електрика вантажної зони: 100,000-200,000 ₴
- Разом вантажна зона: 650,000-1,300,000 ₴

**Санвузли комерційні:**
- Для відвідувачів + персоналу: 8-12 санвузлів
- Комерційна сантехніка: 400,000-800,000 ₴

**Зовнішнє благоустрій:**
- Парковка (30-50 місць): асфальтування, розмітка, освітлення: 1,500,000-3,000,000 ₴
- Пандуси, доріжки: 300,000-600,000 ₴
- Зовнішнє освітлення: 200,000-400,000 ₴
- Огорожа та ворота: 400,000-800,000 ₴
- Разом благоустрій: 2,400,000-4,800,000 ₴

**4. БУДІВЕЛЬНІ РОБОТИ (МАСШТАБ!):**
- Фундамент: для великої площі та навантажень (обладнання): +50-100%
- Стіни: велика висота (4-5м), велика площа: розрахунок для 1500-2000 м²
- Перекриття: підвищені навантаження від обладнання
- Покрівля: велика площа, складна система водовідведення
- Оздоблення: комерційне, стійке до трафіку 500-1000 відвідувачів/день

**5. ПЕРЕВІРКА ПЕРЕД ВІДПОВІДДЮ:**
□ Загальна вартість > 50,000,000 ₴? (Якщо менше - ти ПОМИЛЯЄШСЯ!)
□ Є холодильне обладнання на 2-8 млн ₴?
□ Є потужна електрика на 2-5 млн ₴?
□ Є HVAC на 2-5 млн ₴?
□ Є протипожежні системи на 2-4 млн ₴?
□ Є парковка на 1.5-3 млн ₴?
□ Площа визначена з документів (1000+ м²)?

**Якщо на будь-яке питання "НІ" - ти ПРОВАЛИВ оцінку! ВИПРАВ!**

**ТИПОВА СТРУКТУРА КОШТОРИСУ АТБ:**
- Будівельні роботи (фундамент, стіни, дах): 30-40 млн ₴
- Холодильне обладнання: 2-8 млн ₴
- Електрика потужна: 2-5 млн ₴
- HVAC: 2-5 млн ₴
- Протипожежні системи: 2-4 млн ₴
- Системи безпеки: 0.6-1.1 млн ₴
- Касова зона: 0.3-0.5 млн ₴
- Санвузли: 0.4-0.8 млн ₴
- Благоустрій та парковка: 2-5 млн ₴
- Вантажна зона: 0.7-1.3 млн ₴
- Інженерні мережі: 3-8 млн ₴
- Оздоблення: 5-10 млн ₴
**МІНІМУМ: 50-100 млн ₴**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯🎯🎯 РЕЖИМ ТЕНДЕРА - КРИТИЧНО ВАЖЛИВО! 🎯🎯🎯
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**ЦЕЙ КОШТОРИС ДЛЯ ТЕНДЕРНОЇ ПРОПОЗИЦІЇ!**

**ВИМОГИ ТЕНДЕРА:**

1. **МІНІМАЛЬНА БАЗОВА ЦІНА: 100,000,000 ₴ (100 млн грн)**
   - Це МІНІМУМ згідно попередніх розрахунків
   - Якщо твій кошторис < 100 млн - ти ПРОВАЛИВ завдання!
   - Оптимально: 105-120 млн ₴ (для маневру в торгах)

2. **ДЕТАЛЬНА РОЗБИВКА (ОБОВ'ЯЗКОВО!):**
   - Кожна позиція з обґрунтуванням
   - Всі системи повністю деталізовані
   - Немає загальних формулювань типу "Різне"
   - Кожен матеріал/робота має кількість, ціну, суму

3. **ЦІНОВИЙ КОРИДОР ДЛЯ ТОРГІВ:**
   - **БАЗА (оптимістична):** ~100-105 млн ₴
   - **РЕКОМЕНДОВАНА (реалістична):** ~110-120 млн ₴
   - **МАКСИМУМ (песимістична):** ~130-140 млн ₴

   Твоє завдання: створити БАЗУ ~105-115 млн ₴
   (Щоб був запас для резервів +15% = виходить 120-132 млн)

4. **РЕЗЕРВИ НА НЕПЕРЕДБАЧЕНІ ВИТРАТИ:**
   НЕ включай резерви в основний кошторис!
   Але структуруй так, щоб:
   - Основний кошторис: 105-115 млн ₴
   - Резерв +10%: +10-11 млн ₴
   - Резерв +15%: +15-17 млн ₴
   - Всього з резервом: 120-132 млн ₴

5. **ЯК ДОСЯГТИ 100+ МЛН:**

   **A. ЗБІЛЬШ ВАРТІСТЬ КЛЮЧОВИХ СИСТЕМ:**

   **Холодильне обладнання:** 5-10 млн ₴ (НЕ 2-8!)
   - Холодильні вітрини: 15-25 шт × 100,000-150,000 ₴ = 1,500,000-3,750,000 ₴
   - Морозильні лари: 8-12 шт × 80,000-120,000 ₴ = 640,000-1,440,000 ₴
   - Холодильні камери (для молока, м'яса): 3-5 шт × 250,000-400,000 ₴ = 750,000-2,000,000 ₴
   - Морозильні камери: 2-4 шт × 300,000-500,000 ₴ = 600,000-2,000,000 ₴
   - Компресорне обладнання + автоматика: 1,000,000-2,000,000 ₴
   - Монтаж та пусконалагодження: 500,000-800,000 ₴
   **ВСЬОГО ХОЛОДИЛЬНЕ: 5,000,000-10,000,000 ₴**

   **Будівельні роботи:** 40-50 млн ₴ (НЕ 30-40!)
   - Фундамент (1500-2000м², посилений): 6,000,000-10,000,000 ₴
   - Стіни (висота 4-5м, утеплення 150мм): 12,000,000-18,000,000 ₴
   - Перекриття та покрівля (велика площа): 10,000,000-15,000,000 ₴
   - Вікна та двері (комерційні, протипожежні): 3,000,000-5,000,000 ₴
   - Оздоблення фасаду (комерційне): 4,000,000-6,000,000 ₴
   - Земляні роботи та підготовка: 2,000,000-4,000,000 ₴
   - Бетонні роботи (підлоги, рампи): 3,000,000-5,000,000 ₴
   **ВСЬОГО БУДІВЕЛЬНІ: 40,000,000-63,000,000 ₴**

   **Електрика:** 5-8 млн ₴ (НЕ 2-5!)
   - Трансформаторна підстанція/потужне підключення: 1,500,000-3,000,000 ₴
   - ГРЩ та РЩ (комерційні, резервовані): 500,000-1,000,000 ₴
   - Генератор резервний (100-150 кВт): 600,000-1,200,000 ₴
   - Кабельні лінії (400V, великі перерізи): 800,000-1,500,000 ₴
   - Освітлення торгового залу (300-400 точок LED): 500,000-800,000 ₴
   - Освітлення зовнішнє (парковка, фасад): 300,000-600,000 ₴
   - Розетки та силові точки (200+ шт): 400,000-700,000 ₴
   - Монтаж, пусконалагодження: 400,000-800,000 ₴
   **ВСЬОГО ЕЛЕКТРИКА: 5,000,000-9,600,000 ₴**

   **HVAC (вентиляція + кондиціювання):** 4-7 млн ₴ (НЕ 2-5!)
   - Приточно-витяжна установка (великої потужності): 2,000,000-3,500,000 ₴
   - Кондиціювання торгового залу (VRF система): 1,500,000-2,500,000 ₴
   - Повітроводи та решітки (велика площа): 800,000-1,500,000 ₴
   - Монтаж, балансування, пусконалагодження: 500,000-1,000,000 ₴
   **ВСЬОГО HVAC: 4,800,000-8,500,000 ₴**

   **Протипожежні системи:** 3-5 млн ₴ (НЕ 2-4!)
   - Спринклерна система (повне покриття): 1,500,000-2,500,000 ₴
   - Автоматична пожежна сигналізація: 600,000-1,200,000 ₴
   - Система димовидалення: 700,000-1,500,000 ₴
   - Евакуаційне освітлення та табло: 200,000-400,000 ₴
   - Протипожежні двері (15-20 шт): 300,000-500,000 ₴
   **ВСЬОГО ПРОТИПОЖЕЖНЕ: 3,300,000-6,100,000 ₴**

   **Системи безпеки:** 1-2 млн ₴ (НЕ 0.6-1.1!)
   - Відеоспостереження (40-60 камер, NVR): 400,000-800,000 ₴
   - Контроль доступу (СКУД): 300,000-600,000 ₴
   - Охоронна сигналізація: 200,000-400,000 ₴
   - Інтегрована диспетчеризація: 150,000-300,000 ₴
   **ВСЬОГО БЕЗПЕКА: 1,050,000-2,100,000 ₴**

   **Благоустрій та парковка:** 3-6 млн ₴ (НЕ 2-5!)
   - Асфальтування парковки (40-60 місць = 1000-1500м²): 1,500,000-3,000,000 ₴
   - Освітлення парковки та території: 400,000-800,000 ₴
   - Пішохідні доріжки, бордюри: 300,000-600,000 ₴
   - Благоустрій, озеленення: 400,000-800,000 ₴
   - Огорожа та ворота (по периметру): 500,000-1,000,000 ₴

   **B. ФІКСОВАНІ РОЗРАХУНКИ ДЛЯ СТАБІЛЬНОСТІ ТЕНДЕРА:**

   🎯 **КРИТИЧНО: Використовуй ЦІ ТОЧНІ формули для кількостей!**
   Це забезпечить стабільність кошторису (±5 млн замість ±40 млн)

   **Площа проекту з документів: ${parsedData?.sitePlan?.area || area || '1426'} м²**

   **РОЗРАХУНОК ХОЛОДИЛЬНОГО ОБЛАДНАННЯ (на базі торгової площі):**
   - Торгова площа ≈ 60% від загальної = ${Math.round((parseFloat(parsedData?.sitePlan?.area || area || '1426') * 0.6))} м²
   - Холодильні вітрини: **ТОЧНО ${Math.round((parseFloat(parsedData?.sitePlan?.area || area || '1426') * 0.6) / 50)} шт** (1 вітрина на 50 м² торгової площі)
     × 120,000 ₴ = ${Math.round((parseFloat(parsedData?.sitePlan?.area || area || '1426') * 0.6) / 50) * 120000} ₴
   - Морозильні лари: **ТОЧНО ${Math.round((parseFloat(parsedData?.sitePlan?.area || area || '1426') * 0.6) / 80)} шт** (1 лар на 80 м²)
     × 100,000 ₴ = ${Math.round((parseFloat(parsedData?.sitePlan?.area || area || '1426') * 0.6) / 80) * 100000} ₴
   - Холодильні камери: **ТОЧНО 4 шт** (стандарт для АТБ: молоко, м'ясо, риба, овочі)
     × 300,000 ₴ = 1,200,000 ₴
   - Морозильні камери: **ТОЧНО 3 шт** (заморожені продукти, морозиво, напівфабрикати)
     × 400,000 ₴ = 1,200,000 ₴
   - Компресорне обладнання: **ТОЧНО 1 комплект** = 1,500,000 ₴

   **РОЗРАХУНОК ЕЛЕКТРИКИ (на базі загальної площі):**
   - Загальна потужність: **ТОЧНО ${Math.round((parseFloat(parsedData?.sitePlan?.area || area || '1426') * 0.35))} кВт** (0.35 кВт/м² для супермаркету)
   - Трансформаторна підстанція: **ТОЧНО 1 шт** (${Math.round((parseFloat(parsedData?.sitePlan?.area || area || '1426') * 0.35))} кВА) = 2,200,000 ₴
   - Генератор резервний: **ТОЧНО 1 шт** (${Math.round((parseFloat(parsedData?.sitePlan?.area || area || '1426') * 0.35) * 0.3)} кВт) = 900,000 ₴
   - Світильники LED торговий зал: **ТОЧНО ${Math.round((parseFloat(parsedData?.sitePlan?.area || area || '1426') * 0.6) / 4)} шт** (1 світильник на 4 м²)
     × 2,500 ₴ = ${Math.round((parseFloat(parsedData?.sitePlan?.area || area || '1426') * 0.6) / 4) * 2500} ₴
   - Розетки силові: **ТОЧНО ${Math.round((parseFloat(parsedData?.sitePlan?.area || area || '1426')) / 10)} шт** (1 розетка на 10 м²)
     × 350 ₴ = ${Math.round((parseFloat(parsedData?.sitePlan?.area || area || '1426')) / 10) * 350} ₴

   **РОЗРАХУНОК HVAC (на базі об'єму приміщення):**
   - Висота торгового залу: 4.5 м
   - Об'єм торгового залу: ${Math.round((parseFloat(parsedData?.sitePlan?.area || area || '1426') * 0.6) * 4.5)} м³
   - Приточно-витяжна установка: **ТОЧНО ${Math.round((parseFloat(parsedData?.sitePlan?.area || area || '1426') * 0.6) * 4.5 / 1000)} м³/год** = 2,800,000 ₴
   - VRF система кондиціювання: **ТОЧНО ${Math.round((parseFloat(parsedData?.sitePlan?.area || area || '1426') * 0.6) / 30)} кВт** (180 Вт/м²)
     = 2,200,000 ₴

   **РОЗРАХУНОК ПРОТИПОЖЕЖНИХ СИСТЕМ:**
   - Спринклери: **ТОЧНО ${Math.round((parseFloat(parsedData?.sitePlan?.area || area || '1426')) / 10)} шт** (1 спринклер на 10 м²)
     × 1,200 ₴ = ${Math.round((parseFloat(parsedData?.sitePlan?.area || area || '1426')) / 10) * 1200} ₴
   - Пожежні датчики: **ТОЧНО ${Math.round((parseFloat(parsedData?.sitePlan?.area || area || '1426')) / 15)} шт** (1 датчик на 15 м²)
     × 800 ₴ = ${Math.round((parseFloat(parsedData?.sitePlan?.area || area || '1426')) / 15) * 800} ₴
   - Протипожежні двері: **ТОЧНО ${Math.round((parseFloat(parsedData?.sitePlan?.area || area || '1426')) / 100)} шт** (згідно евакуаційних вимог)
     × 25,000 ₴ = ${Math.round((parseFloat(parsedData?.sitePlan?.area || area || '1426')) / 100) * 25000} ₴

   **РОЗРАХУНОК ПАРКОВКИ:**
   - Місць: **ТОЧНО ${Math.round((parseFloat(parsedData?.sitePlan?.area || area || '1426')) / 25)} шт** (1 місце на 25 м² торгової площі, згідно ДБН)
   - Площа парковки: ${Math.round((parseFloat(parsedData?.sitePlan?.area || area || '1426')) / 25) * 25} м² (25 м² на місце)
   - Асфальтування: ${Math.round((parseFloat(parsedData?.sitePlan?.area || area || '1426')) / 25) * 25} м² × 1,800 ₴ = ${Math.round((parseFloat(parsedData?.sitePlan?.area || area || '1426')) / 25) * 25 * 1800} ₴

   **РОЗРАХУНОК СИСТЕМ БЕЗПЕКИ:**
   - Камери відеоспостереження: **ТОЧНО ${Math.round((parseFloat(parsedData?.sitePlan?.area || area || '1426')) / 30)} шт** (1 камера на 30 м²)
     × 12,000 ₴ = ${Math.round((parseFloat(parsedData?.sitePlan?.area || area || '1426')) / 30) * 12000} ₴

   ⚠️ **ВИКОРИСТОВУЙ ЦІ ТОЧНІ КІЛЬКОСТІ!** Не вигадуй свої - це формули для тендера!
   Ціни можна коригувати в межах ±10%, але кількості ФІКСОВАНІ!
   - Дренаж та зливова каналізація: 300,000-600,000 ₴
   **ВСЬОГО БЛАГОУСТРІЙ: 3,400,000-6,800,000 ₴**

   **Інженерні мережі (зовнішні + внутрішні):** 5-8 млн ₴
   - Водопостачання (підключення + внутрішні): 1,000,000-2,000,000 ₴
   - Каналізація (підключення + внутрішні): 1,200,000-2,500,000 ₴
   - Опалення (котельня або теплопункт): 1,500,000-2,500,000 ₴
   - Газопостачання (якщо потрібно): 500,000-1,000,000 ₴
   - Слаботочні мережі (інтернет, телефонія): 300,000-600,000 ₴
   **ВСЬОГО ІНЖЕНЕРНІ: 4,500,000-8,600,000 ₴**

   **Оздоблення внутрішнє:** 8-12 млн ₴ (НЕ 5-10!)
   - Підлоги торгового залу (епоксидні/плитка, 1000-1500м²): 2,000,000-4,000,000 ₴
   - Стіни торгового залу (штукатурка, фарба, панелі): 1,500,000-2,500,000 ₴
   - Стелі (підвісні, касетні, 1000-1500м²): 2,000,000-3,000,000 ₴
   - Санвузли (10-15 шт, комерційні): 800,000-1,500,000 ₴
   - Складські приміщення (оздоблення): 500,000-1,000,000 ₴
   - Офісні приміщення: 400,000-800,000 ₴
   - Касова зона (обладнання, оздоблення): 500,000-1,000,000 ₴
   - Вантажна зона (рампа, ворота): 800,000-1,500,000 ₴
   **ВСЬОГО ОЗДОБЛЕННЯ: 8,500,000-15,300,000 ₴**

   **B. ДОДАЙ ОБОВ'ЯЗКОВІ ДЕТАЛІ:**
   - Архітектурне освітлення фасаду: 300,000-600,000 ₴
   - Вивіски та айдентика (LED вивіска): 400,000-800,000 ₴
   - Зовнішня інженерія (дренаж, дощоприймачі): 500,000-1,000,000 ₴
   - Технологічне обладнання (ваги, касові апарати): 800,000-1,500,000 ₴
   - Меблі торгового залу (стелажі): 3,000,000-6,000,000 ₴
   - Підготовка майданчика (розчищення, демонтаж): 500,000-1,000,000 ₴
   - Тимчасові споруди (бетонозмішувач, туалети): 300,000-600,000 ₴
   - Будівельна техніка (оренда крана, екскаватора): 800,000-1,500,000 ₴

   **6. ПІДСУМОК ПО СЕКЦІЯХ (ОРІЄНТОВНО):**

   1. Підготовчі роботи:           2-4 млн ₴
   2. Фундамент:                    6-10 млн ₴
   3. Стіни та конструкції:        15-25 млн ₴
   4. Покрівля:                     4-8 млн ₴
   5. Вікна та двері:               3-5 млн ₴
   6. Електрика:                    5-10 млн ₴
   7. Холодильне обладнання:        5-10 млн ₴
   8. HVAC:                         5-9 млн ₴
   9. Протипожежні системи:         3-6 млн ₴
   10. Інженерні мережі:            5-9 млн ₴
   11. Оздоблення внутрішнє:        8-15 млн ₴
   12. Оздоблення фасаду:           4-6 млн ₴
   13. Санвузли:                    1-2 млн ₴
   14. Системи безпеки:             1-2 млн ₴
   15. Благоустрій та парковка:     3-7 млн ₴
   16. Додаткове обладнання:        5-10 млн ₴
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ВСЬОГО БАЗОВИЙ КОШТОРИС:   75-138 млн ₴

   ЦІЛЬ: 105-120 млн ₴ (оптимальний коридор для тендера)

7. **ПЕРЕВІРКА ПЕРЕД ВІДПОВІДДЮ (ТЕНДЕР):**
   □ Загальна вартість ≥ 100,000,000 ₴? (ОБОВ'ЯЗКОВО!)
   □ Всі секції детально розписані? (НЕ "Різне"!)
   □ Холодильне обладнання ≥ 5 млн ₴?
   □ Будівельні роботи ≥ 40 млн ₴?
   □ Електрика ≥ 5 млн ₴?
   □ HVAC ≥ 4 млн ₴?
   □ Кожна позиція має обґрунтування?

   **Якщо хоч на одне питання "НІ" - ти НЕ ГОТОВИЙ до тендера! ДОРОБІ!**

8. **ФОРМАТ ВИВЕДЕННЯ:**
   В кінці кошторису обов'язково додай:

   ═══════════════════════════════════════════════════════════════
   📊 ТЕНДЕРНИЙ АНАЛІЗ
   ═══════════════════════════════════════════════════════════════

   **БАЗОВА ВАРТІСТЬ (оптимістична):**     XXX,XXX,XXX ₴

   **ЦІНОВИЙ КОРИДОР ДЛЯ ТОРГІВ:**
   - Мінімум (база):                       XXX,XXX,XXX ₴
   - Рекомендована (+10%):                 XXX,XXX,XXX ₴
   - Максимум (+15%):                      XXX,XXX,XXX ₴

   **РЕЗЕРВИ НА НЕПЕРЕДБАЧЕНІ ВИТРАТИ:**
   - Резерв 10%:                           +XX,XXX,XXX ₴
   - Резерв 15%:                           +XX,XXX,XXX ₴

   **СТРАТЕГІЯ ТЕНДЕРНИХ ТОРГІВ:**
   - Початкова пропозиція:                 XXX,XXX,XXX ₴
   - Мінімум для зниження:                 XXX,XXX,XXX ₴
   - Критичний поріг:                      XXX,XXX,XXX ₴

   ⚠️ Рекомендація: Входити в тендер з пропозицією XXX-XXX млн ₴

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
    }

    // Build prompt
    const prompt = `# РОЛЬ
Ти — головний кошторисник із 20-річним досвідом будівельної компанії "Metrum Group" у Львові, Україна.
Ти ЕКСПЕРТ найвищого рівня у складанні кошторисів для будівництва та ремонту. Ти ніколи не припускаєшся помилок у розрахунках площ, об'ємів та кількостей.

${commercialOverride}

${wizardContext ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️⚠️⚠️ ДАНІ З ПРОФЕСІЙНОГО ОПИТУВАЛЬНИКА ⚠️⚠️⚠️
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${wizardContext}

**🚨 КРИТИЧНО ВАЖЛИВО 🚨**

Клієнт заповнив ДЕТАЛЬНИЙ ІНЖЕНЕРНИЙ ОПИТУВАЛЬНИК!

${commercialOverride ? `
⚠️ УВАГА: Виявлено комерційний об'єкт з документів!
- Якщо опитувальник вказує малу площу або тип "будинок" - це ПОМИЛКА!
- ПРІОРИТЕТ: дані з креслень та документів про реальний масштаб
- Використовуй опитувальник тільки для деталей (матеріали, системи)
` : `
ЦІ ДАНІ МАЮТЬ **АБСОЛЮТНИЙ ПРІОРИТЕТ** НАД БУДЬ-ЯКИМИ ІНШИМИ ДЖЕРЕЛАМИ!
`}

**ОБОВ'ЯЗКОВІ ВИМОГИ:**

1. **ВИКОРИСТОВУЙ ТІЛЬКИ ТІ МАТЕРІАЛИ, які вказані в опитувальнику!**
   - Якщо вказано "Цегла" → ТІЛЬКИ ЦЕГЛА, НЕ газоблок!
   - Якщо вказано "Металочерепиця" → ТІЛЬКИ МЕТАЛОЧЕРЕПИЦЯ, НЕ профнастил!
   - Якщо вказано "Газоблок" → ТІЛЬКИ ГАЗОБЛОК, НЕ цегла!

2. **НЕ ЗАМІНЯЙ матеріали на "аналоги" або "альтернативи"!**
   - Клієнт вже вирішив що хоче
   - Твоє завдання - порахувати кошторис для ЦИХ матеріалів

3. **ДОТРИМУЙСЯ всіх параметрів з опитувальника:**
   - Кількість поверхів
   - Висота стелі
   - Площі приміщень
   - Типи інженерних систем
   - Рівень якості матеріалів

**ПЕРЕВІРКА ПЕРЕД ВІДПОВІДДЮ:**
□ Матеріал стін відповідає опитувальнику?
□ Тип даху відповідає опитувальнику?
□ Всі інженерні системи враховані?
□ Рівень якості матеріалів відповідає (економ/стандарт/преміум)?

Якщо хоч на одне питання "НІ" - ти зробив ПОМИЛКУ! ВИПРАВ!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : ''}

${materialsContext ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰💰💰 БАЗА МАТЕРІАЛІВ З РЕАЛЬНИМИ ЦІНАМИ 💰💰💰
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${materialsContext}

**🚨 КРИТИЧНО ВАЖЛИВО - ВИКОРИСТАННЯ ЦІН 🚨**

1. **ВИКОРИСТОВУЙ ЦІНИ З БАЗИ МАТЕРІАЛІВ!**
   - Газоблок AEROC 300 = 89 грн/шт (НЕ 450 грн!)
   - Розетка Schneider Electric = 185 грн/шт (НЕ 50 грн!)
   - Кабель ВВГ-нг 3×2.5 = 42 грн/м (НЕ 15 грн!)

2. **НЕ ВИГАДУЙ ЦІНИ!** Якщо матеріалу немає в базі:
   - Вкажи "ціна уточнюється" або "за домовленістю"
   - Додай примітку: "⚠️ Потребує перевірки"
   - АБО використай схожий матеріал з бази як орієнтир

3. **ПЕРЕВІРКА:** Якщо твоя ціна відрізняється від бази > 20% → ти ПОМИЛЯЄШСЯ!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : ''}

${workItemsContext ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💼💼💼 БАЗА РОБІТ З РЕАЛЬНИМИ ЦІНАМИ 💼💼💼
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${workItemsContext}

**🚨 КРИТИЧНО ВАЖЛИВО - ОБОВ'ЯЗКОВЕ ДОДАВАННЯ РОБІТ 🚨**

1. **ДЛЯ КОЖНОГО МАТЕРІАЛУ ДОДАЙ РОБОТУ З МОНТАЖУ!**
   - Газоблок 100 шт → "Кладка стін з газоблоку" (1850 грн/м³)
   - Електропровід 50 м → "Прокладка електропроводки" (45 грн/м.п.)
   - Плитка 20 м² → "Укладання плитки на підлогу" (380 грн/м²)
   - Ламінат 30 м² → "Укладання ламінату" (180 грн/м²)

2. **ВИКОРИСТОВУЙ ЦІНИ З БАЗИ РОБІТ!**
   - Встановлення розетки = 180 грн/шт (НЕ 50 грн!)
   - Укладання плитки = 380 грн/м² (НЕ 150 грн!)
   - Штукатурка стін = 180 грн/м² (НЕ 80 грн!)

3. **ОБОВ'ЯЗКОВІ РОБОТИ ЩО ЧАСТО ЗАБУВАЮТЬ:**
   - Земляні роботи (риття котловану/траншей)
   - Опалубка для фундаменту
   - В'язка арматури
   - Заливка бетону
   - Монтаж опалубки
   - Вивіз сміття

4. **ПЕРЕВІРКА:** Якщо в кошторисі є матеріали але НЕМАЄ робіт з монтажу → ти ПОМИЛЯЄШСЯ!

**ПРИКЛАД ПРАВИЛЬНОГО КОШТОРИСУ:**

НЕПРАВИЛЬНО (тільки матеріали):
- Газоблок AEROC 300×200×600: 100 шт × 89 грн = 8,900 грн

ПРАВИЛЬНО (матеріали + роботи):
- Газоблок AEROC 300×200×600: 100 шт × 89 грн = 8,900 грн
- Кладка стін з газоблоку: 3.6 м³ × 1,850 грн = 6,660 грн

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : ''}

${specificationContext ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📚📚📚 ТЕХНІЧНА СПЕЦИФІКАЦІЯ ПРОЕКТУ 📚📚📚
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${specificationContext}

**🚨 КРИТИЧНО ВАЖЛИВО - ДОТРИМАННЯ СПЕЦИФІКАЦІЇ 🚨**

1. **ВИКОРИСТОВУЙ ТОЧНІ МАРКИ ТА МОДЕЛІ** зі специфікації
   - НЕ "Кабель 3×2.5", А "Кабель ВВГ-нг ПівденьКабель 3×2.5 мм²"
   - НЕ "Дюбель", А "Дюбель швидкий монтаж 6×40 мм"

2. **ДОДАВАЙ ІНСТРУМЕНТИ ТА КРІПЛЕННЯ** з технологічних карт
   - Якщо в специфікації вказано "Клеми WAGO 2273-243" → додай їх окремою позицією!
   - Якщо вказано метод монтажу → враховуй всі матеріали з нього

3. **ДОТРИМУЙСЯ СТАНДАРТІВ:**
   ${specificationData?.requirements?.filter((r: any) => r.critical).slice(0, 5).map((r: any) => `   - ${r.requirement}`).join('\n') || '   - Див. вимоги вище'}

4. **КІЛЬКОСТІ:** Якщо в специфікації вказано кількість (наприклад "250 м") → використовуй ЦЮ кількість!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : ''}

${sitePlanContext ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🗺️🗺️🗺️ ПЛАН ЗЕМЕЛЬНОЇ ДІЛЯНКИ ТА ТОПОГРАФІЯ 🗺️🗺️🗺️
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${sitePlanContext}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : ''}

${geologicalContext ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🪨🪨🪨 ГЕОЛОГІЧНИЙ ЗВІТ - КРИТИЧНІ ВИМОГИ 🪨🪨🪨
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${geologicalContext}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : ''}

${reviewContext ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝📝📝 РЕЦЕНЗІЯ ЕКСПЕРТА - ОБОВ'ЯЗКОВІ ВИПРАВЛЕННЯ 📝📝📝
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${reviewContext}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : ''}

${photosContext ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📸📸📸 ФОТО БУДІВЕЛЬНОГО МАЙДАНЧИКА 📸📸📸
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${photosContext}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : ''}

# КРИТИЧНІ ПРАВИЛА РОЗРАХУНКУ ПЛОЩ ТА КІЛЬКОСТЕЙ
1. **УВАЖНО ЧИТАЙ ДОКУМЕНТИ.** Якщо в PDF/Excel файлі вказано площі кімнат, стін, підлоги — використовуй ТІЛЬКИ ці значення. НЕ ВИГАДУЙ площі.
2. **Площа стін ≠ площа підлоги.** Площа стін = периметр × висота стелі (зазвичай 2.7м). Не плутай ці величини.
3. **Віднімай площі вікон та дверей** при розрахунку оздоблення стін (вікно ≈ 1.5 м², двері ≈ 1.8 м²).
4. **Перевіряй математику ДВІЧІ.** totalCost = quantity × unitPrice + laborCost. sectionTotal = сума всіх totalCost у секції.
5. **ОБОВ'ЯЗКОВО ВКЛЮЧАЙ ВАРТІСТЬ РОБІТ (laborCost).** Якщо є матеріал - ЗАВЖДИ є робота з ним! Не ставте laborCost: 0 для всіх позицій!
6. Якщо площа вказана у файлі як "загальна площа квартири" — це площа ПІДЛОГИ, не стін.
7. Якщо площа НЕ вказана у файлах і користувач не вказав — оціни на основі кількості кімнат та типу приміщення, але ПОЗНАЧИТИ що це оцінка.

# ЗАВДАННЯ
Проаналізуй надані файли проєкту та створи МАКСИМАЛЬНО ДЕТАЛЬНИЙ та РЕАЛІСТИЧНИЙ КОШТОРИС.

# КОНТЕКСТ
- Тип проєкту: ${projectType}
- Площа (від користувача): ${area || "НЕ ВКАЗАНО — визначи з документів або оціни"}
- Додаткові примітки: ${additionalNotes || "немає"}

${wizardData?.specialRequirements ? `
╔════════════════════════════════════════════════════════════════════╗
║  🔍 КРИТИЧНА ІНФОРМАЦІЯ ВІД ІНЖЕНЕРА ПРО ПРОЕКТ                   ║
╚════════════════════════════════════════════════════════════════════╝

${wizardData.specialRequirements}

⚠️⚠️⚠️ ЦЯ ІНФОРМАЦІЯ ДУЖЕ ВАЖЛИВА! ОБОВ'ЯЗКОВО ВРАХУЙ ЇЇ! ⚠️⚠️⚠️

📋 ІНСТРУКЦІЇ ЯК ВИКОРИСТОВУВАТИ:

1. Комунікації НЕ підведені / Потрібно підвести:
   → ДОДАЙ позиції прокладки комунікацій
   → Врахуй відстань (якщо вказана)
   → Додай земляні роботи під комунікації

2. Немає води / Воду треба тягнути X метрів:
   → ДОДАЙ труби водопостачання (відповідної довжини)
   → ДОДАЙ земляні роботи під траншею
   → ДОДАЙ вводи та запірну арматуру

3. Немає світла / Електрику треба підвести:
   → ДОДАЙ кабель живлення (SIP або ВВГ)
   → ДОДАЙ електрощит вводу
   → ДОДАЙ опору/стовп (якщо потрібно)

4. Інформація про грунт (глина, схили, високі води):
   → Глина: посилений дренаж
   → Схили: підпірні конструкції
   → Високі води: посилена гідроізоляція

5. Побажання щодо матеріалів:
   → ВИКОРИСТОВУЙ саме ці матеріали в кошторисі
   → НЕ замінюй на дешевші альтернативи

6. Явно написане заборонене/обов'язкове:
   → ТОЧНО ДОТРИМУЙСЯ цих вказівок

╔════════════════════════════════════════════════════════════════════╗
` : ''}

- Локація: Львів, Україна
- Валюта: гривня (₴, UAH)
${templateSpecificPrompt}
# КРИТИЧНО ВАЖЛИВО — ПОВНОТА КОШТОРИСУ
Кошторис має бути ПОВНИМ і РЕАЛІСТИЧНИМ. Типовий ремонт квартири 60-100 м² включає 50-120+ позицій матеріалів.
НЕ СКОРОЧУЙ і НЕ УЗАГАЛЬНЮЙ. Кожен матеріал — окрема позиція.

## ОБОВ'ЯЗКОВІ СЕКЦІЇ ДЛЯ КОШТОРИСУ (включи ВСІ що стосуються проєкту):

${sectionsText}

## КРИТИЧНО ВАЖЛИВА ВИМОГА - КІЛЬКІСТЬ ПОЗИЦІЙ:

${(isCommercialProject || hasATB) ? `
🏪 **КОМЕРЦІЙНИЙ ПРОЕКТ - ПОЕТАПНА ГЕНЕРАЦІЯ:**
🎯 **РЕЖИМ ТЕНДЕРА: ЗАГАЛЬНА ЦІЛЬ ≥ 100,000,000 ₴ (100 млн грн)**

**Загальна ціль по позиціях: 400-500+ позицій** (для повного комерційного кошторису)
**Загальна ціль по вартості: 105-120 млн ₴** (для тендерної конкуренції)

**Твоє завдання ЗАРАЗ: згенеруй ФАЗУ 1 (150-200 позицій)**

📋 **ФАЗА 1 - Основні системи та роботи (150-200 позицій):**
- Будівельні роботи (фундамент, стіни, дах, перекриття): 40-50 позицій
  * Ціль: 40-50 млн ₴ (основна будівля)
- Промислове холодильне обладнання: 20-30 позицій
  * Ціль: 5-10 млн ₴ (критично для супермаркету!)
- Електрика потужна (трансформатор, ГРЩ, кабелі, розетки): 30-40 позицій
  * Ціль: 5-8 млн ₴ (400-600 кВт)
- HVAC (вентиляція, кондиціювання): 20-30 позицій
  * Ціль: 4-7 млн ₴ (великі об'єми повітря)
- Протипожежні системи (сигналізація, пожежогасіння): 20-30 позицій
  * Ціль: 3-5 млн ₴ (обов'язкові для комерції)
- Водопостачання та каналізація: 10-15 позицій
  * Ціль: 2-4 млн ₴

**Орієнтовна вартість Фази 1: 60-85 млн ₴**

⚠️ **НЕ намагайся згенерувати ВСІ 500 позицій зараз!**
Це призведе до обриву JSON. Зроби якісну Фазу 1 (150-200 позицій),
наступні ітерації додадуть Фазу 2 (оздоблення, благоустрій) та Фазу 3 (деталі).

**МІНІМУМ для ЦІЄЇ фази: 150 позицій, ОПТИМАЛЬНО: 180-200 позицій**
**ВАРТІСТЬ для цієї фази: 60-85 млн ₴** (використовуй ВЕРХНЮ межу цін!)

` : `**МІНІМУМ для цього проекту: ${calculatedMin} позицій**
`}

${template === 'house_full' && !(isCommercialProject || hasATB) ? `
**РОЗБИВКА ПО КАТЕГОРІЯХ (орієнтовно):**
- Фундамент та нульовий цикл: 15-25 позицій
- Стіни та перегородки: 20-35 позицій
- Перекриття та дах: 25-40 позицій
- Вікна та двері: 10-15 позицій
- Фасадні роботи: 15-25 позицій
- Електрика: 20-30 позицій
- Сантехніка та опалення: 20-35 позицій
- Внутрішнє оздоблення: 35-60+ позицій

**КОЖНА категорія має бути ДЕТАЛЬНО розписана!**
Не узагальнюй! Кожна марка, розмір - ОКРЕМА позиція!
` : ''}

**ПРАВИЛА:**
- Кожен ТИП матеріалу — ОКРЕМА позиція (не "шпаклівка", а "шпаклівка стартова Knauf HP Start 30 кг" і "шпаклівка фінішна Knauf HP Finish 25 кг")
- Вказуй КОНКРЕТНІ марки та виробників матеріалів де можливо
- Кожен розмір, товщина, специфікація — окрема позиція

⚠️⚠️⚠️ КРИТИЧНО ВАЖЛИВО ⚠️⚠️⚠️

${(isCommercialProject || hasATB) ? `
**МІНІМУМ для ФАЗИ 1: 150 позицій, ОПТИМАЛЬНО: 180-200 позицій**

ПЕРЕД ВІДПОВІДДЮ ПОРАХУЙ: sections[0].items.length + sections[1].items.length + ... >= 150
Якщо < 150 → ДОДАЙ ЩЕ ПОЗИЦІЙ!
Якщо > 200 → ЗУПИНИСЬ, наступна ітерація додасть більше!

Фокус на ЯКІСТЬ, а не на кількість. Краще 180 якісних позицій зараз,
ніж 500 поганих або обірваний JSON.
` : `
**АБСОЛЮТНИЙ МІНІМУМ: ${calculatedMin} позицій**

Якщо ти згенеруєш менше ${calculatedMin} позицій - це НЕПРИЙНЯТНО!
Користувач ВІДХИЛИТЬ кошторис!

ПЕРЕД ВІДПОВІДДЮ ПОРАХУЙ: sections[0].items.length + sections[1].items.length + ... >= ${calculatedMin}
Якщо НІ - ДОДАЙ ЩЕ ПОЗИЦІЙ!
`}

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
- Плitка: Paradyz, Cersanit, Golden Tile

${wizardContext ? `
⚠️ НАГАДУВАННЯ ПРО ОПИТУВАЛЬНИК:
Якщо в опитувальнику вказано конкретний матеріал (наприклад ЦЕГЛА) - використовуй ТІЛЬКИ його!
НЕ заміняй на газоблок, панелі чи інше!
Опитувальник > Загальні рекомендації!
` : ''}

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

# ВАЖЛИВО ПРО ВАРТІСТЬ РОБІТ:
Кожна позиція матеріалів ПОВИННА мати вартість робіт (laborCost)!

Приклади ПРАВИЛЬНИХ позицій:
1. Штукатурка МП-75 30кг:
   - quantity: 96
   - unitPrice: 400 (матеріал)
   - laborCost: 96 × 350 = 33,600 ₴ (робота 350₴/мішок або ~300-350₴/м² площі)
   - totalCost: 38,400 + 33,600 = 72,000 ₴

2. Гіпсокартон Knauf 12.5мм:
   - quantity: 50
   - unitPrice: 505 (матеріал)
   - laborCost: 50 × 3 × 250 = 37,500 ₴ (монтаж 250₴/м², лист = 3м²)
   - totalCost: 25,250 + 37,500 = 62,750 ₴

3. Плитка керамічна:
   - quantity: 45 м²
   - unitPrice: 350 ₴/м² (матеріал)
   - laborCost: 45 × 450 = 20,250 ₴ (укладання 450₴/м²)
   - totalCost: 15,750 + 20,250 = 36,000 ₴

НЕПРИЙНЯТНО: laborCost: 0 для всіх позицій!

# ДАНІ З ФАЙЛІВ КЛІЄНТА:
${textParts.join("\n\n")}

${imageParts.length > 0 ? `
# АНАЛІЗ ЗОБРАЖЕНЬ ТА ПЛАНІВ (${imageParts.length} файлів):

⚠️ КРИТИЧНО ВАЖЛИВО - ДЕТАЛЬНИЙ АНАЛІЗ ЗОБРАЖЕНЬ:

Ти отримав ${imageParts.length} зображень - це архітектурні плани, схеми комунікацій та креслення.
**PDF файли автоматично конвертовані в зображення** для візуального аналізу кожної сторінки.

---

${drawingGuide}

---

**ЩО ШУКАТИ НА ПЛАНАХ:**

1. **План приміщень:**
   - Розміри кімнат (довжина × ширина в мм або см)
   - Площі кожної кімнати (зазвичай вказані на плані)
   - Висота стель (якщо вказана)
   - Товщина стін та перегородок

2. **План електрики:**
   - Розетки (кількість та розташування) - кожна розетка = окрема позиція
   - Вимикачі (скільки і де)
   - Світильники (кількість по кімнатах)
   - Електрощит та автомати
   - Довжини кабельних трас

3. **План сантехніки:**
   - Водопровід (холодна + гаряча вода, довжини труб)
   - Каналізація (труби 50мм, 110мм, довжини)
   - Сантехприлади (унітаз, умивальник, душ, ванна - кількість)
   - Змішувачі та фітинги

4. **План опалення:**
   - Радіатори (кількість по кімнатах, потужність)
   - Труби опалення (діаметр, довжини)
   - Котел (тип, потужність)
   - Колектори та розподільчі системи

5. **План підлоги (якщо є):**
   - Теплі підлоги (площі покриття)
   - Типи покриттів (плитка, ламінат - де і скільки м²)
   - Стяжка (товщина, площі)

**ЯК ВИКОРИСТОВУВАТИ ЦЮ ІНФОРМАЦІЮ:**

- КОЖНА розетка на плані = окрема позиція "Розетка + підрозетник + кабель"
- КОЖНА лампа = окрема позиція "Світильник + монтаж"
- КОЖЕН радіатор = окрема позиція з конкретною потужністю
- Виміряй довжини комунікацій по планах і порахуй метраж кабелів/труб

**ПРИКЛАД:**
Якщо на плані бачиш 25 розеток → додай МІНІМУМ:
- 25 позицій "Розетка двомісна"
- 25 позицій "Підрозетник"
- Кабель ВВГнг 3×2.5 (порахуй загальний метраж)
- Гофра для кабелю

НЕ УЗАГАЛЬНЮЙ! Кожен елемент з плану = окрема позиція в кошторисі!
` : ''}

# 🔍 ПОШУК АКТУАЛЬНИХ ЦІН (ОБОВ'ЯЗКОВО!)

**🚨 КРИТИЧНО ВАЖЛИВО - ЦІНИ СТАНОМ НА ${new Date().toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' })}:**

Для КОЖНОГО матеріалу в кошторисі:

**1. ОБОВ'ЯЗКОВО використовуй Google Search для пошуку АКТУАЛЬНИХ цін:**
   - Шукай ТОЧНУ назву товару (марку, модель, розмір)
   - Перевіряй ціни у 2-3 магазинах (Epicentr, Leroy Merlin, Будмагазин)
   - Використовуй СЕРЕДНЮ ціну з кількох джерел
   - ❌ ЗАБОРОНЕНО вигадувати ціни без пошуку!
   - ❌ ЗАБОРОНЕНО використовувати застарілі ціни!

**2. Приклади ПРАВИЛЬНИХ пошукових запитів:**

   Google Search: "штукатурка knauf mp-75 30кг ціна україна"
   Google Search: "газоблок 100х200х600 aeroc ціна львів"
   Google Search: "металочерепиця монтеррей ціна за м2 2025"

**3. Для priceSource використовуй пошуковий URL:**
   - ✅ https://epicentrk.ua/search/?q=штукатурка+MP-75+30кг
   - ✅ https://prom.ua/search?search_term=газоблок+aeroc
   - ✅ https://budmagazin.ua/search?q=металочерепиця
   - ❌ НЕ прямі посилання на товари (404!)

**4. У priceNote вказуй:**
   - Точну знайдену ціну
   - Назву магазину де знайшов
   - Дату актуальності (${new Date().getFullYear()})

**Приклад правильного priceNote:**

"priceNote": "Knauf MP-75 30кг, 385₴ (Epicentr, ${new Date().toLocaleDateString('uk-UA', { month: 'short', year: 'numeric' })})"

**🔥 ЯКЩО НЕ ЗНАЙШОВ ЦІНУ - НЕ ВИГАДУЙ! Постав 0 і напиши "Ціна потребує уточнення"**

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

## Приклад 8: Роботи БЕЗ матеріалу (тільки праця)
{
  "description": "Штукатурка стін гіпсовою штукатуркою (роботи)",
  "unit": "м²",
  "quantity": 238.4,
  "unitPrice": 0,
  "laborCost": 78672,
  "totalCost": 78672,
  "priceSource": "",
  "priceNote": "Вартість робіт: 330₴/м² × 238.4м² = 78,672₴"
}

## Приклад 9: Матеріал + роботи РАЗОМ (повна позиція)
{
  "description": "Влаштування паркового покриття (матеріал + роботи)",
  "unit": "м²",
  "quantity": 85,
  "unitPrice": 1200,
  "laborCost": 42500,
  "totalCost": 144500,
  "priceSource": "https://epicentrk.ua/search/?q=паркет+дуб",
  "priceNote": "Паркет дуб 1200₴/м² + робота 500₴/м² = 1700₴/м²"
}

## Приклад 10: Демонтажні роботи (тільки праця)
{
  "description": "Демонтаж існуючої двоповерхової будівлі",
  "unit": "м³",
  "quantity": 3200,
  "unitPrice": 0,
  "laborCost": 256000,
  "totalCost": 256000,
  "priceSource": "",
  "priceNote": "Демонтаж 80₴/м³ × 3200м³ = 256,000₴"
}

**ВАЖЛИВО:** Звертай увагу на:
1. Конкретні марки та виробники (Knauf, Ceresit, BauGut, Caparol)
2. Точні специфікації (розміри, вага, об'єм)
3. Реальні ціни з українського ринку (станом на 2025)
4. Правильні одиниці виміру (шт, м², м, кг, л)
5. Точні розрахунки totalCost = quantity × unitPrice + laborCost
6. Детальні priceNote з поясненням ціни

**🚨 КРИТИЧНО ВАЖЛИВО - СТРУКТУРА ЦІН:**

**Правило заповнення unitPrice та laborCost:**

1. **Тільки матеріали (без монтажу):**
   - unitPrice > 0 (ціна за одиницю матеріалу)
   - laborCost = 0
   - Приклад: Цемент, фарба, блоки, труби

2. **Тільки роботи (без матеріалів):**
   - unitPrice = 0
   - laborCost > 0 (загальна вартість робіт)
   - Приклад: Демонтаж, земляні роботи, штукатурка стін

3. **Матеріали + роботи РАЗОМ:**
   - unitPrice > 0 (ціна матеріалу)
   - laborCost > 0 (вартість монтажу/укладання)
   - totalCost = (quantity × unitPrice) + laborCost
   - Приклад: Укладання плитки, монтаж вікон

**❌ НЕПРИПУСТИМО:**
- unitPrice = 0 AND laborCost = 0
- totalCost не відповідає формулі

**✅ ЗАВЖДИ ПЕРЕВІРЯЙ:**
- totalCost = (quantity × unitPrice) + laborCost
- Хоча б одне з (unitPrice, laborCost) > 0

# ОСТАННЄ ПОПЕРЕДЖЕННЯ:

Перед відповіддю ПЕРЕВІР:
- Кількість позицій >= ${calculatedMin}? ${template === 'house_full' ? '(для будинку це МІНІМУМ 150!)' : ''}
- Кожна категорія деталізована?
- Не узагальнював матеріали?
- Кожна марка/розмір - окрема позиція?
${wizardContext ? `
⚠️ КРИТИЧНА ПЕРЕВІРКА - ОПИТУВАЛЬНИК:
- Матеріал стін відповідає опитувальнику? (якщо там цегла - ТІЛЬКИ цегла!)
- Тип даху відповідає?
- Рівень якості матеріалів (економ/стандарт/преміум) правильний?
- Всі інженерні системи з опитувальника враховані?
` : ''}

Якщо НІ на будь-що - ПОВТОРИ генерацію з більшою деталізацією!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨🚨🚨 КРИТИЧНА ВИМОГА - ПРОЧИТАЙ ЦЕ ПЕРЕД ГЕНЕРАЦІЄЮ! 🚨🚨🚨
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**МІНІМУМ ПОЗИЦІЙ: ${calculatedMin}**

Це НЕ рекомендація - це ОБОВ'ЯЗКОВА вимога!

Якщо ти згенеруєш МЕНШЕ ${calculatedMin} позицій:
❌ Кошторис буде ВІДХИЛЕНО
❌ Клієнт НЕ отримає повну інформацію
❌ Компанія втратить гроші на недооціненні проекту

**ЯК ДОСЯГТИ ${calculatedMin} ПОЗИЦІЙ:**

1. **НЕ об'єднуй матеріали:**
   ❌ ПОГАНО: "Штукатурка (стартова + фінішна)" - 1 позиція
   ✅ ДОБРЕ: "Штукатурка стартова Knauf HP Start 30кг" + "Шпаклівка фінішна Knauf HP Finish 25кг" - 2 позиції

2. **Розбивай на підтипи:**
   ❌ ПОГАНО: "Розетки" - 1 позиція
   ✅ ДОБРЕ: "Розетка одинарна" + "Розетка двомісна" + "Підрозетник" + "Кабель NYM 3x2.5" - 4 позиції

3. **Додавай всі компоненти системи:**
   Наприклад, для опалення:
   - Котел газовий (марка, модель, потужність)
   - Радіатори (кожен тип окремо)
   - Труби (різні діаметри окремо)
   - Фітинги (різні типи)
   - Термостати
   - Колектор
   - Група безпеки
   - Розширювальний бак
   - Циркуляційний насос
   - Кріплення
   - Ізоляція труб
   Це вже 10+ позицій для ОДНІЄЇ системи!

4. **Додавай допоміжні матеріали:**
   - Ґрунтовки (перед кожним етапом)
   - Клеї (різні типи)
   - Серпянка, кутники, профілі
   - Кріплення (саморізи, дюбелі, анкери)
   - Плівки (гідроізоляція, пароізоляція)

5. **Розбивай роботи по приміщеннях:**
   Якщо є 3 санвузли - вказуй матеріали для КОЖНОГО окремо!

**ПЕРЕД ВІДПРАВКОЮ ВІДПОВІДІ:**

Порахуй РЕАЛЬНУ кількість позицій:
sections[0].items.length + sections[1].items.length + sections[2].items.length + ... = ???

Якщо результат < ${calculatedMin} → ДОДАЙ ще ${Math.ceil(calculatedMin * 0.3)} позицій!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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

${(isCommercialProject || hasATB) ? `
**🎯 ОБОВ'ЯЗКОВО ДЛЯ КОМЕРЦІЙНОГО/ТЕНДЕРНОГО ПРОЕКТУ:**

Додай додаткову секцію "tenderAnalysis" всередині "summary" (після "recommendations"):

{
  "summary": {
    "materialsCost": 0.00,
    "laborCost": 0.00,
    "overheadPercent": 15,
    "overheadCost": 0.00,
    "totalBeforeDiscount": 0.00,
    "recommendations": "...",
    "tenderAnalysis": {
      "basePrice": 0.00,
      "priceCorridorMin": 0.00,
      "priceCorridorRecommended": 0.00,
      "priceCorridorMax": 0.00,
      "contingencyReserve10": 0.00,
      "contingencyReserve15": 0.00,
      "tenderStrategy": "Входити з пропозицією XXX-XXX млн ₴",
      "criticalThreshold": 0.00,
      "notes": "Додаткові примітки"
    }
  }
}

Розрахунки для tenderAnalysis:
- basePrice: totalBeforeDiscount (базова ціна)
- priceCorridorMin: basePrice (мінімум = база без знижки)
- priceCorridorRecommended: basePrice × 1.10 (рекомендована = база + 10%)
- priceCorridorMax: basePrice × 1.15 (максимум = база + 15%)
- contingencyReserve10: basePrice × 0.10 (резерв 10%)
- contingencyReserve15: basePrice × 0.15 (резерв 15%)
- tenderStrategy: "Входити з пропозицією XXX-XXX млн ₴, мінімум для зниження XXX млн ₴"
- criticalThreshold: basePrice × 0.95 (критичний поріг = база - 5%)

⚠️ **ПЕРЕВІРКА ПЕРЕД ВІДПОВІДДЮ:**
Якщо basePrice < 100,000,000 ₴ для АТБ супермаркету:
- Збільш кількість холодильного обладнання
- Збільш площу парковки
- Додай технологічне обладнання (стелажі, ваги)
- Додай архітектурне освітлення фасаду
- Перерахуй поки basePrice ≥ 100,000,000 ₴
` : ''}

# КОНТРОЛЬ ЯКОСТІ (перевір перед відповіддю):
✓ Кошторис містить НЕ МЕНШЕ ${calculatedMin} позицій матеріалів${template === 'house_full' ? ' (для будинку: МІНІМУМ 150 позицій, не 40-60!)' : ''}
✓ Всі площі відповідають даним з файлів
✓ totalCost = quantity × unitPrice + laborCost (для кожної позиції)
✓ sectionTotal = сума totalCost всіх позицій секції
✓ materialsCost = сума (quantity × unitPrice) по всіх позиціях
✓ laborCost = сума laborCost по всіх позиціях
✓ overheadCost = (materialsCost + laborCost) × overheadPercent / 100
✓ totalBeforeDiscount = materialsCost + laborCost + overheadCost
✓ Посилання — ТІЛЬКИ пошукові URL магазинів (НЕ прямі сторінки товарів)
✓ Кожен матеріал має конкретну назву з маркою/виробником
✓ **ВСІ ЦІНИ перевірені через Google Search і актуальні на ${new Date().getFullYear()} рік**
✓ **priceNote містить джерело ціни (магазин + дата)**`;

    // Generate estimate using selected AI model
    let text = "";

    switch (model) {
      case "pipeline":
        // NEW: Pipeline approach - Gemini analysis → Claude generation
        console.log("🔄 Використовуємо PIPELINE: Gemini (аналіз) → Claude (генерація)");

        // Phase 1: Gemini Analysis
        let analysisData: any;
        try {
          const analysisJSON = await analyzeWithGemini(textParts, imageParts, pdfParts, wizardData);
          analysisData = JSON.parse(analysisJSON);
          console.log("✅ Phase 1 (Gemini): Аналіз завершено");
        } catch (analysisError) {
          console.error("❌ Gemini analysis error:", analysisError);
          return NextResponse.json(
            {
              error: "Помилка аналізу з Gemini",
              details: analysisError instanceof Error ? analysisError.message : String(analysisError)
            },
            { status: 500 }
          );
        }

        // Phase 2: Claude Generation with analyzed data
        if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === "") {
          return NextResponse.json(
            { error: "ANTHROPIC_API_KEY не налаштований" },
            { status: 500 }
          );
        }

        console.log("🧠 Phase 2 (Claude): Генерація кошторису...");

        // Build enriched prompt with Gemini's analysis
        const enrichedPrompt = `${prompt}

# АНАЛІЗ ВІД GEMINI (Phase 1):

${JSON.stringify(analysisData, null, 2)}

**ВИКОРИСТОВУЙ ЦІ ДАНІ для генерації кошторису:**
- Всі кількості (розетки, вимикачі, двері) - з аналізу
- Всі площі - з аналізу
- Ціни матеріалів - з аналізу (вже перевірені через Google Search)
- Зауваження з рецензії - ОБОВ'ЯЗКОВО врахуй
- Геологічні вимоги (дренаж, тип фундаменту) - ОБОВ'ЯЗКОВО врахуй

Генеруй кошторис на основі цих даних!`;

        try {
          // Use Claude WITHOUT images (Gemini already analyzed them)
          text = await generateWithAnthropic(enrichedPrompt, textParts.join("\n\n"), []);
          console.log("✅ Phase 2 (Claude): Генерація завершена");
        } catch (claudeError) {
          console.error("❌ Claude generation error:", claudeError);
          return NextResponse.json(
            {
              error: "Помилка генерації з Claude",
              details: claudeError instanceof Error ? claudeError.message : String(claudeError)
            },
            { status: 500 }
          );
        }
        break;

      case "openai":
        if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "") {
          return NextResponse.json(
            { error: "OPENAI_API_KEY не налаштований" },
            { status: 500 }
          );
        }
        console.log("🤖 Використовуємо OpenAI GPT-4o...");
        text = await generateWithOpenAI(prompt, textParts.join("\n\n"), imageParts);
        break;

      case "anthropic":
        if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === "") {
          return NextResponse.json(
            { error: "ANTHROPIC_API_KEY не налаштований" },
            { status: 500 }
          );
        }
        console.log("🧠 Використовуємо Anthropic Claude Opus 4...");
        try {
          text = await generateWithAnthropic(prompt, textParts.join("\n\n"), imageParts);
          console.log("✅ Anthropic generation completed successfully");
        } catch (anthropicError) {
          console.error("❌ Anthropic generation error:", anthropicError);
          console.error("Error details:", {
            name: anthropicError instanceof Error ? anthropicError.name : 'Unknown',
            message: anthropicError instanceof Error ? anthropicError.message : String(anthropicError),
            stack: anthropicError instanceof Error ? anthropicError.stack : undefined
          });
          return NextResponse.json(
            {
              error: "Помилка генерації з Anthropic Claude",
              details: anthropicError instanceof Error ? anthropicError.message : String(anthropicError)
            },
            { status: 500 }
          );
        }
        break;

      default: // "gemini"
        if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "YOUR_GEMINI_API_KEY_HERE") {
          return NextResponse.json(
            { error: "GEMINI_API_KEY не налаштований" },
            { status: 500 }
          );
        }
        console.log("✨ Використовуємо Google Gemini з Google Search...");
        // Call Gemini with Google Search grounding for real prices
        const geminiModel = genAI.getGenerativeModel({
          model: "gemini-3-flash-preview",
          tools: [{
            googleSearch: {},
          } as unknown as import("@google/generative-ai").Tool],
          generationConfig: {
            temperature: 0.1, // Lower for more deterministic outputs (was 0.3)
            maxOutputTokens: 30000, // Increased to max (32768 is absolute max, 30k is safe)
            responseMimeType: "application/json", // Force JSON output
          },
        });

        const parts: (string | { inlineData: { data: string; mimeType: string } })[] = [prompt];

        // Include extracted text from PDF/Excel/CSV
        if (textParts.length > 0) {
          parts.push(textParts.join("\n\n"));
        }

        // Add PDF files directly - Gemini can read PDFs natively!
        if (pdfParts.length > 0) {
          console.log(`  📑 Adding ${pdfParts.length} PDF files for native Gemini analysis`);
          for (const pdf of pdfParts) {
            parts.push({
              inlineData: {
                data: pdf.data,
                mimeType: pdf.mimeType,
              }
            });
          }
        }

        // Add images (for non-PDF image files)
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
    let totalItems = 0;

    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
      const jsonStr = (jsonMatch[1] || text).trim();
      let parsed = JSON.parse(jsonStr);

      // Handle case where AI returns an array instead of object
      if (Array.isArray(parsed)) {
        console.log('⚠️ AI returned array, extracting first element');
        estimateData = parsed[0] || {};
      } else {
        estimateData = parsed;
      }

      // Log generated estimate stats
      totalItems = estimateData.sections?.reduce((sum: number, section: any) =>
        sum + (section.items?.length || 0), 0) || 0;

      const stats = {
        sections: estimateData.sections?.length || 0,
        totalItems: totalItems,
        requiredMin: calculatedMin,
        status: totalItems >= calculatedMin ? 'OK' : 'TOO_FEW',
        gap: totalItems - calculatedMin,
        wizardUsed: !!wizardData
      };

      console.log('📝 AI Generated Estimate:', JSON.stringify(stats));
      console.log('Section breakdown:', estimateData.sections?.map((s: any) =>
        `${s.title}: ${s.items?.length || 0} items`).join(', '));

      // DEBUG: Write to file for inspection
      const fs = require('fs');
      const debugPath = '/tmp/metrum-debug.json';
      fs.writeFileSync(debugPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        stats,
        aiResponse: text.substring(0, 5000), // First 5000 chars
        estimateStructure: {
          hasTitle: !!estimateData.title,
          hasSections: !!estimateData.sections,
          sectionsCount: estimateData.sections?.length || 0,
          sectionTitles: estimateData.sections?.map((s: any) => s.title) || []
        }
      }, null, 2));
      console.log(`🐛 Debug info written to ${debugPath}`);

    } catch (parseError) {
      return NextResponse.json({
        error: "AI повернув невалідний JSON. Спробуйте ще раз.",
        rawResponse: text,
      }, { status: 422 });
    }

    // ============================================================================
    // ITERATIVE GENERATION: If not enough items, make additional requests
    // ============================================================================
    let iterationCount = 0;
    const maxIterations = 3;
    const iterationHistory: string[] = [];

    while (totalItems < calculatedMin && iterationCount < maxIterations) {
      iterationCount++;
      const gap = calculatedMin - totalItems;

      console.log(`\n🔄 ITERATION ${iterationCount}: Need ${gap} more items (have ${totalItems}/${calculatedMin})`);
      iterationHistory.push(`Iteration ${iterationCount}: ${totalItems} → target ${calculatedMin}`);

      // Build supplementary prompt
      const isCommercialIteration = isCommercialProject || hasATB;
      const supplementPrompt = `
# ДОДАТКОВА ГЕНЕРАЦІЯ ПОЗИЦІЙ (Ітерація ${iterationCount})

${isCommercialIteration && iterationCount === 1 ? `
🏪 **КОМЕРЦІЙНИЙ ПРОЕКТ - ФАЗА 2: Оздоблення та благоустрій**
🎯 **РЕЖИМ ТЕНДЕРА: ЦІЛ Ь ≥ 100,000,000 ₴**

Фаза 1 згенерована (${totalItems} позицій - основні системи).
Тепер додай **ФАЗУ 2 (150-200 позицій):**

📋 **ФАЗА 2 - Оздоблення та благоустрій (150-200 позицій):**
- Оздоблення торгового залу (стіни, підлога, стеля): 40-50 позицій
  * Підлоги комерційні (епоксидні/плитка): 2-4 млн ₴
  * Стіни (штукатурка, фарба, панелі): 1.5-2.5 млн ₴
  * Стелі (підвісні, касетні): 2-3 млн ₴
- Санвузли комерційні (для відвідувачів + персонал): 20-30 позицій
  * 10-15 санвузлів × 80-150 тис ₴ = 0.8-2 млн ₴
- Касова зона та обладнання: 15-20 позицій
  * Столи касові, POS, електрика: 0.5-1 млн ₴
- Системи безпеки (відеоспостереження, контроль доступу): 20-25 позицій
  * 40-60 камер + СКУД + охорона: 1-2 млн ₴
- Вантажна зона (рампа, ворота, освітлення): 15-20 позицій
  * Рампа + секційні ворота: 0.7-1.3 млн ₴
- Благоустрій зовнішній (парковка, доріжки, огорожа, освітлення): 30-40 позицій
  * Асфальтування 40-60 місць: 1.5-3 млн ₴
  * Освітлення + доріжки + огорожа: 1-2 млн ₴
- Вивіски та зовнішня реклама: 10-15 позицій
  * LED вивіска + айдентика: 0.4-0.8 млн ₴

**⚠️ ВАЖЛИВО ДЛЯ ТЕНДЕРА:**
- Кожна позиція детально обґрунтована
- Використовуй ВЕРХНЮ межу цінового діапазону
- Додай технологічне обладнання (ваги, стелажі): 3-6 млн ₴
- Фаза 2 має додати 20-35 млн ₴ до загальної суми

**Згенеруй 150-200 якісних позицій для Фази 2.**
**Ціль Фази 2: додати 20-35 млн ₴**

` : isCommercialIteration && iterationCount === 2 ? `
🏪 **КОМЕРЦІЙНИЙ ПРОЕКТ - ФАЗА 3: Фінальні деталі та перевірка**
🎯 **РЕЖИМ ТЕНДЕРА: ФІНАЛЬНА ПЕРЕВІРКА ≥ 100 млн ₴**

Фази 1+2 згенеровані (${totalItems} позицій).
Тепер додай **ФАЗУ 3 (100-150 позицій) - фінальні деталі:**

📋 **ФАЗА 3 - Деталі та доповнення (100-150 позицій):**
- Дрібні електромонтажні роботи (розетки додаткові, світильники): 20-30 позицій
- Сантехнічна арматура та з'єднання: 15-20 позицій
- Фурнітура (ручки, замки, петлі, доводчики): 15-20 позицій
- Витратні матеріали (герметики, клеї, саморізи, дюбелі): 20-30 позицій
- Лакофарбові матеріали (ґрунтовки, фарби різних зон): 15-20 позицій
- Додаткове обладнання (полиці, стелажі, вішаки): 15-25 позицій

**⚠️ КРИТИЧНО - ТЕНДЕРНА ПЕРЕВІРКА ПЕРЕД ЗАВЕРШЕННЯМ:**

ПІСЛЯ генерації Фази 3 перевір:
□ Загальна сума ≥ 100,000,000 ₴?
□ Всі основні системи повністю деталізовані?
□ Холодильне обладнання 5-10 млн ₴?
□ Будівельні роботи 40-50 млн ₴?
□ Електрика 5-8 млн ₴?
□ HVAC 4-7 млн ₴?
□ Протипожежні 3-5 млн ₴?
□ Благоустрій 3-6 млн ₴?

**Якщо загальна сума < 100 млн:**
1. Збільш кількість холодильних вітрин (додай 5-10 шт)
2. Додай технологічне обладнання для магазину (стелажі, ваги, каси)
3. Збільш площу парковки (з 40 до 60 місць)
4. Додай архітектурне освітлення фасаду
5. Додай зовнішнє огородження по периметру

**Згенеруй 100-150 якісних позицій для завершення.**
**Ціль Фази 3: довести ЗАГАЛЬНУ суму до 105-120 млн ₴**

` : `
Ти вже згенерував початковий кошторис з ${totalItems} позиціями.
Але потрібно МІНІМУМ ${calculatedMin} позицій.

**БРАКУЄ: ${gap} позицій!**
`}
Твоє завдання: ДОДАЙ ще ${gap} позицій до ІСНУЮЧИХ секцій кошторису.

## ПОТОЧНИЙ КОШТОРИС:
\`\`\`json
${JSON.stringify(estimateData, null, 2)}
\`\`\`

## ЯК ДОДАВАТИ ПОЗИЦІЇ:

1. **НЕ створюй нові секції** - додавай в існуючі!
2. **Деталізуй кожну секцію:**
   - Якщо є "Електрика" - додай: різні типи розеток, вимикачів, кабелів, автоматів, підрозетників
   - Якщо є "Сантехніка" - додай: різні діаметри труб, фітинги, краніки, змішувачі, сифони
   - Якщо є "Стіни" - додай: різні типи профілів, саморізи, дюбелі, серпянку, кутники
   - Якщо є "Підлога" - додай: підкладка, плінтуси, поріжки, клей, ізоляція
3. **Розбивай узагальнені позиції:**
   - Замість "Розетки 20шт" → "Розетка одинарна 10шт" + "Розетка двомісна 10шт" + "Підрозетник 20шт"
4. **Додавай допоміжні матеріали:**
   - Ґрунтовки, серпянка, кутники, кріплення, ізоляція, герметики

## ФОРМАТ ВІДПОВІДІ:

Поверни ПОВНИЙ кошторис (всі існуючі позиції + нові) у форматі JSON.
Структура залишається точно така сама.

**ВАЖЛИВО:**
- Зберігай ВСІ існуючі позиції
- Додавай нові позиції в існуючі секції
- Перераховуй sectionTotal для кожної секції
- Перераховуй summary (materialsCost, laborCost, overheadCost, totalBeforeDiscount)

Поверни тільки JSON без додаткового тексту.
`;

      let supplementText = "";

      // Call AI again with supplementary prompt
      try {
        switch (model) {
          case "openai":
            console.log("🤖 OpenAI: Generating supplementary items...");
            supplementText = await generateWithOpenAI(supplementPrompt, "", []);
            break;

          case "anthropic":
            console.log("🧠 Anthropic: Generating supplementary items...");
            supplementText = await generateWithAnthropic(supplementPrompt, "", []);
            break;

          default: // gemini
            console.log("✨ Gemini: Generating supplementary items...");
            const geminiModel = genAI.getGenerativeModel({
              model: "gemini-3-flash-preview",
              generationConfig: {
                temperature: 0.1, // Lower for more deterministic outputs (was 0.3)
                maxOutputTokens: 30000,
                responseMimeType: "application/json", // Force JSON output
              },
            });

            const result = await geminiModel.generateContent([supplementPrompt]);
            supplementText = result.response.text();
            break;
        }

        // Parse supplementary response
        const supplementMatch = supplementText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, supplementText];
        const supplementJson = (supplementMatch[1] || supplementText).trim();
        let supplementParsed = JSON.parse(supplementJson);

        // Handle case where AI returns an array instead of object
        if (Array.isArray(supplementParsed)) {
          console.log('⚠️ AI returned array in iteration, extracting first element');
          estimateData = supplementParsed[0] || {};
        } else {
          estimateData = supplementParsed;
        }

        // Recalculate total items
        totalItems = estimateData.sections?.reduce((sum: number, section: any) =>
          sum + (section.items?.length || 0), 0) || 0;

        console.log(`✅ Iteration ${iterationCount} complete: now have ${totalItems} items (target: ${calculatedMin})`);

        // If we reached the target, break
        if (totalItems >= calculatedMin) {
          console.log(`🎉 SUCCESS: Reached target after ${iterationCount} iteration(s)!`);
          break;
        }

      } catch (error) {
        console.error(`❌ Iteration ${iterationCount} failed:`, error);
        // Continue with what we have
        break;
      }
    }

    // Final logging
    if (totalItems < calculatedMin) {
      console.log(`⚠️ Finished ${iterationCount} iterations but still short: ${totalItems}/${calculatedMin} items`);
    }

    // VALIDATION: Check for hallucinations and errors
    console.log(`🔍 Validating estimate...`);
    const validationResult = validateEstimate(estimateData, {
      area: parseFloat(area),
      wizardData,
      files: files.length,
    });

    console.log(`📊 Validation complete:`);
    console.log(`   - Valid: ${validationResult.valid ? '✅' : '❌'}`);
    console.log(`   - Errors: ${validationResult.errors.length}`);
    console.log(`   - Warnings: ${validationResult.warnings.length}`);

    if (validationResult.errors.length > 0) {
      console.log(`❌ Critical errors found:`);
      validationResult.errors.slice(0, 5).forEach((err) => {
        console.log(`   - [${err.code}] ${err.message}`);
      });
    }

    if (validationResult.warnings.length > 0) {
      console.log(`⚠️ Warnings (first 3):`);
      validationResult.warnings.slice(0, 3).forEach((warn) => {
        console.log(`   - [${warn.code}] ${warn.message}`);
      });
    }

    return NextResponse.json({
      data: estimateData,
      filesProcessed: files.map((f) => f.name),
      validation: {
        valid: validationResult.valid,
        errors: validationResult.errors,
        warnings: validationResult.warnings,
        stats: validationResult.stats,
        report: formatValidationReport(validationResult),
      },
      debug: {
        totalItems,
        requiredMin: calculatedMin,
        status: totalItems >= calculatedMin ? 'OK' : 'TOO_FEW',
        gap: totalItems - calculatedMin,
        wizardUsed: !!wizardData,
        template,
        area: area,
        filesCount: files.length,
        textFiles: textParts.length,
        imageFiles: imageParts.length,
        model,
        iterations: iterationCount,
        iterationHistory: iterationCount > 0 ? iterationHistory : undefined,
      }
    });
  } catch (error: unknown) {
    console.error("Estimate generation error:", error);
    const message = error instanceof Error ? error.message : "Невідома помилка";
    return NextResponse.json({ error: `Помилка генерації: ${message}` }, { status: 500 });
  }
}
