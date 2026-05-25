import type { DrawerEntity } from "./types";

const STACK_PARAM = "d";
const LEGACY_TASK_PARAM = "task";

const TYPE_RE = /^[a-z][a-zA-Z0-9_-]*$/;
const ID_RE = /^[a-zA-Z0-9_-]+$/;

export function serializeStack(stack: ReadonlyArray<DrawerEntity>): string {
  return stack.map((s) => `${s.type}:${s.id}`).join(",");
}

export function parseStackParam(d: string | null | undefined): DrawerEntity[] {
  if (!d) return [];
  return d
    .split(",")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const idx = chunk.indexOf(":");
      if (idx <= 0 || idx === chunk.length - 1) return null;
      const type = chunk.slice(0, idx);
      const id = chunk.slice(idx + 1);
      if (!TYPE_RE.test(type) || !ID_RE.test(id)) return null;
      return { type, id };
    })
    .filter((x): x is DrawerEntity => x !== null);
}

export function buildUrlWithStack(
  url: URL,
  stack: ReadonlyArray<DrawerEntity>,
): URL {
  const next = new URL(url.toString());
  if (stack.length === 0) {
    next.searchParams.delete(STACK_PARAM);
  } else {
    next.searchParams.set(STACK_PARAM, serializeStack(stack));
  }
  next.searchParams.delete(LEGACY_TASK_PARAM);
  return next;
}

export function readStackFromUrl(url: URL): DrawerEntity[] {
  const d = url.searchParams.get(STACK_PARAM);
  if (d) return parseStackParam(d);
  const legacyTask = url.searchParams.get(LEGACY_TASK_PARAM);
  if (legacyTask && ID_RE.test(legacyTask)) {
    return [{ type: "task", id: legacyTask }];
  }
  return [];
}

export function hasLegacyTaskParam(url: URL): boolean {
  return (
    !url.searchParams.has(STACK_PARAM) &&
    !!url.searchParams.get(LEGACY_TASK_PARAM)
  );
}

export const DRAWER_URL_PARAM = STACK_PARAM;
export const DRAWER_LEGACY_TASK_PARAM = LEGACY_TASK_PARAM;
