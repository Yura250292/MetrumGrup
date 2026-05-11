import { buildPlan, type CounterpartyCandidate } from "../build-plan";
import type { RawInvoiceRow } from "../parse-excel";
import type { ProjectCandidate } from "../match-project";

function row(over: Partial<RawInvoiceRow>): RawInvoiceRow {
  return {
    rowNumber: 1,
    supplier: "ТзОВ Бударена",
    invoiceNumber: "1 від 01.01.25",
    destination: null,
    amount: 1000,
    deliveryDate: new Date("2025-01-01"),
    paymentDate: new Date("2025-01-15"),
    isPaid: true,
    issues: [],
    ...over,
  };
}

describe("buildPlan", () => {
  it("кластеризує варіанти назви в один кластер", () => {
    const rows = [
      row({ rowNumber: 5, supplier: "бударена", amount: 100 }),
      row({ rowNumber: 6, supplier: "ТзОВ Бударена", amount: 200 }),
      row({ rowNumber: 7, supplier: 'ТзОВ "Бударена"', amount: 300 }),
      row({ rowNumber: 8, supplier: "ТОВ Альянс Фасад", amount: 500 }),
    ];
    const plan = buildPlan({
      rows,
      counterpartiesGroup: [],
      counterpartiesStudio: [],
      projectsByFirm: { group: [], studio: [] },
    });
    expect(plan.clusters).toHaveLength(2);
    const budarena = plan.clusters.find((c) => c.normalizedKey === "бударена");
    expect(budarena).toBeDefined();
    expect(budarena!.rowCount).toBe(3);
    expect(budarena!.rawNames).toHaveLength(3);
    expect(budarena!.totalAmount).toBe(600);
    expect(budarena!.displayName).toBe('ТзОВ "Бударена"'); // найдовший
  });

  it("матчить кластер на existing Counterparty", () => {
    const existing: CounterpartyCandidate[] = [
      {
        id: "cp-1",
        name: "ТзОВ «Бударена»",
        firmId: "metrum-group",
        edrpou: null,
        taxId: null,
      },
    ];
    const plan = buildPlan({
      rows: [row({ supplier: "бударена" })],
      counterpartiesGroup: existing,
      counterpartiesStudio: [],
      projectsByFirm: { group: [], studio: [] },
    });
    expect(plan.clusters[0]!.groupMatch).toEqual({
      id: "cp-1",
      name: "ТзОВ «Бударена»",
    });
    expect(plan.clusters[0]!.studioMatch).toBeNull();
  });

  it("підраховує totals paid/debt", () => {
    const rows = [
      row({ rowNumber: 5, isPaid: true, amount: 100 }),
      row({ rowNumber: 6, isPaid: true, amount: 200 }),
      row({ rowNumber: 7, isPaid: false, amount: 50 }),
    ];
    const plan = buildPlan({
      rows,
      counterpartiesGroup: [],
      counterpartiesStudio: [],
      projectsByFirm: { group: [], studio: [] },
    });
    expect(plan.totals.paidCount).toBe(2);
    expect(plan.totals.paidSum).toBe(300);
    expect(plan.totals.debtCount).toBe(1);
    expect(plan.totals.debtSum).toBe(50);
  });

  it("матчить 'Куди везли' на Project з достатньою confidence", () => {
    const projects: ProjectCandidate[] = [
      {
        id: "proj-zelena",
        title: "Зелена 115",
        slug: "zelena-115",
        address: "вул. Зелена 115",
      },
    ];
    const plan = buildPlan({
      rows: [
        row({ destination: "матеріали на зелену 115 з доставкою" }),
        row({ destination: "оренда вишки на форум" }), // не матчиться
      ],
      counterpartiesGroup: [],
      counterpartiesStudio: [],
      projectsByFirm: { group: projects, studio: [] },
    });
    expect(plan.invoices[0]!.matchedProjectId).toBe("proj-zelena");
    expect(plan.invoices[0]!.matchedProjectConfidence).toBeGreaterThanOrEqual(0.7);
    expect(plan.invoices[1]!.matchedProjectId).toBeNull();
    expect(plan.totals.matchedToProject).toBe(1);
  });

  it("новий кластер показує groupMatch=null і studioMatch=null", () => {
    const plan = buildPlan({
      rows: [row({ supplier: "Зовсім Нова Контора" })],
      counterpartiesGroup: [
        {
          id: "x",
          name: "Інша Компанія",
          firmId: "metrum-group",
          edrpou: null,
          taxId: null,
        },
      ],
      counterpartiesStudio: [],
      projectsByFirm: { group: [], studio: [] },
    });
    expect(plan.clusters[0]!.groupMatch).toBeNull();
    expect(plan.clusters[0]!.studioMatch).toBeNull();
    expect(plan.totals.newCounterpartiesInGroup).toBe(1);
    expect(plan.totals.newCounterpartiesInStudio).toBe(1);
  });
});
