/**
 * @jest-environment jsdom
 */
import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import {
  DrillDownDrawerProvider,
  DRILL_DOWN_MAX_DEPTH,
} from "../DrillDownDrawerProvider";
import { useDrillDown } from "../use-drill-down";

type Captured = ReturnType<typeof useDrillDown>;

function Probe({ onReady }: { onReady: (api: Captured) => void }) {
  const api = useDrillDown();
  useEffect(() => {
    onReady(api);
  }, [api, onReady]);
  return null;
}

function setup(initialUrl = "https://app.test/admin-v2/me") {
  // Reset history + URL for each test
  window.history.replaceState({}, "", new URL(initialUrl).pathname);
  let api: Captured | null = null;
  const onReady = (a: Captured) => {
    api = a;
  };
  render(
    <DrillDownDrawerProvider>
      <Probe onReady={onReady} />
    </DrillDownDrawerProvider>,
  );
  if (!api) throw new Error("Probe did not capture API");
  return {
    get api() {
      if (!api) throw new Error("API not ready");
      return api;
    },
  };
}

describe("DrillDownDrawerProvider", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("starts with empty stack", () => {
    const t = setup();
    expect(t.api.stack).toEqual([]);
  });

  it("open pushes onto stack and updates URL", () => {
    const t = setup();
    act(() => t.api.open({ type: "task", id: "abc" }));
    expect(t.api.stack.map((s) => `${s.type}:${s.id}`)).toEqual(["task:abc"]);
    expect(window.location.search).toContain("d=task%3Aabc");
  });

  it("open is no-op if duplicate of top", () => {
    const t = setup();
    act(() => t.api.open({ type: "task", id: "abc" }));
    const firstUid = t.api.stack[0].uid;
    act(() => t.api.open({ type: "task", id: "abc" }));
    expect(t.api.stack).toHaveLength(1);
    expect(t.api.stack[0].uid).toBe(firstUid);
  });

  it("open drills (allows same entity nested below other)", () => {
    const t = setup();
    act(() => t.api.open({ type: "task", id: "abc" }));
    act(() => t.api.open({ type: "user", id: "u1" }));
    expect(t.api.stack.map((s) => `${s.type}:${s.id}`)).toEqual([
      "task:abc",
      "user:u1",
    ]);
  });

  it("back pops top", () => {
    const t = setup();
    act(() => t.api.open({ type: "task", id: "abc" }));
    act(() => t.api.open({ type: "user", id: "u1" }));
    act(() => t.api.back());
    expect(t.api.stack.map((s) => `${s.type}:${s.id}`)).toEqual(["task:abc"]);
  });

  it("closeAll empties stack and clears ?d=", () => {
    const t = setup();
    act(() => t.api.open({ type: "task", id: "abc" }));
    act(() => t.api.closeAll());
    expect(t.api.stack).toEqual([]);
    expect(window.location.search).toBe("");
  });

  it("replaceTop swaps last without growing stack", () => {
    const t = setup();
    act(() => t.api.open({ type: "task", id: "abc" }));
    act(() => t.api.open({ type: "user", id: "u1" }));
    act(() => t.api.replaceTop({ type: "user", id: "u2" }));
    expect(t.api.stack.map((s) => `${s.type}:${s.id}`)).toEqual([
      "task:abc",
      "user:u2",
    ]);
  });

  it("setTopBreadcrumb annotates top item only", () => {
    const t = setup();
    act(() => t.api.open({ type: "task", id: "abc" }));
    act(() => t.api.open({ type: "user", id: "u1" }));
    act(() => t.api.setTopBreadcrumb("Іван"));
    expect(t.api.stack[1].breadcrumbLabel).toBe("Іван");
    expect(t.api.stack[0].breadcrumbLabel).toBeUndefined();
  });

  it("enforces max depth by dropping oldest", () => {
    const t = setup();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    for (let i = 0; i < DRILL_DOWN_MAX_DEPTH + 1; i++) {
      act(() => t.api.open({ type: "task", id: `t${i}` }));
    }
    expect(t.api.stack).toHaveLength(DRILL_DOWN_MAX_DEPTH);
    // First (t0) should have been dropped
    expect(t.api.stack[0].id).toBe("t1");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("reads initial state from URL ?d=", () => {
    window.history.replaceState({}, "", "/me?d=task:abc,user:u1");
    let api: Captured | null = null;
    render(
      <DrillDownDrawerProvider>
        <Probe
          onReady={(a) => {
            api = a;
          }}
        />
      </DrillDownDrawerProvider>,
    );
    expect(api!.stack.map((s) => `${s.type}:${s.id}`)).toEqual([
      "task:abc",
      "user:u1",
    ]);
  });

  it("migrates legacy ?task= → ?d=task:", () => {
    window.history.replaceState({}, "", "/me?task=legacy123");
    let api: Captured | null = null;
    render(
      <DrillDownDrawerProvider>
        <Probe
          onReady={(a) => {
            api = a;
          }}
        />
      </DrillDownDrawerProvider>,
    );
    expect(api!.stack.map((s) => `${s.type}:${s.id}`)).toEqual([
      "task:legacy123",
    ]);
    expect(window.location.search).not.toContain("task=legacy123");
    expect(window.location.search).toContain("d=");
  });

  it("popstate event re-syncs stack from URL", () => {
    const t = setup();
    act(() => t.api.open({ type: "task", id: "abc" }));
    expect(t.api.stack).toHaveLength(1);
    // Simulate back-button: URL goes back, popstate fires
    act(() => {
      window.history.replaceState({}, "", "/admin-v2/me");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(t.api.stack).toHaveLength(0);
  });
});
