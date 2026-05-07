"use client";

import { useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion } from "framer-motion";
import { BookmarkCheck, ExternalLink, MessageSquare } from "lucide-react";

interface BookmarkItem {
  id: string;
  content: string;
  createdAt: string;
  conversationId: string;
  conversationTitle: string;
}

interface Props {
  items: BookmarkItem[];
}

export function BookmarksList({ items: initialItems }: Props) {
  const [items, setItems] = useState(initialItems);

  const removeBookmark = async (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    try {
      await fetch(`/api/owner/messages/${id}/bookmark`, { method: "POST" });
    } catch {
      // ignore — оптимістично оновили
    }
  };

  if (items.length === 0) {
    return (
      <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-8 text-center">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-3">
          <BookmarkCheck size={20} className="text-amber-300" />
        </div>
        <h2 className="text-base font-semibold text-white mb-1">Поки нема закладок</h2>
        <p className="text-sm text-zinc-400 leading-relaxed max-w-xs mx-auto">
          У будь-якій відповіді AI асистента натисни{" "}
          <span className="inline-flex items-center gap-1 text-amber-300">
            <BookmarkCheck size={12} /> Закласти
          </span>{" "}
          — повідомлення з{"’"}явиться тут.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((b, i) => (
        <motion.li
          key={b.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: i * 0.03 }}
          className="rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-md overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-white/5 bg-white/[0.02]">
            <Link
              href={`/owner/chat?c=${b.conversationId}`}
              className="flex items-center gap-1.5 text-xs text-zinc-300 hover:text-white truncate transition group"
              title="Відкрити розмову"
            >
              <MessageSquare size={11} className="shrink-0 text-zinc-500" />
              <span className="truncate">{b.conversationTitle}</span>
              <ExternalLink size={10} className="shrink-0 opacity-0 group-hover:opacity-100 transition" />
            </Link>
            <span className="text-[10px] text-zinc-500 tabular-nums shrink-0">
              {new Date(b.createdAt).toLocaleDateString("uk-UA", {
                day: "2-digit",
                month: "2-digit",
                year: "2-digit",
              })}
            </span>
          </div>

          <div className="px-4 py-3 prose prose-invert prose-sm max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                table: ({ children }) => (
                  <div className="overflow-x-auto my-2">
                    <table className="w-full text-xs border-collapse">{children}</table>
                  </div>
                ),
                th: ({ children }) => (
                  <th className="text-left px-2 py-1.5 font-semibold text-zinc-300 border-b border-white/10 bg-white/[0.04]">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="px-2 py-1.5 text-zinc-200 border-b border-white/5">{children}</td>
                ),
                p: ({ children }) => (
                  <p className="text-sm text-zinc-200 leading-relaxed my-1.5">{children}</p>
                ),
                strong: ({ children }) => <strong className="text-white font-bold">{children}</strong>,
                code: ({ className, children }) => {
                  const lang = (className ?? "").replace(/^language-/, "");
                  if (
                    lang === "chart-bar" ||
                    lang === "chart-line" ||
                    lang === "chart-pie" ||
                    lang === "suggestions"
                  ) {
                    return null;
                  }
                  return (
                    <code className="bg-white/[0.06] text-amber-300 px-1 py-0.5 rounded text-[11px]">
                      {children}
                    </code>
                  );
                },
              }}
            >
              {b.content}
            </ReactMarkdown>
          </div>

          <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-white/5 bg-white/[0.02]">
            <button
              type="button"
              onClick={() => removeBookmark(b.id)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-rose-500/10 hover:text-rose-300 text-[11px] text-zinc-400 transition cursor-pointer"
              title="Прибрати закладку"
            >
              <BookmarkCheck size={11} />
              Прибрати
            </button>
            <Link
              href={`/owner/chat?c=${b.conversationId}`}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-500/10 hover:bg-violet-500/20 text-[11px] text-violet-300 transition"
            >
              Відкрити
              <ExternalLink size={11} />
            </Link>
          </div>
        </motion.li>
      ))}
    </ul>
  );
}
