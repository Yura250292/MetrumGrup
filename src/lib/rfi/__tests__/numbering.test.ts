import { nextRFINumber } from "../numbering";

/**
 * Unit-тест nextRFINumber:
 *  - format "RFI-NNN" (zero-padded to 3)
 *  - sequence 1..N per project
 *  - per-project isolation (projects A та B нумеруються незалежно)
 *  - race-condition (10 паралельних викликів → 10 унікальних номерів)
 *
 * Реальна atomicity — Postgres row-lock через `UPDATE ... SET rfiCounter = rfiCounter + 1`.
 * Цей юніт-мок симулює послідовний апдейт лічильника.
 */
function makeFakeTx() {
  const counters = new Map<string, number>();
  return {
    project: {
      update: jest.fn(async (args: { where: { id: string }; data: { rfiCounter: { increment: number } } }) => {
        const cur = counters.get(args.where.id) ?? 0;
        const next = cur + args.data.rfiCounter.increment;
        counters.set(args.where.id, next);
        return { rfiCounter: next };
      }),
    },
    _counters: counters,
  };
}

describe("rfi/numbering.nextRFINumber", () => {
  test("first call returns RFI-001", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = makeFakeTx() as any;
    const n = await nextRFINumber(tx, "proj-1");
    expect(n).toBe("RFI-001");
  });

  test("sequential 12 calls produce RFI-001..RFI-012", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = makeFakeTx() as any;
    const out: string[] = [];
    for (let i = 0; i < 12; i++) out.push(await nextRFINumber(tx, "proj-1"));
    expect(out[0]).toBe("RFI-001");
    expect(out[2]).toBe("RFI-003");
    expect(out[11]).toBe("RFI-012");
  });

  test("per-project isolation", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = makeFakeTx() as any;
    expect(await nextRFINumber(tx, "A")).toBe("RFI-001");
    expect(await nextRFINumber(tx, "A")).toBe("RFI-002");
    expect(await nextRFINumber(tx, "B")).toBe("RFI-001");
    expect(await nextRFINumber(tx, "B")).toBe("RFI-002");
    expect(await nextRFINumber(tx, "A")).toBe("RFI-003");
  });

  test("Promise.all × 10 produces 10 unique numbers (mocked sequential apply)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = makeFakeTx() as any;
    const results = await Promise.all(Array.from({ length: 10 }, () => nextRFINumber(tx, "proj-x")));
    expect(new Set(results).size).toBe(10);
    for (let i = 1; i <= 10; i++) expect(results).toContain(`RFI-${String(i).padStart(3, "0")}`);
  });
});
