import { describe, it, expect } from "@jest/globals";
import * as XLSX from "xlsx";
import { parseExcelProjectPlan } from "../excel-project-plan-parser";

function buildWorkbook(stages: any[][], projects?: any[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  if (projects) {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(projects),
      "PROJECTS",
    );
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(stages), "STAGES");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return buf;
}

const STAGES_HEADER = [
  "ID Проєкту", "Назва проєкту", "№ п/п", "Найменування", "Етап", "Тип",
  "Одиниця виміру", "Кількість", "Собівартість за одиницю", "Собівартість разом",
  "Вартість за одиницю", "Вартість разом", "План початок", "План тривал.",
  "План кінець", "Попередник", "Тип звʼязку", "Зміщ.",
];

const PROJECTS_HEADER = [
  "ID", "Назва проєкту", "Відповідальний", "Замовник", "Статус",
  "План початок", "План закінчення",
];

describe("parseExcelProjectPlan", () => {
  it("парсить базовий labor-рядок з planning-полями", async () => {
    const buf = buildWorkbook([
      STAGES_HEADER,
      [
        1, "ЛЕВ. Орлика", "1.1", "Демонтаж бордюрів", "Демонтажні роботи",
        "Робота", "м.п.", 182.49, 170, 31023, 165, 30110,
        new Date("2026-05-01"), 3, new Date("2026-05-03"), null, null, null,
      ],
    ]);
    const result = await parseExcelProjectPlan(buf);
    expect(result.success).toBe(true);
    expect(result.items).toHaveLength(1);
    const it = result.items[0]!;
    expect(it.seq).toBe("1.1");
    expect(it.etap).toBe("Демонтажні роботи");
    expect(it.itemType).toBe("labor");
    expect(it.unit).toBe("м.п.");
    expect(it.quantity).toBeCloseTo(182.49);
    expect(it.unitCost).toBe(170);
    expect(it.unitPriceCustomer).toBe(165);
    expect(it.plannedDurationDays).toBe(3);
    expect(it.predecessorSeq).toBeNull();
  });

  it("розпізнає Матеріал як material", async () => {
    const buf = buildWorkbook([
      STAGES_HEADER,
      [
        1, "P", "2.1", "Бетон М200", "Монтажні роботи", "Матеріал",
        "м3", 8.8, null, null, null, null, null, null, null, null, null, null,
      ],
    ]);
    const { items } = await parseExcelProjectPlan(buf);
    expect(items[0]!.itemType).toBe("material");
    expect(items[0]!.unitCost).toBeNull();
  });

  it("резолвить predecessor + lag + тип звʼязку", async () => {
    const buf = buildWorkbook([
      STAGES_HEADER,
      [
        1, "P", "1.1", "Робота A", "Етап1", "Робота", "м.п.", 10, 100, 1000,
        120, 1200, new Date("2026-05-01"), 3, new Date("2026-05-03"), null,
        null, null,
      ],
      [
        1, "P", "1.2", "Робота B", "Етап1", "Робота", "м.п.", 5, 100, 500,
        120, 600, new Date("2026-05-04"), 2, new Date("2026-05-05"), "1.1",
        "SS", 2,
      ],
    ]);
    const { items, warnings } = await parseExcelProjectPlan(buf);
    expect(items).toHaveLength(2);
    expect(items[1]!.predecessorSeq).toBe("1.1");
    expect(items[1]!.dependencyType).toBe("SS");
    expect(items[1]!.dependencyLagDays).toBe(2);
    expect(warnings).toHaveLength(0);
  });

  it("warns про невідомий predecessor (не з seq-набору)", async () => {
    const buf = buildWorkbook([
      STAGES_HEADER,
      [
        1, "P", "2.1", "Робота X", "Етап", "Робота", "шт", 1, 100, 100,
        120, 120, null, null, null, "999.999", "FS", 0,
      ],
    ]);
    const { warnings } = await parseExcelProjectPlan(buf);
    expect(warnings.some((w) => w.includes("999.999"))).toBe(true);
  });

  it("парсить PROJECTS метадату якщо лист є", async () => {
    const buf = buildWorkbook(
      [
        STAGES_HEADER,
        [
          1, "Проєкт X", "1.1", "Робота", "Етап", "Робота", "шт", 1, 100,
          100, 120, 120, null, null, null, null, null, null,
        ],
      ],
      [
        PROJECTS_HEADER,
        [1, "ЛЕВ. Орлика", "Лащук В.", "ЛЕВ Девелопмент", "В роботі",
          new Date("2026-05-01"), new Date("2026-08-19")],
      ],
    );
    const result = await parseExcelProjectPlan(buf);
    expect(result.project).not.toBeNull();
    expect(result.project!.title).toBe("ЛЕВ. Орлика");
    expect(result.project!.responsible).toBe("Лащук В.");
    expect(result.project!.client).toBe("ЛЕВ Девелопмент");
  });

  it("fail-soft коли немає листа STAGES", async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["foo"]]), "Other");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const result = await parseExcelProjectPlan(buf);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("STAGES"))).toBe(true);
  });

  it("пропускає рядки без №п/п або без опису", async () => {
    const buf = buildWorkbook([
      STAGES_HEADER,
      [1, "P", "", "Без seq", "E", "Робота", "шт", 1, 100, 100, 120, 120, null, null, null, null, null, null],
      [1, "P", "1.1", "", "E", "Робота", "шт", 1, 100, 100, 120, 120, null, null, null, null, null, null],
      [1, "P", "1.2", "OK", "E", "Робота", "шт", 1, 100, 100, 120, 120, null, null, null, null, null, null],
    ]);
    const { items } = await parseExcelProjectPlan(buf);
    expect(items).toHaveLength(1);
    expect(items[0]!.seq).toBe("1.2");
  });
});
