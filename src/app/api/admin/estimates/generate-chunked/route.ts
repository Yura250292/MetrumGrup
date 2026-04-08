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

        // Check for multi-agent mode
        const mode = (formData.get("mode") as GenerationMode) || "gemini+openai";

        if (mode === "multi-agent") {
          // NEW MULTI-AGENT MODE
          console.log("🤖 Using Multi-Agent mode with Orchestrator");

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
              const filesForVectorization = await Promise.all(
                r2Keys.map(async (r2File: any) => {
                  const buffer = await downloadFileFromR2(r2File.key);
                  return {
                    buffer,
                    fileName: r2File.originalName,
                    mimeType: r2File.mimeType
                  };
                })
              );

              // Векторизувати проект
              await vectorizeProject(
                projectId,
                filesForVectorization,
                (message, progress) => {
                  sendUpdate({
                    phase: 0,
                    status: 'analyzing',
                    message: `🔍 ${message}`,
                    progress: 12 + Math.floor(progress * 0.18) // 12-30%
                  });
                }
              );

              console.log(`✅ Проект ${projectId} успішно векторизовано!`);

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
            mode: 'multi-agent',
            projectId: projectId || undefined, // Для RAG
            wizardData,
            documents: {
              plans: textParts,
              specifications: textParts,
              geology: textParts.find(t => t.toLowerCase().includes('геолог')),
              sitePhotos: imageParts.map(img => img.name),
            },
            projectNotes: projectNotesStr,
          });

          const estimateData = await orchestrator.generate((update) => {
            sendUpdate(update as ChunkUpdate);
          });

          // Save to database
          if (!projectId) {
            const tempProject = await prisma.project.create({
              data: {
                title: "Тимчасовий проект (Multi-Agent)",
                slug: `temp-multiagent-${Date.now()}`,
                description: "Автоматично створений проект для кошторису",
                status: "DRAFT",
                clientId: session.user.id,
                managerId: session.user.id,
              }
            });
            projectId = tempProject.id;
          }

          const estimate = await prisma.estimate.create({
            data: {
              number: `EST-${Date.now()}`,
              title: estimateData.title,
              projectId: projectId,
              totalAmount: estimateData.summary.totalBeforeDiscount || 0,
              finalAmount: estimateData.summary.totalBeforeDiscount || 0,
              createdById: session.user.id,
              sections: {
                create: estimateData.sections.map((section, index) => ({
                  title: section.title,
                  sortOrder: index,
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

            const itemsToCreate = section.items
              .filter((item: any) =>
                item.description &&
                item.quantity != null &&
                item.unitPrice != null
              )
              .map((item: any, itemIndex: number) => {
                const quantity = Number(item.quantity);
                const unitPrice = Number(item.unitPrice);
                const laborCost = Number(item.laborCost || 0);
                const totalCost = Number(item.totalCost || 0);

                const amount = totalCost > 0 ? totalCost : (quantity * unitPrice + laborCost);

                return {
                  description: item.description,
                  quantity: quantity,
                  unit: item.unit || "шт",
                  unitPrice: unitPrice,
                  laborRate: 0,
                  laborHours: 0,
                  amount: amount,
                  sortOrder: itemIndex,
                  estimateId: estimate.id,
                  sectionId: createdSection.id,
                };
              });

            if (itemsToCreate.length > 0) {
              await prisma.estimateItem.createMany({
                data: itemsToCreate
              });
            }
          }

          sendUpdate({
            phase: 'final',
            status: 'complete',
            message: '🎉 Multi-Agent кошторис готовий!',
            progress: 100,
            data: {
              estimateId: estimate.id,
              estimateNumber: estimate.number,
              totalAmount: estimate.totalAmount,
              sectionsCount: estimateData.sections.length,
              validationIssues: estimateData.validationIssues,
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

        let projectId = formData.get("projectId") as string | null;

        // If no projectId provided, create a temporary project
        if (!projectId) {
          const tempProject = await prisma.project.create({
            data: {
              title: "Тимчасовий проект (генерація по секціях)",
              slug: `temp-chunked-${Date.now()}`,
              description: "Автоматично створений проект для кошторису",
              status: "DRAFT",
              clientId: session.user.id,
              managerId: session.user.id,
            }
          });
          projectId = tempProject.id;
        }

        // Create estimate and sections first (without items)
        const estimate = await prisma.estimate.create({
          data: {
            number: `EST-${Date.now()}`,
            title: "Кошторис (генерація по секціях)",
            projectId: projectId,
            totalAmount,
            finalAmount: totalAmount,
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

          const itemsToCreate = section.items
            .filter((item: any) =>
              item.description &&
              item.quantity != null &&
              item.unitPrice != null
            )
            .map((item: any, itemIndex: number) => {
              const quantity = Number(item.quantity);
              const unitPrice = Number(item.unitPrice);
              const laborCost = Number(item.laborCost || 0);
              const totalCost = Number(item.totalCost || 0);

              // Calculate amount (total cost)
              const amount = totalCost > 0 ? totalCost : (quantity * unitPrice + laborCost);

              return {
                description: item.description,
                quantity: quantity,
                unit: item.unit || "шт",
                unitPrice: unitPrice,
                laborRate: 0,
                laborHours: 0,
                amount: amount,
                sortOrder: itemIndex,
                estimateId: estimate.id,
                sectionId: createdSection.id,
              };
            });

          if (itemsToCreate.length > 0) {
            await prisma.estimateItem.createMany({
              data: itemsToCreate
            });
          }
        }

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
  imageParts: Array<{ data: string; mimeType: string; name: string }>,
  wizardData: any
) {
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash-preview",
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
    parts.push({
      inlineData: { data: image.data, mimeType: image.mimeType },
      text: `Фото будмайданчика: ${image.name}`
    });
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
