import {
  normalizeSupplierKey,
  inferCounterpartyType,
  pickDisplayName,
} from "../normalize-supplier";

describe("normalizeSupplierKey", () => {
  it("кластеризує варіанти 'бударена' в один ключ", () => {
    const k1 = normalizeSupplierKey("бударена");
    const k2 = normalizeSupplierKey("ТзОВ Бударена");
    const k3 = normalizeSupplierKey('ТзОВ "Бударена"');
    const k4 = normalizeSupplierKey("БУДАРЕНА  ");
    expect(k1).toBe("бударена");
    expect(k2).toBe("бударена");
    expect(k3).toBe("бударена");
    expect(k4).toBe("бударена");
  });

  it("розрізняє 'альянс фасад' і 'альянс фасад груп' (різні юрособи)", () => {
    const a = normalizeSupplierKey("ТОВ Альянс Фасад");
    const b = normalizeSupplierKey('ТзОВ "Альянс фасад груп"');
    expect(a).not.toBe(b);
    expect(a).toBe("альянс фасад");
    expect(b).toBe("альянс фасад груп");
  });

  it("знімає ФОП префікс і не плутає з ТОВ", () => {
    expect(normalizeSupplierKey("ФОП Мерза Дмитро Романович")).toBe(
      "мерза дмитро романович",
    );
  });

  it("повертає порожній рядок для null/undefined/порожнього", () => {
    expect(normalizeSupplierKey(null)).toBe("");
    expect(normalizeSupplierKey(undefined)).toBe("");
    expect(normalizeSupplierKey("")).toBe("");
    expect(normalizeSupplierKey("   ")).toBe("");
  });

  it("знімає всі види лапок", () => {
    expect(normalizeSupplierKey('ТзОВ "Дукат Львів"')).toBe("дукат львів");
    expect(normalizeSupplierKey("ТОВ «ДКБМ «ПРАЙД ГРАД»")).toBe("дкбм прайд град");
  });
});

describe("inferCounterpartyType", () => {
  it("ФОП → FOP", () => {
    expect(inferCounterpartyType("ФОП Мерза Дмитро Романович")).toBe("FOP");
    expect(inferCounterpartyType("фоп воробйов олег")).toBe("FOP");
  });

  it("ТОВ/ТзОВ/ПП → LEGAL", () => {
    expect(inferCounterpartyType("ТОВ Альянс Фасад")).toBe("LEGAL");
    expect(inferCounterpartyType("ТзОВ Бударена")).toBe("LEGAL");
    expect(inferCounterpartyType("ПП Дах Стиль")).toBe("LEGAL");
  });

  it("ПІБ без legal-form → INDIVIDUAL", () => {
    expect(inferCounterpartyType("Садкова Ірина Миронівна")).toBe("INDIVIDUAL");
  });

  it("за замовчуванням LEGAL для невпізнаних", () => {
    expect(inferCounterpartyType("Вартіс")).toBe("LEGAL");
    expect(inferCounterpartyType("колір буд")).toBe("LEGAL");
  });
});

describe("pickDisplayName", () => {
  it("вибирає найдовший варіант з кластеру", () => {
    const display = pickDisplayName([
      "бударена",
      "ТзОВ Бударена",
      'ТзОВ "Бударена"',
    ]);
    expect(display).toBe('ТзОВ "Бударена"');
  });

  it("ігнорує порожні", () => {
    expect(pickDisplayName(["", "тов", "  "])).toBe("тов");
  });

  it("повертає порожній рядок якщо все порожнє", () => {
    expect(pickDisplayName([])).toBe("");
    expect(pickDisplayName(["", "  "])).toBe("");
  });
});
