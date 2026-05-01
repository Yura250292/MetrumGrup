import { describe, it, expect } from "@jest/globals";
import { validateProjectForFinanceWrite } from "../project-invariants";

describe("validateProjectForFinanceWrite", () => {
  it("project=null → 400 'не існує'", () => {
    const res = validateProjectForFinanceWrite(null);
    expect(res).toEqual({ ok: false, status: 400, error: "Проєкт не існує" });
  });

  it("isTestProject → 400 з дефолтним повідомленням", () => {
    const res = validateProjectForFinanceWrite({
      firmId: "metrum-group",
      isTestProject: true,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
    expect(res.error).toMatch(/тестового проєкту/);
  });

  it("isTestProject → дозволяє перевизначити повідомлення для relink", () => {
    const res = validateProjectForFinanceWrite(
      { firmId: "metrum-group", isTestProject: true },
      { testProjectError: "Не можна перепривʼязати на тестовий проєкт" },
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("Не можна перепривʼязати на тестовий проєкт");
  });

  it("firmId=null → 400 (інваріант мульти-фірмової моделі)", () => {
    const res = validateProjectForFinanceWrite({
      firmId: null,
      isTestProject: false,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
    expect(res.error).toMatch(/без фірми/);
  });

  it("cross-firm: existingEntryFirmId не збігається з project.firmId → 400", () => {
    const res = validateProjectForFinanceWrite(
      { firmId: "metrum-studio", isTestProject: false },
      { existingEntryFirmId: "metrum-group" },
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/іншій фірмі/);
  });

  it("same-firm: existingEntryFirmId == project.firmId → ok", () => {
    const res = validateProjectForFinanceWrite(
      { firmId: "metrum-group", isTestProject: false },
      { existingEntryFirmId: "metrum-group" },
    );
    expect(res).toEqual({ ok: true, firmId: "metrum-group" });
  });

  it("без existingEntryFirmId і валідний проєкт → ok з firmId", () => {
    const res = validateProjectForFinanceWrite({
      firmId: "metrum-group",
      isTestProject: false,
    });
    expect(res).toEqual({ ok: true, firmId: "metrum-group" });
  });

  it("existingEntryFirmId=null (старі записи без firmId) не блокує relink", () => {
    const res = validateProjectForFinanceWrite(
      { firmId: "metrum-group", isTestProject: false },
      { existingEntryFirmId: null },
    );
    expect(res).toEqual({ ok: true, firmId: "metrum-group" });
  });
});
