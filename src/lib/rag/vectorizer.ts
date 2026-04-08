/**
 * Векторизація проектів для RAG
 * Економія токенів: аналіз 1 раз, використання N разів
 */

import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { parsePDF } from '../pdf-helper';
import { prisma } from '../prisma';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export interface VectorizeResult {
  projectId: string;
  totalChunks: number;
  extractedData: ExtractedProjectData;
  processingTime: number;
}

export interface ExtractedProjectData {
  // Автоматично витягнуті дані
  totalArea?: number;
  floors?: number;
  floorHeight?: number;
  buildingType?: string;
  foundationType?: string;
  wallMaterial?: string;
  roofType?: string;

  // Геологія
  geology?: {
    ugv?: number; // Рівень грунтових вод
    soilType?: string;
    bearingCapacity?: number;
  };

  // Матеріали зі специфікацій
  specifiedMaterials?: Array<{
    name: string;
    quantity?: number;
    unit?: string;
  }>;

  // Стан об'єкта (з фото)
  siteCondition?: {
    description: string;
    hasOldStructures: boolean;
    needsDemolition: boolean;
  };
}

/**
 * Головна функція векторизації проекту
 */
export async function vectorizeProject(
  projectId: string,
  files: Array<{ buffer: Buffer; fileName: string; mimeType: string }>,
  onProgress?: (message: string, progress: number) => void
): Promise<VectorizeResult> {
  const startTime = Date.now();

  onProgress?.('🔍 Початок аналізу проекту...', 0);

  try {
    // 1. Оновити статус
    await prisma.$executeRawUnsafe(`
      INSERT INTO project_parsed_content (project_id, processing_status)
      VALUES ($1, 'processing')
      ON CONFLICT (project_id)
      DO UPDATE SET processing_status = 'processing', processed_at = NOW()
    `, projectId);

    // 2. Обробити кожен файл
    const allChunks: Array<{
      content: string;
      fileName: string;
      fileType: string;
      metadata: any;
    }> = [];

    let extractedData: ExtractedProjectData = {};

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const progress = ((i + 1) / files.length) * 60; // 0-60%

      onProgress?.(`📄 Обробка ${file.fileName}...`, progress);

      if (file.mimeType === 'application/pdf') {
        // PDF → текст + chunking
        const pdfData = await parsePDF(file.buffer);
        const chunks = chunkText(pdfData.text, 512, 50);

        chunks.forEach((chunk, idx) => {
          allChunks.push({
            content: chunk,
            fileName: file.fileName,
            fileType: 'pdf',
            metadata: { page: Math.floor(idx / 2) + 1 }
          });
        });

        // Витягти структуровані дані з PDF
        const pdfExtractedData = await extractDataFromPDF(pdfData.text, file.fileName);
        extractedData = { ...extractedData, ...pdfExtractedData };

      } else if (file.mimeType.startsWith('image/')) {
        // Фото → Gemini Vision
        const imageAnalysis = await analyzeImageWithGemini(file.buffer, file.mimeType);

        allChunks.push({
          content: imageAnalysis.description,
          fileName: file.fileName,
          fileType: 'image',
          metadata: {
            extractedData: imageAnalysis.extractedData
          }
        });

        // Оновити дані про стан об'єкта
        if (imageAnalysis.siteCondition) {
          extractedData.siteCondition = imageAnalysis.siteCondition;
        }
      }
    }

    onProgress?.('🧮 Векторизація chunks...', 65);

    // 3. Векторизувати всі chunks
    const vectors = await vectorizeChunks(allChunks);

    onProgress?.('💾 Збереження у базу даних...', 80);

    // 4. Зберегти вектори в БД
    for (let i = 0; i < vectors.length; i++) {
      const vector = vectors[i];
      const chunk = allChunks[i];

      await prisma.$executeRawUnsafe(`
        INSERT INTO project_vectors (
          project_id, file_name, file_type, chunk_index,
          content, embedding, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6::vector, $7::jsonb)
      `,
        projectId,
        chunk.fileName,
        chunk.fileType,
        i,
        chunk.content,
        `[${vector.join(',')}]`,
        JSON.stringify(chunk.metadata)
      );
    }

    // 5. Зберегти витягнуті дані
    const fullText = allChunks.map(c => c.content).join('\n\n');

    await prisma.$executeRawUnsafe(`
      UPDATE project_parsed_content
      SET
        extracted_data = $1::jsonb,
        full_text = $2,
        processing_status = 'completed',
        processed_at = NOW()
      WHERE project_id = $3
    `,
      JSON.stringify(extractedData),
      fullText,
      projectId
    );

    onProgress?.('✅ Векторизація завершена!', 100);

    const processingTime = Date.now() - startTime;

    return {
      projectId,
      totalChunks: allChunks.length,
      extractedData,
      processingTime
    };

  } catch (error) {
    console.error('Векторизація провалилась:', error);

    // Оновити статус помилки
    await prisma.$executeRawUnsafe(`
      UPDATE project_parsed_content
      SET
        processing_status = 'error',
        error_message = $1,
        processed_at = NOW()
      WHERE project_id = $2
    `,
      error instanceof Error ? error.message : 'Unknown error',
      projectId
    );

    throw error;
  }
}

/**
 * Розбивка тексту на chunks з overlap
 */
function chunkText(text: string, chunkSize: number = 512, overlap: number = 50): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];

  for (let i = 0; i < words.length; i += (chunkSize - overlap)) {
    const chunk = words.slice(i, i + chunkSize).join(' ');
    if (chunk.trim().length > 0) {
      chunks.push(chunk);
    }
  }

  return chunks;
}

