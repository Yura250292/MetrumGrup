/**
 * API для векторизації проекту
 * POST /api/admin/projects/[id]/vectorize
 *
 * Аналізує всі файли проекту 1 раз і зберігає у векторну БД
 * Економія токенів: ~80-90%
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { vectorizeProject, isProjectVectorized } from "@/lib/rag/vectorizer";
import { downloadFileFromR2 } from "@/lib/r2-client";
import { prisma } from "@/lib/prisma";

export const maxDuration = 300; // 5 хвилин
export const runtime = 'nodejs';

interface VectorizeUpdate {
  status: 'analyzing' | 'vectorizing' | 'complete' | 'error';
  message: string;
  progress: number;
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

  const { id: projectId } = await params;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendUpdate = (update: VectorizeUpdate) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(update)}\n\n`)
        );
      };

      try {
        sendUpdate({
          status: 'analyzing',
          message: '🔍 Перевірка проекту...',
          progress: 0
        });

        // Перевірити чи вже векторизований
        const alreadyVectorized = await isProjectVectorized(projectId);
        if (alreadyVectorized) {
          sendUpdate({
            status: 'complete',
            message: '✅ Проект вже векторизований!',
            progress: 100,
            data: { alreadyVectorized: true }
          });
          controller.close();
          return;
        }

        // Отримати всі файли проекту з R2
        sendUpdate({
          status: 'analyzing',
          message: '📦 Завантаження файлів з R2...',
          progress: 5
        });

        const formData = await request.formData();
        const r2KeysStr = formData.get("r2Keys") as string;

        if (!r2KeysStr) {
          throw new Error("Не знайдено файлів проекту");
        }

        const r2Keys = JSON.parse(r2KeysStr);

        // Завантажити файли
        const downloadPromises = r2Keys.map(async (r2File: any) => {
          const buffer = await downloadFileFromR2(r2File.key);
          return {
            buffer: Buffer.from(buffer),
            fileName: r2File.originalName,
            mimeType: r2File.mimeType
          };
        });

        const files = await Promise.all(downloadPromises);

        sendUpdate({
          status: 'analyzing',
          message: `✅ Завантажено ${files.length} файлів`,
          progress: 10
        });

        // Векторизувати проект
        const result = await vectorizeProject(
          projectId,
          files,
          (message, progress) => {
            sendUpdate({
              status: progress < 100 ? 'vectorizing' : 'complete',
              message,
              progress
            });
          }
        );

        sendUpdate({
          status: 'complete',
          message: '🎉 Векторизація завершена!',
          progress: 100,
          data: {
            totalChunks: result.totalChunks,
            extractedData: result.extractedData,
            processingTime: result.processingTime
          }
        });

        controller.close();

      } catch (error) {
        console.error("Векторизація провалилась:", error);
        sendUpdate({
          status: 'error',
          message: error instanceof Error ? error.message : "Невідома помилка",
          progress: 0
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

/**
 * GET - Перевірити статус векторизації
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { id: projectId } = await params;

  try {
    const result = await prisma.$queryRawUnsafe<any[]>(`
      SELECT processing_status, processed_at, error_message, extracted_data
      FROM project_parsed_content
      WHERE project_id = $1
    `, projectId);

    if (result.length === 0) {
      return NextResponse.json({
        vectorized: false,
        status: 'not_started'
      });
    }

    const data = result[0];

    return NextResponse.json({
      vectorized: data.processing_status === 'completed',
      status: data.processing_status,
      processedAt: data.processed_at,
      errorMessage: data.error_message,
      extractedData: data.extracted_data
    });

  } catch (error) {
    console.error("Помилка перевірки статусу:", error);
    return NextResponse.json(
      { error: "Помилка перевірки статусу" },
      { status: 500 }
    );
  }
}