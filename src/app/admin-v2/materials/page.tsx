import { redirect } from "next/navigation";

// Сторінку перенесено у єдиний довідник матеріалів:
// /admin-v2/catalogs/materials (таб «Каталог матеріалів»). Редірект — щоб
// existing закладки не зламались.
export default function MaterialsRedirect() {
  redirect("/admin-v2/catalogs/materials");
}
