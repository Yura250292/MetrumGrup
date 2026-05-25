import type { IncomingDocumentType } from "@prisma/client";
import { callGeminiVision, GeminiUnavailableError } from "@/lib/ocr/gemini-client";
import { getDocumentPrompt } from "./prompts/documents";
import type {
  ExtractedData,
  ExtractedItem,
  CostCodeSuggestion,
} from "./prompts/documents/types";

export type { ExtractedData };

export interface ExtractionResult {
  data: ExtractedData;
  /** Хвилинна telemetry для DocumentExtractionLog. */
  log: {
    model: string;
    prompt: string;
    response: string;
    durationMs: number;
    success: boolean;
    errorMessage?: string;
  };
}

const SUPPORTED_VISION_MIME = /^(application\/pdf|image\/(jpeg|jpg|png|webp|heic|heif))$/i;

export class UnsupportedMimeTypeError extends Error {
  constructor(mimeType: string) {
    super(`Mime type not supported for AI extraction: ${mimeType}`);
    this.name = "UnsupportedMimeTypeError";
  }
}

export async function extractDocument(
  fileBuffer: Buffer,
  mimeType: string,
  expectedType: IncomingDocumentType = "INVOICE",
): Promise<ExtractionResult> {
  if (!SUPPORTED_VISION_MIME.test(mimeType)) {
    throw new UnsupportedMimeTypeError(mimeType);
  }

  const prompt = getDocumentPrompt(expectedType);
  if (!prompt) {
    throw new Error(`No prompt registered for document type: ${expectedType}`);
  }

  const start = Date.now();
  let modelName = "gemini-2.5-flash";
  let rawResponse = "";

  try {
    rawResponse = await callGeminiVision(fileBuffer, mimeType, prompt.prompt);
    const parsed = parseJsonResponse(rawResponse);
    const data = normalizeExtractedData(parsed, expectedType);
    return {
      data,
      log: {
        model: modelName,
        prompt: prompt.prompt,
        response: rawResponse,
        durationMs: Date.now() - start,
        success: true,
      },
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    if (err instanceof GeminiUnavailableError) {
      modelName = "gemini-unavailable";
    }
    return {
      data: emptyExtractedData(expectedType, errorMessage),
      log: {
        model: modelName,
        prompt: prompt.prompt,
        response: rawResponse,
        durationMs: Date.now() - start,
        success: false,
        errorMessage,
      },
    };
  }
}

function parseJsonResponse(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  const cleaned = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new Error("AI response does not contain JSON object");
  }
  const sliced = cleaned.slice(firstBrace, lastBrace + 1);
  return JSON.parse(sliced) as Record<string, unknown>;
}

function emptyExtractedData(
  type: IncomingDocumentType,
  reason: string,
): ExtractedData {
  return {
    type,
    raw: { error: reason },
    fieldConfidence: {},
    overallConfidence: 0,
  };
}

function normalizeExtractedData(
  raw: Record<string, unknown>,
  type: IncomingDocumentType,
): ExtractedData {
  const fieldConfidence = sanitizeConfidenceMap(raw.fieldConfidence);
  const overallConfidence = averageConfidence(fieldConfidence);

  return {
    type,
    counterparty: pickCounterparty(raw.counterparty),
    project: pickProject(raw.project),
    costCodeSuggestions: pickCostCodes(raw.costCodeSuggestions),
    amountTotal: toNumber(raw.amountTotal),
    amountVat: toNumber(raw.amountVat),
    currency: toStringOrUndefined(raw.currency) ?? "UAH",
    documentDate: toIsoDate(raw.documentDate),
    documentNumber: toStringOrUndefined(raw.documentNumber),
    paymentTermsDays: toNumber(raw.paymentTermsDays),
    items: pickItems(raw.items),
    raw,
    fieldConfidence,
    overallConfidence,
  };
}

function sanitizeConfidenceMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const n = toNumber(v);
    if (n !== undefined && n >= 0 && n <= 1) out[k] = n;
  }
  return out;
}

export function averageConfidence(map: Record<string, number>): number {
  const values = Object.values(map);
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return Math.round((sum / values.length) * 100) / 100;
}

function pickCounterparty(value: unknown): ExtractedData["counterparty"] {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  const name = toStringOrUndefined(v.name);
  const edrpou = toEdrpou(v.edrpou);
  const iban = toStringOrUndefined(v.iban);
  const taxId = toStringOrUndefined(v.taxId);
  if (!name && !edrpou && !iban && !taxId) return undefined;
  return { name, edrpou, iban, taxId };
}

function pickProject(value: unknown): ExtractedData["project"] {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  const keyword = toStringOrUndefined(v.keyword);
  const address = toStringOrUndefined(v.address);
  if (!keyword && !address) return undefined;
  return { keyword, address };
}

function pickCostCodes(value: unknown): CostCodeSuggestion[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: CostCodeSuggestion[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const code = toStringOrUndefined(e.code);
    const label = toStringOrUndefined(e.label);
    const confidence = toNumber(e.confidence) ?? 0;
    if (code && label) out.push({ code, label, confidence });
  }
  return out.length > 0 ? out : undefined;
}

function pickItems(value: unknown): ExtractedItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: ExtractedItem[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const name = toStringOrUndefined(e.name);
    if (!name) continue;
    items.push({
      name,
      qty: toNumber(e.qty),
      unit: toStringOrUndefined(e.unit),
      price: toNumber(e.price),
      total: toNumber(e.total),
    });
  }
  return items.length > 0 ? items : undefined;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[\s ]/g, "").replace(",", ".");
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function toStringOrUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toIsoDate(value: unknown): string | undefined {
  const s = toStringOrUndefined(value);
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{2})[./](\d{2})[./](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return undefined;
}

/**
 * EDRPOU нормалізація: тримаємо лише цифри. Юр.особа — 8, ФОП — 10.
 * Інше — повертаємо undefined (AI помилився).
 */
export function toEdrpou(value: unknown): string | undefined {
  const s = toStringOrUndefined(value);
  if (!s) return undefined;
  const digits = s.replace(/\D/g, "");
  if (digits.length === 8 || digits.length === 10) return digits;
  return undefined;
}
