import {
  resolveFirmScope,
  firmWhereForProject,
  firmWhereForFinance,
  firmWhereForPayment,
  firmWhereForTask,
  assertCanAccessFirm,
  firmIdForNewEntity,
  isHomeFirmFor,
  assertHomeFirm,
  getActiveRoleFromSession,
  getAccessibleFirmIds,
  DEFAULT_FIRM_ID,
  STUDIO_FIRM_ID,
} from "../scope";
import type { Session } from "next-auth";
import type { Role } from "@prisma/client";

function makeSession(
  role: string,
  firmId: string | null,
  firmAccess: Record<string, Role> = {},
): Session {
  return {
    user: {
      id: "u1",
      name: "Test",
      email: "t@test",
      role: role as Session["user"]["role"],
      firmId,
      firmAccess,
    },
    expires: "2099-01-01",
  } as unknown as Session;
}

describe("resolveFirmScope", () => {
  it("SUPER_ADMIN без override → DEFAULT_FIRM_ID (Metrum Group)", () => {
    const r = resolveFirmScope(makeSession("SUPER_ADMIN", null));
    expect(r.firmId).toBe(DEFAULT_FIRM_ID);
    expect(r.isSuperAdmin).toBe(true);
  });

  it("SUPER_ADMIN з override='metrum-studio' → STUDIO_FIRM_ID", () => {
    const r = resolveFirmScope(makeSession("SUPER_ADMIN", null), STUDIO_FIRM_ID);
    expect(r.firmId).toBe(STUDIO_FIRM_ID);
  });

  it("SUPER_ADMIN з override=null → null (cross-firm)", () => {
    const r = resolveFirmScope(makeSession("SUPER_ADMIN", null), null);
    expect(r.firmId).toBeNull();
  });

  it("MANAGER без override → его home firmId з сесії", () => {
    const r = resolveFirmScope(makeSession("MANAGER", STUDIO_FIRM_ID));
    expect(r.firmId).toBe(STUDIO_FIRM_ID);
    expect(r.userFirmId).toBe(STUDIO_FIRM_ID);
    expect(r.isSuperAdmin).toBe(false);
  });

  it("MANAGER з override='metrum-group' → override застосовується (page guards enforce)", () => {
    // Тепер scope не блокує переключення — лише isHomeFirmFor визначає права на дії.
    const r = resolveFirmScope(
      makeSession("MANAGER", STUDIO_FIRM_ID),
      DEFAULT_FIRM_ID,
    );
    expect(r.firmId).toBe(DEFAULT_FIRM_ID);
    expect(r.userFirmId).toBe(STUDIO_FIRM_ID); // home firm збережено
  });

  it("MANAGER без firmId без override → DEFAULT_FIRM_ID (безпечний fallback)", () => {
    const r = resolveFirmScope(makeSession("MANAGER", null));
    expect(r.firmId).toBe(DEFAULT_FIRM_ID);
  });

  it("null session → DEFAULT_FIRM_ID", () => {
    const r = resolveFirmScope(null);
    expect(r.firmId).toBe(DEFAULT_FIRM_ID);
  });
});

