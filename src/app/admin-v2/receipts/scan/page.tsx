import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { ScanUploader } from "./_components/scan-uploader";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { firmWhereForProject } from "@/lib/firm/scope";

export const dynamic = "force-dynamic";

export default async function AdminV2ReceiptScanPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { firmId } = await resolveFirmScopeForRequest(session);

  const projects = await prisma.project.findMany({
    where: {
      status: { in: ["ACTIVE", "DRAFT"] },
      ...firmWhereForProject(firmId),
    },
    orderBy: { title: "asc" },
    select: { id: true, title: true, status: true },
  });

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
          СКАН НАКЛАДНОЇ
        </span>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight" style={{ color: T.textPrimary }}>
          Сканувати накладну
        </h1>
        <p className="text-[15px]" style={{ color: T.textSecondary }}>
          Оберіть проєкт і завантажте фото або PDF накладної. AI розпізнає позиції,
          ви підтвердите матчинг — і матеріали впадуть на склад проєкту.
        </p>
      </section>

      <ScanUploader projects={projects} />
    </div>
  );
}
