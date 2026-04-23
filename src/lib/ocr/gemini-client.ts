import { GoogleGenerativeAI } from "@google/generative-ai";

export const GEMINI_VISION_MODELS = ["gemini-3-flash-preview", "gemini-2.5-flash"] as const;

export class GeminiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiUnavailableError";
  }
}

let cachedClient: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!process.env.GEMINI_API_KEY) {
    throw new GeminiUnavailableError("GEMINI_API_KEY не налаштовано");
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return cachedClient;
}

/**
 * Call Gemini Vision with model fallback. Returns the raw text response from
 * the first model that succeeds. Throws GeminiUnavailableError if all models
 * fail or the API key is missing.
 */
export async function callGeminiVision(
  buffer: Buffer,
  mimeType: string,
  prompt: string,
  models: readonly string[] = GEMINI_VISION_MODELS,
): Promise<string> {
  const genAI = getClient();
  const base64 = buffer.toString("base64");

  let lastError: unknown = null;
  for (const modelName of models) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([
        { inlineData: { mimeType, data: base64 } },
        { text: prompt },
      ]);
      return result.response.text();
    } catch (err) {
      lastError = err;
      console.error(`[gemini] ${modelName} failed:`, err instanceof Error ? err.message : err);
    }
  }

  const msg = lastError instanceof Error ? lastError.message : "Усі моделі Gemini недоступні";
  throw new GeminiUnavailableError(msg);
}
