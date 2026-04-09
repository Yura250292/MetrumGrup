"use client";

import Link from "next/link";
import type { FeedItem } from "@/hooks/useFeed";
import { formatCurrency } from "@/lib/utils";
import { timeAgo } from "@/lib/timeAgo";
import { FeedIcon } from "./FeedIcon";

const KIND_VERBS: Record<FeedItem["kind"], string> = {
  completion_act: "оформлено",
  photo_report: "додано",
  estimate_approved: "затверджено",
  comment: "залишено",
  chat_message: "нове повідомлення",
};

export function FeedItemCard({ item, compact = false }: { item: FeedItem; compact?: boolean }) {
  return (
    <Link href={item.link}>
      <div
        className={`flex items-start gap-3 ${
          compact ? "p-3" : "p-4"
        } rounded-xl border transition-colors admin-dark:border-white/10 admin-dark:bg-gray-900/40 admin-dark:hover:bg-gray-900/60 admin-light:border-gray-200 admin-light:bg-white admin-light:hover:bg-gray-50 cursor-pointer`}
      >
        <FeedIcon kind={item.kind} size={compact ? "sm" : "md"} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <p
              className={`font-semibold truncate admin-dark:text-white admin-light:text-gray-900 ${
                compact ? "text-xs" : "text-sm"
              }`}
            >
              {item.title}
            </p>
            {item.amount !== undefined && (
              <span
                className={`flex-shrink-0 font-bold admin-dark:text-emerald-400 admin-light:text-emerald-600 ${
                  compact ? "text-xs" : "text-sm"
                }`}
              >
                {formatCurrency(item.amount)}
              </span>
            )}
          </div>
          {item.subtitle && (
            <p
              className={`mt-0.5 admin-dark:text-gray-400 admin-light:text-gray-600 ${
                compact ? "text-[11px]" : "text-xs"
              }`}
            >
              {item.subtitle}
            </p>
          )}
          {item.preview && (
            <p
              className={`mt-1 italic admin-dark:text-gray-300 admin-light:text-gray-700 line-clamp-2 ${
                compact ? "text-[11px]" : "text-xs"
              }`}
            >
              «{item.preview}»
            </p>
          )}
          <div
            className={`mt-1.5 flex items-center gap-2 flex-wrap text-[10px] admin-dark:text-gray-500 admin-light:text-gray-500 ${
              compact ? "" : "text-[11px]"
            }`}
          >
            {item.actor && (
              <span className="font-medium admin-dark:text-gray-400 admin-light:text-gray-600">
                {item.actor.name}
              </span>
            )}
            <span>{KIND_VERBS[item.kind]}</span>
            {item.project && (
              <>
                <span>•</span>
                <span className="truncate">{item.project.title}</span>
              </>
            )}
            <span>•</span>
            <span>{timeAgo(item.createdAt)}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
