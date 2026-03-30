import { EstimateCalculator } from "../estimate-calculations";
import Decimal from "decimal.js";
import type { EstimateItem, EstimateSection } from "@/lib/schemas/estimate";

describe("EstimateCalculator", () => {
  describe("Floating-point precision", () => {
    it("should handle 0.1 + 0.2 correctly (JavaScript fails this)", () => {
      const item: EstimateItem = {
        description: "Test item",
        unit: "шт",
        quantity: new Decimal(0.1),
        unitPrice: new Decimal(0.2),
        laborHours: new Decimal(0),
        laborRate: new Decimal(0),
      };

      const result = EstimateCalculator.calculateItemAmount(item);

      // JavaScript: 0.1 * 0.2 = 0.020000000000000004
      // Decimal.js: 0.1 * 0.2 = 0.02
      expect(result.toString()).toBe("0.02");
      expect(result.toNumber()).toBe(0.02);
    });

    it("should handle complex decimal multiplication", () => {
      const item: EstimateItem = {
        description: "Складна позиція",
        unit: "м²",
        quantity: new Decimal(123.456),
        unitPrice: new Decimal(789.12),
        laborHours: new Decimal(5.5),
        laborRate: new Decimal(250),
        };

      // Materials: 123.456 × 789.12 = 97,434.72672
      // Labor: 5.5 × 250 = 1,375.00
      // Total: 98,809.72672 → 98,809.73 (округлено)

      const materialCost = EstimateCalculator.calculateMaterialCost(item);
      const laborCost = EstimateCalculator.calculateLaborCost(item);
      const totalAmount = EstimateCalculator.calculateItemAmount(item);

      expect(materialCost.toFixed(2)).toBe("97434.73");
      expect(laborCost.toFixed(2)).toBe("1375.00");
      expect(totalAmount.toFixed(2)).toBe("98809.73");
    });
  });

  describe("calculateItemAmount", () => {
    it("should calculate item amount for materials only", () => {
      const item: EstimateItem = {
        description: "Цемент",
        unit: "мішок",
        quantity: new Decimal(10),
        unitPrice: new Decimal(150.50),
        laborHours: new Decimal(0),
        laborRate: new Decimal(0),
      };

      const result = EstimateCalculator.calculateItemAmount(item);
      expect(result.toFixed(2)).toBe("1505.00");
    });

    it("should calculate item amount for materials + labor", () => {
      const item: EstimateItem = {
        description: "Встановлення плитки",
        unit: "м²",
        quantity: new Decimal(50),
        unitPrice: new Decimal(300),
        laborHours: new Decimal(25),
        laborRate: new Decimal(200),
      };

      // Materials: 50 × 300 = 15,000
      // Labor: 25 × 200 = 5,000
      // Total: 20,000

      const result = EstimateCalculator.calculateItemAmount(item);
      expect(result.toFixed(2)).toBe("20000.00");
    });
  });

  describe("calculateTotals", () => {
    it("should calculate totals for multiple sections", () => {
      const sections: EstimateSection[] = [
        {
          title: "Демонтаж",
          items: [
            {
              description: "Демонтаж стін",
              unit: "м²",
              quantity: new Decimal(10),
              unitPrice: new Decimal(100),
              laborHours: new Decimal(5),
              laborRate: new Decimal(150),
            },
          ],
        },
        {
          title: "Стіни",
          items: [
            {
              description: "Шпаклівка",
              unit: "м²",
              quantity: new Decimal(50),
              unitPrice: new Decimal(200),
              laborHours: new Decimal(10),
              laborRate: new Decimal(180),
            },
          ],
        },
      ];

      // Секція 1: 10×100 + 5×150 = 1,000 + 750 = 1,750
      // Секція 2: 50×200 + 10×180 = 10,000 + 1,800 = 11,800
      // Матеріали: 1,000 + 10,000 = 11,000
      // Роботи: 750 + 1,800 = 2,550
      // Subtotal: 13,550
      // Overhead (15%): 2,032.50
      // Total: 15,582.50

      const totals = EstimateCalculator.calculateTotals(sections, new Decimal(15));

      expect(totals.totalMaterials.toFixed(2)).toBe("11000.00");
      expect(totals.totalLabor.toFixed(2)).toBe("2550.00");
      expect(totals.overhead.toFixed(2)).toBe("2032.50");
      expect(totals.totalAmount.toFixed(2)).toBe("15582.50");
    });

    it("should handle zero overhead", () => {
      const sections: EstimateSection[] = [
        {
          title: "Тест",
          items: [
            {
              description: "Позиція",
              unit: "шт",
              quantity: new Decimal(1),
              unitPrice: new Decimal(1000),
              laborHours: new Decimal(0),
              laborRate: new Decimal(0),
            },
          ],
        },
      ];

      const totals = EstimateCalculator.calculateTotals(sections, new Decimal(0));

      expect(totals.totalMaterials.toFixed(2)).toBe("1000.00");
      expect(totals.totalLabor.toFixed(2)).toBe("0.00");
      expect(totals.overhead.toFixed(2)).toBe("0.00");
      expect(totals.totalAmount.toFixed(2)).toBe("1000.00");
    });
  });

  describe("applyDiscount", () => {
    it("should apply 10% discount correctly", () => {
      const totalAmount = new Decimal(10000);
      const discount = new Decimal(10);

      const result = EstimateCalculator.applyDiscount(totalAmount, discount);

      expect(result.toFixed(2)).toBe("9000.00");
    });

    it("should apply 0% discount (no change)", () => {
      const totalAmount = new Decimal(5000);
      const discount = new Decimal(0);

      const result = EstimateCalculator.applyDiscount(totalAmount, discount);

      expect(result.toFixed(2)).toBe("5000.00");
    });

    it("should handle decimal discount percentages", () => {
      const totalAmount = new Decimal(1000);
      const discount = new Decimal(12.5); // 12.5%

      const result = EstimateCalculator.applyDiscount(totalAmount, discount);

      // 1000 × (1 - 0.125) = 875
      expect(result.toFixed(2)).toBe("875.00");
    });
  });

  describe("Conversion methods", () => {
    it("toNumber should round to specified precision", () => {
      const decimal = new Decimal("123.456789");

      expect(EstimateCalculator.toNumber(decimal, 2)).toBe(123.46);
      expect(EstimateCalculator.toNumber(decimal, 0)).toBe(123);
      expect(EstimateCalculator.toNumber(decimal, 4)).toBe(123.4568);
    });

    it("toString should return string with precision", () => {
      const decimal = new Decimal("999.999");

      expect(EstimateCalculator.toString(decimal, 2)).toBe("1000.00");
      expect(EstimateCalculator.toString(decimal, 3)).toBe("999.999");
    });

    it("format should use Ukrainian locale", () => {
      const decimal = new Decimal("12345.67");

      const formatted = EstimateCalculator.format(decimal);

      // Українська локаль використовує пробіл як розділювач тисяч і кому як десятковий роздільник
      // Але toLocaleString може повертати різний формат залежно від системи
      // Тому перевіряємо що число є і має 2 знаки після коми
      expect(formatted).toMatch(/12[,\s.]?345[,.]67/);
    });

    it("formatCurrency should optionally add currency symbol", () => {
      const decimal = new Decimal("1000");

      const withoutCurrency = EstimateCalculator.formatCurrency(decimal, false);
      const withCurrency = EstimateCalculator.formatCurrency(decimal, true);

      expect(withoutCurrency).toMatch(/1[,\s.]?000[,.]00/);
      expect(withCurrency).toMatch(/1[,\s.]?000[,.]00\s*₴/);
    });
  });

  describe("Edge cases", () => {
    it("should handle very small numbers", () => {
      const item: EstimateItem = {
        description: "Мала кількість",
        unit: "шт",
        quantity: new Decimal(0.001),
        unitPrice: new Decimal(0.50),
        laborHours: new Decimal(0),
        laborRate: new Decimal(0),
      };

      const result = EstimateCalculator.calculateItemAmount(item);
      expect(result.toFixed(3)).toBe("0.001");
    });

    it("should handle very large numbers", () => {
      const item: EstimateItem = {
        description: "Велика сума",
        unit: "шт",
        quantity: new Decimal(10000),
        unitPrice: new Decimal(99.99),
        laborHours: new Decimal(100),
        laborRate: new Decimal(500),
      };

      // Materials: 10000 × 99.99 = 999,900
      // Labor: 100 × 500 = 50,000
      // Total: 1,049,900

      const result = EstimateCalculator.calculateItemAmount(item);
      expect(result.toFixed(2)).toBe("1049900.00");
    });

    it("should handle 100+ items without precision loss", () => {
      const items: EstimateItem[] = Array.from({ length: 150 }, (_, i) => ({
        description: `Позиція ${i + 1}`,
        unit: "шт",
        quantity: new Decimal(1.23),
        unitPrice: new Decimal(45.67),
        laborHours: new Decimal(0.5),
        laborRate: new Decimal(100),
      }));

      const section: EstimateSection = {
        title: "Велика секція",
        items,
      };

      // Single item: 1.23 × 45.67 + 0.5 × 100 = 56.1741 + 50 = 106.1741
      // 150 items: 106.1741 × 150 = 15,926.115 → 15,926.12

      const total = EstimateCalculator.calculateSectionTotal(section);
      expect(total.toFixed(2)).toBe("15926.12");
    });
  });
});
