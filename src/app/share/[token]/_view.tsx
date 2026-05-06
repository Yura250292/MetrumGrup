"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface Props {
  title: string;
  author: string;
  sharedAt: string;
  messages: Msg[];
}

export function SharedConversationView({ title, author, sharedAt, messages }: Props) {
  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-6 pb-5 border-b border-white/10"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-violet-400 font-bold">
              <Sparkles size={11} />
              Метрум · AI асистент
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight leading-tight">{title}</h1>
          <div className="mt-2 text-xs text-zinc-500">
            {author} · поділився {new Date(sharedAt).toLocaleDateString("uk-UA", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </div>
        </motion.div>

        {/* Messages */}
        <div className="space-y-4">
          {messages.map((m, i) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.04 }}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[88%] rounded-2xl px-4 py-3 ${
                  m.role === "user"
                    ? "bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white"
                    : "bg-white/[0.04] border border-white/10 text-zinc-100"
                }`}
              >
                {m.role === "user" ? (
                  <p className="text-sm whitespace-pre-wrap m-0">{m.content}</p>
                ) : (
                  <div className="prose prose-invert prose-sm">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        table: ({ children }) => (
                          <div className="overflow-x-auto my-2 -mx-1">
                            <table className="w-full text-xs border-collapse">{children}</table>
                          </div>
                        ),
                        th: ({ children }) => (
                          <th className="text-left px-2 py-1.5 font-semibold text-zinc-300 border-b border-white/10 bg-white/[0.04]">
                            {children}
                          </th>
                        ),
                        td: ({ children }) => (
                          <td className="px-2 py-1.5 text-zinc-200 border-b border-white/5">
                            {children}
                          </td>
                        ),
                        // Hide chart blocks and suggestions in shared view (no interactive)
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
                      {m.content}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-12 pt-5 border-t border-white/10 text-center text-xs text-zinc-500">
          Згенеровано Metrum AI асистентом · read-only перегляд
        </div>
      </div>
    </div>
  );
}
