import { redirect } from "next/navigation";

// Перенесено у єдиний довідник матеріалів:
// /admin-v2/catalogs/materials?tab=suppliers — таб «Ціни від постачальників».
// Stale-link redirect.
export default function SuppliersCatalogRedirect() {
  redirect("/admin-v2/catalogs/materials?tab=suppliers");
}
