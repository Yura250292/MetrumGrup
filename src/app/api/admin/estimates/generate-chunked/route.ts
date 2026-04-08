import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { downloadFileFromR2 } from "@/lib/r2-client";
import { parsePDF } from "@/lib/pdf-helper";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export const maxDuration = 300;
export const runtime = 'nodejs';

interface ChunkUpdate {
  phase: number | string;
  status: 'analyzing' | 'generating' | 'complete' | 'error';
  message: string;
  progress?: number;
  data?: any;
}

// Streaming response for chunked generation
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
    return forbiddenResponse();
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendUpdate = (update: ChunkUpdate) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(update)}\n\n`)
        );
      };

      try {
        const formData = await request.formData();

        // Get files from R2
        const r2KeysStr = formData.get("r2Keys") as string;
        const wizardDataStr = formData.get("wizardData") as string;
        const projectNotesStr = formData.get("projectNotes") as string || "";

        if (!r2KeysStr) {
          throw new Error("No files provided");
        }

        const r2Keys = JSON.parse(r2KeysStr);
        const wizardData = wizardDataStr ? JSON.parse(wizardDataStr) : null;

        sendUpdate({
          phase: 0,
          status: 'analyzing',
          message: '📦 Завантаження файлів з R2...',
          progress: 5
        });

        // Download files from R2
        const downloadPromises = r2Keys.map(async (r2File: any) => {
          const buffer = await downloadFileFromR2(r2File.key);
          const uint8Array = new Uint8Array(buffer);
          const blob = new Blob([uint8Array], { type: r2File.mimeType });
          return new File([blob], r2File.originalName, { type: r2File.mimeType });
        });

        const files = await Promise.all(downloadPromises);

        sendUpdate({
          phase: 0,
          status: 'analyzing',
          message: `✅ Завантажено ${files.length} файлів`,
          progress: 10
        });

        // Extract content from files
        const textParts: string[] = [];
        const pdfParts: Array<{ data: string; mimeType: string }> = [];

        sendUpdate({
          phase: 1,
          status: 'analyzing',
          message: '📄 Gemini аналізує документи...',
          progress: 15
        });

        for (const file of files) {
          if (file.name.toLowerCase().endsWith('.pdf')) {
            const buffer = Buffer.from(await file.arrayBuffer());

            // For large PDFs, send directly
            if (file.size > 15 * 1024 * 1024) {
              pdfParts.push({
                data: buffer.toString('base64'),
                mimeType: 'application/pdf'
              });
            } else {
              const pdfData = await parsePDF(buffer);
              textParts.push(`[${file.name}]\n${pdfData.text}`);
            }
          }
        }

        sendUpdate({
          phase: 1,
          status: 'complete',
          message: '✅ Аналіз завершено',
          progress: 30,
          data: {
            filesAnalyzed: files.length,
            textExtracted: textParts.length,
            pdfsProcessed: pdfParts.length
          }
        });

        // PHASE 2: Generate Foundation (Claude)
        sendUpdate({
          phase: 2,
          status: 'generating',
          message: '🏗️ Claude генерує розділ "Фундамент"...',
          progress: 40
        });

        const foundationSection = await generateSectionWithClaude(
          "Фундамент",
          textParts.join("\n\n"),
          wizardData
        );

        sendUpdate({
          phase: 2,
          status: 'complete',
          message: '✅ Фундамент готовий',
          progress: 50,
          data: { section: foundationSection }
        });

        // PHASE 3: Generate Electrical (Gemini)
        sendUpdate({
          phase: 3,
          status: 'generating',
          message: '⚡ Gemini генерує розділ "Електрика"...',
          progress: 60
        });

        const electricalSection = await generateSectionWithGemini(
          "Електромонтажні роботи",
          textParts,
          pdfParts,
          wizardData
        );

        sendUpdate({
          phase: 3,
          status: 'complete',
          message: '✅ Електрика готова',
          progress: 70,
          data: { section: electricalSection }
        });

        // PHASE 4: Generate Plumbing (OpenAI)
        sendUpdate({
          phase: 4,
          status: 'generating',
          message: '🚰 OpenAI генерує розділ "Сантехніка"...',
          progress: 80
        });

        const plumbingSection = await generateSectionWithOpenAI(
          "Сантехнічні роботи",
          textParts.join("\n\n"),
          wizardData
        );

        sendUpdate({
          phase: 4,
          status: 'complete',
          message: '✅ Сантехніка готова',
          progress: 90,
          data: { section: plumbingSection }
        });

        // PHASE 5: Generate Finishing (Claude)
        sendUpdate({
          phase: 5,
          status: 'generating',
          message: '🎨 Claude генерує розділ "Оздоблення"...',
          progress: 95
        });

        const finishingSection = await generateSectionWithClaude(
          "Оздоблювальні роботи",
          textParts.join("\n\n"),
          wizardData
        );

        sendUpdate({
          phase: 5,
          status: 'complete',
          message: '✅ Оздоблення готове',
          progress: 98,
          data: { section: finishingSection }
        });

        // Save to database
        const sections = [
          foundationSection,
          electricalSection,
          plumbingSection,
          finishingSection
        ];

        const totalAmount = sections.reduce((sum, s) => sum + s.totalCost, 0);

        const projectId = formData.get("projectId") as string | null;

        const estimate = await prisma.estimate.create({
          data: {
            number: `EST-${Date.now()}`,
            title: "Кошторис (генерація по секціях)",
            projectId: projectId || undefined,
            totalAmount,
            finalAmount: totalAmount,
            createdById: session.user.id,
            sections: {
              create: sections.map((section, index) => ({
                title: section.title,
                description: section.description || "",
                sortOrder: index,
                items: {
                  create: section.items.map((item: any, itemIndex: number) => ({
                    description: item.description,
                    quantity: item.quantity,
                    unit: item.unit,
                    unitPrice: item.unitPrice,
                    laborCost: item.laborCost,
                    totalCost: item.totalCost,
                    sortOrder: itemIndex,
                    notes: item.notes || "",
                  }))
                }
              }))
            }
          }
        });

        sendUpdate({
          phase: 'final',
          status: 'complete',
          message: '🎉 Кошторис готовий!',
          progress: 100,
          data: {
            estimateId: estimate.id,
            estimateNumber: estimate.number,
            totalAmount: estimate.totalAmount,
            sectionsCount: sections.length
          }
        });

        controller.close();

      } catch (error) {
        console.error("Chunked generation error:", error);
        sendUpdate({
          phase: 'error',
          status: 'error',
          message: error instanceof Error ? error.message : "Невідома помилка",
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}

// Helper functions for generating sections with different models

async function generateSectionWithGemini(
  sectionName: string,
  textParts: string[],
  pdfParts: Array<{ data: string; mimeType: string }>,
  wizardData: any
) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash-exp",
    tools: [{ googleSearch: {} } as any],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8000,
      responseMimeType: "application/json",
    },
  });

  const prompt = `Згенеруй розділ кошторису "${sectionName}" на основі документів.

