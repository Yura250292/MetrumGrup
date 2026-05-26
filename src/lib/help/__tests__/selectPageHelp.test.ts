import { selectPageHelp } from "../selectPageHelp";
import type { PageHelpConfig } from "../types";

const REGISTRY: Record<string, PageHelpConfig> = {
  "/admin-v2/financing": {
    route: "/admin-v2/financing",
    title: "Фінансування",
    summary: "fin",
    audience: ["SUPER_ADMIN"],
    jobsToBeDone: [
      { text: "Add entry", requiresFinance: true },
      { text: "View list", requiresFinance: false },
    ],
    firstSteps: ["a", "b"],
  },
  "/admin-v2/projects": {
    route: "/admin-v2/projects",
    title: "Проєкти",
    summary: "proj",
    jobsToBeDone: [
      { text: "Create", requiresFinance: false },
      { text: "View budget", requiresFinance: true },
    ],
    firstSteps: [],
  },
};

describe("selectPageHelp", () => {
  it("returns fallback for unknown route", () => {
    const res = selectPageHelp("/admin-v2/unknown", "SUPER_ADMIN", REGISTRY);
    expect(res?.isFallback).toBe(true);
    expect(res?.title).toBe("Допомога");
  });

  it("hides page entirely when audience excludes role", () => {
    expect(selectPageHelp("/admin-v2/financing", "ENGINEER", REGISTRY)).toBeNull();
    expect(selectPageHelp("/admin-v2/financing", null, REGISTRY)).toBeNull();
  });

  it("allows SUPER_ADMIN to see all jobs on financing", () => {
    const res = selectPageHelp("/admin-v2/financing", "SUPER_ADMIN", REGISTRY);
    expect(res?.jobsToBeDone).toHaveLength(2);
  });

  it("filters finance jobs out for non-finance roles on shared pages", () => {
    const res = selectPageHelp("/admin-v2/projects", "ENGINEER", REGISTRY);
    expect(res?.title).toBe("Проєкти");
    expect(res?.jobsToBeDone.map((j) => j.text)).toEqual(["Create"]);
  });

  it("keeps all jobs for SUPER_ADMIN on shared pages", () => {
    const res = selectPageHelp("/admin-v2/projects", "SUPER_ADMIN", REGISTRY);
    expect(res?.jobsToBeDone).toHaveLength(2);
  });

  it("matches dynamic child routes to parent config", () => {
    const res = selectPageHelp("/admin-v2/projects/abc-123", "MANAGER", REGISTRY);
    expect(res?.title).toBe("Проєкти");
  });
});
