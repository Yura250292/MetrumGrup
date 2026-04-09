"use client";

import { useState } from "react";
import { Activity } from "lucide-react";
import { useFeed, type FeedKind } from "@/hooks/useFeed";
import { FeedItemCard } from "@/components/feed/FeedItemCard";

const FILTERS: { value: "all" | FeedKind | "completed"; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "completed", label: "Виконано" },
  { value: "photo_report", label: "Фото" },
  { value: "estimate_approved", label: "Кошториси" },
  { value: "comment", label: "Коментарі" },
];

const COMPLETED_KINDS = new Set<FeedKind>([
  "completion_act",
  "estimate_approved",
  "photo_report",
]);

export default function FeedPage() {
  const [filter, setFilter] = useState<typeof FILTERS[number]["value"]>("all");
  const { data, isLoading, error } = useFeed(30);

  const items = (data?.items ?? []).filter((item) => {
    if (filter === "all") return true;
    if (filter === "completed") return COMPLETED_KINDS.has(item.kind);
    return item.kind === filter;
  });

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 p-2.5 text-white">
          <Activity className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Стрічка активності</h1>
          <p className="text-sm text-muted-foreground">
            Усе, що відбувається в компанії — в одному місці
          </p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="mb-4 flex gap-2 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === f.value
                ? "bg-blue-600 text-white"
                : "admin-dark:bg-white/5 admin-dark:text-gray-300 admin-dark:hover:bg-white/10 admin-light:bg-gray-100 admin-light:text-gray-700 admin-light:hover:bg-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

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

      {!isLoading && items.length === 0 && (
        <div className="rounded-xl border admin-dark:border-white/10 admin-light:border-gray-200 p-8 text-center">
          <Activity className="mx-auto h-10 w-10 admin-dark:text-gray-700 admin-light:text-gray-300" />
          <p className="mt-2 text-sm admin-dark:text-gray-500 admin-light:text-gray-500">
            Поки що нічого не відбулось
          </p>
        </div>
      )}

      <div className="space-y-2">
        {items.map((item) => (
          <FeedItemCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
