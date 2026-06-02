import { describe, it, expect } from "@jest/globals";
import {
  groupTasks,
  buildTaskTree,
  flattenTree,
  type GroupableTask,
  type GroupingContext,
} from "@/lib/tasks/grouping";

const t = (over: Partial<GroupableTask> & { id: string }): GroupableTask => ({
  parentTaskId: null,
  stageId: "s1",
  statusId: "todo",
  status: { name: "To Do", color: "#999" },
  priority: "NORMAL",
  assignees: [],
  ...over,
});

const ctx: GroupingContext = {
  stages: [
    { id: "s1", name: "Етап 1" },
    { id: "s2", name: "Етап 2" },
  ],
  statuses: [
    { id: "todo", name: "To Do", color: "#aaa" },
    { id: "prog", name: "In Progress", color: "#00f" },
  ],
};

describe("groupTasks", () => {
  it("none → одна група з усіма", () => {
    const g = groupTasks([t({ id: "a" }), t({ id: "b" })], "none", ctx);
    expect(g).toHaveLength(1);
    expect(g[0].items).toHaveLength(2);
  });

  it("status → у порядку ctx, з кольором пігулки", () => {
    const g = groupTasks(
      [t({ id: "a", statusId: "prog" }), t({ id: "b", statusId: "todo" })],
      "status",
      ctx,
    );
    expect(g.map((x) => x.key)).toEqual(["todo", "prog"]);
    expect(g[1].color).toBe("#00f");
    expect(g[0].items.map((i) => i.id)).toEqual(["b"]);
  });

  it("status: лічильник = к-сть задач", () => {
    const g = groupTasks(
      [t({ id: "a", statusId: "todo" }), t({ id: "b", statusId: "todo" })],
      "status",
      ctx,
    );
    expect(g[0].items).toHaveLength(2);
  });

  it("priority → URGENT перший", () => {
    const g = groupTasks(
      [t({ id: "a", priority: "LOW" }), t({ id: "b", priority: "URGENT" })],
      "priority",
      ctx,
    );
    expect(g[0].key).toBe("URGENT");
  });

  it("assignee → fan-out: задача з 2 виконавцями у двох групах", () => {
    const task = t({
      id: "a",
      assignees: [
        { user: { id: "u1", name: "Ihor" } },
        { user: { id: "u2", name: "Olha" } },
      ],
    });
    const g = groupTasks([task], "assignee", ctx);
    expect(g).toHaveLength(2);
    expect(g.every((x) => x.items.some((i) => i.id === "a"))).toBe(true);
  });

  it("assignee → без виконавця в кінці", () => {
    const g = groupTasks(
      [t({ id: "a" }), t({ id: "b", assignees: [{ user: { id: "u1", name: "Ihor" } }] })],
      "assignee",
      ctx,
    );
    expect(g[g.length - 1].label).toBe("Без виконавця");
  });

  it("stage → невідомий етап у 'Без етапу'", () => {
    const g = groupTasks([t({ id: "a", stageId: "ghost" })], "stage", ctx);
    expect(g[g.length - 1].label).toBe("Без етапу");
  });
});

describe("buildTaskTree", () => {
  it("вкладає дітей під батька з глибиною", () => {
    const tree = buildTaskTree([
      { id: "p", parentTaskId: null },
      { id: "c", parentTaskId: "p" },
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].depth).toBe(0);
    expect(tree[0].children[0].task.id).toBe("c");
    expect(tree[0].children[0].depth).toBe(1);
  });

  it("осиротіла дитина (батько відсутній) → корінь", () => {
    const tree = buildTaskTree([{ id: "c", parentTaskId: "missing" }]);
    expect(tree).toHaveLength(1);
    expect(tree[0].task.id).toBe("c");
  });

  it("цикл не зациклює", () => {
    const tree = buildTaskTree([
      { id: "a", parentTaskId: "b" },
      { id: "b", parentTaskId: "a" },
    ]);
    // не падає, обидва присутні десь у дереві
    const ids = flattenTree(tree, () => true).map((n) => n.task.id).sort();
    expect(ids).toContain("a");
    expect(ids).toContain("b");
  });
});

describe("flattenTree", () => {
  it("згорнутий батько ховає дітей", () => {
    const tree = buildTaskTree([
      { id: "p", parentTaskId: null },
      { id: "c", parentTaskId: "p" },
    ]);
    const collapsed = flattenTree(tree, () => false);
    expect(collapsed.map((n) => n.task.id)).toEqual(["p"]);
    const expanded = flattenTree(tree, () => true);
    expect(expanded.map((n) => n.task.id)).toEqual(["p", "c"]);
  });
});
