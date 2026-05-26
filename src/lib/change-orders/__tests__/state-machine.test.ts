import {
  ACTION_RBAC,
  TRANSITIONS,
  type COAction,
  validateTransition,
} from "../state-machine";
import type { ChangeOrderStatus, Role } from "@prisma/client";

const ALL_STATUSES: ChangeOrderStatus[] = [
  "DRAFT",
  "PENDING_PM",
  "PENDING_ADMIN",
  "PENDING_CLIENT",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
];

const ALL_ACTIONS: COAction[] = [
  "submit",
  "approve_pm",
  "approve_admin",
  "approve_client",
  "reject",
  "cancel",
];

describe("change-orders state machine", () => {
  test("happy path DRAFT → PENDING_PM → PENDING_ADMIN → PENDING_CLIENT → APPROVED", () => {
    const path: Array<{ from: ChangeOrderStatus; action: COAction; role: Role; to: ChangeOrderStatus }> = [
      { from: "DRAFT", action: "submit", role: "MANAGER", to: "PENDING_PM" },
      { from: "PENDING_PM", action: "approve_pm", role: "MANAGER", to: "PENDING_ADMIN" },
      { from: "PENDING_ADMIN", action: "approve_admin", role: "SUPER_ADMIN", to: "PENDING_CLIENT" },
      { from: "PENDING_CLIENT", action: "approve_client", role: "CLIENT", to: "APPROVED" },
    ];
    for (const step of path) {
      const result = validateTransition(step.from, step.action, step.role);
      expect(result).toEqual({ ok: true, nextStatus: step.to });
    }
  });

  test("invalid transitions return invalid-transition", () => {
    const cases: Array<{ from: ChangeOrderStatus; action: COAction }> = [
      { from: "DRAFT", action: "approve_pm" },
      { from: "DRAFT", action: "approve_admin" },
      { from: "DRAFT", action: "approve_client" },
      { from: "DRAFT", action: "reject" },
      { from: "PENDING_PM", action: "submit" },
      { from: "PENDING_PM", action: "approve_admin" },
      { from: "PENDING_PM", action: "approve_client" },
      { from: "PENDING_ADMIN", action: "submit" },
      { from: "PENDING_ADMIN", action: "approve_pm" },
      { from: "PENDING_ADMIN", action: "approve_client" },
      { from: "PENDING_CLIENT", action: "submit" },
      { from: "PENDING_CLIENT", action: "approve_pm" },
      { from: "PENDING_CLIENT", action: "approve_admin" },
      { from: "PENDING_CLIENT", action: "cancel" },
      { from: "APPROVED", action: "submit" },
      { from: "APPROVED", action: "approve_pm" },
      { from: "APPROVED", action: "reject" },
      { from: "APPROVED", action: "cancel" },
      { from: "REJECTED", action: "submit" },
      { from: "REJECTED", action: "approve_pm" },
      { from: "CANCELLED", action: "submit" },
    ];
    for (const { from, action } of cases) {
      const result = validateTransition(from, action, "SUPER_ADMIN");
      expect(result).toEqual({ ok: false, reason: "invalid-transition" });
    }
    expect(cases.length).toBeGreaterThanOrEqual(21);
  });

  test("RBAC: ENGINEER cannot approve_admin (forbidden-role)", () => {
    const result = validateTransition("PENDING_ADMIN", "approve_admin", "ENGINEER");
    expect(result).toEqual({ ok: false, reason: "forbidden-role" });
  });

  test("RBAC: CLIENT cannot submit", () => {
    const result = validateTransition("DRAFT", "submit", "CLIENT");
    expect(result).toEqual({ ok: false, reason: "forbidden-role" });
  });

  test("RBAC: SUPER_ADMIN overrides every action", () => {
    for (const action of ALL_ACTIONS) {
      expect(ACTION_RBAC[action]).toContain("SUPER_ADMIN");
    }
  });

  test("RBAC: approve_client allowed for CLIENT + SUPER_ADMIN", () => {
    expect(ACTION_RBAC.approve_client).toEqual(
      expect.arrayContaining(["CLIENT", "SUPER_ADMIN"]),
    );
  });

  test("All final statuses have no outgoing transitions", () => {
    expect(TRANSITIONS.APPROVED).toEqual({});
    expect(TRANSITIONS.REJECTED).toEqual({});
    expect(TRANSITIONS.CANCELLED).toEqual({});
  });

  test("Every status is reachable from at least one (sanity)", () => {
    const reachable = new Set<ChangeOrderStatus>(["DRAFT"]);
    for (const [, actions] of Object.entries(TRANSITIONS)) {
      for (const next of Object.values(actions)) {
        if (next) reachable.add(next);
      }
    }
    for (const status of ALL_STATUSES) {
      expect(reachable.has(status)).toBe(true);
    }
  });
});
