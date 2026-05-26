import { matchRoute } from "../matchRoute";
import type { PageHelpConfig } from "../types";

function cfg(route: string, title: string): PageHelpConfig {
  return { route, title, summary: "", jobsToBeDone: [], firstSteps: [] };
}

describe("matchRoute", () => {
  const registry: Record<string, PageHelpConfig> = {
    "/admin-v2/projects": cfg("/admin-v2/projects", "Проєкти"),
    "/admin-v2/financing": cfg("/admin-v2/financing", "Фінансування"),
    "/admin-v2/catalogs/materials": cfg("/admin-v2/catalogs/materials", "Каталог"),
  };

  it("returns exact match", () => {
    expect(matchRoute("/admin-v2/projects", registry)?.title).toBe("Проєкти");
  });

  it("returns parent match for dynamic segment", () => {
    expect(matchRoute("/admin-v2/projects/123", registry)?.title).toBe("Проєкти");
    expect(matchRoute("/admin-v2/financing/pivot", registry)?.title).toBe("Фінансування");
  });

  it("prefers longest matching prefix", () => {
    expect(matchRoute("/admin-v2/catalogs/materials/42", registry)?.title).toBe("Каталог");
  });

  it("returns null for unknown route", () => {
    expect(matchRoute("/admin-v2/unknown", registry)).toBeNull();
    expect(matchRoute("/dashboard", registry)).toBeNull();
  });

  it("does not match partial path segment (no false positive)", () => {
    expect(matchRoute("/admin-v2/projectsXY", registry)).toBeNull();
  });
});