Верни JSON:
{
  "title": "${sectionName}",
  "totalCost": 0,
  "items": [
    {
      "description": "назва роботи",
      "quantity": 0,
      "unit": "м²",
      "unitPrice": 0,
      "laborCost": 0,
      "totalCost": 0
    }
  ]
}`;

  const parts: any[] = [prompt, ...textParts];

  for (const pdf of pdfParts) {
    parts.push({ inlineData: { data: pdf.data, mimeType: pdf.mimeType } });
  }

  const result = await model.generateContent(parts);
  const text = result.response.text();

  return JSON.parse(text);
}

async function generateSectionWithClaude(
  sectionName: string,
  context: string,
  wizardData: any
) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const prompt = `Згенеруй розділ кошторису "${sectionName}" на основі контексту.

Верни ТІЛЬКИ JSON:
{
  "title": "${sectionName}",
  "totalCost": 0,
  "items": [...]
}

Контекст:
${context.substring(0, 50000)}`;

  const message = await anthropic.messages.create({
    model: "claude-opus-4-20250514",
    max_tokens: 8000,
    temperature: 0.1,
    messages: [{ role: "user", content: prompt }]
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);

  return JSON.parse(jsonMatch ? jsonMatch[0] : '{}');
}

async function generateSectionWithOpenAI(
  sectionName: string,
  context: string,
  wizardData: any
) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const prompt = `Згенеруй розділ кошторису "${sectionName}".

Верни JSON:
{
  "title": "${sectionName}",
  "totalCost": 0,
  "items": [...]
}

Контекст:
${context.substring(0, 50000)}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.1,
  });

  return JSON.parse(completion.choices[0].message.content || '{}');
}
