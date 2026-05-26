import {
  canCreateRFI,
  canAnswerRFI,
  canEditRFI,
  canCloseRFI,
  canCancelRFI,
  isAllowedTransition,
} from "../access";
import type { RFIStatus } from "@prisma/client";

const rfiBase = {
  status: "OPEN" as RFIStatus,
  askedById: "asker",
  assignedToId: "assignee",
};

describe("rfi/access RBAC matrix", () => {
  test("canCreateRFI: CLIENT denied, staff allowed", () => {
    expect(canCreateRFI("SUPER_ADMIN")).toBe(true);
    expect(canCreateRFI("MANAGER")).toBe(true);
    expect(canCreateRFI("ENGINEER")).toBe(true);
    expect(canCreateRFI("FOREMAN")).toBe(true);
    expect(canCreateRFI("FINANCIER")).toBe(true);
    expect(canCreateRFI("CLIENT")).toBe(false);
    expect(canCreateRFI(null)).toBe(false);
  });

  test("canAnswerRFI: only assignee or PM can answer when OPEN/IN_PROGRESS", () => {
    expect(canAnswerRFI(rfiBase, "assignee", "ENGINEER")).toBe(true);
    expect(canAnswerRFI(rfiBase, "other", "ENGINEER")).toBe(false);
    expect(canAnswerRFI(rfiBase, "other", "SUPER_ADMIN")).toBe(true);
    expect(canAnswerRFI(rfiBase, "other", "MANAGER")).toBe(true);
    // not answerable when ANSWERED/CLOSED/CANCELLED
    expect(canAnswerRFI({ ...rfiBase, status: "ANSWERED" }, "assignee", "ENGINEER")).toBe(false);
    expect(canAnswerRFI({ ...rfiBase, status: "CANCELLED" }, "assignee", "SUPER_ADMIN")).toBe(false);
  });

  test("canEditRFI: askedBy and PM can edit while OPEN/IN_PROGRESS", () => {
    expect(canEditRFI(rfiBase, "asker", "ENGINEER")).toBe(true);
    expect(canEditRFI(rfiBase, "asker", "SUPER_ADMIN")).toBe(true);
    expect(canEditRFI(rfiBase, "stranger", "ENGINEER")).toBe(false);
    expect(canEditRFI({ ...rfiBase, status: "ANSWERED" }, "asker", "ENGINEER")).toBe(false);
  });

  test("canCloseRFI: only ANSWERED is closeable", () => {
    expect(canCloseRFI({ ...rfiBase, status: "ANSWERED" }, "asker", "ENGINEER")).toBe(true);
    expect(canCloseRFI({ ...rfiBase, status: "ANSWERED" }, "assignee", "ENGINEER")).toBe(true);
    expect(canCloseRFI({ ...rfiBase, status: "ANSWERED" }, "stranger", "MANAGER")).toBe(true);
    expect(canCloseRFI({ ...rfiBase, status: "ANSWERED" }, "stranger", "ENGINEER")).toBe(false);
    expect(canCloseRFI({ ...rfiBase, status: "OPEN" }, "asker", "SUPER_ADMIN")).toBe(false);
    expect(canCloseRFI({ ...rfiBase, status: "CLOSED" }, "asker", "SUPER_ADMIN")).toBe(false);
  });

  test("canCancelRFI: not allowed on CLOSED/CANCELLED", () => {
    expect(canCancelRFI(rfiBase, "asker", "ENGINEER")).toBe(true);
    expect(canCancelRFI(rfiBase, "stranger", "MANAGER")).toBe(true);
    expect(canCancelRFI(rfiBase, "stranger", "ENGINEER")).toBe(false);
    expect(canCancelRFI({ ...rfiBase, status: "CLOSED" }, "asker", "SUPER_ADMIN")).toBe(false);
    expect(canCancelRFI({ ...rfiBase, status: "CANCELLED" }, "asker", "SUPER_ADMIN")).toBe(false);
  });

  test("isAllowedTransition: matrix", () => {
    expect(isAllowedTransition("OPEN", "IN_PROGRESS")).toBe(true);
    expect(isAllowedTransition("OPEN", "ANSWERED")).toBe(true);
    expect(isAllowedTransition("OPEN", "CLOSED")).toBe(false);
    expect(isAllowedTransition("IN_PROGRESS", "ANSWERED")).toBe(true);
    expect(isAllowedTransition("ANSWERED", "CLOSED")).toBe(true);
    expect(isAllowedTransition("ANSWERED", "OPEN")).toBe(false);
    expect(isAllowedTransition("CLOSED", "OPEN")).toBe(false);
    expect(isAllowedTransition("CANCELLED", "OPEN")).toBe(false);
  });
});
