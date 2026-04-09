"use client";

import Link from "next/link";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { useFeed } from "@/hooks/useFeed";
import { FeedItemCard } from "@/components/feed/FeedItemCard";

const COMPLETED_KINDS = new Set([
  "completion_act",
  "estimate_approved",
  "photo_report",
]);

export function RecentlyCompletedWidget() {
  const { data, isLoading } = useFeed(15);

  const completedItems = (data?.items ?? [])
    .filter((item) => COMPLETED_KINDS.has(item.kind))
    .slice(0, 5);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 admin-dark:text-emerald-400 admin-light:text-emerald-600" />
          <h2 className="text-lg font-bold admin-dark:text-white admin-light:text-gray-900">
            Нещодавно виконано
          </h2>
        </div>
        <Link
          href="/admin/feed"
          className="text-xs font-medium text-blue-500 hover:underline flex items-center gap-1"
        >
          Вся стрічка
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {isLoading && (
        <div className="rounded-xl border admin-dark:border-white/10 admin-light:border-gray-200 p-4 text-sm admin-dark:text-gray-500 admin-light:text-gray-500">
          Завантаження...
        </div>
      )}

      {!isLoading && completedItems.length === 0 && (
        <div className="rounded-xl border admin-dark:border-white/10 admin-light:border-gray-200 p-4 text-sm admin-dark:text-gray-500 admin-light:text-gray-500">
          Поки немає виконаних робіт
        </div>
      )}

      {!isLoading && completedItems.length > 0 && (
        <div className="space-y-2">
          {completedItems.map((item) => (
            <FeedItemCard key={item.id} item={item} compact />
          ))}
        </div>
      )}
    </div>
  );
}
