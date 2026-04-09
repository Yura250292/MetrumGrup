"use client";

import React from "react";

const MENTION_REGEX = /<@([a-z0-9_-]+)>/gi;

export function RenderCommentBody({
  body,
  mentions,
}: {
  body: string;
  mentions: { id: string; name: string }[];
}) {
  const map = new Map(mentions.map((m) => [m.id, m.name]));
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;

  // Reset regex state
  MENTION_REGEX.lastIndex = 0;

  while ((m = MENTION_REGEX.exec(body)) !== null) {
    if (m.index > lastIndex) {
      parts.push(body.slice(lastIndex, m.index));
    }
    const id = m[1];
    const name = map.get(id) ?? "невідомий";
    parts.push(
      <span
        key={`m-${m.index}`}
        className="inline-flex items-center px-1 rounded admin-dark:bg-blue-500/20 admin-dark:text-blue-200 admin-light:bg-blue-100 admin-light:text-blue-700 font-medium"
      >
        @{name}
      </span>
    );
    lastIndex = m.index + m[0].length;
  }

  if (lastIndex < body.length) {
    parts.push(body.slice(lastIndex));
  }

  return <span className="whitespace-pre-wrap break-words">{parts}</span>;
}
