import { describe, it, expect } from '@jest/globals'
import {
  generateTaxReportVAT,
  generateTaxReportFOP,
  formatTaxReportText,
  getTaxSummary,
} from '../tax-utils'
import { TAX_RATES } from '../financial-calculations'

describe('tax-utils', () => {
  describe('generateTaxReportVAT', () => {
    it('should generate complete VAT tax report', () => {
      const report = generateTaxReportVAT({
        estimateNumber: 'EST-001',
        estimateTitle: 'Ремонт офісу',
        projectTitle: 'Офіс компанії ABC',
        clientName: 'ТОВ ABC',
        subtotal: 100000,
        totalLabor: 20000,
        totalMargin: 30000,
        pdvAmount: 20000,
        esvAmount: 4400,
        pdfoAmount: 3600,
        militaryTaxAmount: 300,
        profitTaxAmount: 3906,
        totalTaxAmount: 12206,
        netProfit: 17794,
        effectiveTaxRate: 40.69,
      })

      // Перевірка основної інформації
      expect(report.estimateNumber).toBe('EST-001')
      expect(report.estimateTitle).toBe('Ремонт офісу')
      expect(report.projectTitle).toBe('Офіс компанії ABC')
      expect(report.clientName).toBe('ТОВ ABC')

      // Перевірка сум
      expect(report.subtotal).toBe(100000)
      expect(report.totalLabor).toBe(20000)
      expect(report.totalMargin).toBe(30000)

      // Перевірка ПДВ
      expect(report.pdv.base).toBe(100000)
      expect(report.pdv.rate).toBe(20)
      expect(report.pdv.amount).toBe(20000)
      expect(report.pdv.note).toContain('транзитним')

      // Перевірка ЄСВ
      expect(report.esv.base).toBe(20000)
      expect(report.esv.rate).toBe(22)
      expect(report.esv.amount).toBe(4400)

      // Перевірка ПДФО
      expect(report.pdfo.base).toBe(20000)
      expect(report.pdfo.rate).toBe(18)
      expect(report.pdfo.amount).toBe(3600)

      // Перевірка військового збору
      expect(report.militaryTax.base).toBe(20000)
      expect(report.militaryTax.rate).toBe(1.5)
      expect(report.militaryTax.amount).toBe(300)

      // Перевірка податку на прибуток
      // База: 30000 - 4400 - 3600 - 300 = 21700
      expect(report.profitTax.base).toBe(21700)
      expect(report.profitTax.rate).toBe(18)
      expect(report.profitTax.amount).toBe(3906)

      // Перевірка підсумку
      expect(report.summary.totalTaxBurden).toBe(12206)
      expect(report.summary.netProfit).toBe(17794)
      expect(report.summary.effectiveTaxRate).toBe(40.69)
    })

    it('should handle zero labor costs', () => {
      const report = generateTaxReportVAT({
        estimateNumber: 'EST-002',
        estimateTitle: 'Тільки матеріали',
        projectTitle: 'Проєкт без робіт',
        clientName: 'Клієнт',
        subtotal: 50000,
        totalLabor: 0,
        totalMargin: 15000,
        pdvAmount: 10000,
        esvAmount: 0,
        pdfoAmount: 0,
        militaryTaxAmount: 0,
        profitTaxAmount: 2700, // 15000 * 18%
        totalTaxAmount: 2700,
        netProfit: 12300,
        effectiveTaxRate: 18,
      })

      expect(report.esv.amount).toBe(0)
      expect(report.pdfo.amount).toBe(0)
      expect(report.militaryTax.amount).toBe(0)
      expect(report.profitTax.base).toBe(15000) // Без вирахувань
    })

    it('should use correct TAX_RATES constants', () => {
      const report = generateTaxReportVAT({
        estimateNumber: 'EST-003',
        estimateTitle: 'Test',
        projectTitle: 'Test Project',
        clientName: 'Test Client',
        subtotal: 100000,
        totalLabor: 10000,
        totalMargin: 20000,
        pdvAmount: 0,
        esvAmount: 0,
        pdfoAmount: 0,
        militaryTaxAmount: 0,
        profitTaxAmount: 0,
        totalTaxAmount: 0,
        netProfit: 0,
        effectiveTaxRate: 0,
      })

      expect(report.pdv.rate).toBe(TAX_RATES.PDV)
      expect(report.esv.rate).toBe(TAX_RATES.ESV_EMPLOYER)
      expect(report.pdfo.rate).toBe(TAX_RATES.PDFO)
      expect(report.militaryTax.rate).toBe(TAX_RATES.MILITARY_TAX)
      expect(report.profitTax.rate).toBe(TAX_RATES.PROFIT_TAX)
    })
  })

  describe('generateTaxReportFOP', () => {
    it('should generate complete FOP tax report', () => {
      const report = generateTaxReportFOP({
        estimateNumber: 'EST-FOP-001',
        estimateTitle: 'Дизайн інтер\'єру',
        projectTitle: 'Квартира',
        clientName: 'Іван Петренко',
        subtotal: 100000,
        totalMargin: 25000,
        unifiedTaxAmount: 5000,
        esvAmount: 1760,
        militaryTaxAmount: 1500,
        totalTaxAmount: 8260,
        netProfit: 16740,
        effectiveTaxRate: 33.04,
      })

      // Основна інформація
      expect(report.estimateNumber).toBe('EST-FOP-001')
      expect(report.estimateTitle).toBe('Дизайн інтер\'єру')

      // Суми
      expect(report.subtotal).toBe(100000)
      expect(report.totalMargin).toBe(25000)

      // Єдиний податок
      expect(report.unifiedTax.base).toBe(100000)
      expect(report.unifiedTax.rate).toBe(5)
      expect(report.unifiedTax.amount).toBe(5000)
      expect(report.unifiedTax.note).toContain('5%')

      // ЄСВ
      expect(report.esv.base).toBe(8000) // Мін. ЗП за замовчуванням
      expect(report.esv.rate).toBe(22)
      expect(report.esv.amount).toBe(1760)
      expect(report.esv.note).toContain('8000')

      // Військовий збір
      expect(report.militaryTax.base).toBe(100000)
      expect(report.militaryTax.rate).toBe(1.5)
      expect(report.militaryTax.amount).toBe(1500)

      // Підсумок
      expect(report.summary.totalTaxBurden).toBe(8260)
      expect(report.summary.netProfit).toBe(16740)
      expect(report.summary.effectiveTaxRate).toBe(33.04)
    })

    it('should use custom ESV base', () => {
      const report = generateTaxReportFOP({
        estimateNumber: 'EST-FOP-002',
        estimateTitle: 'Test',
        projectTitle: 'Test',
        clientName: 'Test',
        subtotal: 100000,
        totalMargin: 25000,
        unifiedTaxAmount: 5000,
        esvAmount: 3300, // 15000 * 22%
        militaryTaxAmount: 1500,
        totalTaxAmount: 9800,
        netProfit: 15200,
        effectiveTaxRate: 39.2,
        esvBase: 15000,
      })

      expect(report.esv.base).toBe(15000)
      expect(report.esv.note).toContain('15000.00')
    })

    it('should use correct FOP TAX_RATES constants', () => {
      const report = generateTaxReportFOP({
        estimateNumber: 'EST-FOP-003',
        estimateTitle: 'Test',
        projectTitle: 'Test',
        clientName: 'Test',
        subtotal: 50000,
        totalMargin: 10000,
        unifiedTaxAmount: 0,
        esvAmount: 0,
        militaryTaxAmount: 0,
        totalTaxAmount: 0,
        netProfit: 0,
        effectiveTaxRate: 0,
      })

      expect(report.unifiedTax.rate).toBe(TAX_RATES.FOP_UNIFIED_TAX)
      expect(report.esv.rate).toBe(TAX_RATES.FOP_ESV_RATE)
      expect(report.esv.base).toBe(TAX_RATES.FOP_ESV_MIN_WAGE)
      expect(report.militaryTax.rate).toBe(TAX_RATES.MILITARY_TAX)
    })
  })

  describe('formatTaxReportText', () => {
    it('should format VAT report as text', () => {
      const report = generateTaxReportVAT({
        estimateNumber: 'EST-001',
        estimateTitle: 'Ремонт',
        projectTitle: 'Офіс',
        clientName: 'ТОВ ABC',
        subtotal: 100000,
        totalLabor: 20000,
        totalMargin: 30000,
        pdvAmount: 20000,
        esvAmount: 4400,
        pdfoAmount: 3600,
        militaryTaxAmount: 300,
        profitTaxAmount: 3906,
        totalTaxAmount: 12206,
        netProfit: 17794,
        effectiveTaxRate: 40.69,
      })

      const text = formatTaxReportText('VAT', report)

      // Перевірка структури звіту
      expect(text).toContain('ПОДАТКОВИЙ ЗВІТ')
      expect(text).toContain('EST-001')
      expect(text).toContain('Ремонт')
      expect(text).toContain('Офіс')
      expect(text).toContain('ТОВ ABC')
      expect(text).toContain('ТОВ з ПДВ')

      // Перевірка фінансових показників
      expect(text).toContain('100000.00')
      expect(text).toContain('20000.00')
      expect(text).toContain('30000.00')

      // Перевірка податків
      expect(text).toContain('ПДВ')
      expect(text).toContain('ЄСВ')
      expect(text).toContain('ПДФО')
      expect(text).toContain('Військовий збір')
      expect(text).toContain('Податок на прибуток')

      // Перевірка підсумку
      expect(text).toContain('12206.00')
      expect(text).toContain('17794.00')
      expect(text).toContain('40.69')
    })

    it('should format FOP report as text', () => {
      const report = generateTaxReportFOP({
        estimateNumber: 'EST-FOP-001',
        estimateTitle: 'Дизайн',
        projectTitle: 'Квартира',
        clientName: 'Іван Петренко',
        subtotal: 100000,
        totalMargin: 25000,
        unifiedTaxAmount: 5000,
        esvAmount: 1760,
        militaryTaxAmount: 1500,
        totalTaxAmount: 8260,
        netProfit: 16740,
        effectiveTaxRate: 33.04,
      })

      const text = formatTaxReportText('FOP', report)

      // Перевірка структури
      expect(text).toContain('ПОДАТКОВИЙ ЗВІТ')
      expect(text).toContain('EST-FOP-001')
      expect(text).toContain('Дизайн')
      expect(text).toContain('ФОП 3 група')

      // Перевірка податків ФОП
      expect(text).toContain('Єдиний податок')
      expect(text).toContain('5%')
      expect(text).toContain('5000.00')

      expect(text).toContain('ЄСВ')
      expect(text).toContain('1760.00')

      expect(text).toContain('Військовий збір')
      expect(text).toContain('1500.00')

      // Підсумок
      expect(text).toContain('8260.00')
      expect(text).toContain('16740.00')
      expect(text).toContain('33.04')

      // НЕ має містити ПДВ та податок на прибуток
      expect(text).not.toContain('Податок на прибуток')
    })

    it('should contain separator lines', () => {
      const report = generateTaxReportVAT({
        estimateNumber: 'EST-001',
        estimateTitle: 'Test',
        projectTitle: 'Test',
        clientName: 'Test',
        subtotal: 0,
        totalLabor: 0,
        totalMargin: 0,
        pdvAmount: 0,
        esvAmount: 0,
        pdfoAmount: 0,
        militaryTaxAmount: 0,
        profitTaxAmount: 0,
        totalTaxAmount: 0,
        netProfit: 0,
        effectiveTaxRate: 0,
      })

      const text = formatTaxReportText('VAT', report)

      // Перевірка форматування
      expect(text).toContain('='.repeat(80))
      expect(text).toContain('-'.repeat(80))
      expect(text).toContain('ФІНАНСОВІ ПОКАЗНИКИ')
      expect(text).toContain('ДЕТАЛЬНИЙ РОЗПОДІЛ ПОДАТКІВ')
      expect(text).toContain('ПІДСУМОК')
    })
  })

  describe('getTaxSummary', () => {
    it('should return VAT summary', () => {
      const summary = getTaxSummary('VAT', 12206, 40.69)

      expect(summary).toContain('ТОВ з ПДВ')
      expect(summary).toContain('12206.00')
      expect(summary).toContain('40.7')
    })

    it('should return FOP summary', () => {
      const summary = getTaxSummary('FOP', 8260, 33.04)

      expect(summary).toContain('ФОП 3 група')
      expect(summary).toContain('8260.00')
      expect(summary).toContain('33.0')
    })

    it('should return CASH summary', () => {
      const summary = getTaxSummary('CASH', 0, 0)

      expect(summary).toBe('Готівка: без податків')
    })

    it('should format numbers correctly', () => {
      const summary = getTaxSummary('VAT', 12345.67, 45.678)

      expect(summary).toContain('12345.67')
      expect(summary).toContain('45.7') // Rounded to 1 decimal
    })

    it('should handle zero values', () => {
      const summaryVAT = getTaxSummary('VAT', 0, 0)
      const summaryFOP = getTaxSummary('FOP', 0, 0)

      expect(summaryVAT).toContain('0.00')
      expect(summaryFOP).toContain('0.00')
    })
  })

  describe('Real-world integration scenarios', () => {
    it('should generate complete report for typical construction project', () => {
      const report = generateTaxReportVAT({
        estimateNumber: 'EST-2025-042',
        estimateTitle: 'Будівництво складу',
        projectTitle: 'Логістичний комплекс Phase 1',
        clientName: 'ТОВ Логістика Плюс',
        subtotal: 5000000,
        totalLabor: 800000,
        totalMargin: 1500000,
        pdvAmount: 1000000,
        esvAmount: 176000,
        pdfoAmount: 144000,
        militaryTaxAmount: 12000,
        profitTaxAmount: 212760,
        totalTaxAmount: 544760,
        netProfit: 955240,
        effectiveTaxRate: 36.32,
      })

      const text = formatTaxReportText('VAT', report)
      const summary = getTaxSummary('VAT', 544760, 36.32)

      expect(report.subtotal).toBe(5000000)
      expect(report.summary.netProfit).toBe(955240)
      expect(text).toContain('Будівництво складу')
      expect(summary).toContain('544760.00')
    })

    it('should generate complete report for FOP freelancer', () => {
      const report = generateTaxReportFOP({
        estimateNumber: 'EST-FOP-2025-015',
        estimateTitle: 'Веб-дизайн сайту',
        projectTitle: 'Корпоративний сайт',
        clientName: 'ТОВ Маркетинг Студія',
        subtotal: 50000,
        totalMargin: 35000,
        unifiedTaxAmount: 2500,
        esvAmount: 1760,
        militaryTaxAmount: 750,
        totalTaxAmount: 5010,
        netProfit: 29990,
        effectiveTaxRate: 14.31,
      })

      const text = formatTaxReportText('FOP', report)
      const summary = getTaxSummary('FOP', 5010, 14.31)

      expect(report.subtotal).toBe(50000)
      expect(report.summary.netProfit).toBe(29990)
      expect(text).toContain('Веб-дизайн')
      expect(summary).toContain('5010.00')
    })
  })
})
