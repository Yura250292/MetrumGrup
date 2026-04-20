import type { FinanceCategoryKey } from "@/lib/constants";

type ItemLike = {
  itemType?: string | null;
  description?: string | null;
};

type SectionLike = {
  title?: string | null;
} | null
  | undefined;

const SECTION_TITLE_TO_CATEGORY: Record<string, FinanceCategoryKey> = {
  "демонтаж": "demolition",
  "демонтажні роботи": "demolition",
  "земляні роботи": "construction",
  "фундамент": "construction",
  "стіни": "construction",
  "покрівля": "construction",
  "покривля": "construction",
  "опоряджувальні роботи": "construction",
  "опорядження": "construction",
  "оздоблення": "construction",
  "електрика": "construction",
  "електромонтаж": "construction",
  "сантехніка": "construction",
  "опалення": "construction",
  "вентиляція": "construction",
  "пожежна безпека": "construction",
  "проєктування": "design",
  "проектування": "design",
  "логістика": "logistics",
  "транспорт": "logistics",
  "адміністративні": "admin",
  "оренда": "rent",
  "техніка": "equipment",
  "обладнання": "equipment",
  "матеріали": "materials",
  "робота": "salary",
  "роботи": "subcontractors",
  "підрядники": "subcontractors",
  "податки": "taxes",
};

export function mapItemToFinanceCategory(
  item: ItemLike,
  section: SectionLike,
): FinanceCategoryKey {
  switch (item.itemType) {
    case "labor":
      return "subcontractors";
    case "equipment":
      return "equipment";
    case "material":
      return "materials";
  }

  const title = section?.title?.trim().toLowerCase();
  if (title) {
    const direct = SECTION_TITLE_TO_CATEGORY[title];
    if (direct) return direct;

    for (const [needle, category] of Object.entries(SECTION_TITLE_TO_CATEGORY)) {
      if (title.includes(needle)) return category;
    }
  }

  return "construction";
}
