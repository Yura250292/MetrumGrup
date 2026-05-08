import { redirect } from "next/navigation";

// Сторінку обʼєднано з /admin-v2/financing/suppliers (таб «Журнал платежів»).
// Редірект — щоб не зламати existing закладки і linki з дос'є.
export default function SupplierPaymentsRedirect() {
  redirect("/admin-v2/financing/suppliers?tab=payments");
}
