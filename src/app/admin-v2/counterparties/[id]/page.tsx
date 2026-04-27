import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CounterpartyDossier } from "../_components/counterparty-dossier";

export const dynamic = "force-dynamic";

const ALLOWED = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER", "HR"];

export default async function CounterpartyDossierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!ALLOWED.includes(session.user.role)) redirect("/admin-v2");

  const { id } = await params;
  const cp = await prisma.counterparty.findUnique({ where: { id } });
  if (!cp) notFound();

  return (
    <CounterpartyDossier
      id={id}
      currentUserRole={session.user.role}
    />
  );
}
