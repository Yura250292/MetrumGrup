import {
  extractDocument,
  averageConfidence,
  toEdrpou,
  UnsupportedMimeTypeError,
} from "../document-extractor";

jest.mock("@/lib/ocr/gemini-client", () => ({
  callGeminiVision: jest.fn(),
  GeminiUnavailableError: class extends Error {},
  GEMINI_VISION_MODELS: ["gemini-2.5-flash"],
}));

import { callGeminiVision } from "@/lib/ocr/gemini-client";

const mockCall = callGeminiVision as jest.MockedFunction<typeof callGeminiVision>;

describe("averageConfidence", () => {
  it("повертає 0 для порожнього map", () => {
    expect(averageConfidence({})).toBe(0);
  });

  it("середнє по значеннях, округлено до сотих", () => {
    expect(averageConfidence({ a: 1, b: 0.5, c: 0 })).toBe(0.5);
    expect(averageConfidence({ a: 0.91, b: 0.83 })).toBe(0.87);
  });
});

describe("toEdrpou", () => {
  it("8 цифр (юр.особа)", () => {
    expect(toEdrpou("12345678")).toBe("12345678");
    expect(toEdrpou("ЄДРПОУ: 12345678")).toBe("12345678");
  });

  it("10 цифр (ФОП)", () => {
    expect(toEdrpou("1234567890")).toBe("1234567890");
  });

  it("не 8/10 цифр → undefined", () => {
    expect(toEdrpou("12345")).toBeUndefined();
    expect(toEdrpou("123456789")).toBeUndefined();
    expect(toEdrpou("12345678901")).toBeUndefined();
    expect(toEdrpou(null)).toBeUndefined();
    expect(toEdrpou(undefined)).toBeUndefined();
    expect(toEdrpou("")).toBeUndefined();
  });
});

describe("extractDocument", () => {
  beforeEach(() => jest.clearAllMocks());

  it("кидає UnsupportedMimeTypeError для не-vision mime", async () => {
    await expect(
      extractDocument(Buffer.from("x"), "text/plain", "INVOICE"),
    ).rejects.toBeInstanceOf(UnsupportedMimeTypeError);
  });

  it("парсить валідний JSON-відповідь Gemini у структуру ExtractedData", async () => {
    mockCall.mockResolvedValue(
      JSON.stringify({
        counterparty: {
          name: 'ТОВ "Будматеріали-Плюс"',
          edrpou: "12345678",
          iban: "UA1234567890",
        },
        amountTotal: "12500.50",
        amountVat: "2500.00",
        currency: "UAH",
        documentDate: "12.03.2026",
        documentNumber: "INV-001",
        items: [
          { name: "Цемент", qty: 10, unit: "мішок", price: 250, total: 2500 },
        ],
        fieldConfidence: {
          counterparty: 0.95,
          amountTotal: 0.9,
          documentDate: 0.8,
        },
      }),
    );

    const result = await extractDocument(Buffer.from("pdf"), "application/pdf", "INVOICE");

    expect(result.log.success).toBe(true);
    expect(result.data.type).toBe("INVOICE");
    expect(result.data.counterparty?.edrpou).toBe("12345678");
    expect(result.data.amountTotal).toBe(12500.5);
    expect(result.data.amountVat).toBe(2500);
    expect(result.data.documentDate).toBe("2026-03-12");
    expect(result.data.items).toHaveLength(1);
    expect(result.data.overallConfidence).toBeGreaterThan(0);
  });

  it("приймає JSON загорнутий у markdown-блок", async () => {
    mockCall.mockResolvedValue('```json\n{"amountTotal": 100, "fieldConfidence": {"amountTotal": 1}}\n```');
    const r = await extractDocument(Buffer.from("x"), "image/png", "INVOICE");
    expect(r.log.success).toBe(true);
    expect(r.data.amountTotal).toBe(100);
  });

  it("повертає empty data + success=false якщо AI повертає не-JSON", async () => {
    mockCall.mockResolvedValue("просто текст без JSON");
    const r = await extractDocument(Buffer.from("x"), "image/png", "INVOICE");
    expect(r.log.success).toBe(false);
    expect(r.data.overallConfidence).toBe(0);
  });

  it("ловить помилку Gemini і повертає failed log", async () => {
    mockCall.mockRejectedValue(new Error("Gemini 503"));
    const r = await extractDocument(Buffer.from("x"), "application/pdf", "INVOICE");
    expect(r.log.success).toBe(false);
    expect(r.log.errorMessage).toContain("503");
  });

  it("ЄДРПОУ з опискою (не 8/10 цифр) → undefined", async () => {
    mockCall.mockResolvedValue(
      JSON.stringify({
        counterparty: { name: "X", edrpou: "1234567" },
        amountTotal: 1,
        fieldConfidence: { amountTotal: 1 },
      }),
    );
    const r = await extractDocument(Buffer.from("x"), "image/png", "INVOICE");
    expect(r.data.counterparty?.edrpou).toBeUndefined();
    expect(r.data.counterparty?.name).toBe("X");
  });
});
