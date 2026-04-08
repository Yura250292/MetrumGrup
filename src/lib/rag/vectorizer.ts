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
        console.log(`📄 Обробка PDF: ${file.fileName}, розмір: ${file.buffer.length} bytes`);

        const pdfData = await parsePDF(file.buffer);
        console.log(`📄 PDF текст витягнуто: ${pdfData.text.length} символів, сторінок: ${pdfData.numpages}`);

        if (!pdfData.text || pdfData.text.length < 50) {
          console.error(`⚠️ PDF ${file.fileName} порожній або занадто малий! Текст: "${pdfData.text.substring(0, 100)}"`);
          throw new Error(`PDF файл ${file.fileName} не містить тексту або не вдалось його прочитати`);
        }

        const chunks = chunkText(pdfData.text, 512, 50);
        console.log(`📄 PDF розбито на ${chunks.length} chunks`);

        if (chunks.length === 0) {
          console.error(`⚠️ PDF ${file.fileName} не вдалось розбити на chunks!`);
          throw new Error(`PDF файл ${file.fileName} не вдалось обробити`);
        }

        chunks.forEach((chunk, idx) => {
          allChunks.push({
            content: chunk,
            fileName: file.fileName,
            fileType: 'pdf',
            metadata: { page: Math.floor(idx / 2) + 1 }
          });
        });

        // Витягти структуровані дані з PDF
        console.log(`🤖 Аналіз PDF через Gemini: ${file.fileName}`);
        const pdfExtractedData = await extractDataFromPDF(pdfData.text, file.fileName);
        console.log(`✅ PDF дані витягнуто:`, Object.keys(pdfExtractedData));
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
    model: 'gemini-3-flash-preview',
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
    model: 'gemini-3-flash-preview',
    generationConfig: {
      responseMimeType: 'application/json'
    }
  });

  const prompt = `Ти - досвідчений інженер-кошторисник. Проаналізуй технічну документацію з PDF "${fileName}".

ВАЖЛИВО: Читай документ як ПРОФЕСІОНАЛЬНИЙ ІНЖЕНЕР:
- Витягуй ВСІ технічні розміри, діаметри, товщини
- Читай креслення: осі, відстані, висотні відмітки
- Аналізуй специфікації матеріалів з кількістю
- Зверни увагу на марки матеріалів (М-150, B25, Ø12мм тощо)
- Фіксуй конструктивні рішення детально

ШУКАЙ В ДОКУМЕНТІ:

📐 ЗАГАЛЬНІ ПАРАМЕТРИ:
- Загальна площа будівлі (м²)
- Кількість поверхів
- Висота поверху (м) та загальна висота
- Площа кожного поверху окремо
- Тип об'єкта (житловий/комерційний/промисловий)

🏗️ КОНСТРУКТИВНІ ЕЛЕМЕНТИ:
- Фундамент: тип, розміри, глибина закладення, марка бетону
- Стіни: матеріал, товщина, висота, довжина
- Перекриття: тип, товщина, марка бетону
- Покрівля: тип, площа, кут нахилу, матеріали
- Колони/балки: розміри перерізів, довжина, марка бетону

🔧 ІНЖЕНЕРНІ СИСТЕМИ:
- Водопостачання: діаметри труб (Ø), довжина, матеріал
- Каналізація: діаметри (Ø), ухил, довжина
- Опалення: потужність котла, діаметри труб, кількість радіаторів
- Вентиляція: продуктивність, діаметри повітроводів
- Електрика: потужність, довжина кабелів, марки кабелів, кількість розеток

⚡ ЕЛЕКТРОПОСТАЧАННЯ (ДЕТАЛЬНО):
- Загальна потужність (кВт)
- Кабелі: марки (ВВГнг, NYM), переріз (мм²), довжина (м)
- Щити: тип, кількість автоматів
- Розетки/вимикачі: кількість по приміщеннях
- Освітлення: тип світильників, потужність, кількість

🧱 СПЕЦИФІКАЦІЇ МАТЕРІАЛІВ:
- Назва матеріалу з ТОЧНОЮ маркою
- Кількість (ОБОВ'ЯЗКОВО!)
- Одиниця виміру (м², м³, м, шт, кг, т)
- Розміри (довжина × ширина × висота)
- ГОСТ або ТУ якщо вказано

🌍 ГЕОЛОГІЯ:
- Рівень ґрунтових вод (УГВ) в метрах
- Тип ґрунту (суглинок, пісок, глина)
- Несуча здатність (кг/см²)

📊 КРЕСЛЕННЯ:
- Осьові розміри будівлі (м)
- Відстані між осями
- Висотні відмітки (±0.000)
- Товщини стін/перекриттів
- Діаметри отворів

ТЕКСТ ДОКУМЕНТУ:
${text.substring(0, 50000)}

ПОВЕРНИ ДЕТАЛЬНИЙ JSON:
{
  "totalArea": 1450.5,
  "floors": 2,
  "floorHeight": 3.0,
  "totalHeight": 6.5,
  "buildingType": "commercial",

  "foundation": {
    "type": "стрічковий",
    "depth": 1.8,
    "width": 0.6,
    "concrete": "B25",
    "reinforcement": "А500С Ø12мм"
  },

  "walls": {
    "material": "цегла М-150",
    "thickness": 0.38,
    "totalLength": 145.5,
    "height": 3.0
  },

  "slabs": {
    "type": "залізобетонні",
    "thickness": 0.22,
    "concrete": "B25",
    "area": 1450.5
  },

  "roof": {
    "type": "плоска",
    "area": 725.3,
    "slope": 0,
    "insulation": "мінвата 150мм",
    "waterproofing": "Технонікол"
  },

  "engineering": {
    "water": {
      "pipes": [
        {"diameter": 32, "length": 125.5, "material": "ПП"}
      ]
    },
    "sewage": {
      "pipes": [
        {"diameter": 110, "length": 85.3, "material": "ПВХ"}
      ]
    },
    "heating": {
      "boilerPower": 35,
      "pipes": [
        {"diameter": 25, "length": 245.0, "material": "ПП"}
      ],
      "radiators": 28
    },
    "ventilation": {
      "airflow": 3500,
      "ducts": [
        {"diameter": 315, "length": 65.0}
      ]
    },
    "electrical": {
      "totalPower": 75.5,
      "cables": [
        {"type": "ВВГнг 3×2.5", "length": 450.0},
        {"type": "ВВГнг 5×6", "length": 85.0}
      ],
      "outlets": 125,
      "switches": 45,
      "lighting": {
        "type": "LED 18W",
        "quantity": 156
      }
    }
  },

  "geology": {
    "ugv": 1.8,
    "soilType": "суглинок",
    "bearingCapacity": 2.5
  },

  "specifiedMaterials": [
    {"name": "Цегла М-150", "quantity": 45000, "unit": "шт"},
    {"name": "Бетон B25", "quantity": 125.5, "unit": "м³"},
    {"name": "Арматура А500С Ø12", "quantity": 2.5, "unit": "т"},
    {"name": "Труба ПП Ø32", "quantity": 125.5, "unit": "м"},
    {"name": "Кабель ВВГнг 3×2.5", "quantity": 450.0, "unit": "м"}
  ],

  "technicalDetails": "Додаткові важливі деталі з креслень та специфікацій які не ввійшли в структуровані поля"
}

КРИТИЧНО ВАЖЛИВО:
- Витягуй ВСІ цифри які є в документі
- Не вигадуй дані - якщо немає, пиши null
- Зберігай ТОЧНІ марки матеріалів (М-150, B25, А500С)
- Фіксуй ВСІІ діаметри з символом Ø
- Читай специфікації таблиці ПОВНІСТЮ
- Якщо є креслення - витягуй розміри з позначок`;

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

/**
 * Видалити всі вектори проекту (для ревекторизації)
 */
export async function deleteProjectVectors(projectId: string): Promise<void> {
  console.log(`🗑️ Видалення старих векторів проекту ${projectId}...`);

  // Видалити вектори
  await prisma.$executeRawUnsafe(`
    DELETE FROM project_vectors
    WHERE project_id = $1
  `, projectId);

  // Оновити статус
  await prisma.$executeRawUnsafe(`
    UPDATE project_parsed_content
    SET processing_status = 'pending'
    WHERE project_id = $1
  `, projectId);

  console.log(`✅ Видалено вектори проекту ${projectId}`);
}

/**
 * Отримати список вже векторизованих файлів проекту
 */
export async function getVectorizedFiles(projectId: string): Promise<string[]> {
  const result = await prisma.$queryRawUnsafe<any[]>(`
    SELECT DISTINCT file_name
    FROM project_vectors
    WHERE project_id = $1
  `, projectId);

  return result.map(r => r.file_name);
}
