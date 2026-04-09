/**
 * Structural validator: checks the *shape* of the estimate, not the numbers.
 *
 *   • At least one section.
 *   • Every section has a non-empty title.
 *   • Every item has a description, unit, positive quantity, non-negative unitPrice.
 *   • No "ghost" items (description only).
 *   • laborRate * laborHours is consistent with laborCost (when both exist).
 */

import type { Validator } from './types';

export const structuralValidator: Validator = ({ estimate }) => {
  const issues: ReturnType<Validator> = [];

  if (!estimate.sections || estimate.sections.length === 0) {
    issues.push({
      severity: 'error',
      code: 'NO_SECTIONS',
      message: 'Кошторис не містить жодної секції',
    });
    return issues;
  }

  estimate.sections.forEach((section) => {
    if (!section.title || section.title.trim() === '') {
      issues.push({
        severity: 'warning',
        code: 'EMPTY_SECTION_TITLE',
        message: 'Секція без заголовка',
      });
    }

    if (!section.items || section.items.length === 0) {
      issues.push({
        severity: 'warning',
        code: 'EMPTY_SECTION',
        message: `Секція "${section.title}" не містить позицій`,
        section: section.title,
      });
      return;
    }

    section.items.forEach((item, idx) => {
      const label = item.description || `позиція #${idx + 1}`;
      if (!item.description || item.description.trim() === '') {
        issues.push({
          severity: 'error',
          code: 'MISSING_DESCRIPTION',
          message: `Позиція без назви`,
          section: section.title,
          itemIndex: idx,
        });
      }
      if (!item.unit || item.unit.trim() === '') {
        issues.push({
          severity: 'error',
          code: 'MISSING_UNIT',
          message: `"${label}": відсутня одиниця виміру`,
          section: section.title,
          itemIndex: idx,
        });
      }
      const quantity = Number(item.quantity ?? 0);
      if (!(quantity > 0)) {
        issues.push({
          severity: 'error',
          code: 'INVALID_QUANTITY',
          message: `"${label}": кількість ${item.quantity} недопустима (має бути > 0)`,
          section: section.title,
          itemIndex: idx,
        });
      }
      const unitPrice = Number(item.unitPrice ?? 0);
      if (unitPrice < 0) {
        issues.push({
          severity: 'error',
          code: 'NEGATIVE_PRICE',
          message: `"${label}": ціна ${unitPrice} не може бути від'ємною`,
          section: section.title,
          itemIndex: idx,
        });
      }

      // Cross-check labor breakdown when stored as rate*hours.
      const laborRate = Number(item.laborRate ?? 0);
      const laborHours = Number(item.laborHours ?? 0);
      const laborCost = Number(item.laborCost ?? 0);
      if (laborCost > 0 && laborRate > 0 && laborHours > 0) {
        const computed = laborRate * laborHours;
        if (Math.abs(computed - laborCost) > 1) {
          issues.push({
            severity: 'warning',
            code: 'LABOR_BREAKDOWN_MISMATCH',
            message:
              `"${label}": laborRate × laborHours = ${computed.toFixed(2)} ` +
              `≠ laborCost ${laborCost.toFixed(2)}`,
            section: section.title,
            itemIndex: idx,
          });
        }
      }
    });
  });

  return issues;
};
