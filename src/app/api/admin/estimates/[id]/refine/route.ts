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
import { normalizeAiItems } from "@/lib/estimates/ai-item-normalizer";
import { detectImpactedCategories, isSectionImpacted } from "@/lib/refine/section-detector";
import { computeEstimateDiff, type DiffItem } from "@/lib/refine/diff";
import { recomputeEstimateTotals } from "@/lib/estimates/recompute";

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
            console.log(`📥 Завантаження ${r2Keys.length} файлів з R2 для векторизації...`);

            const filesWithBuffers = await Promise.all(
              r2Keys.map(async (r2File: any) => {
                console.log(`📥 Завантаження файлу: ${r2File.originalName} (${r2File.mimeType})`);
                const buffer = await downloadFileFromR2(r2File.key);
                console.log(`✅ Завантажено: ${r2File.originalName}, розмір: ${buffer.length} bytes`);

                return {
                  buffer: Buffer.from(buffer),
                  fileName: r2File.originalName,
                  mimeType: r2File.mimeType
                };
              })
            );

            console.log(`🧮 Початок векторизації ${filesWithBuffers.length} файлів...`);
            console.log('Типи файлів:', filesWithBuffers.map(f => `${f.fileName} (${f.mimeType})`));

            // Vectorize new files (they will be added incrementally to existing vectors)
            await vectorizeProject(
              existingEstimate.projectId,
              filesWithBuffers,
              (message, progress) => {
                console.log(`[Векторизація ${progress}%] ${message}`);
                sendUpdate({
                  phase: 0,
                  status: 'analyzing',
                  message: `🧮 ${message}`,
                  progress: 35 + Math.floor(progress * 0.1) // 35-45%
                });
              }
            );

            console.log('✅ Векторизація завершена успішно!');

            sendUpdate({
              phase: 0,
              status: 'analyzing',
              message: '✅ Нові файли додані до векторної БД!',
              progress: 45
            });
          } catch (vectorError) {
            console.error('❌ КРИТИЧНА ПОМИЛКА ВЕКТОРИЗАЦІЇ:', vectorError);
            console.error('Stack trace:', vectorError instanceof Error ? vectorError.stack : 'N/A');

            // ПОКАЗАТИ ПОМИЛКУ КОРИСТУВАЧУ
            sendUpdate({
              phase: 0,
              status: 'analyzing',
              message: `❌ Помилка векторизації: ${vectorError instanceof Error ? vectorError.message : 'Unknown'}`,
              progress: 45
            });

            // НЕ продовжувати якщо векторизація провалилась
            throw new Error(`Векторизація провалилась: ${vectorError instanceof Error ? vectorError.message : 'Unknown error'}`);
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

        // 🆕 DELTA REFINE (Plan Stage 6):
        // Detect which sections the user actually wants to refine. Sections
        // outside that set keep their old items verbatim, so unrelated areas
        // don't drift across refines.
        const impactedCategories = regenerateAll
          ? detectImpactedCategories('') // empty string => all categories
          : detectImpactedCategories(additionalInfo);

        const oldItemsBySection: Record<string, DiffItem[]> = {};
        existingEstimate.sections.forEach((s) => {
          oldItemsBySection[s.title] = s.items.map((it) => ({
            description: it.description,
            unit: it.unit,
            quantity: Number(it.quantity),
            unitPrice: Number(it.unitPrice),
            laborCost: Number(it.laborRate) * Number(it.laborHours),
            amount: Number(it.amount),
            engineKey: (it as any).engineKey ?? null,
            itemType: (it as any).itemType ?? null,
          }));
        });

        const newItemsBySection: Record<string, DiffItem[]> = {};

        // Додати позиції
        for (let sIdx = 0; sIdx < newEstimateData.sections.length; sIdx++) {
          const section = newEstimateData.sections[sIdx];
          const createdSection = refinedEstimate.sections[sIdx];

          // Decide whether to use NEW items (impacted) or OLD items (untouched).
          const useNewItems = isSectionImpacted(section.title, impactedCategories);
          let itemsForDb: any[];

          if (useNewItems) {
            const normalized = normalizeAiItems(section.items);
            itemsForDb = normalized.map((item, itemIndex) => ({
              ...item,
              sortOrder: itemIndex,
              estimateId: refinedEstimate.id,
              sectionId: createdSection.id,
            }));
            console.log(`🔄 [refine] section "${section.title}" → REGENERATED (${itemsForDb.length} items)`);
          } else {
            // Keep old items 1:1.
            const oldSection = existingEstimate.sections.find((s) => s.title === section.title);
            itemsForDb = (oldSection?.items ?? []).map((it, itemIndex) => ({
              description: it.description,
              quantity: Number(it.quantity),
              unit: it.unit,
              unitPrice: Number(it.unitPrice),
              laborRate: Number(it.laborRate),
              laborHours: Number(it.laborHours),
              amount: Number(it.amount),
              itemType: (it as any).itemType ?? null,
              engineKey: (it as any).engineKey ?? null,
              quantityFormula: (it as any).quantityFormula ?? null,
              sortOrder: itemIndex,
              estimateId: refinedEstimate.id,
              sectionId: createdSection.id,
            }));
            console.log(`✅ [refine] section "${section.title}" → KEPT (${itemsForDb.length} items, not impacted)`);
          }

          newItemsBySection[section.title] = itemsForDb.map((it) => ({
            description: it.description,
            unit: it.unit,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            laborCost: Number(it.laborRate ?? 0) * Number(it.laborHours ?? 0),
            amount: Number(it.amount ?? 0),
            engineKey: it.engineKey ?? null,
            itemType: it.itemType ?? null,
          }));

          if (itemsForDb.length > 0) {
            await prisma.estimateItem.createMany({ data: itemsForDb });

            // Оновити totalAmount секції після додавання items
            const sectionTotal = itemsForDb.reduce((sum: number, item: any) => sum + Number(item.amount), 0);
            await prisma.estimateSection.update({
              where: { id: createdSection.id },
              data: { totalAmount: sectionTotal }
            });
          }
        }

        // Compute item-level diff (after vs before).
        const allOld: DiffItem[] = Object.values(oldItemsBySection).flat();
        const allNew: DiffItem[] = Object.values(newItemsBySection).flat();
        const refineDiff = computeEstimateDiff(allOld, allNew);
        console.log(
          `📊 [refine] diff: +${refineDiff.added.length} added, ` +
          `~${refineDiff.changed.length} changed, ` +
          `-${refineDiff.removed.length} removed, ` +
          `=${refineDiff.unchangedCount} unchanged. ` +
          `Δamount: ${refineDiff.totals.deltaAmount.toFixed(0)} ₴`
        );

        // 7.3 Summary reconciliation: server is the source of truth.
        await recomputeEstimateTotals(refinedEstimate.id);
        const updatedEstimate = await prisma.estimate.findUnique({
          where: { id: refinedEstimate.id },
          include: {
            sections: true,
            items: true
          }
        });
        const totalAmount = Number(updatedEstimate?.totalAmount ?? 0);

        // 6.2 Persist refine history for audit / review queue.
        try {
          await prisma.estimateRefineHistory.create({
            data: {
              estimateId: refinedEstimate.id,
              previousEstimateId: estimateId,
              refinedById: session.user.id,
              changeReason: additionalInfo || null,
              impactedCategories: impactedCategories as any,
              addedCount: refineDiff.added.length,
              removedCount: refineDiff.removed.length,
              changedCount: refineDiff.changed.length,
              unchangedCount: refineDiff.unchangedCount,
              deltaAmount: refineDiff.totals.deltaAmount.toFixed(2),
              // Cap stored items at 50 to keep rows compact; the UI usually
              // shows top-20 anyway.
              changedItems: refineDiff.changed.slice(0, 50).map((c) => ({
                description: c.description,
                engineKey: c.engineKey,
                changes: c.changes,
              })) as any,
              metadata: {
                regenerateAll: !!regenerateAll,
                fileCount: imageParts.length + textParts.length,
              } as any,
            },
          });
        } catch (e) {
          console.warn('[refine] failed to persist refine history:', e);
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
            newTotalAmount: totalAmount,
            difference: Number(totalAmount) - Number(existingEstimate.totalAmount),
            sectionsCount: newEstimateData.sections.length,
            // 🆕 Delta refine summary (Plan Stage 6).
            refineDiff: {
              addedCount: refineDiff.added.length,
              removedCount: refineDiff.removed.length,
              changedCount: refineDiff.changed.length,
              unchangedCount: refineDiff.unchangedCount,
              deltaAmount: refineDiff.totals.deltaAmount,
              impactedCategories,
              // Top 20 changes for the UI to surface in a "what changed" panel.
              changedItems: refineDiff.changed.slice(0, 20).map((c) => ({
                description: c.description,
                engineKey: c.engineKey,
                changes: c.changes,
              })),
            },
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
