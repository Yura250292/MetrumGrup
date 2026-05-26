import { peekNextCONumber } from "../numbering";

describe("peekNextCONumber", () => {
  test("starts at CO-YYYY-001 when no records exist", async () => {
    const tx = {
      changeOrder: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as unknown as Parameters<typeof peekNextCONumber>[0];
    const number = await peekNextCONumber(tx, "metrum-group", new Date("2026-05-25T10:00:00Z"));
    expect(number).toBe("CO-2026-001");
  });

  test("increments numeric suffix from last record", async () => {
    const tx = {
      changeOrder: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ number: "CO-2026-017" }),
      },
    } as unknown as Parameters<typeof peekNextCONumber>[0];
    const number = await peekNextCONumber(tx, "metrum-group", new Date("2026-05-25T10:00:00Z"));
    expect(number).toBe("CO-2026-018");
  });

  test("pads with zeros for sub-100 numbers", async () => {
    const tx = {
      changeOrder: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ number: "CO-2026-099" }),
      },
    } as unknown as Parameters<typeof peekNextCONumber>[0];
    const number = await peekNextCONumber(tx, "metrum-group", new Date("2026-05-25T10:00:00Z"));
    expect(number).toBe("CO-2026-100");
  });

  test("uses Kyiv year for prefix", async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const tx = { changeOrder: { findFirst } } as unknown as Parameters<typeof peekNextCONumber>[0];
    // 31 December 23:00 UTC = 2 January 01:00 Kyiv → still 2026 vs new year
    await peekNextCONumber(tx, "metrum-group", new Date("2026-12-31T23:00:00Z"));
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          number: { startsWith: "CO-2027-" },
        }),
      }),
    );
  });

  test("scopes by firmId in query", async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const tx = { changeOrder: { findFirst } } as unknown as Parameters<typeof peekNextCONumber>[0];
    await peekNextCONumber(tx, "metrum-studio", new Date("2026-05-25T10:00:00Z"));
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ firmId: "metrum-studio" }),
      }),
    );
  });
});
