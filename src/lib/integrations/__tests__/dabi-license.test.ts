import { describe, it, expect } from "@jest/globals";
import { parseDabiHtml } from "../dabi-license";

const SAMPLE_HTML = `
<html><body>
<dl>
  <dt>Найменування</dt><dd>ТОВ Будівельник</dd>
  <dt>ЄДРПОУ</dt><dd>14360570</dd>
  <dt>Дата видачі</dt><dd>01.06.2024</dd>
  <dt>Дійсна до</dt><dd>01.06.2026</dd>
  <dt>Види робіт</dt><dd>Залізобетонні роботи, Цегляні роботи; Покрівельні роботи</dd>
  <dt>Статус</dt><dd>Чинна</dd>
</dl>
</body></html>
`;

const REVOKED_HTML = `
<dl>
  <dt>Найменування</dt><dd>ФОП Іванов</dd>
  <dt>Статус</dt><dd>Анульована</dd>
</dl>
`;

describe("dabi-license parser", () => {
  it("parses active license fields", () => {
    const parsed = parseDabiHtml(SAMPLE_HTML);
    expect(parsed).not.toBeNull();
    expect(parsed?.holderName).toBe("ТОВ Будівельник");
    expect(parsed?.holderEdrpou).toBe("14360570");
    expect(parsed?.issuedAt?.toISOString().slice(0, 10)).toBe("2024-06-01");
    expect(parsed?.validUntil?.toISOString().slice(0, 10)).toBe("2026-06-01");
    expect(parsed?.scope).toEqual([
      "Залізобетонні роботи",
      "Цегляні роботи",
      "Покрівельні роботи",
    ]);
    expect(parsed?.status).toBe("ACTIVE");
  });

  it("maps REVOKED status", () => {
    const parsed = parseDabiHtml(REVOKED_HTML);
    expect(parsed?.status).toBe("REVOKED");
  });

  it("returns null when holder name is missing", () => {
    expect(parseDabiHtml("<html><body>nothing</body></html>")).toBeNull();
  });
});
