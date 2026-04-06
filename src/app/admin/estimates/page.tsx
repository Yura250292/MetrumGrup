import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ESTIMATE_STATUS_LABELS } from "@/lib/constants";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import Link from "next/link";
import { Plus, FileText, Sparkles, FileDown, FileSpreadsheet, Mail } from "lucide-react";
import { redirect } from "next/navigation";
import { EstimateActions } from "@/components/admin/EstimateActions";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  SENT: "bg-blue-100 text-blue-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  REVISION: "bg-yellow-100 text-yellow-700",
  ENGINEER_REVIEW: "bg-purple-100 text-purple-700",
  FINANCE_REVIEW: "bg-orange-100 text-orange-700",
};

export const dynamic = 'force-dynamic';

export default async function EstimatesPage() {
  const session = await auth();

  // Check authentication
  if (!session?.user) {
    redirect("/auth/signin");
  }

  // Check authorization - allow SUPER_ADMIN, MANAGER, ENGINEER, and FINANCIER
  const allowedRoles = ["SUPER_ADMIN", "MANAGER", "ENGINEER", "FINANCIER"];
  if (!allowedRoles.includes(session.user.role)) {
    redirect("/dashboard");
  }

  const estimates = await prisma.estimate.findMany({
    include: {
      project: { select: { title: true, client: { select: { name: true } } } },
      createdBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Кошториси</h1>
          <p className="mt-1 text-sm text-muted-foreground">{estimates.length} кошторисів</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/estimates/ai-generate" className="flex-1 md:flex-none">
            <Button className="w-full bg-gradient-to-r from-primary to-amber-500 hover:from-primary/90 hover:to-amber-500/90">
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">AI Генератор</span>
              <span className="sm:hidden">AI</span>
            </Button>
          </Link>
          <Link href="/admin/estimates/new" className="flex-1 md:flex-none">
            <Button variant="outline" className="w-full">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Вручну</span>
              <span className="sm:hidden">Новий</span>
            </Button>
          </Link>
        </div>
      </div>

      {estimates.length > 0 ? (
        <div className="space-y-3">
          {estimates.map((est) => (
            <Link key={est.id} href={`/admin/estimates/${est.id}`}>
              <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer">
                {/* Mobile-optimized layout */}
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  {/* Icon and Title Section */}
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="rounded-xl admin-dark:bg-gradient-to-br admin-dark:from-amber-500 admin-dark:to-amber-600 admin-light:bg-amber-100 p-3 flex-shrink-0 shadow-lg">
                      <FileText className="h-5 w-5 admin-dark:text-white admin-light:text-amber-700" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-base admin-dark:text-white admin-light:text-gray-900 mb-1">{est.title}</p>
                      <Badge className={STATUS_COLORS[est.status]}>
                        {ESTIMATE_STATUS_LABELS[est.status]}
                      </Badge>
                    </div>
                  </div>

                  {/* Info Section - Stack on mobile */}
                  <div className="flex flex-col gap-2 md:gap-3 md:flex-row md:items-center">
                    {/* Details */}
                    <div className="flex flex-col gap-0.5">
                      <p className="text-xs admin-dark:text-gray-400 admin-light:text-gray-600">
                        <span className="font-medium">{est.number}</span>
                      </p>
                      <p className="text-xs admin-dark:text-gray-400 admin-light:text-gray-600">
                        {est.project.title}
                      </p>
                      <p className="text-xs admin-dark:text-gray-400 admin-light:text-gray-600">
                        {est.project.client.name}
                      </p>
                      <p className="text-xs admin-dark:text-gray-500 admin-light:text-gray-500">
                        {formatDateShort(est.createdAt)}
                      </p>
                    </div>

                    {/* Amount and Actions */}
                    <div className="flex items-center justify-between md:justify-end gap-3">
                      <div className="text-left md:text-right">
                        <p className="font-bold text-lg admin-dark:text-white admin-light:text-gray-900">
                          {formatCurrency(Number(est.finalAmount))}
                        </p>
                        {Number(est.discount) > 0 && (
                          <p className="text-xs admin-dark:text-gray-400 admin-light:text-gray-500 line-through">
                            {formatCurrency(Number(est.totalAmount))}
                          </p>
                        )}
                      </div>
                      <EstimateActions
                        estimateId={est.id}
                        estimateNumber={est.number}
                        status={est.status}
                        clientName={est.project.client.name}
                      />
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card className="p-12 text-center">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-medium">Немає кошторисів</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Створіть перший кошторис для проєкту
          </p>
        </Card>
      )}
    </div>
  );
}
