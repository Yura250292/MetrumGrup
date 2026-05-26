import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { CounterpartyCompareView } from "../_components/counterparty-compare-view";

export const dynamic = "force-dynamic";

const ALLOWED = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER", "HR"];

export default async function CounterpartyComparePage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!ALLOWED.includes(session.user.role)) redirect("/admin-v2");

  const { ids } = await searchParams;
  const counterpartyIds = (ids ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return <CounterpartyCompareView ids={counterpartyIds} />;
}
