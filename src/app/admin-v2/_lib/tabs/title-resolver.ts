import { BREADCRUMB_MAP, NAV_GROUPS } from "../nav";

export interface TabMeta {
  title: string;
  iconKey?: string;
}

const ICON_NAMES: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      const iconName = (item.icon as unknown as { displayName?: string }).displayName ?? item.icon.name;
      if (iconName) map[item.href] = iconName;
    }
  }
  return map;
})();

function stripQuery(path: string): string {
  const q = path.indexOf("?");
  return q === -1 ? path : path.slice(0, q);
}

function titleCase(segment: string): string {
  return segment
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function resolveTabMeta(rawPath: string): TabMeta {
  const path = stripQuery(rawPath);

  if (BREADCRUMB_MAP[path]) {
    return { title: BREADCRUMB_MAP[path], iconKey: ICON_NAMES[path] };
  }

  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (path === item.href || path.startsWith(item.href + "/")) {
        const tail = path.slice(item.href.length).replace(/^\//, "");
        const title = tail
          ? `${item.label} · ${titleCase(decodeURIComponent(tail.split("/")[0]))}`
          : item.label;
        return { title, iconKey: ICON_NAMES[item.href] };
      }
    }
  }

  const tail = path.replace(/^\/admin-v2\/?/, "");
  if (!tail) return { title: "Дашборд", iconKey: ICON_NAMES["/admin-v2"] };
  return { title: titleCase(decodeURIComponent(tail.split("/")[0])) };
}
