import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { FinancialSummary } from "@/components/dashboard/FinancialSummary";
import { PaymentScheduleTable } from "@/components/dashboard/PaymentScheduleTable";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import Link from "next/link";
import { ArrowLeft, FileText, Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";

export const dynamic = 'force-dynamic';

export default async function ProjectFinancesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");

  const project = await prisma.project.findFirst({
    where: { id, clientId: session.user.id },
    select: {
      id: true,
      title: true,
      totalBudget: true,
      totalPaid: true,
    },
  });

  if (!project) notFound();

  const payments = await prisma.payment.findMany({
    where: { projectId: id },
    orderBy: { scheduledDate: "asc" },
  });

  const completionActs = await prisma.completionAct.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
  });

  const estimates = await prisma.estimate.findMany({
    where: {
      projectId: id,
      status: "APPROVED", // Тільки затверджені кошториси
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <Link
        href={`/dashboard/projects/${id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        {project.title}
      </Link>

      <h1 className="mb-6 text-2xl font-bold">Фінанси</h1>

      {/* Financial Summary */}
      <div className="mb-8">
        <FinancialSummary
          totalBudget={Number(project.totalBudget)}
          totalPaid={Number(project.totalPaid)}
        />
      </div>

      {/* Payment Schedule */}
      <div className="mb-8">
        <h2 className="mb-4 text-lg font-semibold">Графік платежів</h2>
        <PaymentScheduleTable payments={payments} />
      </div>

      {/* Estimates */}
      {estimates.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-4 text-lg font-semibold">Кошториси</h2>
          <div className="space-y-3">
            {estimates.map((estimate) => (
              <Card key={estimate.id} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="rounded-lg bg-primary/10 p-2">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{estimate.title}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>№{estimate.number}</span>
                        <span>•</span>
                        <span>{formatCurrency(Number(estimate.finalAmount))}</span>
                        <span>•</span>
                        <span>{formatDateShort(estimate.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-green-100 text-green-700">Затверджено</Badge>
                    <a
                      href={`/api/estimates/${estimate.id}/export?format=pdf`}
                      download
                      className="hidden md:inline-flex"
                    >
                      <Button variant="outline" size="sm">
                        <Download className="h-3.5 w-3.5 mr-1.5" />
                        PDF
                      </Button>
                    </a>
                    <a
                      href={`/api/estimates/${estimate.id}/export?format=excel`}
                      download
                      className="hidden md:inline-flex"
                    >
                      <Button variant="outline" size="sm">
                        <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />
                        Excel
                      </Button>
                    </a>
                    {/* Mobile: Single dropdown */}
                    <div className="md:hidden relative group">
                      <Button variant="outline" size="sm">
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      <div className="hidden group-active:block absolute right-0 top-full mt-1 bg-card border rounded-lg shadow-lg z-10 min-w-[120px]">
                        <a
                          href={`/api/estimates/${estimate.id}/export?format=pdf`}
                          download
                          className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
                        >
                          <Download className="h-3.5 w-3.5" />
                          PDF
                        </a>
                        <a
                          href={`/api/estimates/${estimate.id}/export?format=excel`}
                          download
                          className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
                        >
                          <FileSpreadsheet className="h-3.5 w-3.5" />
                          Excel
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Completion Acts */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">Акти виконаних робіт</h2>
        {completionActs.length > 0 ? (
          <div className="space-y-3">
            {completionActs.map((act) => (
              <Card key={act.id} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="rounded-lg bg-primary/10 p-2">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {act.title}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>№{act.number}</span>
                        <span>•</span>
                        <span>{formatCurrency(Number(act.amount))}</span>
                        <span>•</span>
                        <span>{formatDateShort(act.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={act.signedByClient ? "success" : "warning"}>
                      {act.signedByClient ? "Підписано" : "На підпис"}
                    </Badge>
                    {act.fileUrl && (
                      <a
                        href={act.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg p-2 hover:bg-muted transition-colors"
                        title="Завантажити"
                      >
                        <Download className="h-4 w-4 text-muted-foreground" />
                      </a>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Актів виконаних робіт ще немає.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
