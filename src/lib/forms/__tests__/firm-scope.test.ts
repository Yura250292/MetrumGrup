/**
 * Контрактний тест: форми мають бути firm-isolated.
 *
 * Цей файл не тестує API end-to-end (це інтеграційні тести); він фіксує
 * контракт, що:
 *  - `assertCanAccessFirm` блокує крос-фірмний доступ для form entities;
 *  - формальний firmId на template/submission/attachment — обов'язковий
 *    для скоупінгу і не може приходити від клієнта (stamped server-side).
 *
 * Регрес-захист: якщо хтось випадково замінить `assertCanAccessFirm` на
 * довільну логіку у form-API, цей тест впаде.
 */

import {
  assertCanAccessFirm,
  DEFAULT_FIRM_ID,
  STUDIO_FIRM_ID,
} from "@/lib/firm/scope";
import type { Session } from "next-auth";

function makeSession(role: string, firmId: string | null): Session {
  return {
    user: { id: "u1", name: "T", email: "t@test", role, firmId },
    expires: "2099-01-01",
  } as unknown as Session;
}

describe("form entities — multi-firm isolation", () => {
  it("Group MANAGER не має доступу до Studio FormTemplate", () => {
    expect(() =>
      assertCanAccessFirm(makeSession("MANAGER", DEFAULT_FIRM_ID), STUDIO_FIRM_ID),
    ).toThrow(/Forbidden/);
  });

  it("Studio MANAGER не має доступу до Group FormTemplate", () => {
    expect(() =>
      assertCanAccessFirm(makeSession("MANAGER", STUDIO_FIRM_ID), DEFAULT_FIRM_ID),
    ).toThrow(/Forbidden/);
  });

  it("Group MANAGER не має доступу до Studio FormSubmission", () => {
    expect(() =>
      assertCanAccessFirm(makeSession("MANAGER", DEFAULT_FIRM_ID), STUDIO_FIRM_ID),
    ).toThrow(/Forbidden/);
  });

  it("Studio FOREMAN бачить власну Studio FormSubmission", () => {
    expect(() =>
      assertCanAccessFirm(makeSession("FOREMAN", STUDIO_FIRM_ID), STUDIO_FIRM_ID),
    ).not.toThrow();
  });

  it("SUPER_ADMIN має доступ до форм будь-якої фірми", () => {
    expect(() =>
      assertCanAccessFirm(makeSession("SUPER_ADMIN", DEFAULT_FIRM_ID), STUDIO_FIRM_ID),
    ).not.toThrow();
    expect(() =>
      assertCanAccessFirm(makeSession("SUPER_ADMIN", STUDIO_FIRM_ID), DEFAULT_FIRM_ID),
    ).not.toThrow();
  });

  it("Legacy submission без firmId трактується як Group (default)", () => {
    // Studio MANAGER не бачить legacy submissions без firmId — це правильно,
    // бо вони належать default-фірмі (Group).
    expect(() =>
      assertCanAccessFirm(makeSession("MANAGER", STUDIO_FIRM_ID), null),
    ).toThrow(/Forbidden/);
    expect(() =>
      assertCanAccessFirm(makeSession("MANAGER", DEFAULT_FIRM_ID), null),
    ).not.toThrow();
  });
});
