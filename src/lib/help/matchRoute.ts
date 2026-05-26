import type { PageHelpConfig } from "./types";

export function matchRoute(
  pathname: string,
  registry: Record<string, PageHelpConfig>,
): PageHelpConfig | null {
  if (registry[pathname]) return registry[pathname];

  const keys = Object.keys(registry).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (pathname === key) return registry[key];
    if (pathname.startsWith(key + "/")) return registry[key];
  }
  return null;
}