describe("isHomeFirmFor", () => {
  it("SUPER_ADMIN — завжди home (доступ до всього)", () => {
    expect(isHomeFirmFor(makeSession("SUPER_ADMIN", null), STUDIO_FIRM_ID)).toBe(true);
    expect(isHomeFirmFor(makeSession("SUPER_ADMIN", null), DEFAULT_FIRM_ID)).toBe(true);
    expect(isHomeFirmFor(makeSession("SUPER_ADMIN", null), null)).toBe(true);
  });

  it("MANAGER на своїй фірмі — home", () => {
    expect(
      isHomeFirmFor(makeSession("MANAGER", STUDIO_FIRM_ID), STUDIO_FIRM_ID),
    ).toBe(true);
  });

  it("MANAGER на чужій фірмі без firmAccess — НЕ home", () => {
    expect(
      isHomeFirmFor(makeSession("MANAGER", STUDIO_FIRM_ID), DEFAULT_FIRM_ID),
    ).toBe(false);
  });

  it("HR з firmAccess[Studio]=SUPER_ADMIN на Studio — home (per-firm доступ)", () => {
    const sess = makeSession("HR", DEFAULT_FIRM_ID, {
      [STUDIO_FIRM_ID]: "SUPER_ADMIN",
    });
    expect(isHomeFirmFor(sess, STUDIO_FIRM_ID)).toBe(true);
    expect(isHomeFirmFor(sess, DEFAULT_FIRM_ID)).toBe(true);
  });

  it("MANAGER на cross-firm view (null) — НЕ home", () => {
    expect(isHomeFirmFor(makeSession("MANAGER", STUDIO_FIRM_ID), null)).toBe(false);
  });

  it("Користувач без firmId → home лише для DEFAULT_FIRM_ID", () => {
    expect(isHomeFirmFor(makeSession("MANAGER", null), DEFAULT_FIRM_ID)).toBe(true);
    expect(isHomeFirmFor(makeSession("MANAGER", null), STUDIO_FIRM_ID)).toBe(false);
  });
});

describe("getActiveRoleFromSession", () => {
  it("SUPER_ADMIN залишається SUPER_ADMIN на будь-якій фірмі", () => {
    expect(
      getActiveRoleFromSession(makeSession("SUPER_ADMIN", null), STUDIO_FIRM_ID),
    ).toBe("SUPER_ADMIN");
    expect(
      getActiveRoleFromSession(makeSession("SUPER_ADMIN", null), DEFAULT_FIRM_ID),
    ).toBe("SUPER_ADMIN");
    expect(
      getActiveRoleFromSession(makeSession("SUPER_ADMIN", null), null),
    ).toBe("SUPER_ADMIN");
  });

  it("На home фірмі — base role", () => {
    expect(
      getActiveRoleFromSession(makeSession("MANAGER", STUDIO_FIRM_ID), STUDIO_FIRM_ID),
    ).toBe("MANAGER");
  });

  it("shymilo93: HR на Metrum Group, SUPER_ADMIN на Studio", () => {
    const sess = makeSession("HR", DEFAULT_FIRM_ID, {
      [STUDIO_FIRM_ID]: "SUPER_ADMIN",
    });
    expect(getActiveRoleFromSession(sess, DEFAULT_FIRM_ID)).toBe("HR");
    expect(getActiveRoleFromSession(sess, STUDIO_FIRM_ID)).toBe("SUPER_ADMIN");
  });

  it("Чужа фірма без firmAccess → null", () => {
    expect(
      getActiveRoleFromSession(makeSession("MANAGER", STUDIO_FIRM_ID), DEFAULT_FIRM_ID),
    ).toBeNull();
  });

  it("Cross-firm (null) для не-SUPER_ADMIN → null", () => {
    expect(getActiveRoleFromSession(makeSession("MANAGER", STUDIO_FIRM_ID), null)).toBeNull();
  });
});

describe("getAccessibleFirmIds", () => {
  it("SUPER_ADMIN — всі відомі фірми", () => {
    const ids = getAccessibleFirmIds(makeSession("SUPER_ADMIN", null));
    expect(ids).toContain(DEFAULT_FIRM_ID);
    expect(ids).toContain(STUDIO_FIRM_ID);
  });

  it("MANAGER з однією фірмою — лише home", () => {
    expect(getAccessibleFirmIds(makeSession("MANAGER", STUDIO_FIRM_ID))).toEqual([
      STUDIO_FIRM_ID,
    ]);
  });

  it("shymilo93 — Group (home) + Studio (firmAccess)", () => {
    const sess = makeSession("HR", DEFAULT_FIRM_ID, {
      [STUDIO_FIRM_ID]: "SUPER_ADMIN",
    });
    const ids = getAccessibleFirmIds(sess);
    expect(ids).toContain(DEFAULT_FIRM_ID);
    expect(ids).toContain(STUDIO_FIRM_ID);
    expect(ids).toHaveLength(2);
  });
});