/**
 * Векторизація chunks через OpenAI
 */
async function vectorizeChunks(
  chunks: Array<{ content: string; fileName: string; fileType: string }>
): Promise<number[][]> {
  const BATCH_SIZE = 100; // OpenAI дозволяє до 2048 inputs
  const vectors: number[][] = [];

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);

    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: batch.map(c => c.content),
      dimensions: 1536 // Оптимальний баланс точності та швидкості
    });

    vectors.push(...response.data.map(d => d.embedding));
  }

  return vectors;
}

/**
 * Аналіз фото через Gemini Vision
 */
async function analyzeImageWithGemini(
  buffer: Buffer,
  mimeType: string
): Promise<{
  description: string;
  extractedData?: any;
  siteCondition?: ExtractedProjectData['siteCondition'];
}> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-3.0-flash',
  });

  const prompt = `Проаналізуй це фото будівельного об'єкта.

ОПИШИ:
1. Стан об'єкта (новий/старий/потребує демонтажу)
2. Тип будівлі (житловий будинок/комерційна будівля/промисловий об'єкт)
3. Матеріали які видно (цегла/бетон/метал/дерево)
4. Чи є старі конструкції які треба демонтувати?
5. Будь-які важливі деталі для кошторису

ФОРМАТ ВІДПОВІДІ (JSON):
{
  "description": "Детальний опис (1-2 параграфи)",
  "siteCondition": {
    "description": "Короткий опис стану",
    "hasOldStructures": true/false,
    "needsDemolition": true/false
  },
  "buildingType": "residential/commercial/industrial",
  "visibleMaterials": ["цегла", "бетон"]
}`;

  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        data: buffer.toString('base64'),
        mimeType
      }
    }
  ]);

  try {
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      return {
        description: data.description || text,
        siteCondition: data.siteCondition,
        extractedData: data
      };
    }
  } catch (e) {
    // Fallback
  }

  return {
    description: result.response.text()
  };
}

/**
 * Витягування структурованих даних з PDF (креслення, специфікації)
 */
async function extractDataFromPDF(
  text: string,
  fileName: string
): Promise<Partial<ExtractedProjectData>> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-3.0-flash',
    generationConfig: {
      responseMimeType: 'application/json'
    }
  });

  const prompt = `Проаналізуй цей текст з PDF документа "${fileName}" та витягни структуровані дані.

ШУКАЙ:
- Загальну площу будівлі (м²)
- Кількість поверхів
- Висоту поверху (м)
- Тип фундаменту (стрічковий/плитний/пальовий)
- Матеріал стін (цегла/газоблок/бетон)
- Тип покрівлі
- Геологічні дані (УГВ, тип грунту)
- Матеріали зі специфікацій

ТЕКСТ:
${text.substring(0, 15000)}

ПОВЕРНИ JSON:
{
  "totalArea": 1450,
  "floors": 1,
  "floorHeight": 4.2,
  "buildingType": "commercial",
  "foundationType": "стрічковий",
  "wallMaterial": "цегла М-150",
  "roofType": "плоска",
  "geology": {
    "ugv": 1.8,
    "soilType": "суглинок",
    "bearingCapacity": 2.5
  },
  "specifiedMaterials": [
    {"name": "Цегла М-150", "quantity": 50000, "unit": "шт"}
  ]
}

Якщо даних немає - поверни null для цього поля.`;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const data = JSON.parse(responseText);

    // Очистити null значення
    Object.keys(data).forEach(key => {
      if (data[key] === null) delete data[key];
    });

    return data;
  } catch (error) {
    console.warn('Не вдалось витягти структуровані дані:', error);
    return {};
  }
}

/**
 * RAG пошук релевантних фрагментів
 */
export async function ragSearch(
  query: string,
  projectId: string,
  topK: number = 5,
  threshold: number = 0.7
): Promise<Array<{
  content: string;
  fileName: string;
  similarity: number;
  metadata: any;
}>> {
  // 1. Векторизувати запит
  const queryEmbedding = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
    dimensions: 1536
  });

  // 2. Пошук схожих векторів
  const results = await prisma.$queryRawUnsafe<any[]>(`
    SELECT
      content,
      file_name,
      1 - (embedding <=> $1::vector) as similarity,
      metadata
    FROM project_vectors
    WHERE project_id = $2
      AND 1 - (embedding <=> $1::vector) > $3
    ORDER BY embedding <=> $1::vector
    LIMIT $4
  `,
    `[${queryEmbedding.data[0].embedding.join(',')}]`,
    projectId,
    threshold,
    topK
  );

  return results.map(r => ({
    content: r.content,
    fileName: r.file_name,
    similarity: parseFloat(r.similarity),
    metadata: r.metadata
  }));
}

/**
 * Отримати витягнуті дані проекту
 */
export async function getExtractedProjectData(
  projectId: string
): Promise<ExtractedProjectData | null> {
  const result = await prisma.$queryRawUnsafe<any[]>(`
    SELECT extracted_data
    FROM project_parsed_content
    WHERE project_id = $1 AND processing_status = 'completed'
  `, projectId);

  if (result.length === 0) return null;

  return result[0].extracted_data as ExtractedProjectData;
}

/**
 * Перевірити чи проект вже векторизований
 */
export async function isProjectVectorized(projectId: string): Promise<boolean> {
  const result = await prisma.$queryRawUnsafe<any[]>(`
    SELECT processing_status
    FROM project_parsed_content
    WHERE project_id = $1
  `, projectId);

  return result.length > 0 && result[0].processing_status === 'completed';
}
