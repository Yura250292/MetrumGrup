"use client";

import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

/**
 * Спільний рендер Markdown для нарад — однаковий вигляд у редакторі-прев'ю
 * та на сторінці наради (WYSIWYG: що бачиш у прев'ю, те й збережеться).
 *
 * Стиль — як у Obsidian / Typora: чітка ієрархія заголовків, читабельні
 * таблиці-сітки, акуратні списки, code-блоки, цитати. remark-gfm дає
 * таблиці, ~strikethrough~, чек-листи, автопосилання.
 */

const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

const COMPONENTS: Components = {
  h1: (p) => (
    <h1
      {...p}
      className="mb-3 mt-6 border-b pb-1.5 text-xl font-bold first:mt-0"
      style={{ color: T.textPrimary, borderColor: T.borderSoft }}
    />
  ),
  h2: (p) => (
    <h2
      {...p}
      className="mb-2 mt-5 border-b pb-1 text-lg font-bold first:mt-0"
      style={{ color: T.textPrimary, borderColor: T.borderSoft }}
    />
  ),
  h3: (p) => (
    <h3
      {...p}
      className="mb-2 mt-4 text-base font-bold first:mt-0"
      style={{ color: T.textPrimary }}
    />
  ),
  h4: (p) => (
    <h4
      {...p}
      className="mb-1.5 mt-3 text-sm font-bold first:mt-0"
      style={{ color: T.textPrimary }}
    />
  ),
  p: (p) => <p {...p} className="my-2 leading-relaxed first:mt-0 last:mb-0" />,
  ul: (p) => (
    <ul {...p} className="my-2 list-disc space-y-1 pl-6 first:mt-0 last:mb-0" />
  ),
  ol: (p) => (
    <ol
      {...p}
      className="my-2 list-decimal space-y-1 pl-6 first:mt-0 last:mb-0"
    />
  ),
  li: (p) => <li {...p} className="leading-relaxed" />,
  strong: (p) => (
    <strong {...p} style={{ color: T.textPrimary, fontWeight: 700 }} />
  ),
  em: (p) => <em {...p} style={{ color: T.textSecondary }} />,
  del: (p) => (
    <del {...p} style={{ color: T.textMuted }} />
  ),
  a: (p) => (
    <a
      {...p}
      target="_blank"
      rel="noreferrer noopener"
      className="underline decoration-1 underline-offset-2"
      style={{ color: T.accentPrimary }}
    />
  ),
  hr: () => (
    <hr
      className="my-5 border-0"
      style={{ borderTop: `1px solid ${T.borderSoft}` }}
    />
  ),
  blockquote: (p) => (
    <blockquote
      {...p}
      className="my-3 rounded-r-md py-1 pl-4 pr-3 italic"
      style={{
        borderLeft: `3px solid ${T.accentPrimary}`,
        background: T.panelElevated,
        color: T.textSecondary,
      }}
    />
  ),
  // Інлайн-код vs code-блок: блок (має language-* або багаторядковий)
  // рендеримо «голим» — фон і відступи дає <pre>; інлайн — як пігулку.
  code: ({ className, children, ...rest }) => {
    const text = String(children ?? "");
    const isBlock =
      (className?.startsWith("language-") ?? false) || text.includes("\n");
    if (isBlock) {
      return (
        <code className={className} style={{ fontFamily: MONO }} {...rest}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="rounded px-1 py-0.5 text-[0.85em]"
        style={{
          background: T.panelElevated,
          color: T.textPrimary,
          fontFamily: MONO,
        }}
        {...rest}
      >
        {children}
      </code>
    );
  },
  pre: (p) => (
    <pre
      {...p}
      className="my-3 overflow-x-auto rounded-lg p-3 text-[13px] leading-relaxed"
      style={{
        background: T.panelElevated,
        border: `1px solid ${T.borderSoft}`,
        fontFamily: MONO,
      }}
    />
  ),
  // Таблиця — чиста сітка в стилі Obsidian/Typora: рамки на кожній комірці,
  // підсвічена шапка, горизонтальний скрол на вузьких екранах.
  table: (p) => (
    <div className="my-3 overflow-x-auto">
      <table
        {...p}
        className="w-full text-sm"
        style={{ borderCollapse: "collapse" }}
      />
    </div>
  ),
  th: (p) => (
    <th
      {...p}
      className="px-3 py-2 text-left align-top text-xs font-semibold"
      style={{
        color: T.textSecondary,
        background: T.panelElevated,
        border: `1px solid ${T.borderSoft}`,
      }}
    />
  ),
  td: (p) => (
    <td
      {...p}
      className="px-3 py-2 align-top leading-relaxed"
      style={{ color: T.textPrimary, border: `1px solid ${T.borderSoft}` }}
    />
  ),
  img: (p) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...p}
      alt={p.alt ?? ""}
      className="my-3 max-w-full rounded-lg"
      style={{ border: `1px solid ${T.borderSoft}` }}
    />
  ),
};

export function MeetingMarkdown({ children }: { children: string }) {
  return (
    <div
      className="text-sm leading-relaxed"
      // overflowWrap (а не word-break) — переносить лише задовгі непарні
      // рядки/URL, але НЕ ламає звичайні слова й не «стискає» колонки
      // таблиць до нуля ширини.
      style={{ color: T.textPrimary, overflowWrap: "break-word" }}
    >
      {/* remarkBreaks: одиночний Enter = перенос рядка (як у Telegram/
          Obsidian), а не «склеювання» в один абзац за CommonMark. */}
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={COMPONENTS}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
