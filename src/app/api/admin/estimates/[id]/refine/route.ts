/**
 * API для доповнення/рефайнменту кошторису
 * POST /api/admin/estimates/[id]/refine
 *
 * Регенерує кошторис з додатковими даними:
 * - Новий текст (додаткова інформація)
 * - Нові файли (PDF, Word, Excel, фото)
 * - Вибрані секції для регенерації
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { EstimateOrchestrator } from "@/lib/agents/orchestrator";
import { downloadFileFromR2 } from "@/lib/r2-client";
import { parsePDF } from "@/lib/pdf-helper";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { vectorizeProject } from "@/lib/rag/vectorizer";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export const maxDuration = 300;
export const runtime = 'nodejs';

interface RefineUpdate {
  phase: number | string;
  status: 'analyzing' | 'generating' | 'complete' | 'error';
  message: string;
  progress?: number;
  data?: any;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
    return forbiddenResponse();
  }

  const { id: estimateId } = await params;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendUpdate = (update: RefineUpdate) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(update)}\n\n`)
        );
      };

      try {
        sendUpdate({
          phase: 0,
          status: 'analyzing',
          message: '🔍 Завантаження існуючого кошторису...',
          progress: 5
        });

        // Завантажити існуючий кошторис
        const existingEstimate = await prisma.estimate.findUnique({
          where: { id: estimateId },
          include: {
            sections: {
              include: { items: true },
              orderBy: { sortOrder: 'asc' }
            },
            project: true
          }
        });

        if (!existingEstimate) {
          throw new Error("Кошторис не знайдено");
        }

        sendUpdate({
          phase: 0,
          status: 'analyzing',
          message: `✅ Завантажено кошторис ${existingEstimate.number}`,
          progress: 10
        });

        // Отримати нові дані з formData
        const formData = await request.formData();
        const additionalInfo = formData.get("additionalInfo") as string || "";
        const r2KeysStr = formData.get("r2Keys") as string;
        const sectionsToRefine = formData.get("sectionsToRefine") as string; // "all" або ["section1", "section2"]
        const regenerateAll = formData.get("regenerateAll") === "true";

        sendUpdate({
          phase: 0,
          status: 'analyzing',
          message: '📝 Обробка додаткової інформації...',
          progress: 15
        });

        // Завантажити нові файли якщо є
        const textParts: string[] = [];
        const imageParts: Array<{ data: string; mimeType: string; name: string }> = [];

        if (r2KeysStr) {
          const r2Keys = JSON.parse(r2KeysStr);

          sendUpdate({
            phase: 0,
            status: 'analyzing',
            message: `📦 Завантаження ${r2Keys.length} нових файлів...`,
            progress: 20
          });

          // Завантажити файли з R2
          for (const r2File of r2Keys) {
            const buffer = await downloadFileFromR2(r2File.key);

            if (r2File.mimeType === 'application/pdf') {
              const pdfData = await parsePDF(buffer);
              textParts.push(`[${r2File.originalName}]\n${pdfData.text}`);
            } else if (r2File.mimeType.startsWith('image/')) {
              imageParts.push({
                data: buffer.toString('base64'),
                mimeType: r2File.mimeType,
                name: r2File.originalName
              });
            }
          }

          sendUpdate({
            phase: 0,
            status: 'analyzing',
            message: `✅ Завантажено ${r2Keys.length} файлів`,
            progress: 30
          });

          // 🔍 Векторизувати нові файли і додати до проекту
          sendUpdate({
            phase: 0,
            status: 'analyzing',
            message: '🧮 Векторизація нових файлів для майбутнього використання...',
            progress: 35
          });

          const filesToVectorize = r2Keys.map((r2File: any) => ({
            buffer: Buffer.from(''), // Will be downloaded again in vectorizer
            fileName: r2File.originalName,
            mimeType: r2File.mimeType
          }));

          try {
            // Download files for vectorization
            const filesWithBuffers = await Promise.all(
              r2Keys.map(async (r2File: any) => {
                const buffer = await downloadFileFromR2(r2File.key);
                return {
                  buffer: Buffer.from(buffer),
                  fileName: r2File.originalName,
                  mimeType: r2File.mimeType
                };
              })
            );

            // Vectorize new files (they will be added incrementally to existing vectors)
            await vectorizeProject(
              existingEstimate.projectId,
              filesWithBuffers,
              (message, progress) => {
                sendUpdate({
                  phase: 0,
                  status: 'analyzing',
                  message: `🧮 ${message}`,
                  progress: 35 + Math.floor(progress * 0.1) // 35-45%
                });
              }
            );

            sendUpdate({
              phase: 0,
              status: 'analyzing',
              message: '✅ Нові файли додані до векторної БД!',
              progress: 45
            });
          } catch (vectorError) {
            console.error('Vectorization error (non-critical):', vectorError);
            // Continue even if vectorization fails
            sendUpdate({
              phase: 0,
              status: 'analyzing',
              message: '⚠️ Векторизація не вдалась, але продовжуємо генерацію',
              progress: 45
            });
          }
        }

        // Побудувати контекст з існуючого кошторису + нові дані
        const existingContext = `
ІСНУЮЧИЙ КОШТОРИС:
Номер: ${existingEstimate.number}
Загальна вартість: ${existingEstimate.totalAmount} ₴

ПОТОЧНІ СЕКЦІЇ:
${existingEstimate.sections.map(s => {
  const sectionTotal = s.items.reduce((sum, item) => sum + Number(item.amount), 0);
  return `  ${s.title}: ${sectionTotal} ₴ (${s.items.length} позицій)`;
}).join('\n')}

ДОДАТКОВА ІНФОРМАЦІЯ ВІД ІНЖЕНЕРА:
${additionalInfo}

НОВІ ДОКУМЕНТИ:
${textParts.join('\n\n')}
`;

        sendUpdate({
          phase: 1,
          status: 'generating',
          message: '🤖 Регенерація кошторису з новими даними...',
          progress: 50
        });

        // Регенерувати через Multi-Agent orchestrator
        const orchestrator = new EstimateOrchestrator({
          mode: 'multi-agent',
          projectId: existingEstimate.projectId,
          wizardData: {
            objectType: 'other',
            workScope: 'full',
            renovationStage: 'full',
            hasGeology: !!additionalInfo.toLowerCase().includes('геологія'),
            hasSpecifications: textParts.length > 0,
          },
          documents: {
            plans: [existingContext, ...textParts],
            specifications: textParts,
            sitePhotos: imageParts.map(img => img.name),
          },
          projectNotes: `
РЕФАЙНМЕНТ ІСНУЮЧОГО КОШТОРИСУ ${existingEstimate.number}

Поточна вартість: ${existingEstimate.totalAmount} ₴

${additionalInfo}

ВАЖЛИВО: Врахуй всю нову інформацію і онови розрахунки!
          `,
        });

        const newEstimateData = await orchestrator.generate((update) => {
          sendUpdate({
            phase: update.phase,
            status: update.status as any,
            message: update.message,
            progress: 50 + Math.floor((update.progress || 0) * 0.4) // 50-90%
          });
        });

        sendUpdate({
          phase: 'final',
          status: 'generating',
          message: '💾 Збереження оновленого кошторису...',
          progress: 95
        });

        // Створити новий кошторис (версію)
        const refinedEstimate = await prisma.estimate.create({
          data: {
            number: `${existingEstimate.number}-R${Date.now()}`,
            title: `${existingEstimate.title} (доповнений)`,
            projectId: existingEstimate.projectId,
            totalAmount: newEstimateData.summary.totalBeforeDiscount || 0,
            finalAmount: newEstimateData.summary.totalBeforeDiscount || 0,
            createdById: session.user.id,
            sections: {
              create: newEstimateData.sections.map((section, index) => ({
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

        // Додати позиції
        for (let sIdx = 0; sIdx < newEstimateData.sections.length; sIdx++) {
          const section = newEstimateData.sections[sIdx];
          const createdSection = refinedEstimate.sections[sIdx];

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
                estimateId: refinedEstimate.id,
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
          message: '🎉 Кошторис успішно доповнено!',
          progress: 100,
          data: {
            oldEstimateId: estimateId,
            oldTotalAmount: existingEstimate.totalAmount,
            newEstimateId: refinedEstimate.id,
            newEstimateNumber: refinedEstimate.number,
            newTotalAmount: refinedEstimate.totalAmount,
            difference: Number(refinedEstimate.totalAmount) - Number(existingEstimate.totalAmount),
            sectionsCount: newEstimateData.sections.length,
          }
        });

        controller.close();

      } catch (error) {
        console.error('Помилка рефайнменту:', error);

        sendUpdate({
          phase: 'error',
          status: 'error',
          message: error instanceof Error ? error.message : 'Невідома помилка'
        });

        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
