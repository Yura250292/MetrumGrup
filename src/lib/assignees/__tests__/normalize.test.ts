import { splitAssignees, fromLegacyUserIds } from "../normalize";
import type { AssigneeRef } from "../types";

describe("splitAssignees", () => {
  it("розділяє User та Employee у окремі списки", () => {
    const refs: AssigneeRef[] = [
      { kind: "user", id: "u1" },
      { kind: "employee", id: "e1" },
      { kind: "user", id: "u2" },
    ];
    const { userIds, employeeIds } = splitAssignees(refs);
    expect(userIds).toEqual(["u1", "u2"]);
    expect(employeeIds).toEqual(["e1"]);
  });

  it("дедупить дублікати у межах одного типу", () => {
    const refs: AssigneeRef[] = [
      { kind: "user", id: "u1" },
      { kind: "user", id: "u1" },
      { kind: "employee", id: "e1" },
      { kind: "employee", id: "e1" },
    ];
    const { userIds, employeeIds } = splitAssignees(refs);
    expect(userIds).toEqual(["u1"]);
    expect(employeeIds).toEqual(["e1"]);
  });

  it("ігнорує порожні id", () => {
    const refs = [
      { kind: "user", id: "" },
      { kind: "employee", id: "e1" },
    ] as AssigneeRef[];
    const { userIds, employeeIds } = splitAssignees(refs);
    expect(userIds).toEqual([]);
    expect(employeeIds).toEqual(["e1"]);
  });

  it("повертає порожні списки для пустого вхідного масиву", () => {
    expect(splitAssignees([])).toEqual({ userIds: [], employeeIds: [] });
  });
});

describe("fromLegacyUserIds", () => {
  it("конвертує string[] у AssigneeRef[] з kind=user", () => {
    expect(fromLegacyUserIds(["u1", "u2"])).toEqual([
      { kind: "user", id: "u1" },
      { kind: "user", id: "u2" },
    ]);
  });

  it("повертає [] для null/undefined", () => {
    expect(fromLegacyUserIds(null)).toEqual([]);
    expect(fromLegacyUserIds(undefined)).toEqual([]);
  });

  it("фільтрує порожні рядки", () => {
    expect(fromLegacyUserIds(["u1", "", "u2"])).toEqual([
      { kind: "user", id: "u1" },
      { kind: "user", id: "u2" },
    ]);
  });
});
