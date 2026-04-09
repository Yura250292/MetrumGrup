"use client";

import { useState } from "react";
import Link from "next/link";
import { Calculator, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useProjectEstimates } from "@/hooks/useProjectEstimates";
import { ESTIMATE_STATUS_LABELS } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";
import { AIGenerateEstimateModal } from "./AIGenerateEstimateModal";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  SENT: "bg-blue-100 text-blue-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  REVISION: "bg-yellow-100 text-yellow-700",
  ENGINEER_REVIEW: "bg-purple-100 text-purple-700",
  FINANCE_REVIEW: "bg-orange-100 text-orange-700",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function ProjectEstimatesSection({ projectId }: { projectId: string }) {
  const { data: estimates, isLoading, error } = useProjectEstimates(projectId);
  const [aiModalOpen, setAiModalOpen] = useState(false);

  return (
    <div className="rounded-xl border admin-dark:border-white/10 admin-light:border-gray-200 admin-dark:bg-gray-900/40 admin-light:bg-white p-4">
      <div className="mb-4 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Calculator className="h-5 w-5 admin-dark:text-gray-400 admin-light:text-gray-600" />
          <h3 className="text-base font-bold admin-dark:text-white admin-light:text-gray-900">
            Кошториси
          </h3>
          {estimates && (
            <span className="text-xs admin-dark:text-gray-500 admin-light:text-gray-500">
              ({estimates.length})
            </span>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAiModalOpen(true)}
          >
            <Sparkles className="h-4 w-4" />
            AI з файлів
          </Button>
          <Link href={`/admin/estimates/ai-generate?projectId=${projectId}`}>
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Створити
            </Button>
          </Link>
        </div>
      </div>

      <div className="space-y-2">
        {isLoading && (
          <p className="text-sm admin-dark:text-gray-500 admin-light:text-gray-500">
            Завантаження...
          </p>
        )}
        {error && (
          <p className="text-sm text-red-500">
            Помилка: {(error as Error).message}
          </p>
        )}
        {!isLoading && estimates?.length === 0 && (
          <p className="text-sm text-center py-4 admin-dark:text-gray-500 admin-light:text-gray-500">
            Поки немає кошторисів. Створіть перший вручну або дайте AI зробити це з ваших файлів.
          </p>
        )}
        {estimates?.map((est) => (
          <Link key={est.id} href={`/admin/estimates/${est.id}`}>
            <div className="flex items-center gap-3 rounded-lg border admin-dark:border-white/5 admin-dark:bg-gray-900/40 admin-dark:hover:bg-gray-900/60 admin-light:border-gray-100 admin-light:bg-white admin-light:hover:bg-gray-50 p-3 transition-colors cursor-pointer">
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-purple-500 to-violet-500 flex items-center justify-center text-white flex-shrink-0">
                <Calculator className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <p className="text-sm font-semibold truncate admin-dark:text-white admin-light:text-gray-900">
                    {est.number}
                  </p>
                  <Badge className={STATUS_COLORS[est.status] ?? ""}>
                    {ESTIMATE_STATUS_LABELS[est.status as keyof typeof ESTIMATE_STATUS_LABELS] ?? est.status}
                  </Badge>
                </div>
                <p className="text-xs truncate admin-dark:text-gray-400 admin-light:text-gray-600">
                  {est.title}
                </p>
                <p className="text-[10px] admin-dark:text-gray-500 admin-light:text-gray-500">
                  {formatDate(est.createdAt)}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold admin-dark:text-emerald-400 admin-light:text-emerald-600">
                  {formatCurrency(Number(est.finalClientPrice || est.totalAmount || 0))}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <AIGenerateEstimateModal
        open={aiModalOpen}
        onOpenChange={setAiModalOpen}
        projectId={projectId}
      />
    </div>
  );
}
