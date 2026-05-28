export function dirtyFieldClass(
  dirty: ReadonlySet<string>,
  name: string,
): string {
  return dirty.has(name)
    ? "ring-2 ring-amber-400 border-amber-400 bg-amber-50/30"
    : "";
}
