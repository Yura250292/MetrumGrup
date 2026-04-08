/**
 * Типи та інтерфейси для спеціалізованих AI агентів генерації кошторисів
 */

import { WizardData } from "../wizard-types";

/**
 * Типи спеціалізованих агентів
 */
export enum AgentType {
  // Критичні агенти (гібридний підхід)
  ELECTRICAL = "electrical",   // Електрика
  PLUMBING = "plumbing",       // Сантехніка
  HEATING = "heating",         // Опалення та вентиляція

  // Для майбутнього розширення
  PREPARATORY = "preparatory", // Демонтаж + Земляні роботи
  FOUNDATION = "foundation",   // Фундамент
  STRUCTURAL = "structural",   // Стіни + Дах + Вікна + Двері
  FINISHING = "finishing",     // Оздоблення + Підлога + Стеля

  // Загальний AI (для некритичних категорій)
  GENERAL = "general"
}

/**
 * Рівень впевненості агента в своїх розрахунках
 */
export enum ConfidenceLevel {
  LOW = "low",           // <70% - недостатньо даних
  MEDIUM = "medium",     // 70-85% - достатньо даних
  HIGH = "high",         // 85-95% - повні дані
  VERY_HIGH = "very_high" // >95% - детальні креслення
}

/**
 * Типи попереджень від агентів
 */
export enum WarningType {
  MISSING_DATA = "missing_data",           // Відсутні дані
  ASSUMED_VALUES = "assumed_values",       // Припущені значення
  OUTDATED_PRICES = "outdated_prices",     // Застарілі ціни
  INCOMPLETE_SPECS = "incomplete_specs",   // Неповні специфікації
  CALCULATION_UNCERTAINTY = "calculation_uncertainty" // Невизначеність розрахунків
}

/**
 * Попередження від агента
 */
export interface AgentWarning {
  type: WarningType;
  message: string;
  details?: string;
  affectedItems?: string[]; // ID позицій які під питанням
}

/**
 * Позиція кошторису (для агента)
 */
export interface EstimateItem {
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  laborCost: number;
  totalCost: number;
  priceSource?: string | null;
  priceNote?: string | null;
}

/**
 * Секція кошторису (результат роботи агента)
 */
export interface EstimateSection {
  title: string;
  items: EstimateItem[];
  sectionTotal: number;
}

/**
 * Результат роботи агента
 */
export interface AgentResult {
  agentType: AgentType;
  section: EstimateSection;
  confidence: ConfidenceLevel;
  warnings: AgentWarning[];
  processingTime: number; // мс
  tokensUsed?: number;
  model?: string; // gemini/openai/anthropic
}

/**
 * Матеріал з бази даних
 */
export interface Material {
  id: string;
  name: string;
  category: string;
  unit: string;
  priceUAH: number;
  brand?: string;
  specifications?: string;
  source?: string;
  sourceURL?: string;
  lastUpdated: string;
  notes?: string;
}

/**
 * Робота з бази даних
 */
export interface WorkItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  priceUAH: number;
  laborOnly: boolean;
  description?: string;
  includes?: string;
  source?: string;
  lastUpdated: string;
}

/**
 * Контекст для агента (все що йому потрібно для роботи)
 */
export interface AgentContext {
  // Дані проекту
  projectType: string;
  area: string;
  additionalNotes: string;
  wizardData?: WizardData | any;

  // Документи
  textParts: string[];
  imageParts: Array<{ inlineData: { data: string; mimeType: string } }>;
  pdfParts: Array<{ data: string; mimeType: string; name: string }>;

  // Бази даних
  materialsDatabase: Material[];
  workItemsDatabase: WorkItem[];

  // Спеціалізовані дані для агента
  drawingGuide?: string; // Для візуального аналізу
  categoryDescriptions?: Record<string, string>; // Описи категорій робіт
}

/**
 * Конфігурація агента
 */
export interface AgentConfig {
  type: AgentType;
  enabled: boolean;
  model: "gemini" | "openai" | "anthropic";
  temperature?: number;
  maxTokens?: number;
  timeout?: number; // мс
}

/**
 * Конфігурація координатора агентів
 */
export interface CoordinatorConfig {
  mode: "classic" | "multi-agent" | "hybrid";
  agents: AgentConfig[];
  parallelExecution: boolean;
  fallbackToClassic: boolean; // Якщо агент failed
}

/**
 * Результат роботи координатора
 */
export interface CoordinatorResult {
  sections: EstimateSection[];
  totalAmount: number;
  totalMaterials: number;
  totalLabor: number;
  agentResults: AgentResult[];
  totalProcessingTime: number;
  warnings: AgentWarning[];
}
