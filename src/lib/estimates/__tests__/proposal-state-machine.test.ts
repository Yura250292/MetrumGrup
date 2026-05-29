import {
  countItemStates,
  deriveProposalStatus,
  InvalidTransitionError,
  isTerminalState,
  nextItemState,
} from "../proposal-state-machine";

describe("nextItemState", () => {
  describe("from PENDING", () => {
    it("client APPROVE → CLIENT_APPROVED", () => {
      expect(nextItemState("PENDING", "client", "APPROVE")).toBe("CLIENT_APPROVED");
    });
    it("client REJECT → CLIENT_REJECTED", () => {
      expect(nextItemState("PENDING", "client", "REJECT")).toBe("CLIENT_REJECTED");
    });
    it("client COUNTER → CLIENT_COUNTERED", () => {
      expect(nextItemState("PENDING", "client", "COUNTER")).toBe("CLIENT_COUNTERED");
    });
    it("firm action on PENDING is invalid (фірма не може сама себе схвалити)", () => {
      expect(() => nextItemState("PENDING", "firm", "COUNTER")).toThrow(
        InvalidTransitionError,
      );
      expect(() => nextItemState("PENDING", "firm", "ACCEPT_COUNTER")).toThrow();
    });
  });

  describe("from CLIENT_COUNTERED", () => {
    it("firm ACCEPT_COUNTER → CLIENT_APPROVED", () => {
      expect(nextItemState("CLIENT_COUNTERED", "firm", "ACCEPT_COUNTER")).toBe(
        "CLIENT_APPROVED",
      );
    });
    it("firm REJECT_COUNTER → FIRM_REJECTED", () => {
      expect(nextItemState("CLIENT_COUNTERED", "firm", "REJECT_COUNTER")).toBe(
        "FIRM_REJECTED",
      );
    });
    it("firm COUNTER → FIRM_COUNTERED", () => {
      expect(nextItemState("CLIENT_COUNTERED", "firm", "COUNTER")).toBe(
        "FIRM_COUNTERED",
      );
    });
    it("client дія на CLIENT_COUNTERED invalid (м'яч у фірми)", () => {
      expect(() => nextItemState("CLIENT_COUNTERED", "client", "APPROVE")).toThrow();
      expect(() => nextItemState("CLIENT_COUNTERED", "client", "COUNTER")).toThrow();
    });
  });

  describe("from FIRM_COUNTERED", () => {
    it("client APPROVE → CLIENT_APPROVED", () => {
      expect(nextItemState("FIRM_COUNTERED", "client", "APPROVE")).toBe(
        "CLIENT_APPROVED",
      );
    });
    it("client REJECT → CLIENT_REJECTED", () => {
      expect(nextItemState("FIRM_COUNTERED", "client", "REJECT")).toBe(
        "CLIENT_REJECTED",
      );
    });
    it("client COUNTER → CLIENT_COUNTERED (loop)", () => {
      expect(nextItemState("FIRM_COUNTERED", "client", "COUNTER")).toBe(
        "CLIENT_COUNTERED",
      );
    });
    it("firm дія на FIRM_COUNTERED invalid (м'яч у клієнта)", () => {
      expect(() => nextItemState("FIRM_COUNTERED", "firm", "COUNTER")).toThrow();
    });
  });

  describe("terminal states", () => {
    for (const terminal of [
      "CLIENT_APPROVED",
      "CLIENT_REJECTED",
      "FIRM_REJECTED",
      "FINAL",
    ] as const) {
      it(`${terminal} is terminal — no further transitions`, () => {
        expect(isTerminalState(terminal)).toBe(true);
        expect(() => nextItemState(terminal, "client", "APPROVE")).toThrow(
          InvalidTransitionError,
        );
        expect(() => nextItemState(terminal, "firm", "COUNTER")).toThrow();
      });
    }
  });
});

describe("countItemStates", () => {
  it("empty list = всі нулі", () => {
    expect(countItemStates([])).toEqual({
      total: 0,
      approved: 0,
      rejected: 0,
      pending: 0,
    });
  });

  it("розрізняє approved / rejected / pending", () => {
    const states = countItemStates([
      "PENDING",
      "CLIENT_APPROVED",
      "CLIENT_APPROVED",
      "CLIENT_REJECTED",
      "FIRM_REJECTED",
      "CLIENT_COUNTERED",
      "FIRM_COUNTERED",
    ]);
    expect(states).toEqual({ total: 7, approved: 2, rejected: 2, pending: 3 });
  });

  it("COUNTERED стани в pending (торг ще йде)", () => {
    expect(countItemStates(["CLIENT_COUNTERED", "FIRM_COUNTERED"])).toEqual({
      total: 2,
      approved: 0,
      rejected: 0,
      pending: 2,
    });
  });
});

describe("deriveProposalStatus", () => {
  it("терміналки proposal-рівня залишаються незмінними", () => {
    const counts = { total: 5, approved: 5, rejected: 0, pending: 0 };
    for (const t of [
      "FULLY_APPROVED",
      "REJECTED",
      "WITHDRAWN",
      "EXPIRED",
    ] as const) {
      expect(deriveProposalStatus(t, counts, true)).toBe(t);
    }
  });

  it("усі approved → FULLY_APPROVED", () => {
    expect(
      deriveProposalStatus(
        "IN_NEGOTIATION",
        { total: 3, approved: 3, rejected: 0, pending: 0 },
        true,
      ),
    ).toBe("FULLY_APPROVED");
  });

  it("усі rejected → REJECTED", () => {
    expect(
      deriveProposalStatus(
        "IN_NEGOTIATION",
        { total: 3, approved: 0, rejected: 3, pending: 0 },
        true,
      ),
    ).toBe("REJECTED");
  });

  it("mix terminal approved+rejected → PARTIALLY_APPROVED", () => {
    expect(
      deriveProposalStatus(
        "IN_NEGOTIATION",
        { total: 5, approved: 3, rejected: 2, pending: 0 },
        true,
      ),
    ).toBe("PARTIALLY_APPROVED");
  });

  it("є pending, клієнт ще не діяв → SENT", () => {
    expect(
      deriveProposalStatus(
        "SENT",
        { total: 5, approved: 0, rejected: 0, pending: 5 },
        false,
      ),
    ).toBe("SENT");
  });

  it("є pending, клієнт уже діяв → IN_NEGOTIATION", () => {
    expect(
      deriveProposalStatus(
        "SENT",
        { total: 5, approved: 2, rejected: 0, pending: 3 },
        true,
      ),
    ).toBe("IN_NEGOTIATION");
  });

  it("total=0 не змінює статус (degenerate case)", () => {
    expect(
      deriveProposalStatus(
        "SENT",
        { total: 0, approved: 0, rejected: 0, pending: 0 },
        false,
      ),
    ).toBe("SENT");
  });
});
