import { summarizeExecution, type EstimateExecutionRow } from "../estimate-execution";

function row(partial: Partial<EstimateExecutionRow>): EstimateExecutionRow {
  return {
    estimateItemId: "i1",
    description: "Test",
    unit: "м²",
    sectionId: null,
    sectionName: null,
    quantityPlanned: 100,
    unitPrice: 50,
    unitCost: 50,
    unitPriceCustomer: 60,
    quantityActual: 0,
    percentDone: 0,
    amountPlanned: 5000,
    amountActual: 0,
    revenuePlanned: 6000,
    revenueActual: 0,
    overrunAmount: 0,
    lastReportAt: null,
    ...partial,
  };
}

describe("summarizeExecution", () => {
  it("повертає нулі для пустого списку", () => {
    expect(summarizeExecution([])).toEqual({
      itemsTotal: 0,
      itemsStarted: 0,
      itemsCompleted: 0,
      amountPlanned: 0,
      amountActual: 0,
      revenuePlanned: 0,
      revenueActual: 0,
      marginPlanned: 0,
      marginActual: 0,
      totalOverrun: 0,
    });
  });

  it("рахує started/completed по фактичному виконанню", () => {
    const rows = [
      row({ quantityActual: 0, percentDone: 0 }), // не почато
      row({ quantityActual: 10, percentDone: 10 }), // почато
      row({ quantityActual: 100, percentDone: 100 }), // завершено
      row({ quantityActual: 150, percentDone: 150 }), // завершено + overrun
    ];
    const s = summarizeExecution(rows);
    expect(s.itemsTotal).toBe(4);
    expect(s.itemsStarted).toBe(3);
    expect(s.itemsCompleted).toBe(2);
  });

  it("сумує грошові обʼєми та overrun", () => {
    const rows = [
      row({ amountPlanned: 1000, amountActual: 800, overrunAmount: 0 }),
      row({ amountPlanned: 2000, amountActual: 2500, overrunAmount: 500 }),
      row({ amountPlanned: 500, amountActual: 0, overrunAmount: 0 }),
    ];
    const s = summarizeExecution(rows);
    expect(s.amountPlanned).toBe(3500);
    expect(s.amountActual).toBe(3300);
    expect(s.totalOverrun).toBe(500);
  });
});
