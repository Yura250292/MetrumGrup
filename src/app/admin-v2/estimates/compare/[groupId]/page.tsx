import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { EstimateCompareView } from "./_components/estimate-compare-view";

export const dynamic = "force-dynamic";

export default async function EstimateComparePage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  const allowed = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER"];
  if (!allowed.includes(session.user.role)) redirect("/");

  if (!groupId) notFound();

  return <EstimateCompareView groupId={groupId} />;
}
