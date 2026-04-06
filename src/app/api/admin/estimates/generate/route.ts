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
import { parseSpecificationText, generateSpecificationContext } from "@/lib/specification-parser";
import fs from "fs/promises";
import path from "path";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

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

// Note: PDF to image conversion removed - Gemini can read PDFs natively!
// PDFs are now sent directly to Gemini without conversion.

// Parse uploaded files to text and/or images/PDFs
async function extractFileContent(file: File): Promise<string | { text: string; images: string[]; pdfs: Array<{ data: string; mimeType: string; name: string }> }> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith(".pdf")) {
    try {
      // Extract text content
      const pdfModule = await import("pdf-parse");
      const pdfParse = (pdfModule as unknown as { default: (buf: Buffer) => Promise<{ text: string }> }).default || pdfModule;
      const data = await (pdfParse as (buf: Buffer) => Promise<{ text: string }>)(buffer);

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

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Build content with vision support
  const messageContent: any[] = [{ type: "text", text: userContent }];

  // Add images for Claude vision
  if (imageParts.length > 0) {
    console.log(`  🖼️  Adding ${imageParts.length} images to Anthropic request`);
    for (const img of imageParts) {
      messageContent.push({
        type: "image",
        source: {
          type: "base64",
          media_type: img.inlineData.mimeType,
          data: img.inlineData.data
        }
      });
    }
  }

  const message = await anthropic.messages.create({
    model: "claude-opus-4-20250514",
    max_tokens: 16000, // Збільшено для більшої кількості позицій
    temperature: 0.1, // Lower for more deterministic outputs (was 0.3)
    system: systemPrompt,
    messages: [{ role: "user", content: messageContent }],
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

function calculateMinimumItems(wizardData: any): number {
  if (!wizardData) return 50;

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

function buildWizardContext(wizardData: any): string {
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
  context += `- Об'єкт: **${objectTypeLabels[wizardData.objectType] || wizardData.objectType}**\n`;
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
  const minItems = calculateMinimumItems(wizardData);
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
    const files = formData.getAll("files") as File[];
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

    console.log('📂 Processing files...');
    for (const file of files) {
      const content = await extractFileContent(file);

      // Handle PDF files (returns object with text, images, and PDF data)
      if (typeof content === 'object' && 'text' in content && 'pdfs' in content) {
        // Add PDF text content
        textParts.push(content.text);
        console.log(`  📄 PDF text: ${file.name} (${content.text.length} chars)`);

        // Add PDF files for native Gemini processing (Gemini can read PDFs directly!)
        if (content.pdfs && content.pdfs.length > 0) {
          pdfParts.push(...content.pdfs);
          console.log(`  📑 PDF file: ${file.name} (${(content.pdfs[0].data.length / 1024).toFixed(1)} KB base64) - будеGemini може читати PDF нативно!`);
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
          console.log(`  🖼️  PDF images: ${file.name} (${content.images.length} pages as fallback)`);
        }
      }
      // Handle regular image files
      else if (typeof content === 'string' && content.startsWith("__IMAGE__:")) {
        const [, base64, mimeType] = content.split(":");
        imageParts.push({ inlineData: { data: base64, mimeType } });
        console.log(`  🖼️  Image: ${file.name} (${(base64.length / 1024).toFixed(1)} KB base64)`);
      }
      // Handle text files (Excel, CSV, TXT, etc.)
      else if (typeof content === 'string') {
        textParts.push(content);
        const textLength = content.length;
        const lines = content.split('\n').length;
        console.log(`  📄 Text: ${file.name} (${textLength} chars, ${lines} lines)`);
        if (textLength < 100) {
          console.log(`    ⚠️ WARNING: Very short content from ${file.name}`);
        }
      }
    }

    console.log(`📊 Extraction summary: ${textParts.length} text files, ${imageParts.length} images, ${pdfParts.length} PDFs`);

    // Classify files: plans vs specifications
    const planFiles: File[] = [];
    const specFiles: File[] = [];

    for (const file of files) {
      const name = file.name.toLowerCase();
      // Detect specification files by name keywords or size
      const isSpec =
        name.includes('специф') ||
        name.includes('spec') ||
        name.includes('технолог') ||
        name.includes('інструкц') ||
        name.includes('instruction') ||
        name.includes('вимог') ||
        name.includes('requirement') ||
        file.size > 10 * 1024 * 1024; // Files > 10MB are likely detailed specs

      if (isSpec) {
        specFiles.push(file);
      } else {
        planFiles.push(file);
      }
    }

    console.log(`📂 Classified: ${planFiles.length} plan files, ${specFiles.length} specification files`);

    // Process specification files
    let specificationData: any = null;
    if (specFiles.length > 0) {
      console.log(`📚 Processing ${specFiles.length} specification files...`);
      const specificationTexts: string[] = [];

      for (const file of specFiles) {
        try {
          if (file.name.endsWith('.pdf')) {
            const buffer = Buffer.from(await file.arrayBuffer());
            const pdfModule = await import("pdf-parse");
            const pdfParse = (pdfModule as any).default || pdfModule;
            const data = await pdfParse(buffer);
            specificationTexts.push(`[SPECIFICATION: ${file.name}]\n${data.text}`);
            console.log(`  ✓ ${file.name}: ${data.numpages} pages, ${data.text.length} chars`);
          } else if (file.name.endsWith('.txt') || file.name.endsWith('.md')) {
            const text = await file.text();
            specificationTexts.push(`[SPECIFICATION: ${file.name}]\n${text}`);
            console.log(`  ✓ ${file.name}: ${text.length} chars`);
          }
        } catch (e) {
          console.error(`  ✗ ${file.name}: extraction failed`, e);
        }
      }

      // Parse specifications
      if (specificationTexts.length > 0) {
        const allSpecText = specificationTexts.join('\n\n---\n\n');
        specificationData = parseSpecificationText(allSpecText);
        console.log(`📊 Parsed specification data:`);
        console.log(`   - Materials: ${specificationData.materials.length}`);
        console.log(`   - Methods: ${specificationData.methods.length}`);
        console.log(`   - Requirements: ${specificationData.requirements.length}`);
        console.log(`   - Critical requirements: ${specificationData.requirements.filter((r: any) => r.critical).length}`);
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

    // Build wizard context FIRST for highest priority
    const wizardContext = buildWizardContext(wizardData);

    // Build materials context from database
    const relevantCategories = template === 'house_full'
      ? ['foundation', 'walls', 'roof', 'electrical', 'plumbing', 'heating', 'windows', 'doors', 'finishing']
      : template === 'apartment_rough'
      ? ['walls', 'electrical', 'plumbing', 'finishing']
      : undefined; // All categories for custom
    const materialsContext = generateMaterialsContext(relevantCategories);
    console.log(`💰 Materials database context: ${(materialsContext.length / 1024).toFixed(1)}KB, categories: ${relevantCategories?.join(', ') || 'all'}`);

    // Build specification context if available
    const specificationContext = specificationData
      ? generateSpecificationContext(specificationData)
      : '';
    if (specificationContext) {
      console.log(`📚 Specification context: ${(specificationContext.length / 1024).toFixed(1)}KB`);
      console.log(`   - ${specificationData.materials.length} materials, ${specificationData.methods.length} methods, ${specificationData.requirements.filter((r: any) => r.critical).length} critical requirements`);
    }

    // Build prompt
    const prompt = `# РОЛЬ
Ти — головний кошторисник із 20-річним досвідом будівельної компанії "Metrum Group" у Львові, Україна.
Ти ЕКСПЕРТ найвищого рівня у складанні кошторисів для будівництва та ремонту. Ти ніколи не припускаєшся помилок у розрахунках площ, об'ємів та кількостей.

${wizardContext ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️⚠️⚠️ АБСОЛЮТНИЙ ПРІОРИТЕТ - ДАНІ З ПРОФЕСІЙНОГО ОПИТУВАЛЬНИКА ⚠️⚠️⚠️
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${wizardContext}

**🚨 КРИТИЧНО ВАЖЛИВО 🚨**

Клієнт заповнив ДЕТАЛЬНИЙ ІНЖЕНЕРНИЙ ОПИТУВАЛЬНИК!

ЦІ ДАНІ МАЮТЬ **АБСОЛЮТНИЙ ПРІОРИТЕТ** НАД БУДЬ-ЯКИМИ ІНШИМИ ДЖЕРЕЛАМИ!

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
- Локація: Львів, Україна
- Валюта: гривня (₴, UAH)
${templateSpecificPrompt}
# КРИТИЧНО ВАЖЛИВО — ПОВНОТА КОШТОРИСУ
Кошторис має бути ПОВНИМ і РЕАЛІСТИЧНИМ. Типовий ремонт квартири 60-100 м² включає 50-120+ позицій матеріалів.
НЕ СКОРОЧУЙ і НЕ УЗАГАЛЬНЮЙ. Кожен матеріал — окрема позиція.

## ОБОВ'ЯЗКОВІ СЕКЦІЇ ДЛЯ КОШТОРИСУ (включи ВСІ що стосуються проєкту):

${sectionsText}

## КРИТИЧНО ВАЖЛИВА ВИМОГА - КІЛЬКІСТЬ ПОЗИЦІЙ:

**МІНІМУМ для цього проекту: ${calculatedMin} позицій**

${template === 'house_full' ? `
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
**АБСОЛЮТНИЙ МІНІМУМ: ${calculatedMin} позицій**

Якщо ти згенеруєш менше ${calculatedMin} позицій - це НЕПРИЙНЯТНО!
Користувач ВІДХИЛИТЬ кошторис!

ПЕРЕД ВІДПОВІДДЮ ПОРАХУЙ: sections[0].items.length + sections[1].items.length + ... >= ${calculatedMin}
Якщо НІ - ДОДАЙ ЩЕ ПОЗИЦІЙ!

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
✓ Кожен матеріал має конкретну назву з маркою/виробником`;

    // Generate estimate using selected AI model
    let text = "";

    switch (model) {
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
        text = await generateWithAnthropic(prompt, textParts.join("\n\n"), imageParts);
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
      estimateData = JSON.parse(jsonStr);

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
      const supplementPrompt = `
# ДОДАТКОВА ГЕНЕРАЦІЯ ПОЗИЦІЙ (Ітерація ${iterationCount})

Ти вже згенерував початковий кошторис з ${totalItems} позиціями.
Але потрібно МІНІМУМ ${calculatedMin} позицій.

**БРАКУЄ: ${gap} позицій!**

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
        const supplementData = JSON.parse(supplementJson);

        // Update estimate data
        estimateData = supplementData;

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
