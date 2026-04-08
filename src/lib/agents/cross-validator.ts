/**
 * Перехресна валідація між агентами
 * Виявляє дублікати, залежності, аномалії цін
 */

import { EstimateSection } from './base-agent';

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  agent: string;
  item: string;
  message: string;
  suggestion: string;
}

export class CrossValidator {
  /**
   * Головний метод валідації
   */
  validate(sections: EstimateSection[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // 1. Перевірка дублікатів між агентами
    issues.push(...this.checkDuplicates(sections));

    // 2. Перевірка залежностей (фундамент → стіни → покрівля)
    issues.push(...this.checkDependencies(sections));

    // 3. Перевірка цін (занадто високі/низькі)
    issues.push(...this.checkPriceAnomalies(sections));

    // 4. Перевірка об'ємів (логічність)
    issues.push(...this.checkVolumeConsistency(sections));

    return issues;
  }

  /**
   * Перевірка дублікатів позицій між різними агентами
   */
  private checkDuplicates(sections: EstimateSection[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const seenItems = new Map<string, { agent: string; item: any }>();

    for (const section of sections) {
      for (const item of section.items) {
        const normalized = this.normalizeItemName(item.description);

        if (seenItems.has(normalized)) {
          const prev = seenItems.get(normalized)!;
          issues.push({
            severity: 'warning',
            agent: section.title,
            item: item.description,
            message: `Можливий дублікат з секцією "${prev.agent}"`,
            suggestion: `Перевірити чи це справді окремі роботи`
          });
        } else {
          seenItems.set(normalized, { agent: section.title, item });
        }
      }
    }

    return issues;
  }

  /**
   * Перевірка залежностей між секціями
   */
  private checkDependencies(sections: EstimateSection[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    const hasSection = (name: string) =>
      sections.some(s => s.title.toLowerCase().includes(name.toLowerCase()));

    // Земляні роботи → Фундамент
    if (hasSection('фундамент') && !hasSection('земля')) {
      issues.push({
        severity: 'warning',
        agent: 'Фундамент',
        item: 'Залежність',
        message: 'Фундамент без земляних робіт',
        suggestion: 'Переконайтеся що земляні роботи включені або не потрібні'
      });
    }

    // Фундамент → Стіни
    if (hasSection('стіни') && !hasSection('фундамент')) {
      issues.push({
        severity: 'error',
        agent: 'Стіни',
        item: 'Залежність',
        message: 'Стіни без фундаменту!',
        suggestion: 'Додати секцію фундаменту'
      });
    }

    // Стіни → Покрівля
    if (hasSection('покрівля') && !hasSection('стіни')) {
      issues.push({
        severity: 'error',
        agent: 'Покрівля',
        item: 'Залежність',
        message: 'Покрівля без стін!',
        suggestion: 'Додати секцію стін'
      });
    }

    // Електрика/Сантехніка → Оздоблення (логічний порядок)
    if (hasSection('оздоблення') &&
        !hasSection('електрика') &&
        !hasSection('сантехніка')) {
      issues.push({
        severity: 'info',
        agent: 'Оздоблення',
        item: 'Порядок робіт',
        message: 'Оздоблення без інженерних мереж',
        suggestion: 'Зазвичай спочатку роблять електрику/сантехніку, потім оздоблення'
      });
    }

    return issues;
  }

  /**
   * Перевірка аномалій цін
   */
  private checkPriceAnomalies(sections: EstimateSection[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (const section of sections) {
      for (const item of section.items) {
        // Занадто низька ціна
        if (item.unitPrice < 1 && item.unitPrice > 0) {
          issues.push({
            severity: 'error',
            agent: section.title,
            item: item.description,
            message: `Нереалістично низька ціна: ${item.unitPrice} ₴`,
            suggestion: 'Перевірити одиницю виміру або ціну'
          });
        }

        // Занадто висока ціна (підозріло)
        if (item.unitPrice > 100000) {
          issues.push({
            severity: 'warning',
            agent: section.title,
            item: item.description,
            message: `Дуже висока ціна: ${item.unitPrice.toFixed(0)} ₴`,
            suggestion: 'Перевірити джерело ціни та одиницю виміру'
          });
        }

        // Кругла ціна (100, 500, 1000) → підозра на вигадану
        if (item.unitPrice % 100 === 0 && item.unitPrice >= 100) {
          if (!item.priceSource || item.priceSource === 'База матеріалів') {
            issues.push({
              severity: 'info',
              agent: section.title,
              item: item.description,
              message: `Кругла ціна ${item.unitPrice} ₴ (можливо наближена)`,
              suggestion: 'Уточнити актуальну ціну'
            });
          }
        }

        // Низька впевненість
        if (item.confidence < 0.5) {
          issues.push({
            severity: 'warning',
            agent: section.title,
            item: item.description,
            message: `Низька впевненість у ціні (${(item.confidence * 100).toFixed(0)}%)`,
            suggestion: 'Перевірити ціну вручну'
          });
        }

        // Нульова ціна
        if (item.unitPrice === 0) {
          issues.push({
            severity: 'error',
            agent: section.title,
            item: item.description,
            message: `Ціна = 0 ₴ (не знайдена)`,
            suggestion: 'Вказати ціну вручну'
          });
        }
      }
    }

    return issues;
  }

  /**
   * Перевірка логічності об'ємів
   */
  private checkVolumeConsistency(sections: EstimateSection[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Перевірка занадто великих кількостей
    for (const section of sections) {
      for (const item of section.items) {
        // Якщо кількість > 10000 для більшості одиниць
        if (item.quantity > 10000 &&
            !['грн', 'коп', 'зміна'].includes(item.unit.toLowerCase())) {
          issues.push({
            severity: 'warning',
            agent: section.title,
            item: item.description,
            message: `Дуже велика кількість: ${item.quantity} ${item.unit}`,
            suggestion: 'Перевірити правильність розрахунку'
          });
        }

        // Якщо кількість < 0.01
        if (item.quantity < 0.01 && item.quantity > 0) {
          issues.push({
            severity: 'warning',
            agent: section.title,
            item: item.description,
            message: `Дуже мала кількість: ${item.quantity} ${item.unit}`,
            suggestion: 'Можливо неправильна одиниця виміру'
          });
        }
      }
    }

    return issues;
  }

  /**
   * Нормалізація назви для порівняння
   */
  private normalizeItemName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^а-яa-z0-9]/g, '')
      .replace(/\s+/g, '')
      .trim();
  }

  /**
   * Статистика валідації
   */
  getValidationStats(issues: ValidationIssue[]) {
    return {
      total: issues.length,
      errors: issues.filter(i => i.severity === 'error').length,
      warnings: issues.filter(i => i.severity === 'warning').length,
      info: issues.filter(i => i.severity === 'info').length,
    };
  }
}
