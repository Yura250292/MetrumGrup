import { z } from "zod";
import Decimal from "decimal.js";

// Custom Zod type for Decimal
// Приймає number, string, або Decimal і перетворює на Decimal
const decimalSchema = z.union([
  z.number(),
  z.string(),
  z.instanceof(Decimal)
]).transform((val) => new Decimal(val));

// EstimateItem - єдине джерело правди для структури позиції кошторису
export const estimateItemSchema = z.object({
  id: z.string().optional(),
  description: z.string().min(3, "Опис занадто короткий (мінімум 3 символи)"),
  unit: z.string().min(1, "Оберіть одиницю виміру"),
  quantity: decimalSchema.refine(
    (q) => q.greaterThan(0),
    "Кількість повинна бути більше 0"
  ),
  unitPrice: decimalSchema.refine(
    (p) => p.greaterThanOrEqualTo(0),
    "Ціна повинна бути більше або дорівнювати 0"
  ),
  laborRate: decimalSchema.default(new Decimal(0)),
  laborHours: decimalSchema.default(new Decimal(0)),
  materialId: z.string().nullable().optional(),
  priceSource: z.string().url().nullable().optional(),
  priceNote: z.string().nullable().optional(),
  isManualOverride: z.boolean().optional(),
  sortOrder: z.number().optional(),
});

export type EstimateItemInput = z.input<typeof estimateItemSchema>;
export type EstimateItem = z.output<typeof estimateItemSchema>;

// EstimateSection - секція кошторису з позиціями
export const estimateSectionSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(2, "Назва секції занадто коротка (мінімум 2 символи)"),
  items: z.array(estimateItemSchema).min(1, "Мінімум 1 позиція у секції"),
  sortOrder: z.number().optional(),
});

export type EstimateSectionInput = z.input<typeof estimateSectionSchema>;
export type EstimateSection = z.output<typeof estimateSectionSchema>;

// Full Estimate - створення кошторису
export const estimateCreateSchema = z.object({
  projectId: z.string().cuid("Невалідний ID проєкту"),
  title: z.string().min(5, "Назва занадто коротка (мінімум 5 символів)"),
  description: z.string().optional(),
  area: decimalSchema.optional(),
  areaSource: z.string().optional(),
  sections: z.array(estimateSectionSchema).min(1, "Мінімум 1 секція у кошторисі"),
  overheadRate: decimalSchema
    .refine((r) => r.greaterThanOrEqualTo(0), "Накладні витрати не можуть бути від'ємними")
    .refine((r) => r.lessThanOrEqualTo(100), "Накладні витрати не можуть перевищувати 100%")
    .default(new Decimal(15)),
  discount: decimalSchema
    .refine((d) => d.greaterThanOrEqualTo(0), "Знижка не може бути від'ємною")
    .refine((d) => d.lessThanOrEqualTo(100), "Знижка не може перевищувати 100%")
    .default(new Decimal(0)),
});

// AI-specific schema - має додаткові поля для генерації через AI
export const aiEstimateSchema = estimateCreateSchema.extend({
  summary: z.object({
    materialsCost: decimalSchema.optional(),
    laborCost: decimalSchema.optional(),
    overheadPercent: decimalSchema.optional(),
    overheadCost: decimalSchema.optional(),
    totalBeforeDiscount: decimalSchema.optional(),
    recommendations: z.string().optional(),
  }).optional(),
});

// Validation constraints - константи для перевірок
export const ESTIMATE_CONSTRAINTS = {
  // Мінімальна кількість позицій залежно від типу проєкту
  MIN_ITEMS_SMALL_PROJECT: 20,    // студія, 1-кімн
  MIN_ITEMS_MEDIUM_PROJECT: 40,   // 2-кімн
  MIN_ITEMS_LARGE_PROJECT: 60,    // 3+ кімн

  // Обмеження на кількість
  MAX_ITEMS_PER_SECTION: 50,
  MAX_SECTIONS: 20,

  // Обмеження на ціни
  MIN_UNIT_PRICE: new Decimal(0.01),
  MAX_UNIT_PRICE: new Decimal(1000000),

  // Обмеження на кількість
  MIN_QUANTITY: new Decimal(0.001),
  MAX_QUANTITY: new Decimal(100000),
} as const;

export type EstimateCreateInput = z.input<typeof estimateCreateSchema>;
export type EstimateCreate = z.output<typeof estimateCreateSchema>;
export type AIEstimateInput = z.input<typeof aiEstimateSchema>;
export type AIEstimate = z.output<typeof aiEstimateSchema>;
