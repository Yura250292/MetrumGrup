import { nextNumber } from "../numbering";

/**
 * Unit-тест: мокає `tx.sequence` як in-memory мапу. Перевіряємо:
 *  - формат "PR-YYYY-NNNN"
 *  - per-firm + per-prefix + per-year ізоляція
 *  - послідовність 1..N
 *  - upsert не зачіпає вже існуючий lastValue
 *
 * Атомарність під конкуренцією — це Postgres-level гарантія через row-lock
 * у `UPDATE ... SET ... RETURNING`; покривається integration-тестом у Phase B.
 */
function makeFakeTx() {
  const store = new Map<string, { scope: string; lastValue: number }>();
  return {
    sequence: {
      upsert: jest.fn(async (args: { where: { scope: string }; create: { scope: string; lastValue: number } }) => {
        if (!store.has(args.where.scope)) {
          store.set(args.where.scope, { ...args.create });
        }
        return store.get(args.where.scope);
      }),
      update: jest.fn(async (args: { where: { scope: string }; data: { lastValue: { increment: number } } } ) => {
        const row = store.get(args.where.scope);
        if (!row) throw new Error("sequence.update on non-existent scope");
        row.lastValue += args.data.lastValue.increment;
        return { lastValue: row.lastValue };
      }),
    },
    _store: store,
  };
}

describe("procurement/numbering.nextNumber", () => {
  test("first call returns -0001", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = makeFakeTx() as any;
    const n = await nextNumber(tx, "PR", "metrum-group", 2026);
    expect(n).toBe("PR-2026-0001");
  });

  test("sequential 50 calls produce -0001..-0050", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = makeFakeTx() as any;
    const results: string[] = [];
    for (let i = 0; i < 50; i++) {
      results.push(await nextNumber(tx, "PR", "metrum-group", 2026));
    }
    expect(results[0]).toBe("PR-2026-0001");
    expect(results[49]).toBe("PR-2026-0050");
    expect(new Set(results).size).toBe(50);
  });

  test("per-firm + per-prefix + per-year ізоляція", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = makeFakeTx() as any;
    expect(await nextNumber(tx, "PR", "metrum-group", 2026)).toBe(
      "PR-2026-0001",
    );
    // інша фірма — окремий counter
    expect(await nextNumber(tx, "PR", "metrum-studio", 2026)).toBe(
      "PR-2026-0001",
    );
    // інший префікс — окремий counter
    expect(await nextNumber(tx, "RFQ", "metrum-group", 2026)).toBe(
      "RFQ-2026-0001",
    );
    // інший рік — окремий counter
    expect(await nextNumber(tx, "PR", "metrum-group", 2027)).toBe(
      "PR-2027-0001",
    );
    // повернення до Group/PR/2026 — продовжується з 0002
    expect(await nextNumber(tx, "PR", "metrum-group", 2026)).toBe(
      "PR-2026-0002",
    );
  });

  test("формат 4-digit zero-padded", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = makeFakeTx() as any;
    for (let i = 0; i < 12; i++) {
      await nextNumber(tx, "PO", "metrum-group", 2026);
    }
    // 12-й виклик
    const n = await nextNumber(tx, "PO", "metrum-group", 2026);
    expect(n).toBe("PO-2026-0013");
  });
});
