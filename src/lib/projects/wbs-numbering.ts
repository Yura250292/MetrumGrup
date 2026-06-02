/**
 * Обчислення WBS-кодів (1 / 1.1 / 1.1.1) для дерева етапів виконання
 * (ProjectStageRecord). Чисте, без Prisma — код виводиться з позиції у дереві
 * (parentStageId + sortOrder), тож сам перераховується після перестановок.
 * Не персиститься в БД — лише для відображення.
 *
 * Матеріали (costType === "MATERIAL") нумеруються окремим лічильником із
 * суфіксом «М» у межах батька: роботи 1.1.1, 1.1.2; матеріали 1.1.М1, 1.1.М2.
 */

export type WbsRow = {
  id: string;
  parentStageId: string | null;
  sortOrder: number;
  costType: "LABOR" | "MATERIAL" | null;
};

const MATERIAL_PREFIX = "М";

export function computeWbsCodes(rows: WbsRow[]): Map<string, string> {
  const byId = new Map<string, WbsRow>();
  for (const r of rows) byId.set(r.id, r);

  // Діти за батьком; корінь = без батька АБО батько поза набором.
  const childrenByParent = new Map<string | null, WbsRow[]>();
  for (const r of rows) {
    const parentKey =
      r.parentStageId && byId.has(r.parentStageId) && r.parentStageId !== r.id
        ? r.parentStageId
        : null;
    const arr = childrenByParent.get(parentKey) ?? [];
    arr.push(r);
    childrenByParent.set(parentKey, arr);
  }

  const result = new Map<string, string>();
  const visited = new Set<string>();

  const assign = (parentKey: string | null, parentCode: string) => {
    const children = (childrenByParent.get(parentKey) ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));

    let workN = 0;
    let materialN = 0;
    for (const child of children) {
      if (visited.has(child.id)) continue; // захист від циклів
      visited.add(child.id);

      const seg =
        child.costType === "MATERIAL"
          ? `${MATERIAL_PREFIX}${++materialN}`
          : `${++workN}`;
      const code = parentCode ? `${parentCode}.${seg}` : seg;
      result.set(child.id, code);

      assign(child.id, code);
    }
  };

  assign(null, "");

  // Недосяжні вузли (взаємний цикл, де жоден не корінь) — промоутимо у корені,
  // продовжуючи нумерацію, щоб етапи не зникали.
  let rootWork = Array.from(result.values()).filter((c) => /^\d+$/.test(c)).length;
  let rootMaterial = Array.from(result.values()).filter((c) =>
    new RegExp(`^${MATERIAL_PREFIX}\\d+$`).test(c),
  ).length;
  for (const row of rows) {
    if (visited.has(row.id)) continue;
    visited.add(row.id);
    const seg =
      row.costType === "MATERIAL"
        ? `${MATERIAL_PREFIX}${++rootMaterial}`
        : `${++rootWork}`;
    result.set(row.id, seg);
    assign(row.id, seg);
  }

  return result;
}
