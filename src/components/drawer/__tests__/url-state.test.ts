import {
  buildUrlWithStack,
  hasLegacyTaskParam,
  parseStackParam,
  readStackFromUrl,
  serializeStack,
} from "../url-state";

describe("drawer/url-state", () => {
  describe("serializeStack", () => {
    it("returns empty string for empty stack", () => {
      expect(serializeStack([])).toBe("");
    });
    it("joins type:id pairs with commas", () => {
      expect(
        serializeStack([
          { type: "task", id: "abc" },
          { type: "user", id: "xyz" },
        ]),
      ).toBe("task:abc,user:xyz");
    });
  });

  describe("parseStackParam", () => {
    it("returns [] for null/empty", () => {
      expect(parseStackParam(null)).toEqual([]);
      expect(parseStackParam("")).toEqual([]);
    });

    it("parses valid stack", () => {
      expect(parseStackParam("task:abc,user:xyz")).toEqual([
        { type: "task", id: "abc" },
        { type: "user", id: "xyz" },
      ]);
    });

    it("skips malformed chunks but keeps valid ones", () => {
      expect(parseStackParam("task:abc,bad,user:")).toEqual([
        { type: "task", id: "abc" },
      ]);
    });

    it("rejects invalid type chars (uppercase start, symbols)", () => {
      expect(parseStackParam("Task:abc,task!:abc")).toEqual([]);
    });

    it("rejects invalid id chars (dots, slashes)", () => {
      expect(parseStackParam("task:a.b,task:a/b")).toEqual([]);
    });
  });

  describe("round-trip", () => {
    it("serialize → parse yields identity", () => {
      const stack = [
        { type: "task", id: "abc-123" },
        { type: "counterparty", id: "xyz_42" },
      ];
      expect(parseStackParam(serializeStack(stack))).toEqual(stack);
    });
  });

  describe("readStackFromUrl", () => {
    it("reads ?d=... when present", () => {
      const url = new URL("https://app.test/me?d=task:abc,user:xyz");
      expect(readStackFromUrl(url)).toEqual([
        { type: "task", id: "abc" },
        { type: "user", id: "xyz" },
      ]);
    });

    it("falls back to legacy ?task=<id>", () => {
      const url = new URL("https://app.test/me?task=abc123");
      expect(readStackFromUrl(url)).toEqual([{ type: "task", id: "abc123" }]);
    });

    it("?d takes precedence over ?task", () => {
      const url = new URL("https://app.test/me?d=task:newid&task=oldid");
      expect(readStackFromUrl(url)).toEqual([{ type: "task", id: "newid" }]);
    });

    it("returns [] when neither present", () => {
      const url = new URL("https://app.test/me");
      expect(readStackFromUrl(url)).toEqual([]);
    });
  });

  describe("buildUrlWithStack", () => {
    it("sets ?d= for non-empty stack", () => {
      const url = new URL("https://app.test/me");
      const next = buildUrlWithStack(url, [{ type: "task", id: "abc" }]);
      expect(next.searchParams.get("d")).toBe("task:abc");
    });

    it("removes ?d= for empty stack", () => {
      const url = new URL("https://app.test/me?d=task:abc&other=1");
      const next = buildUrlWithStack(url, []);
      expect(next.searchParams.has("d")).toBe(false);
      expect(next.searchParams.get("other")).toBe("1");
    });

    it("strips legacy ?task= when writing new stack", () => {
      const url = new URL("https://app.test/me?task=oldid");
      const next = buildUrlWithStack(url, [{ type: "task", id: "newid" }]);
      expect(next.searchParams.has("task")).toBe(false);
      expect(next.searchParams.get("d")).toBe("task:newid");
    });
  });

  describe("hasLegacyTaskParam", () => {
    it("true when only ?task=", () => {
      expect(hasLegacyTaskParam(new URL("https://app.test?task=abc"))).toBe(
        true,
      );
    });
    it("false when ?d= present (even with ?task=)", () => {
      expect(
        hasLegacyTaskParam(new URL("https://app.test?d=task:1&task=abc")),
      ).toBe(false);
    });
    it("false when neither", () => {
      expect(hasLegacyTaskParam(new URL("https://app.test"))).toBe(false);
    });
  });
});
