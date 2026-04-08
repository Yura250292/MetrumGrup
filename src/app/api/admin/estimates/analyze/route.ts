import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { parseSpecificationText, generateSpecificationContext } from "@/lib/specification-parser";
import { parsePDF } from "@/lib/pdf-helper";
import { classifyDocuments, groupByType } from '@/lib/document-classifier';
import { DocumentType } from '@/lib/document-types';
import { SitePlanParser } from '@/lib/parsers/site-plan-parser';
import { GeologicalParser } from '@/lib/parsers/geological-parser';
import { ProjectReviewParser } from '@/lib/parsers/review-parser';
import { SitePhotosHandler } from '@/lib/parsers/site-photos-handler';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "MANAGER") {
    return forbiddenResponse();
  }

  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const wizardDataStr = formData.get("wizardData") as string;
    const wizardData = wizardDataStr ? JSON.parse(wizardDataStr) : null;

    if (files.length === 0) {
      return NextResponse.json({ error: "Завантажте хоча б один файл" }, { status: 400 });
    }

    console.log(`📋 PRE-ANALYSIS: ${files.length} files, wizard: ${!!wizardData}`);

    // NEW: Classify files with enhanced classifier
    const classified = classifyDocuments(files);
    const grouped = groupByType(classified);

    console.log(`📂 Classified ${files.length} files:`);
    grouped.forEach((docs, type) => {
      console.log(`   - ${type}: ${docs.length} files`);
    });

    // Get plan and spec files for backward compatibility
    const planFiles: File[] = (grouped.get(DocumentType.ARCHITECTURAL_PLAN) || []).map(d => d.file);
    const specFiles: File[] = (grouped.get(DocumentType.SPECIFICATION) || []).map(d => d.file);

    // NEW: Parse each document type
    const parsedData: Record<string, any> = {};

    // 1. Site Plans / Topography
    const sitePlanDocs = [
      ...(grouped.get(DocumentType.SITE_PLAN) || []),
      ...(grouped.get(DocumentType.TOPOGRAPHY) || [])
    ];

    if (sitePlanDocs.length > 0) {
      console.log(`🗺️  Processing ${sitePlanDocs.length} site plan(s)...`);
      const parser = new SitePlanParser();
      const texts: string[] = [];

      for (const doc of sitePlanDocs) {
        const buffer = Buffer.from(await doc.file.arrayBuffer());
        const data = await parsePDF(buffer);
        texts.push(data.text);
      }

      const allText = texts.join('\n\n---\n\n');
      parsedData.sitePlan = parser.parse(allText);
      console.log(`   ✓ Site plan parsed: ${parsedData.sitePlan.summary}`);
    }

    // 2. Geological Reports
    const geologicalDocs = grouped.get(DocumentType.GEOLOGICAL_REPORT) || [];

    if (geologicalDocs.length > 0) {
      console.log(`🪨 Processing ${geologicalDocs.length} geological report(s)...`);
      const parser = new GeologicalParser();
      const texts: string[] = [];

      for (const doc of geologicalDocs) {
        const buffer = Buffer.from(await doc.file.arrayBuffer());
        const data = await parsePDF(buffer);
        texts.push(data.text);
      }

      const allText = texts.join('\n\n---\n\n');
      parsedData.geological = parser.parse(allText);
      console.log(`   ✓ Geological data: ${parsedData.geological.summary}`);
      if (parsedData.geological.warnings.length > 0) {
        console.warn(`   ⚠️  ${parsedData.geological.warnings.length} geological warnings`);
      }
    }

    // 3. Project Reviews
    const reviewDocs = grouped.get(DocumentType.PROJECT_REVIEW) || [];

    if (reviewDocs.length > 0) {
      console.log(`📝 Processing ${reviewDocs.length} project review(s)...`);
      const parser = new ProjectReviewParser();
      const texts: string[] = [];

      for (const doc of reviewDocs) {
        const buffer = Buffer.from(await doc.file.arrayBuffer());
        const data = await parsePDF(buffer);
        texts.push(data.text);
      }

      const allText = texts.join('\n\n---\n\n');
      parsedData.review = parser.parse(allText);
      console.log(`   ✓ Review parsed: ${parsedData.review.summary}`);
      if (parsedData.review.criticalCount > 0) {
        console.warn(`   🚨 ${parsedData.review.criticalCount} critical comments!`);
      }
    }

    // 4. Site Photos
    const photoDocs = grouped.get(DocumentType.SITE_PHOTOS) || [];

    if (photoDocs.length > 0) {
      console.log(`📸 Processing ${photoDocs.length} site photo(s)...`);
      const handler = new SitePhotosHandler();
      const photoFiles = photoDocs.map(d => d.file);
      parsedData.photos = handler.analyze(photoFiles);
      console.log(`   ✓ Photos: ${parsedData.photos.summary}`);
    }

    // Extract plan PDF content (for visual analysis)
    const pdfParts: Array<{ data: string; mimeType: string; name: string }> = [];
    const textParts: string[] = [];

    for (const file of planFiles) {
      if (file.name.endsWith('.pdf')) {
        const buffer = Buffer.from(await file.arrayBuffer());
        const pdfBase64 = buffer.toString('base64');
        pdfParts.push({
          data: pdfBase64,
          mimeType: 'application/pdf',
          name: file.name
        });

        // Also extract text with pdf-parse
        try {
          const pdfModule = await import("pdf-parse");
          const pdfParse = (pdfModule as any).default || pdfModule;
          const data = await pdfParse(buffer);
          textParts.push(`[ПЛАН: ${file.name}]\n${data.text}`);
        } catch (e) {
          console.error("PDF text extraction failed:", e);
        }
      }
    }

    // Extract specification content (text only, no visual needed)
    const specificationTexts: string[] = [];
    let specificationData: any = null;

    if (specFiles.length > 0) {
      console.log(`📚 Processing ${specFiles.length} specification files...`);

      for (const file of specFiles) {
        try {
          if (file.name.endsWith('.pdf')) {
            const buffer = Buffer.from(await file.arrayBuffer());
            const pdfModule = await import("pdf-parse");
            const pdfParse = (pdfModule as any).default || pdfModule;
            const data = await pdfParse(buffer);
            specificationTexts.push(`[СПЕЦИФІКАЦІЯ: ${file.name}]\n${data.text}`);
            console.log(`  ✓ ${file.name}: ${data.numpages} pages, ${data.text.length} chars`);
          } else if (file.name.endsWith('.txt') || file.name.endsWith('.md')) {
            const text = await file.text();
            specificationTexts.push(`[СПЕЦИФІКАЦІЯ: ${file.name}]\n${text}`);
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
      }
    }

    console.log(`📑 Extracted: ${pdfParts.length} plan PDFs, ${textParts.length} plan texts, ${specificationTexts.length} spec texts`);

    // Build wizard summary
    let wizardSummary = "";
    if (wizardData) {
      wizardSummary = `
# ДАНІ З ОПИТУВАЛЬНИКА (Wizard):

**Тип об'єкта:** ${wizardData.objectType === 'house' ? 'Приватний будинок' : wizardData.objectType === 'townhouse' ? 'Котедж (таунхаус)' : wizardData.objectType}
**Обсяг робіт:** ${wizardData.workScope}
**Площа:** ${wizardData.totalArea} м²
**Поверхів:** ${wizardData.floors || 'не вказано'}
**Висота стелі:** ${wizardData.ceilingHeight || '2.7'} м

${wizardData.houseData?.currentState ? `**Поточний стан будівлі:** ${wizardData.houseData.currentState}` : ''}
${wizardData.townhouseData?.currentState ? `**Поточний стан будівлі:** ${wizardData.townhouseData.currentState}` : ''}

${wizardData.houseData?.demolitionRequired === false || wizardData.townhouseData?.demolitionRequired === false ? '**Демонтаж:** НЕ потрібен (голі стіни)' : ''}
${wizardData.houseData?.demolitionRequired === true ? `**Демонтаж:** Потрібен - ${wizardData.houseData.demolitionDescription || 'деталі не вказані'}` : ''}

${wizardData.houseData?.walls?.material ? `**Матеріал стін:** ${wizardData.houseData.walls.material === 'brick' ? 'Цегла' : wizardData.houseData.walls.material === 'gasblock' ? 'Газоблок' : wizardData.houseData.walls.material}` : ''}

${wizardData.houseData?.roof?.type ? `**Тип даху:** ${wizardData.houseData.roof.type === 'pitched' ? 'Скатний' : 'Плоский'}` : ''}

${wizardData.utilities?.electrical ? `
**Електрика:**
- Розетки: ${wizardData.utilities.electrical.outlets || 0} шт
- Вимикачі: ${wizardData.utilities.electrical.switches || 0} шт
- Світильники: ${wizardData.utilities.electrical.lightPoints || 0} шт
` : ''}

${wizardData.utilities?.heating?.type && wizardData.utilities.heating.type !== 'none' ? `
**Опалення:**
- Тип: ${wizardData.utilities.heating.type === 'gas' ? 'Газ' : wizardData.utilities.heating.type}
- Радіатори: ${wizardData.utilities.heating.radiators || 0} шт
- Тепла підлога: ${wizardData.utilities.heating.underfloor ? 'Так' : 'Ні'}
` : ''}
`;
    }

    // Analysis prompt
    const analysisPrompt = `
# ЗАВДАННЯ: ПРЕ-АНАЛІЗ БУДІВЕЛЬНИХ ПЛАНІВ

Ти - експерт-кошторисник. Твоє завдання: **ДЕТАЛЬНО ОПИСАТИ** що ти бачиш на планах.

${wizardSummary}

## ЩО ПОТРІБНО ЗРОБИТИ:

1. **ПРОАНАЛІЗУЙ ЗАВАНТАЖЕНІ ФАЙЛИ** (${files.length} файлів, ${pdfParts.length} PDF):
   - Яка будівля? (будинок/котедж/квартира)
   - Скільки поверхів?
   - Які приміщення? (спальні, санвузли, кухня, вітальня, тощо)
   - Загальна площа (якщо видно на планах)

2. **ПОРАХУЙ ЩО БАЧИШ НА ПЛАНАХ:**

   **ЕЛЕКТРИКА:**
   - Скільки розеток (⊗ символи)?
   - Скільки вимикачів (O з рисками)?
   - Скільки світильників/люстр (⊕)?
   - Чи є щит електричний?

   **САНТЕХНІКА:**
   - Скільки унітазів?
   - Скільки умивальників?
   - Скільки ванн/душових?
   - Скільки мийок (кухня)?
   - Чи є бойлер? Пральна машина?

   **ОПАЛЕННЯ:**
   - Чи бачиш радіатори на планах?
   - Скільки приблизно?
   - Чи є позначки теплої підлоги?

   **СТІНИ/ПЕРЕГОРОДКИ:**
   - Чи є товсті стіни (несучі)?
   - Чи є тонкі перегородки?
   - Чи потрібен демонтаж якихось стін?

   **ВІКНА/ДВЕРІ:**
   - Скільки вікон?
   - Скільки дверей (вхідних і внутрішніх)?

   **ПЛОЩІ ПРИМІЩЕНЬ:**
   - Якщо видно розміри кімнат - назви їх

3. **ПЕРЕВІР ВІДПОВІДНІСТЬ З WIZARD:**
   - Чи відповідає те що на планах тому що вказано в опитувальнику?
   - Якщо користувач вказав "3 санвузли" а на планах їх 2 - ПОВІДОМ!
   - Якщо вказано "2 поверхи" а на планах 3 - ПОВІДОМ!

4. **ПОПЕРЕДЖЕННЯ:**
   - Якщо чогось не видно на планах - скажи про це
   - Якщо плани неякісні/нечіткі - попереди
   - Якщо бракує якихось планів (наприклад є план 1 поверху, але немає 2-го)

## ФОРМАТ ВІДПОВІДІ (JSON):

{
  "summary": "Коротко (2-3 речення) що це за об'єкт",
  "building": {
    "type": "house/townhouse/apartment",
    "floors": 2,
    "totalArea": "150 м² (з планів)" або "150 м² (з wizard, на планах не видно)",
    "currentState": "shell/existing_building/..."
  },
  "rooms": {
    "bedrooms": 3,
    "bathrooms": 2,
    "kitchen": 1,
    "living": 1,
    "other": ["кабінет", "котельня"]
  },
  "electrical": {
    "outlets": 45,
    "switches": 23,
    "lights": 18,
    "notes": "Якісь помітки якщо є"
  },
  "plumbing": {
    "toilets": 2,
    "sinks": 3,
    "baths": 1,
    "showers": 1,
    "kitchenSinks": 1,
    "washingMachines": 1,
    "boilers": 1,
    "notes": ""
  },
  "heating": {
    "radiators": 12,
    "underfloor": true,
    "underfloorArea": "40 м² (санвузли + кухня)",
    "notes": ""
  },
  "windows": {
    "count": 15,
    "notes": "Різні розміри, деталі на планах"
  },
  "doors": {
    "entrance": 1,
    "interior": 12,
    "notes": ""
  },
  "walls": {
    "demolitionNeeded": false,
    "newPartitions": "12 м.п. газоблок",
    "notes": ""
  },
  "discrepancies": [
    "⚠️ Wizard: 3 санвузли, Плани: бачу тільки 2",
    "⚠️ Не вистачає плану даху - не можу порахувати покрівлю точно"
  ],
  "warnings": [
    "План електрики нечіткий - можу пропустити деякі розетки",
    "Не бачу план фундаменту"
  ],
  "confidence": "high/medium/low",
  "recommendation": "Що порадиш користувачу додати/виправити"
}

**ВАЖЛИВО:**
- Будь КОНКРЕТНИЙ - не "кілька розеток", а "45 розеток"
- Якщо не впевнений - вказуй "приблизно" і confidence: medium/low
- ОБОВ'ЯЗКОВО порівняй з wizard даними і вкажи розбіжності
- Повертай ТІЛЬКИ JSON без додаткового тексту
`;

    // Call Gemini for analysis
    const geminiModel = genAI.getGenerativeModel({
      model: "gemini-3-flash-preview-preview",
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8000,
      },
    });

    const parts: any[] = [analysisPrompt];

    // Add text parts
    if (textParts.length > 0) {
      parts.push(textParts.join("\n\n"));
    }

    // Add PDFs
    if (pdfParts.length > 0) {
      console.log(`📑 Adding ${pdfParts.length} PDFs for visual analysis`);
      for (const pdf of pdfParts) {
        parts.push({
          inlineData: {
            data: pdf.data,
            mimeType: pdf.mimeType,
          }
        });
      }
    }

    console.log(`🤖 Calling Gemini for pre-analysis...`);
    const result = await geminiModel.generateContent(parts);
    let responseText = result.response.text();

    // Clean up response: remove markdown code blocks
    responseText = responseText
      .replace(/^```json\s*/i, '')  // Remove opening ```json
      .replace(/^```\s*/i, '')      // Remove opening ```
      .replace(/\s*```\s*$/i, '')   // Remove closing ```
      .trim();

    // Find JSON object (look for { ... })
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : responseText;

    const analysis = JSON.parse(jsonStr);

    console.log(`✅ Pre-analysis complete`);
    console.log(`   Confidence: ${analysis.confidence}`);
    console.log(`   Discrepancies: ${analysis.discrepancies?.length || 0}`);
    console.log(`   Warnings: ${analysis.warnings?.length || 0}`);

    return NextResponse.json({
      analysis,
      filesAnalyzed: files.length,
      planFiles: planFiles.length,
      specFiles: specFiles.length,
      classification: {
        total: files.length,
        byType: Array.from(grouped.entries()).map(([type, docs]) => ({
          type,
          count: docs.length,
          files: docs.map(d => d.file.name),
          confidence: docs.map(d => d.classification.confidence)
        }))
      },
      parsedData, // NEW: All parsed data from new document types
      specification: specificationData
        ? {
            summary: specificationData.summary,
            materialsCount: specificationData.materials.length,
            methodsCount: specificationData.methods.length,
            requirementsCount: specificationData.requirements.length,
            criticalRequirements: specificationData.requirements.filter((r: any) => r.critical)
              .length,
          }
        : null,
      wizardDataUsed: !!wizardData,
    });

  } catch (error: unknown) {
    console.error("Pre-analysis error:", error);
    const message = error instanceof Error ? error.message : "Невідома помилка";
    return NextResponse.json({ error: `Помилка аналізу: ${message}` }, { status: 500 });
  }
}
