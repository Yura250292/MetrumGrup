import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { downloadFileFromR2 } from "@/lib/r2-client";
import { parsePDF } from "@/lib/pdf-helper";
import { EstimateOrchestrator, GenerationMode } from "@/lib/agents/orchestrator";
import { vectorizeProject, isProjectVectorized } from "@/lib/rag/vectorizer";
import { normalizeAiItems } from "@/lib/estimates/ai-item-normalizer";
import { recomputeEstimateTotals } from "@/lib/estimates/recompute";
import { getOrCreateScratchProject } from "@/lib/projects/scratch-project";

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
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(update)}\n\n`)
          );
        } catch (e) {
          // Connection closed, ignore
        }
      };

      // 🆕 Heartbeat кожні 15 секунд щоб з'єднання не закрилось через idle timeout
      const heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch (e) {
          clearInterval(heartbeatInterval);
        }
      }, 15000);

      try {
        const formData = await request.formData();

        // Get files from R2 (optional)
        const r2KeysStr = formData.get("r2Keys") as string;
        const wizardDataStr = formData.get("wizardData") as string;
        const projectNotesStr = formData.get("projectNotes") as string || "";
        const checkProzorroStr = formData.get("checkProzorro") as string;
        const prozorroSearchQuery = (formData.get("prozorroSearchQuery") as string) || "";

        // Files are now optional - can generate from wizard data only
        const r2Keys = r2KeysStr ? JSON.parse(r2KeysStr) : [];
        const wizardData = wizardDataStr ? JSON.parse(wizardDataStr) : null;
        const checkProzorro = checkProzorroStr === "true";

        console.log(`📋 Generation params: ${r2Keys.length} files, wizardData: ${!!wizardData}, checkProzorro: ${checkProzorro}, prozorroQuery: "${prozorroSearchQuery}"`);

        // ⚠️ ВАЛІДАЦІЯ ПЛОЩІ
        if (wizardData) {
          const areaRaw = wizardData.totalArea || wizardData.area;
          const area = areaRaw ? (typeof areaRaw === 'string' ? parseFloat(areaRaw) : areaRaw) : 0;

          console.log(`📐 Площа проекту: ${area} м² (raw: ${areaRaw}, type: ${typeof areaRaw})`);

          if (!area || area === 0 || isNaN(area)) {
            console.error(`❌ КРИТИЧНА ПОМИЛКА: Площа не вказана або = 0`);
            console.error(`wizardData:`, JSON.stringify(wizardData, null, 2));

            throw new Error(
              `❌ Не вказано площу проекту! \n` +
              `Площа обов'язкова для розрахунку кошторису.\n` +
              `Отримано: "${areaRaw}" (${typeof areaRaw})`
            );
          }

          // Конвертувати в число якщо прийшло як string
          if (typeof wizardData.totalArea === 'string') {
            wizardData.totalArea = parseFloat(wizardData.totalArea);
          }
          if (typeof wizardData.area === 'string') {
            wizardData.area = parseFloat(wizardData.area);
          }

          console.log(`✅ Площа проекту валідна: ${wizardData.totalArea || wizardData.area} м²`);
        }

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
        const imageParts: Array<{ data: string; mimeType: string; name: string }> = [];

        sendUpdate({
          phase: 1,
          status: 'analyzing',
          message: '📄 Gemini аналізує документи...',
          progress: 15
        });

        for (const file of files) {
          const fileName = file.name.toLowerCase();

          if (fileName.endsWith('.pdf')) {
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
          } else if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') || fileName.endsWith('.png') || fileName.endsWith('.webp')) {
            // Process images for Gemini Vision
            const buffer = Buffer.from(await file.arrayBuffer());
            imageParts.push({
              data: buffer.toString('base64'),
              mimeType: file.type,
              name: file.name
            });
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
            pdfsProcessed: pdfParts.length,
            imagesProcessed: imageParts.length
          }
        });

        // Check for multi-agent or master mode
        const mode = (formData.get("mode") as GenerationMode) || "gemini+openai";

        if (mode === "multi-agent" || mode === "master") {
          // ORCHESTRATOR MODE (Multi-Agent or Master)
          console.log(`🤖 Using ${mode === 'master' ? 'Master Agent' : 'Multi-Agent'} mode with Orchestrator`);

          // Отримати projectId
          let projectId = formData.get("projectId") as string | null;

          // 🔍 АВТОМАТИЧНА ВЕКТОРИЗАЦІЯ (якщо є projectId і ще не векторизовано)
          if (projectId && r2Keys.length > 0) {
            const alreadyVectorized = await isProjectVectorized(projectId);

            if (!alreadyVectorized) {
              console.log(`🔍 Проект ${projectId} не векторизований. Починаю векторизацію...`);

              sendUpdate({
                phase: 0,
                status: 'analyzing',
                message: '🔍 Векторизація проекту для економії токенів...',
                progress: 12
              });

              // Підготувати файли для векторизації
              console.log(`📥 Завантаження ${r2Keys.length} файлів для векторизації...`);

              const filesForVectorization = await Promise.all(
                r2Keys.map(async (r2File: any) => {
                  console.log(`📥 Завантаження: ${r2File.originalName} (${r2File.mimeType})`);
                  const buffer = await downloadFileFromR2(r2File.key);
                  console.log(`✅ Завантажено: ${r2File.originalName}, ${buffer.length} bytes`);

                  return {
                    buffer,
                    fileName: r2File.originalName,
                    mimeType: r2File.mimeType
                  };
                })
              );

              console.log(`🧮 Типи файлів для векторизації:`, filesForVectorization.map(f => `${f.fileName} (${f.mimeType}, ${f.buffer.length}b)`));

              // Векторизувати проект
              try {
                await vectorizeProject(
                  projectId,
                  filesForVectorization,
                  (message, progress) => {
                    console.log(`[Векторизація ${progress}%] ${message}`);
                    sendUpdate({
                      phase: 0,
                      status: 'analyzing',
                      message: `🔍 ${message}`,
                      progress: 12 + Math.floor(progress * 0.18) // 12-30%
                    });
                  }
                );

                console.log(`✅ Проект ${projectId} успішно векторизовано!`);
              } catch (vectorError) {
                console.error(`❌ КРИТИЧНА ПОМИЛКА ВЕКТОРИЗАЦІЇ:`, vectorError);
                console.error('Stack:', vectorError instanceof Error ? vectorError.stack : 'N/A');
                throw new Error(`Векторизація провалилась: ${vectorError instanceof Error ? vectorError.message : 'Unknown'}`);
              }

              sendUpdate({
                phase: 0,
                status: 'analyzing',
                message: '✅ Векторизація завершена! Наступні генерації будуть використовувати RAG (економія токенів 75-90%)',
                progress: 30
              });
            } else {
              console.log(`✅ Проект ${projectId} вже векторизований. Використовую RAG для економії токенів.`);

              sendUpdate({
                phase: 0,
                status: 'analyzing',
                message: '✅ Використовую RAG (векторизований проект) - економія токенів 75-90%',
                progress: 12
              });
            }
          }

          const orchestrator = new EstimateOrchestrator({
            mode: mode,
            projectId: projectId || undefined, // Для RAG
            wizardData,
            documents: {
              plans: textParts,
              specifications: textParts,
              geology: textParts.find(t => t.toLowerCase().includes('геолог')),
              sitePhotos: imageParts.map(img => img.name),
            },
            projectNotes: projectNotesStr,
            prozorroSearchQuery, // 🆕 Опис для пошуку на Prozorro
          });

          const estimateData = await orchestrator.generate((update) => {
            sendUpdate(update as ChunkUpdate);
          });

          // Save to database — when no real project is provided we attach the
          // estimate to a hidden per-user scratch project (slug `temp-…`) so it
          // never leaks into the user-facing project list.
          if (!projectId) {
            projectId = await getOrCreateScratchProject(session.user.id);
          }

          const materialsCost = estimateData.summary.materialsCost || 0;
          const laborCost = estimateData.summary.laborCost || 0;
          const totalBeforeDiscount = estimateData.summary.totalBeforeDiscount || 0;
          const overheadCost = totalBeforeDiscount - materialsCost - laborCost;

          const estimate = await prisma.estimate.create({
            data: {
              number: `EST-${Date.now()}`,
              title: estimateData.title,
              projectId: projectId,
              totalAmount: totalBeforeDiscount,
              finalAmount: totalBeforeDiscount,
              totalMaterials: materialsCost,
              totalLabor: laborCost,
              totalOverhead: overheadCost,
              analysisSummary: (estimateData as any).analysisSummary || null,
              structuredReport: (estimateData as any).structuredReport || undefined,
              bidIntelligence: (estimateData as any).preAnalysisResult?.bidIntelligence || undefined,
              prozorroChecked: !!(estimateData as any).preAnalysisResult?.prozorroAnalysis,
              prozorroCheckedAt: !!(estimateData as any).preAnalysisResult?.prozorroAnalysis ? new Date() : null,
              prozorroAnalysis: (() => {
                const pa = (estimateData as any).preAnalysisResult?.prozorroAnalysis;
                if (!pa) return null;
                // Зберігаємо як JSON-string у БД (поле String? @db.Text)
                return JSON.stringify({
                  similarProjectsFound: pa.similarProjectsFound || 0,
                  totalItemsParsed: pa.totalItemsParsed || 0,
                  averagePriceLevel: pa.averagePriceLevel || 'medium',
                  topSimilarProjects: pa.topSimilarProjects || [],
                  aggregatedLocations: pa.aggregatedLocations || [],
                  priceDatabase: pa.priceDatabase instanceof Map
                    ? Object.fromEntries(pa.priceDatabase)
                    : (pa.priceDatabase || {}),
                });
              })(),
              createdById: session.user.id,
              sections: {
                create: estimateData.sections.map((section, index) => ({
                  title: section.title,
                  sortOrder: index,
                  totalAmount: section.sectionTotal || 0,
                }))
              }
            },
            include: {
              sections: { orderBy: { sortOrder: "asc" } }
            }
          });

          // Create items for each section
          for (let sIdx = 0; sIdx < estimateData.sections.length; sIdx++) {
            const section = estimateData.sections[sIdx];
            const createdSection = estimate.sections[sIdx];

            const normalized = normalizeAiItems(section.items);
            const itemsToCreate = normalized.map((item, itemIndex) => ({
              ...item,
              sortOrder: itemIndex,
              estimateId: estimate.id,
              sectionId: createdSection.id,
            }));

            if (itemsToCreate.length > 0) {
              await prisma.estimateItem.createMany({
                data: itemsToCreate
              });

              // Оновити totalAmount секції після додавання items
              const sectionTotal = itemsToCreate.reduce((sum: number, item: any) => sum + Number(item.amount), 0);
              await prisma.estimateSection.update({
                where: { id: createdSection.id },
                data: { totalAmount: sectionTotal }
              });
            }
          }

          // 7.3 Summary reconciliation: server is the source of truth for
          // totalAmount/totalMaterials/totalLabor/finalAmount.
          await recomputeEstimateTotals(estimate.id);
          const finalEstimate = await prisma.estimate.findUnique({
            where: { id: estimate.id },
            include: {
              items: true,
              sections: {
                orderBy: { sortOrder: 'asc' },
                include: {
                  items: {
                    orderBy: { sortOrder: 'asc' }
                  }
                }
              }
            }
          });
          const actualTotalAmount = Number(finalEstimate?.totalAmount ?? 0);

          sendUpdate({
            phase: 'final',
            status: 'complete',
            message: `🎉 ${mode === 'master' ? 'Master Agent' : 'Multi-Agent'} кошторис готовий!`,
            progress: 100,
            data: {
              estimateId: estimate.id,
              estimateNumber: estimate.number,
              totalAmount: actualTotalAmount,
              sectionsCount: estimateData.sections.length,
              validationIssues: estimateData.validationIssues,
              // 🆕 Звіт інженера та аналіз Prozorro (як об'єкт для модалки)
              analysisSummary: (estimateData as any).analysisSummary || null,
              structuredReport: (estimateData as any).structuredReport || null,
              bidIntelligence: (estimateData as any).preAnalysisResult?.bidIntelligence || null,
              prozorroAnalysis: (() => {
                const pa = (estimateData as any).preAnalysisResult?.prozorroAnalysis;
                if (!pa) return null;
                // Конвертуємо Map → object щоб серіалізувалось у JSON
                return {
                  similarProjectsFound: pa.similarProjectsFound || 0,
                  totalItemsParsed: pa.totalItemsParsed || 0,
                  averagePriceLevel: pa.averagePriceLevel || 'medium',
                  topSimilarProjects: pa.topSimilarProjects || [],
                  aggregatedLocations: pa.aggregatedLocations || [],
                  priceDatabase: pa.priceDatabase instanceof Map
                    ? Object.fromEntries(pa.priceDatabase)
                    : (pa.priceDatabase || {}),
                };
              })(),
              scalingInfo: (estimateData as any).scalingInfo || null,
              zeroPriceFixResult: (estimateData as any).zeroPriceFixResult || null,
              // ✅ Add complete sections from database for frontend display
              sections: finalEstimate?.sections.map(section => ({
                title: section.title,
                items: section.items.map(item => ({
                  description: item.description,
                  unit: item.unit,
                  quantity: Number(item.quantity),
                  unitPrice: Number(item.unitPrice),
                  laborCost: Number(item.laborRate) * Number(item.laborHours),
                  totalCost: Number(item.amount),
                  priceSource: null,
                  priceNote: null
                })),
                sectionTotal: Number(section.totalAmount)
              })) || []
            }
          });

          controller.close();
          return;
        }

        // ORIGINAL MODE: Gemini + OpenAI
        // PHASE 2: Generate Foundation (Gemini)
        sendUpdate({
          phase: 2,
          status: 'generating',
          message: '🏗️ Gemini генерує розділ "Фундамент"...',
          progress: 40
        });

        const foundationSection = await generateSectionWithGemini(
          "Фундамент",
          textParts,
          pdfParts,
          imageParts,
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
          imageParts,
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

        // PHASE 5: Generate Finishing (OpenAI)
        sendUpdate({
          phase: 5,
          status: 'generating',
          message: '🎨 OpenAI генерує розділ "Оздоблення"...',
          progress: 95
        });

        const finishingSection = await generateSectionWithOpenAI(
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

        // Розрахувати матеріали, роботи, накладні
        let totalMaterials = 0;
        let totalLabor = 0;

        sections.forEach(section => {
          section.items.forEach((item: any) => {
            totalMaterials += Number(item.quantity || 0) * Number(item.unitPrice || 0);
            totalLabor += Number(item.laborCost || 0);
          });
        });

        const totalOverhead = totalAmount - totalMaterials - totalLabor;

        let projectId = formData.get("projectId") as string | null;

        // If no projectId provided, attach to the hidden per-user scratch project
        if (!projectId) {
          projectId = await getOrCreateScratchProject(session.user.id);
        }

        // Create estimate and sections first (without items)
        const estimate = await prisma.estimate.create({
          data: {
            number: `EST-${Date.now()}`,
            title: "Кошторис (генерація по секціях)",
            projectId: projectId,
            totalAmount,
            finalAmount: totalAmount,
            totalMaterials,
            totalLabor,
            totalOverhead,
            analysisSummary: null,
            prozorroChecked: checkProzorro,
            createdById: session.user.id,
            sections: {
              create: sections.map((section, index) => ({
                title: section.title,
                sortOrder: index,
              }))
            }
          },
          include: {
            sections: { orderBy: { sortOrder: "asc" } }
          }
        });

        // Then create items for each section with explicit estimateId and sectionId
        for (let sIdx = 0; sIdx < sections.length; sIdx++) {
          const section = sections[sIdx];
          const createdSection = estimate.sections[sIdx];

          const normalized = normalizeAiItems(section.items);
          const itemsToCreate = normalized.map((item, itemIndex) => ({
            ...item,
            sortOrder: itemIndex,
            estimateId: estimate.id,
            sectionId: createdSection.id,
          }));

          if (itemsToCreate.length > 0) {
            await prisma.estimateItem.createMany({
              data: itemsToCreate
            });

            // Оновити totalAmount секції після додавання items
            const sectionTotal = itemsToCreate.reduce((sum: number, item: any) => sum + Number(item.amount), 0);
            await prisma.estimateSection.update({
              where: { id: createdSection.id },
              data: { totalAmount: sectionTotal }
            });
          }
        }

        // 7.3 Summary reconciliation: server is the source of truth.
        await recomputeEstimateTotals(estimate.id);
        const finalEstimate = await prisma.estimate.findUnique({
          where: { id: estimate.id },
          include: { items: true, sections: true }
        });

        const actualTotalAmount = Number(finalEstimate?.totalAmount ?? 0);

        sendUpdate({
          phase: 'final',
          status: 'complete',
          message: '🎉 Кошторис готовий!',
          progress: 100,
          data: {
            estimateId: estimate.id,
            estimateNumber: estimate.number,
            totalAmount: actualTotalAmount,
            sectionsCount: sections.length,
          }
        });

        clearInterval(heartbeatInterval);
        controller.close();

      } catch (error) {
        console.error("Chunked generation error:", error);
        sendUpdate({
          phase: 'error',
          status: 'error',
          message: error instanceof Error ? error.message : "Невідома помилка",
        });
        clearInterval(heartbeatInterval);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform", // no-transform щоб Vercel/CDN не буферизували
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // Вимкнути буферизацію проксі
    },
  });
}

