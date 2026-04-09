/**
 * Price validator: catches obvious AI hallucinations and miscalculations.
 *
 *   • zero / negative unit prices on non-equipment items;
 *   • unrealistically low (<1₴) or high (>100,000₴) unit prices;
 *   • "round" prices that smell like LLM guesses (>=100 and divisible by 100);
 *   • totalCost mismatch versus quantity * unitPrice + laborCost;
 *   • aggregated section totals out of sync with the sum of items.
 */

import type { Validator } from './types';

export const priceValidator: Validator = ({ estimate }) => {
  const issues: ReturnType<Validator> = [];

  estimate.sections.forEach((section) => {
    let computedSectionTotal = 0;
    section.items.forEach((item, idx) => {
      const label = item.description || `позиція #${idx + 1}`;
      const quantity = Number(item.quantity ?? 0);
      const unitPrice = Number(item.unitPrice ?? 0);
      const laborCost = Number(item.laborCost ?? 0);
      const totalCost = Number(item.totalCost ?? item.amount ?? 0);

      if (item.itemType !== 'composite' && unitPrice === 0 && laborCost === 0) {
        issues.push({
          severity: 'warning',
          code: 'ZERO_PRICE',
          message: `"${label}": ціна 0 і робота 0 — позиція без вартості`,
          section: section.title,
          itemIndex: idx,
        });
      }

      if (unitPrice > 0 && unitPrice < 1) {
        issues.push({
          severity: 'warning',
          code: 'SUSPICIOUSLY_LOW_PRICE',
          message: `"${label}": ціна ${unitPrice} ₴ нереалістично низька`,
          section: section.title,
          itemIndex: idx,
        });
      }

      if (unitPrice > 100000) {
        issues.push({
          severity: 'warning',
          code: 'SUSPICIOUSLY_HIGH_PRICE',
          message: `"${label}": ціна ${unitPrice} ₴ нереалістично висока`,
          section: section.title,
          itemIndex: idx,
        });
      }

      if (unitPrice >= 100 && unitPrice % 100 === 0 && unitPrice < 10000) {
        issues.push({
          severity: 'info',
          code: 'ROUND_PRICE',
          message: `"${label}": кругла ціна ${unitPrice} ₴ — ймовірно вигадана LLM`,
          section: section.title,
          itemIndex: idx,
        });
      }

      const expectedTotal = quantity * unitPrice + laborCost;
      if (totalCost > 0 && Math.abs(expectedTotal - totalCost) > 1) {
        issues.push({
          severity: 'error',
          code: 'TOTAL_COST_MISMATCH',
          message:
            `"${label}": totalCost ${totalCost.toFixed(2)} ` +
            `≠ quantity*unitPrice+laborCost ${expectedTotal.toFixed(2)}`,
          section: section.title,
          itemIndex: idx,
          details: { expected: expectedTotal, actual: totalCost },
        });
      }

      computedSectionTotal += expectedTotal > 0 ? expectedTotal : totalCost;
    });

    if (section.sectionTotal !== undefined && section.sectionTotal > 0) {
      if (Math.abs(section.sectionTotal - computedSectionTotal) > 1) {
        issues.push({
          severity: 'error',
          code: 'SECTION_TOTAL_MISMATCH',
          message:
            `Секція "${section.title}": sectionTotal ${section.sectionTotal.toFixed(2)} ` +
            `≠ сума позицій ${computedSectionTotal.toFixed(2)}`,
          section: section.title,
        });
      }
    }
  });

  return issues;
};
