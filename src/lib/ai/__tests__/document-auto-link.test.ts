import { linkCounterparty, linkProject } from "../document-auto-link";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    counterparty: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    project: {
      findMany: jest.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";

const mockedCounterpartyFindFirst = prisma.counterparty.findFirst as jest.Mock;
const mockedCounterpartyFindMany = prisma.counterparty.findMany as jest.Mock;
const mockedProjectFindMany = prisma.project.findMany as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe("linkCounterparty", () => {
  it("EDRPOU exact match → matchReason=edrpou_exact, score=1", async () => {
    mockedCounterpartyFindFirst.mockResolvedValue({ id: "c1", name: "Будматеріали" });
    const r = await linkCounterparty(
      { name: "Інша назва", edrpou: "12345678" },
      "metrum-group",
    );
    expect(r).toEqual({
      counterpartyId: "c1",
      name: "Будматеріали",
      matchReason: "edrpou_exact",
      score: 1,
    });
    expect(mockedCounterpartyFindFirst).toHaveBeenCalledWith({
      where: { firmId: "metrum-group", edrpou: "12345678", isActive: true },
      select: { id: true, name: true },
    });
  });

  it("без EDRPOU → fuzzy по нормалізованій назві (різні лапки/дефіси)", async () => {
    mockedCounterpartyFindFirst.mockResolvedValue(null);
    mockedCounterpartyFindMany.mockResolvedValue([
      { id: "c1", name: 'ТОВ "Будматеріали-Плюс"' },
      { id: "c2", name: "Інша Фірма" },
    ]);
    const r = await linkCounterparty(
      { name: "ТОВ Будматеріали Плюс" },
      "metrum-group",
    );
    expect(r?.counterpartyId).toBe("c1");
    expect(r?.matchReason).toBe("name_levenshtein");
    expect(r?.score).toBeGreaterThanOrEqual(0.85);
  });

  it("низька similarity → null", async () => {
    mockedCounterpartyFindFirst.mockResolvedValue(null);
    mockedCounterpartyFindMany.mockResolvedValue([
      { id: "c1", name: "Будматеріали" },
    ]);
    const r = await linkCounterparty({ name: "Зовсім інша компанія" }, "metrum-group");
    expect(r).toBeNull();
  });

  it("без EDRPOU і без name → null", async () => {
    const r = await linkCounterparty({}, "metrum-group");
    expect(r).toBeNull();
  });

  it("undefined extracted → null", async () => {
    const r = await linkCounterparty(undefined, "metrum-group");
    expect(r).toBeNull();
  });
});

describe("linkProject", () => {
  it("один title hit → match", async () => {
    mockedProjectFindMany.mockResolvedValueOnce([{ id: "p1", title: "Бабушкіна 12" }]);
    const r = await linkProject({ keyword: "Бабушкіна" }, "metrum-group");
    expect(r?.projectId).toBe("p1");
    expect(r?.matchReason).toBe("title_ilike");
  });

  it(">1 title hit → null (потрібен ручний вибір)", async () => {
    mockedProjectFindMany.mockResolvedValueOnce([
      { id: "p1", title: "Бабушкіна 12" },
      { id: "p2", title: "Бабушкіна 15" },
    ]);
    const r = await linkProject({ keyword: "Бабушкіна" }, "metrum-group");
    expect(r).toBeNull();
  });

  it("title 0 → fallback на address", async () => {
    mockedProjectFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "p1", title: "Будинок А" }]);
    const r = await linkProject(
      { keyword: "невідоме", address: "вул. Хрещатик, 1" },
      "metrum-group",
    );
    expect(r?.projectId).toBe("p1");
    expect(r?.matchReason).toBe("address_ilike");
  });

  it("undefined → null", async () => {
    const r = await linkProject(undefined, "metrum-group");
    expect(r).toBeNull();
  });
});