// Helper functions for generating sections with different models

async function generateSectionWithGemini(
  sectionName: string,
  textParts: string[],
  pdfParts: Array<{ data: string; mimeType: string }>,
  imageParts: Array<{ data: string; mimeType: string; name: string }>,
  wizardData: any
) {
  const model = genAI.getGenerativeModel({
    model: "gemini-3-flash-preview",
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8000,
      responseMimeType: "application/json",
    },
  });

  const prompt = `Згенеруй розділ кошторису "${sectionName}" на основі документів.

КРИТИЧНО ВАЖЛИВО:
- Всі поля ОБОВ'ЯЗКОВІ! Не пропускай жодне поле!
- Всі числа мають бути > 0 (не null, не undefined, не 0)
- description - завжди заповнена назва роботи
- quantity - кількість (число > 0)
- unit - одиниця виміру (м², м³, шт, м.п., т, компл)
- unitPrice - ціна за одиницю (грн)
- laborCost - вартість робіт (грн)
- totalCost - загальна вартість (quantity * unitPrice + laborCost)

Верни JSON:
{
  "title": "${sectionName}",
  "totalCost": 0,
  "items": [
    {
      "description": "назва роботи",
      "quantity": 10,
      "unit": "м²",
      "unitPrice": 500,
      "laborCost": 200,
      "totalCost": 5200
    }
  ]
}`;

  const parts: any[] = [prompt, ...textParts];

  for (const pdf of pdfParts) {
    parts.push({ inlineData: { data: pdf.data, mimeType: pdf.mimeType } });
  }

  for (const image of imageParts) {
    parts.push({ text: `Фото будмайданчика: ${image.name}` });
    parts.push({ inlineData: { data: image.data, mimeType: image.mimeType } });
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

  const prompt = `Згенеруй розділ кошторису "${sectionName}" на основі документів.

ВАЖЛИВО: Всі поля ОБОВ'ЯЗКОВІ! Не використовуй null або undefined!

Верни JSON:
{
  "title": "${sectionName}",
  "totalCost": 0,
  "items": [
    {
      "description": "назва роботи",
      "quantity": 10,
      "unit": "м²",
      "unitPrice": 500,
      "laborCost": 200,
      "totalCost": 5200,
      "notes": ""
    }
  ]
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
