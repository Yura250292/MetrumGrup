import { describe, it, expect } from '@jest/globals'
import {
  calculateFinancials,
  calculateTaxesLLCWithVAT,
  calculateTaxesFOP3rdGroup,
  getTaxRate,
  getTaxLabel,
  TAX_RATES,
  decimalToNumber,
  numberToDecimal,
} from '../financial-calculations'
import { TaxationType } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'

describe('financial-calculations', () => {
  describe('calculateFinancials', () => {
    describe('VAT taxation', () => {
      it('should calculate financials with VAT correctly', () => {
        const result = calculateFinancials({
          taxationType: 'VAT',
          globalMarginPercent: 30,
          logisticsCost: 5000,
          totalLabor: 20000,
          items: [
            { amount: 100000, useCustomMargin: false },
            { amount: 50000, useCustomMargin: false },
          ],
        })

        // Перевірка базових розрахунків
        expect(result.items).toHaveLength(2)
        expect(result.items[0].priceWithMargin).toBe(130000) // 100000 * 1.3
        expect(result.items[0].marginAmount).toBe(30000)
        expect(result.items[1].priceWithMargin).toBe(65000) // 50000 * 1.3
        expect(result.items[1].marginAmount).toBe(15000)

        // Перевірка підсумків
        expect(result.subtotal).toBe(195000) // 130000 + 65000
        expect(result.totalMargin).toBe(45000) // 30000 + 15000

        // Перевірка ПДВ (20% від subtotal)
        expect(result.taxAmount).toBe(39000) // 195000 * 0.2

        // Фінальна сума
        expect(result.finalAmount).toBe(239000) // 195000 + 39000 + 5000

        // Перевірка детального розподілу податків
        expect(result.taxBreakdown).toBeDefined()
        expect(result.taxBreakdown?.pdvAmount).toBe(39000)
        expect(result.taxBreakdown?.esvAmount).toBe(4400) // 20000 * 0.22
        expect(result.taxBreakdown?.pdfoAmount).toBe(3600) // 20000 * 0.18
        expect(result.taxBreakdown?.militaryTaxAmount).toBe(300) // 20000 * 0.015
      })

      it('should apply custom margins per item', () => {
        const result = calculateFinancials({
          taxationType: 'VAT',
          globalMarginPercent: 20,
          logisticsCost: 0,
          items: [
            { amount: 100000, useCustomMargin: false },
            { amount: 50000, useCustomMargin: true, customMarginPercent: 50 },
          ],
        })

        expect(result.items[0].priceWithMargin).toBe(120000) // 100000 * 1.2
        expect(result.items[0].marginAmount).toBe(20000)
        expect(result.items[1].priceWithMargin).toBe(75000) // 50000 * 1.5
        expect(result.items[1].marginAmount).toBe(25000)

        expect(result.subtotal).toBe(195000)
        expect(result.totalMargin).toBe(45000)
      })

      it('should handle zero labor costs', () => {
        const result = calculateFinancials({
          taxationType: 'VAT',
          globalMarginPercent: 30,
          logisticsCost: 0,
          totalLabor: 0,
          items: [{ amount: 100000, useCustomMargin: false }],
        })

        expect(result.taxBreakdown?.esvAmount).toBe(0)
        expect(result.taxBreakdown?.pdfoAmount).toBe(0)
        expect(result.taxBreakdown?.militaryTaxAmount).toBe(0)
      })
    })

    describe('FOP taxation', () => {
      it('should calculate financials with FOP 3rd group correctly', () => {
        const result = calculateFinancials({
          taxationType: 'FOP',
          globalMarginPercent: 30,
          logisticsCost: 3000,
          items: [{ amount: 100000, useCustomMargin: false }],
        })

        expect(result.subtotal).toBe(130000) // 100000 * 1.3
        expect(result.totalMargin).toBe(30000)

        // Єдиний податок (5% від subtotal)
        expect(result.taxAmount).toBe(6500) // 130000 * 0.05

        // Фінальна сума
        expect(result.finalAmount).toBe(139500) // 130000 + 6500 + 3000

        // Детальний розподіл
        expect(result.taxBreakdown?.unifiedTaxAmount).toBe(6500)
        expect(result.taxBreakdown?.esvAmount).toBe(1760) // 8000 * 0.22
        expect(result.taxBreakdown?.militaryTaxAmount).toBe(1950) // 130000 * 0.015
      })

      it('should not include VAT for FOP', () => {
        const result = calculateFinancials({
          taxationType: 'FOP',
          globalMarginPercent: 20,
          logisticsCost: 0,
          items: [{ amount: 50000, useCustomMargin: false }],
        })

        expect(result.taxBreakdown?.pdvAmount).toBe(0)
        expect(result.taxBreakdown?.profitTaxAmount).toBe(0)
      })
    })

    describe('CASH taxation', () => {
      it('should calculate without any taxes', () => {
        const result = calculateFinancials({
          taxationType: 'CASH',
          globalMarginPercent: 25,
          logisticsCost: 2000,
          items: [{ amount: 80000, useCustomMargin: false }],
        })

        expect(result.subtotal).toBe(100000) // 80000 * 1.25
        expect(result.totalMargin).toBe(20000)
        expect(result.taxAmount).toBe(0)
        expect(result.finalAmount).toBe(102000) // 100000 + 0 + 2000
        expect(result.taxBreakdown).toBeUndefined()
      })
    })

    describe('edge cases', () => {
      it('should handle zero amounts', () => {
        const result = calculateFinancials({
          taxationType: 'VAT',
          globalMarginPercent: 30,
          logisticsCost: 0,
          items: [],
        })

        expect(result.subtotal).toBe(0)
        expect(result.totalMargin).toBe(0)
        expect(result.taxAmount).toBe(0)
        expect(result.finalAmount).toBe(0)
      })

      it('should handle very large amounts', () => {
        const result = calculateFinancials({
          taxationType: 'VAT',
          globalMarginPercent: 20,
          logisticsCost: 0,
          totalLabor: 0,
          items: [{ amount: 10000000, useCustomMargin: false }],
        })

        expect(result.subtotal).toBe(12000000)
        expect(result.taxAmount).toBe(2400000) // 20% VAT
        expect(result.finalAmount).toBe(14400000)
      })

      it('should round correctly to 2 decimal places', () => {
        const result = calculateFinancials({
          taxationType: 'VAT',
          globalMarginPercent: 33.33,
          logisticsCost: 0,
          totalLabor: 0,
          items: [{ amount: 99.99, useCustomMargin: false }],
        })

        // Всі значення мають бути округлені до 2 знаків
        expect(result.subtotal).toBe(133.32)
        expect(result.totalMargin).toBe(33.33)
      })
    })
  })

  describe('calculateTaxesLLCWithVAT', () => {
    it('should calculate all tax components correctly', () => {
      const result = calculateTaxesLLCWithVAT({
        subtotal: 100000,
        totalLabor: 20000,
        totalMargin: 30000,
      })

      // ПДВ: 100000 * 20% = 20000
      expect(result.pdvAmount).toBe(20000)

      // ЄСВ: 20000 * 22% = 4400
      expect(result.esvAmount).toBe(4400)

      // ПДФО: 20000 * 18% = 3600
      expect(result.pdfoAmount).toBe(3600)

      // Військовий збір: 20000 * 1.5% = 300
      expect(result.militaryTaxAmount).toBe(300)

      // Прибуток до оподаткування: 30000 - 4400 - 3600 - 300 = 21700
      // Податок на прибуток: 21700 * 18% = 3906
      expect(result.profitTaxAmount).toBe(3906)

      // Загальні податки (без ПДВ): 4400 + 3600 + 300 + 3906 = 12206
      expect(result.totalTaxAmount).toBe(12206)

      // Чистий прибуток: 30000 - 12206 = 17794
      expect(result.netProfit).toBe(17794)

      // Ефективна ставка: (12206 / 30000) * 100 = 40.69%
      expect(result.effectiveTaxRate).toBe(40.69)
    })

    it('should handle zero labor costs', () => {
      const result = calculateTaxesLLCWithVAT({
        subtotal: 100000,
        totalLabor: 0,
        totalMargin: 25000,
      })

      expect(result.esvAmount).toBe(0)
      expect(result.pdfoAmount).toBe(0)
      expect(result.militaryTaxAmount).toBe(0)

      // Податок на прибуток: 25000 * 18% = 4500
      expect(result.profitTaxAmount).toBe(4500)
      expect(result.netProfit).toBe(20500) // 25000 - 4500
    })

    it('should not apply profit tax for negative profit', () => {
      const result = calculateTaxesLLCWithVAT({
        subtotal: 100000,
        totalLabor: 50000,
        totalMargin: 10000, // Маленький прибуток
      })

      // Витрати на ЗП: 50000 * (22% + 18% + 1.5%) = 20750
      // Прибуток після витрат: 10000 - 20750 = -10750 (збиток)
      expect(result.profitTaxAmount).toBe(0)
      expect(result.netProfit).toBeLessThan(0)
    })

    it('should verify TAX_RATES constants', () => {
      expect(TAX_RATES.PDV).toBe(20)
      expect(TAX_RATES.PROFIT_TAX).toBe(18)
      expect(TAX_RATES.ESV_EMPLOYER).toBe(22)
      expect(TAX_RATES.PDFO).toBe(18)
      expect(TAX_RATES.MILITARY_TAX).toBe(1.5)
    })
  })

  describe('calculateTaxesFOP3rdGroup', () => {
    it('should calculate FOP taxes correctly', () => {
      const result = calculateTaxesFOP3rdGroup({
        subtotal: 100000,
        totalMargin: 25000,
      })

      // Єдиний податок: 100000 * 5% = 5000
      expect(result.unifiedTaxAmount).toBe(5000)

      // ЄСВ: 8000 * 22% = 1760 (від мін. ЗП)
      expect(result.esvAmount).toBe(1760)

      // Військовий збір: 100000 * 1.5% = 1500
      expect(result.militaryTaxAmount).toBe(1500)

      // Загальні податки: 5000 + 1760 + 1500 = 8260
      expect(result.totalTaxAmount).toBe(8260)

      // Чистий прибуток: 25000 - 8260 = 16740
      expect(result.netProfit).toBe(16740)

      // Ефективна ставка: (8260 / 25000) * 100 = 33.04%
      expect(result.effectiveTaxRate).toBe(33.04)
    })

    it('should use custom ESV base', () => {
      const result = calculateTaxesFOP3rdGroup({
        subtotal: 100000,
        totalMargin: 25000,
        esvBase: 15000, // Вища база для ЄСВ
      })

      // ЄСВ: 15000 * 22% = 3300
      expect(result.esvAmount).toBe(3300)
    })

    it('should handle zero margin', () => {
      const result = calculateTaxesFOP3rdGroup({
        subtotal: 50000,
        totalMargin: 0,
      })

      expect(result.effectiveTaxRate).toBe(0)
      expect(result.netProfit).toBeLessThan(0) // Збиток через ЄСВ та військовий збір
    })

    it('should verify FOP tax rates', () => {
      expect(TAX_RATES.FOP_UNIFIED_TAX).toBe(5)
      expect(TAX_RATES.FOP_ESV_MIN_WAGE).toBe(8000)
      expect(TAX_RATES.FOP_ESV_RATE).toBe(22)
    })
  })

  describe('getTaxRate', () => {
    it('should return correct tax rate for VAT', () => {
      expect(getTaxRate('VAT')).toBe(20)
    })

    it('should return correct tax rate for FOP', () => {
      expect(getTaxRate('FOP')).toBe(5)
    })

    it('should return 0 for CASH', () => {
      expect(getTaxRate('CASH')).toBe(0)
    })
  })

  describe('getTaxLabel', () => {
    it('should return correct label for VAT', () => {
      expect(getTaxLabel('VAT')).toBe('ТОВ з ПДВ 20%')
    })

    it('should return correct label for FOP', () => {
      expect(getTaxLabel('FOP')).toBe('ФОП 3 група 5%')
    })

    it('should return correct label for CASH', () => {
      expect(getTaxLabel('CASH')).toBe('Готівка (без податків)')
    })

    it('should return "Невідомо" for unknown type', () => {
      expect(getTaxLabel('UNKNOWN' as TaxationType)).toBe('Невідомо')
    })
  })

  describe('Decimal conversion utilities', () => {
    it('should convert Decimal to number', () => {
      const decimal = new Decimal('123.45')
      expect(decimalToNumber(decimal)).toBe(123.45)
    })

    it('should return 0 for null Decimal', () => {
      expect(decimalToNumber(null)).toBe(0)
    })

    it('should return 0 for undefined Decimal', () => {
      expect(decimalToNumber(undefined)).toBe(0)
    })

    it('should convert number to Decimal', () => {
      const decimal = numberToDecimal(456.78)
      expect(decimal.toString()).toBe('456.78')
      expect(decimal).toBeInstanceOf(Decimal)
    })

    it('should handle very large numbers in conversion', () => {
      const decimal = numberToDecimal(999999999.99)
      expect(decimalToNumber(decimal)).toBe(999999999.99)
    })
  })

  describe('Real-world scenarios', () => {
    it('should calculate a typical small construction project with VAT', () => {
      // Проєкт на 500,000 грн з роботами 100,000 грн, націнка 25%
      const result = calculateFinancials({
        taxationType: 'VAT',
        globalMarginPercent: 25,
        logisticsCost: 10000,
        totalLabor: 100000,
        items: [
          { amount: 300000, useCustomMargin: false }, // Матеріали
          { amount: 100000, useCustomMargin: false }, // Роботи
        ],
      })

      expect(result.subtotal).toBe(500000)
      expect(result.totalMargin).toBe(100000)
      expect(result.taxAmount).toBe(100000) // 20% VAT
      expect(result.finalAmount).toBe(610000)

      // Чистий прибуток після всіх податків
      expect(result.taxBreakdown?.netProfit).toBeGreaterThan(0)
      expect(result.taxBreakdown?.netProfit).toBeLessThan(result.totalMargin)
    })

    it('should calculate a FOP freelance project', () => {
      // Невеликий проєкт ФОП на 150,000 грн з націнкою 40%
      const result = calculateFinancials({
        taxationType: 'FOP',
        globalMarginPercent: 40,
        logisticsCost: 5000,
        items: [{ amount: 100000, useCustomMargin: false }],
      })

      expect(result.subtotal).toBe(140000)
      expect(result.totalMargin).toBe(40000)

      // ФОП має менше податків ніж ТОВ
      const effectiveRate = result.taxBreakdown?.effectiveTaxRate || 0
      expect(effectiveRate).toBeLessThan(50) // Менше 50%
    })
  })
})