describe("assertHomeFirm", () => {
  it("на home — не кидає", () => {
    expect(() =>
      assertHomeFirm(makeSession("MANAGER", STUDIO_FIRM_ID), STUDIO_FIRM_ID),
    ).not.toThrow();
  });
  it("на чужій — кидає Forbidden", () => {
    expect(() =>
      assertHomeFirm(makeSession("MANAGER", STUDIO_FIRM_ID), DEFAULT_FIRM_ID),
    ).toThrow(/Forbidden/);
  });
  it("SUPER_ADMIN — ніколи не кидає", () => {
    expect(() =>
      assertHomeFirm(makeSession("SUPER_ADMIN", null), STUDIO_FIRM_ID),
    ).not.toThrow();
  });
});

describe("firmWhere builders", () => {
  it("firmId=null → порожній where (no scope)", () => {
    expect(firmWhereForProject(null)).toEqual({});
    expect(firmWhereForFinance(null)).toEqual({});
    expect(firmWhereForPayment(null)).toEqual({});
    expect(firmWhereForTask(null)).toEqual({});
  });

  it("Project та FinanceEntry — direct firmId (мають своє поле)", () => {
    expect(firmWhereForProject("metrum-studio")).toEqual({ firmId: "metrum-studio" });
    expect(firmWhereForFinance("metrum-studio")).toEqual({ firmId: "metrum-studio" });
  });

  it("Payment та Task — через nested project (немає власного firmId)", () => {
    expect(firmWhereForPayment("metrum-studio")).toEqual({
      project: { firmId: "metrum-studio" },
    });
    expect(firmWhereForTask("metrum-studio")).toEqual({
      project: { firmId: "metrum-studio" },
    });
  });
});

describe("assertCanAccessFirm", () => {
  it("SUPER_ADMIN — завжди має доступ", () => {
    expect(() =>
      assertCanAccessFirm(makeSession("SUPER_ADMIN", null), STUDIO_FIRM_ID),
    ).not.toThrow();
    expect(() =>
      assertCanAccessFirm(makeSession("SUPER_ADMIN", "metrum-group"), STUDIO_FIRM_ID),
    ).not.toThrow();
  });

  it("MANAGER зі своєю фірмою — пропускає", () => {
    expect(() =>
      assertCanAccessFirm(makeSession("MANAGER", STUDIO_FIRM_ID), STUDIO_FIRM_ID),
    ).not.toThrow();
  });

  it("MANAGER (Studio) намагається відкрити Group entity → 403", () => {
    expect(() =>
      assertCanAccessFirm(makeSession("MANAGER", STUDIO_FIRM_ID), DEFAULT_FIRM_ID),
    ).toThrow(/Forbidden/);
  });

  it("Legacy entity без firmId → трактується як metrum-group", () => {
    // MANAGER зі Studio не має доступу до legacy (group) entities.
    expect(() =>
      assertCanAccessFirm(makeSession("MANAGER", STUDIO_FIRM_ID), null),
    ).toThrow(/Forbidden/);
    // MANAGER з Group має доступ.
    expect(() =>
      assertCanAccessFirm(makeSession("MANAGER", DEFAULT_FIRM_ID), null),
    ).not.toThrow();
  });
});

describe("firmIdForNewEntity", () => {
  it("користувач закріплений за фірмою — використовує його firmId", () => {
    expect(firmIdForNewEntity(makeSession("MANAGER", STUDIO_FIRM_ID))).toBe(STUDIO_FIRM_ID);
  });

  it("користувач без firmId — використовує fallback", () => {
    expect(firmIdForNewEntity(makeSession("SUPER_ADMIN", null))).toBe(DEFAULT_FIRM_ID);
    expect(firmIdForNewEntity(makeSession("SUPER_ADMIN", null), "custom")).toBe("custom");
  });

  it("null session — fallback", () => {
    expect(firmIdForNewEntity(null)).toBe(DEFAULT_FIRM_ID);
  });
});
