"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

export function AiFeedback({ messageId }: { messageId: string }) {
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  async function submit(value: "up" | "down") {
    setFeedback(value);
    // Fire-and-forget — log feedback for analytics
    fetch("/api/admin/ai/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, feedback: value }),
    }).catch(() => {});
  }

  if (feedback) {
    return (
      <span className="text-[10px]" style={{ color: T.textMuted }}>
        {feedback === "up" ? "Дякую!" : "Враховано"}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => submit("up")}
        className="rounded p-0.5 transition-colors hover:opacity-80"
        style={{ color: T.textMuted }}
        title="Корисно"
      >
        <ThumbsUp className="h-3 w-3" />
      </button>
      <button
        onClick={() => submit("down")}
        className="rounded p-0.5 transition-colors hover:opacity-80"
        style={{ color: T.textMuted }}
        title="Не корисно"
      >
        <ThumbsDown className="h-3 w-3" />
      </button>
    </div>
  );
}
