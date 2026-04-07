import { DocumentType, DOCUMENT_KEYWORDS } from './document-types';

export interface ClassificationResult {
  type: DocumentType;
  confidence: number; // 0-1
  matchedKeywords: string[];
}

export function classifyDocument(
  fileName: string,
  fileSize: number,
  mimeType: string
): ClassificationResult {
  const nameLower = fileName.toLowerCase();

  // Special rules

  // 1. Images → Site Photos
  if (mimeType.startsWith('image/')) {
    return {
      type: DocumentType.SITE_PHOTOS,
      confidence: 0.9,
      matchedKeywords: ['image file']
    };
  }

  // 2. Large PDFs (>10MB) → likely Specifications
  if (mimeType === 'application/pdf' && fileSize > 10 * 1024 * 1024) {
    // But check if it's geological report (can be large too)
    const geoKeywords = DOCUMENT_KEYWORDS[DocumentType.GEOLOGICAL_REPORT];
    const matchedGeo = geoKeywords.filter(kw => nameLower.includes(kw));

    if (matchedGeo.length > 0) {
      return {
        type: DocumentType.GEOLOGICAL_REPORT,
        confidence: 0.95,
        matchedKeywords: matchedGeo
      };
    }

    return {
      type: DocumentType.SPECIFICATION,
      confidence: 0.85,
      matchedKeywords: ['large file size']
    };
  }

  // 3. Keyword-based classification
  const scores: { type: DocumentType; score: number; matched: string[] }[] = [];

  for (const [type, keywords] of Object.entries(DOCUMENT_KEYWORDS)) {
    const matchedKeywords = keywords.filter(kw => nameLower.includes(kw));
    const score = matchedKeywords.length;

    if (score > 0) {
      scores.push({
        type: type as DocumentType,
        score,
        matched: matchedKeywords
      });
    }
  }

  // Sort by score (most matches first)
  scores.sort((a, b) => b.score - a.score);

  if (scores.length > 0) {
    const best = scores[0];
    const confidence = Math.min(0.9, 0.5 + (best.score * 0.2));

    return {
      type: best.type,
      confidence,
      matchedKeywords: best.matched
    };
  }

  // Fallback: Architectural Plan (most common)
  return {
    type: DocumentType.ARCHITECTURAL_PLAN,
    confidence: 0.3,
    matchedKeywords: []
  };
}

export interface ClassifiedDocument {
  file: File;
  classification: ClassificationResult;
}

export function classifyDocuments(files: File[]): ClassifiedDocument[] {
  return files.map(file => ({
    file,
    classification: classifyDocument(file.name, file.size, file.type)
  }));
}

// Group by type
export function groupByType(
  classified: ClassifiedDocument[]
): Map<DocumentType, ClassifiedDocument[]> {
  const groups = new Map<DocumentType, ClassifiedDocument[]>();

  for (const doc of classified) {
    const type = doc.classification.type;
    if (!groups.has(type)) {
      groups.set(type, []);
    }
    groups.get(type)!.push(doc);
  }

  return groups;
}
